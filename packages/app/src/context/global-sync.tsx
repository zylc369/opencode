import {
  type Config,
  type Path,
  type Project,
  type ProviderAuthResponse,
  type ProviderListResponse,
  createOpencodeClient,
} from "@opencode-ai/sdk/v2/client"
import { createStore, produce, reconcile } from "solid-js/store"
import { useGlobalSDK } from "./global-sdk"
import type { InitError } from "../pages/error"
import {
  createContext,
  createEffect,
  untrack,
  getOwner,
  useContext,
  onCleanup,
  onMount,
  type ParentProps,
  Switch,
  Match,
} from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { getFilename } from "@opencode-ai/util/path"
import { usePlatform } from "./platform"
import { useLanguage } from "@/context/language"
import { Persist, persisted } from "@/utils/persist"
import { createRefreshQueue } from "./global-sync/queue"
import { createChildStoreManager } from "./global-sync/child-store"
import { trimSessions } from "./global-sync/session-trim"
import { estimateRootSessionTotal, loadRootSessionsWithFallback } from "./global-sync/session-load"
import { applyDirectoryEvent, applyGlobalEvent } from "./global-sync/event-reducer"
import { bootstrapDirectory, bootstrapGlobal } from "./global-sync/bootstrap"
import { sanitizeProject } from "./global-sync/utils"
import type { ProjectMeta } from "./global-sync/types"
import { SESSION_RECENT_LIMIT } from "./global-sync/types"
import { Log } from "@/utils/log"

const log = Log.create({ service: "global-sync" })

// Global store type defining the application-wide state structure
type GlobalStore = {
  // Flag indicating if global sync is ready
  ready: boolean
  // Optional initialization error information
  error?: InitError
  // Current working path configuration
  path: Path
  // List of available projects
  project: Project[]
  // List of available providers
  provider: ProviderListResponse
  // Provider authentication status
  provider_auth: ProviderAuthResponse
  // Global configuration settings
  config: Config
  // Reload state indicator
  reload: undefined | "pending" | "complete"
}

// Main function to create and configure the global sync context
function createGlobalSync() {
  // Get required contexts for SDK, platform, and language support
  const globalSDK = useGlobalSDK()
  const platform = usePlatform()
  const language = useLanguage()
  // Get SolidJS owner for reactive cleanup
  const owner = getOwner()
  if (!owner) throw new Error("GlobalSync must be created within owner")

  // Statistics tracking for performance monitoring
  const stats = {
    // Count of evicted directory stores
    evictions: 0,
    // Count of fallback session loads
    loadSessionsFallback: 0,
  }

  // Caching maps for various async operations and metadata
  // SDK client cache per directory
  const sdkCache = new Map<string, ReturnType<typeof createOpencodeClient>>()
  // Track bootstrapping operations per directory
  const booting = new Map<string, Promise<void>>()
  // Track session loading operations per directory
  const sessionLoads = new Map<string, Promise<void>>()
  // Metadata about session limits per directory
  const sessionMeta = new Map<string, { limit: number }>()

  // Persisted project cache for storing project list across sessions
  const [projectCache, setProjectCache, , projectCacheReady] = persisted(
    Persist.global("globalSync.project", ["globalSync.project.v1"]),
    createStore({ value: [] as Project[] }),
  )

  // Main global store containing application state
  const [globalStore, setGlobalStore] = createStore<GlobalStore>({
    // Initially not ready
    ready: false,
    // Default empty paths
    path: { state: "", config: "", worktree: "", directory: "", home: "" },
    // Initialize with cached projects
    project: projectCache.value,
    // Empty provider lists
    provider: { all: [], connected: [], default: {} },
    // Empty authentication state
    provider_auth: {},
    // Empty configuration
    config: {},
    // No reload operation in progress
    reload: undefined,
  })

  // Update development statistics for performance monitoring
  const updateStats = (activeDirectoryStores: number) => {
    // Store stats on global object for debugging in development
    if (!import.meta.env.DEV) return
    ;(
      globalThis as {
        __OPENCODE_GLOBAL_SYNC_STATS?: {
          activeDirectoryStores: number
          evictions: number
          loadSessionsFullFetchFallback: number
        }
      }
    ).__OPENCODE_GLOBAL_SYNC_STATS = {
      activeDirectoryStores,
      evictions: stats.evictions,
      loadSessionsFullFetchFallback: stats.loadSessionsFallback,
    }
  }

  // Check if global sync is paused (during reload operations)
  const paused = () => untrack(() => globalStore.reload) !== undefined

  // Create refresh queue for managing async bootstrap operations
  const queue = createRefreshQueue({
    paused,
    bootstrap,
    bootstrapInstance,
  })

  // Create child store manager for directory-specific state management
  const children = createChildStoreManager({
    owner,
    markStats: updateStats,
    incrementEvictions: () => {
      stats.evictions += 1
      updateStats(Object.keys(children.children).length)
    },
    isBooting: (directory) => booting.has(directory),
    isLoadingSessions: (directory) => sessionLoads.has(directory),
    onBootstrap: (directory) => {
      void bootstrapInstance(directory)
    },
    onDispose: (directory) => {
      // Clean up resources when directory is disposed
      queue.clear(directory)
      sessionMeta.delete(directory)
      sdkCache.delete(directory)
    },
  })

  // Get or create SDK client for a specific directory
  const sdkFor = (directory: string) => {
    const cached = sdkCache.get(directory)
    if (cached) return cached
    // Create new SDK client with directory-specific configuration
    log.info(`[sdkFor] directory=${directory}, url=${globalSDK.url}`)
    const sdk = createOpencodeClient({
      baseUrl: globalSDK.url,
      fetch: platform.fetch,
      directory,
      throwOnError: true,
    })
    sdkCache.set(directory, sdk)
    return sdk
  }

  // Effect to load cached projects when store is empty
  createEffect(() => {
    if (!projectCacheReady()) return
    if (globalStore.project.length !== 0) return
    const cached = projectCache.value
    log.info(`[createEffect][projectCache] length=${cached.length}, cached=${JSON.stringify(cached)}`)
    if (cached.length === 0) return
    setGlobalStore("project", cached)
  })

  // Effect to persist projects to cache when they change
  createEffect(() => {
    if (!projectCacheReady()) return
    const projects = globalStore.project
    log.info(`[createEffect][globalStore] length=${projects.length}, projects=${JSON.stringify(projects)}`)
    if (projects.length === 0) {
      const cachedLength = untrack(() => projectCache.value.length)
      if (cachedLength !== 0) return
    }
    setProjectCache("value", projects.map(sanitizeProject))
  })

  // Effect to handle reload completion
  createEffect(() => {
    if (globalStore.reload !== "complete") return
    log.info(`[createEffect][reload] current ${globalStore.reload} to undefined`)
    setGlobalStore("reload", undefined)
    queue.refresh()
  })

  // Load sessions for a specific directory with caching and fallback logic
  async function loadSessions(directory: string) {
    // Check if session loading is already in progress
    const pending = sessionLoads.get(directory)
    log.info(`[loadSessions] directory=${directory}, pending=${pending}`)
    if (pending) return pending

    // Pin the directory to prevent disposal during loading
    children.pin(directory)
    const [store, setStore] = children.child(directory, { bootstrap: false })

    // Check if we have sufficient cached data
    const meta = sessionMeta.get(directory)
    if (meta && meta.limit >= store.limit) {
      const next = trimSessions(store.session, { limit: store.limit, permission: store.permission })
      if (next.length !== store.session.length) {
        setStore("session", reconcile(next, { key: "id" }))
      }
      children.unpin(directory)
      return
    }

    // Calculate the limit for loading sessions
    const limit = Math.max(store.limit + SESSION_RECENT_LIMIT, SESSION_RECENT_LIMIT)
    const promise = loadRootSessionsWithFallback({
      directory,
      limit,
      list: (query) => {
        log.info(`[session][list] query=${JSON.stringify(query)}`)
        return globalSDK.client.session.list(query)
      },
      onFallback: () => {
        stats.loadSessionsFallback += 1
        updateStats(Object.keys(children.children).length)
      },
    })
      .then((x) => {
        // Filter and sort sessions: only non-archived sessions with valid IDs
        const nonArchived = (x.data ?? [])
          .filter((s) => !!s?.id)
          .filter((s) => !s.time?.archived)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        const limit = store.limit
        // Preserve child sessions that were already loaded
        const childSessions = store.session.filter((s) => !!s.parentID)
        // Combine and trim sessions according to limit and permissions
        const sessions = trimSessions([...nonArchived, ...childSessions], { limit, permission: store.permission })
        // Update session total estimate
        setStore(
          "sessionTotal",
          estimateRootSessionTotal({ count: nonArchived.length, limit: x.limit, limited: x.limited }),
        )
        // Update sessions in store with reconciliation
        setStore("session", reconcile(sessions, { key: "id" }))
        // Cache the metadata for future reference
        sessionMeta.set(directory, { limit })
      })
      .catch((err) => {
        console.error("Failed to load sessions", err)
        const project = getFilename(directory)
        // Show error toast to user
        showToast({ title: language.t("toast.session.listFailed.title", { project }), description: err.message })
      })

    // Track the loading promise
    sessionLoads.set(directory, promise)
    promise.finally(() => {
      // Clean up after loading completes
      sessionLoads.delete(directory)
      children.unpin(directory)
    })
    return promise
  }

  // Bootstrap a specific directory instance with its own state and configuration
  async function bootstrapInstance(directory: string) {
    if (!directory) {
      log.warn(`[bootstrapInstance] directory is empty`)
      return
    }
    // Check if bootstrapping is already in progress for this directory
    const pending = booting.get(directory)
    log.info(`[bootstrapInstance] directory=${directory}, pending=${pending}`)
    if (pending) return pending

    // Pin directory to prevent disposal during bootstrapping
    children.pin(directory)
    const promise = (async () => {
      // Ensure child store exists for this directory
      const child = children.ensureChild(directory)
      // Get VCS cache for version control information
      const cache = children.vcsCache.get(directory)
      if (!cache) return
      // Get SDK client for this directory
      const sdk = sdkFor(directory)
      // Bootstrap the directory with all necessary data
      await bootstrapDirectory({
        directory,
        sdk,
        store: child[0],
        setStore: child[1],
        vcsCache: cache,
        loadSessions,
      })
    })()

    // Track the bootstrapping promise
    booting.set(directory, promise)
    promise.finally(() => {
      // Clean up after bootstrapping completes
      booting.delete(directory)
      children.unpin(directory)
    })
    return promise
  }

  // Subscribe to global SDK events and handle them appropriately
  const unsub = globalSDK.event.listen((e) => {
    const directory = e.name
    const event = e.details

    log.info(`[event][listen] directory=${directory}, event=${JSON.stringify(event)}`)

    // Handle global events that affect the entire application
    if (directory === "global") {
      applyGlobalEvent({
        event,
        project: globalStore.project,
        refresh: queue.refresh,
        setGlobalProject(next) {
          // Handle both function updates and direct value assignments
          if (typeof next === "function") {
            setGlobalStore("project", produce(next))
            return
          }
          setGlobalStore("project", next)
        },
      })
      return
    }

    // Handle directory-specific events
    const existing = children.children[directory]
    if (!existing) return
    // Mark directory as recently active
    children.mark(directory)
    const [store, setStore] = existing
    // Apply the event to the directory store
    applyDirectoryEvent({
      event,
      directory,
      store,
      setStore,
      push: queue.push,
      vcsCache: children.vcsCache.get(directory),
      loadLsp: () => {
        // Load LSP status when requested by events
        sdkFor(directory)
          .lsp.status()
          .then((x) => setStore("lsp", x.data ?? []))
      },
    })
  })

  // Set up cleanup handlers for proper resource management
  // Unsubscribe from events
  onCleanup(unsub)
  onCleanup(() => {
    // Dispose of refresh queue
    queue.dispose()
  })
  onCleanup(() => {
    // Dispose all child directory stores
    for (const directory of Object.keys(children.children)) {
      children.disposeDirectory(directory)
    }
  })

  // Bootstrap the global application state and configuration
  async function bootstrap() {
    await bootstrapGlobal({
      globalSDK: globalSDK.client,
      connectErrorTitle: language.t("dialog.server.add.error"),
      connectErrorDescription: language.t("error.globalSync.connectFailed", { url: globalSDK.url }),
      requestFailedTitle: language.t("common.requestFailed"),
      setGlobalStore,
    })
  }

  // Trigger bootstrap when component mounts
  onMount(() => {
    void bootstrap()
  })

  // Update project metadata for a specific directory
  function projectMeta(directory: string, patch: ProjectMeta) {
    children.projectMeta(directory, patch)
  }

  // Update project icon for a specific directory
  function projectIcon(directory: string, value: string | undefined) {
    children.projectIcon(directory, value)
  }

  // Return the public API for the global sync context
  return {
    // Global store data
    data: globalStore,
    // Store setter function
    set: setGlobalStore,
    get ready() {
      // Ready state getter
      return globalStore.ready
    },
    get error() {
      // Error state getter
      return globalStore.error
    },
    // Child store accessor
    child: children.child,
    // Global bootstrap function
    bootstrap,
    updateConfig: (config: Config) => {
      log.info(`[updateConfig] config=${config}`)
      // Update global configuration with reload state management
      setGlobalStore("reload", "pending")
      return globalSDK.client.global.config.update({ config }).finally(() => {
        // Mark reload as complete after a delay
        setTimeout(() => {
          setGlobalStore("reload", "complete")
        }, 1000)
      })
    },
    project: {
      // Session loading function
      loadSessions,
      // Project metadata updater
      meta: projectMeta,
      // Project icon updater
      icon: projectIcon,
    },
  }
}

// Create context for global sync state management
const GlobalSyncContext = createContext<ReturnType<typeof createGlobalSync>>()

// Provider component that wraps children with global sync context
export function GlobalSyncProvider(props: ParentProps) {
  const value = createGlobalSync()
  return (
    <Switch>
      {/* Only render children when global sync is ready */}
      <Match when={value.ready}>
        <GlobalSyncContext.Provider value={value}>{props.children}</GlobalSyncContext.Provider>
      </Match>
    </Switch>
  )
}

// Hook to access global sync context within components
export function useGlobalSync() {
  const context = useContext(GlobalSyncContext)
  if (!context) throw new Error("useGlobalSync must be used within GlobalSyncProvider")
  return context
}

// Export utility functions for directory management and session loading
export { canDisposeDirectory, pickDirectoriesToEvict } from "./global-sync/eviction"
export { estimateRootSessionTotal, loadRootSessionsWithFallback } from "./global-sync/session-load"

import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { Persist, persisted } from "@/utils/persist"
import { checkServerHealth } from "@/utils/server-health"
import { Log } from "@/utils/log"

const log = Log.create({ service: "server" })

/** Stored project information with worktree path and expanded state */
type StoredProject = { worktree: string; expanded: boolean }

/**
 * Normalize and validate a server URL
 * - Trims whitespace
 * - Adds http:// protocol if missing
 * - Removes trailing slashes
 * @param input - Raw URL string
 * @returns Normalized URL or undefined if invalid
 */
export function normalizeServerUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, "")
}

/**
 * Get a display name for a server URL
 * - Removes protocol prefix
 * - Removes trailing slashes
 * @param url - Server URL
 * @returns Display name (e.g., "localhost:4096" from "http://localhost:4096/")
 */
export function serverDisplayName(url: string) {
  if (!url) return ""
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

/**
 * Generate a storage key for projects associated with a server URL
 * - Local servers use "local" key
 * - Remote servers use full URL as key
 * @param url - Server URL
 * @returns Storage key for projects
 */
function projectsKey(url: string) {
  if (!url) return ""
  const host = url.replace(/^https?:\/\//, "").split(":")[0]
  if (host === "localhost" || host === "127.0.0.1") return "local"
  return url
}

/**
 * Server context for managing OpenCode server connections
 * Provides server list management, health checking, and project tracking
 */
export const { use: useServer, provider: ServerProvider } = createSimpleContext({
  name: "Server",
  init: (props: { defaultUrl: string }) => {
    const platform = usePlatform()

    // Create persisted store for server list and projects
    const [store, setStore, _, ready] = persisted(
      Persist.global("server", ["server.v3"]),
      createStore({
        // List of known server URLs
        list: [] as string[],
        // Projects per server
        projects: {} as Record<string, StoredProject[]>,
        // Last opened project per server
        lastProject: {} as Record<string, string>,
      }),
    )

    // Local state for active server and health status
    const [state, setState] = createStore({
      // Currently active server URL
      active: "",
      // Health check result
      healthy: undefined as boolean | undefined,
    })

    /**
     * Check if the current server is healthy
     * @returns true if server is healthy, false if unhealthy, undefined if unknown
     */
    const healthy = () => state.healthy

    /**
     * Set the active server by URL
     * @param input - Server URL to set as active
     */
    function setActive(input: string) {
      const url = normalizeServerUrl(input)
      if (!url) return
      log.info(`[setActive][setState][active] input=${input}, url=${url}`)
      setState("active", url)
    }

    /**
     * Add a server to the list and set it as active
     * - Skips if URL matches the default server
     * - Avoids duplicates in the list
     * @param input - Server URL to add
     */
    function add(input: string) {
      const url = normalizeServerUrl(input)
      if (!url) return

      // Don't add if it's the default server
      const fallback = normalizeServerUrl(props.defaultUrl)
      if (fallback && url === fallback) {
        log.info(`[add][setState][active] url === fallback, input=${input}, url=${url}, fallback=${fallback}`)
        setState("active", url)
        return
      }

      batch(() => {
        log.info(`[add][setState][active] In batch. url !== fallback, input=${input}, url=${url}, fallback=${fallback}`)

        // Add to list if not already present
        if (!store.list.includes(url)) {
          setStore("list", store.list.length, url)
        }
        setState("active", url)
      })
    }

    /**
     * Remove a server from the list
     * - Switches to the first available server if removing the active one
     * @param input - Server URL to remove
     */
    function remove(input: string) {
      const url = normalizeServerUrl(input)
      if (!url) return

      const list = store.list.filter((x) => x !== url)
      // Select next server if removing the active one
      const next = state.active === url ? (list[0] ?? normalizeServerUrl(props.defaultUrl) ?? "") : state.active

      batch(() => {
        log.info(`[remove][setState][active] url !== fallback, input=${input}, url=${url}`)

        setStore("list", list)
        setState("active", next)
      })
    }

    // Initialize active server from default URL when ready
    createEffect(() => {
      if (!ready()) {
        log.info(`[createEffect] not ready`)
        return
      }
      if (state.active) return
      const url = normalizeServerUrl(props.defaultUrl)
      if (!url) return

      log.info(`[createEffect][setState][active] url=${url}, defaultUrl=${props.defaultUrl}`)
      setState("active", url)
    })

    /**
     * Check if the server context is ready
     * @returns true if persisted state is loaded and active server is set
     */
    const isReady = createMemo(() => ready() && !!state.active)

    // Get platform-specific fetch implementation
    const fetcher = platform.fetch ?? globalThis.fetch
    /**
     * Check if a server is healthy
     * @param url - Server URL to check
     * @returns Promise that resolves to true if server is healthy
     */
    const check = (url: string) => checkServerHealth(url, fetcher).then((x) => x.healthy)

    /**
     * Periodically check server health
     * - Runs every 10 seconds
     * - Stops when component unmounts or active server changes
     */
    createEffect(() => {
      const url = state.active
      if (!url) return

      log.info(`[createEffect][setState][healthy] url=${url}`)
      setState("healthy", undefined)

      let alive = true
      let busy = false

      const run = () => {
        // Skip if previous check is still running
        if (busy) return
        busy = true
        void check(url)
          .then((next) => {
            // Component unmounted
            if (!alive) return
            setState("healthy", next)
          })
          .finally(() => {
            busy = false
          })
      }

      // Initial check
      run()
      // Check every 10 seconds
      const interval = setInterval(run, 10_000)

      onCleanup(() => {
        alive = false
        clearInterval(interval)
      })
    })

    /**
     * Get the storage key for the current server's projects
     * @returns Storage key ("local" for localhost, full URL otherwise)
     */
    const origin = createMemo(() => {
      const result = projectsKey(state.active)
      log.info(`[origin] active=${state.active}, projectsKey=${result}`)
      return result
    })
    /**
     * Get the list of projects for the current server
     * @returns Array of stored projects
     */
    const projectsList = createMemo(() => {
      const key = origin()
      const result = store.projects[key] ?? []
      log.info(`[projectsList] key(from origin)=${key},projectsList=${JSON.stringify(result)}`)
      return result
    })
    /**
     * Check if the current server is local (localhost/127.0.0.1)
     * @returns true if local server
     */
    const isLocal = createMemo(() => {
      const originValue = origin()
      const result = originValue === "local"
      log.info(`[isLocal] origin=${originValue},isLocal=${result}`)
      return result
    })

    return {
      ready: isReady,
      healthy,
      isLocal,
      get url() {
        return state.active
      },
      get name() {
        return serverDisplayName(state.active)
      },
      get list() {
        return store.list
      },
      setActive,
      add,
      remove,
      /**
       * Project management methods
       * Projects are stored per-server origin to track open directories
       */
      projects: {
        list: projectsList,
        /**
         * Open a project in the project list
         * - Adds to the beginning of the list
         * - Skips if already present
         * @param directory - Worktree directory path
         */
        open(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          if (current.find((x) => x.worktree === directory)) return
          setStore("projects", key, [{ worktree: directory, expanded: true }, ...current])
        },
        /**
         * Close a project (remove from list)
         * @param directory - Worktree directory path
         */
        close(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          setStore(
            "projects",
            key,
            current.filter((x) => x.worktree !== directory),
          )
        },
        /**
         * Mark a project as expanded in the UI
         * @param directory - Worktree directory path
         */
        expand(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const index = current.findIndex((x) => x.worktree === directory)
          if (index !== -1) setStore("projects", key, index, "expanded", true)
        },
        /**
         * Mark a project as collapsed in the UI
         * @param directory - Worktree directory path
         */
        collapse(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const index = current.findIndex((x) => x.worktree === directory)
          if (index !== -1) setStore("projects", key, index, "expanded", false)
        },
        /**
         * Move a project to a different position in the list
         * @param directory - Worktree directory path to move
         * @param toIndex - Target index in the list
         */
        move(directory: string, toIndex: number) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const fromIndex = current.findIndex((x) => x.worktree === directory)
          if (fromIndex === -1 || fromIndex === toIndex) return
          const result = [...current]
          const [item] = result.splice(fromIndex, 1)
          result.splice(toIndex, 0, item)
          setStore("projects", key, result)
        },
        /**
         * Get the last opened project for the current server
         * @returns Last project directory or undefined
         */
        last() {
          const key = origin()
          if (!key) return
          return store.lastProject[key]
        },
        /**
         * Set a project as the last opened for the current server
         * @param directory - Worktree directory path
         */
        touch(directory: string) {
          const key = origin()
          if (!key) return
          setStore("lastProject", key, directory)
        },
      },
    }
  },
})

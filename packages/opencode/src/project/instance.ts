import { Log } from "@/util/log"
import { Context } from "../util/context"
import { Project } from "./project"
import { State } from "./state"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { Filesystem } from "@/util/filesystem"

/** Instance context interface containing project and directory information */
interface Context {
  // Current working directory
  directory: string
  // Git worktree directory (may differ from directory in worktrees)
  worktree: string
  // Project metadata
  project: Project.Info
}

/** Async local storage context for instance data */
const context = Context.create<Context>("instance")

/** Cache of pending instance initialization promises by directory path */
const cache = new Map<string, Promise<Context>>()

/** Disposal state tracking for disposeAll operation */
const disposal = {
  // In-flight disposeAll promise
  all: undefined as Promise<void> | undefined,
}

/**
 * Instance namespace for managing project instances
 * Provides context-aware project information and lifecycle management
 */
export const Instance = {
  /**
   * Provide instance context for a directory
   * Creates or reuses cached instance, runs init function if new, then executes fn
   * @param input.directory - Directory path to create instance for
   * @param input.init - Optional async initialization function (only runs on first call)
   * @param input.fn - Function to execute within instance context
   * @returns Result of input.fn
   */
  async provide<R>(input: { directory: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
    // Check cache for existing instance promise
    let existing = cache.get(input.directory)
    if (!existing) {
      Log.Default.info("creating instance", { directory: input.directory })
      // Create new instance: resolve project, run init, cache the promise
      existing = iife(async () => {
        const { project, sandbox } = await Project.fromDirectory(input.directory)
        const ctx = {
          directory: input.directory,
          worktree: sandbox,
          project,
        }
        // Run init function within the new context
        await context.provide(ctx, async () => {
          await input.init?.()
        })
        return ctx
      })
      cache.set(input.directory, existing)
    }
    // Wait for instance to be ready
    const ctx = await existing
    // Execute user function within instance context
    return context.provide(ctx, async () => {
      return input.fn()
    })
  },

  /**
   * Get the current working directory from instance context
   * @throws Error if called outside of Instance.provide()
   */
  get directory() {
    return context.use().directory
  },

  /**
   * Get the git worktree directory from instance context
   * @throws Error if called outside of Instance.provide()
   */
  get worktree() {
    return context.use().worktree
  },

  /**
   * Get the project info from instance context
   * @throws Error if called outside of Instance.provide()
   */
  get project() {
    return context.use().project
  },
  /**
   * Check if a path is within the project boundary.
   * Returns true if path is inside Instance.directory OR Instance.worktree.
   * Paths within the worktree but outside the working directory should not trigger external_directory permission.
   * @param filepath - Path to check
   * @returns true if path is within project boundaries
   */
  containsPath(filepath: string) {
    // Check if path is within the working directory
    if (Filesystem.contains(Instance.directory, filepath)) return true
    // Non-git projects set worktree to "/" which would match ANY absolute path.
    // Skip worktree check in this case to preserve external_directory permissions.
    if (Instance.worktree === "/") return false
    // Check if path is within the worktree
    return Filesystem.contains(Instance.worktree, filepath)
  },

  /**
   * Create a state factory scoped to the current instance directory
   * @param init - Function to initialize state
   * @param dispose - Optional disposal function for cleanup
   * @returns State factory function
   */
  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
    return State.create(() => Instance.directory, init, dispose)
  },

  /**
   * Dispose the current instance
   * Cleans up state, removes from cache, and emits disposal event
   */
  async dispose() {
    Log.Default.info("disposing instance", { directory: Instance.directory })
    // Dispose all scoped states
    await State.dispose(Instance.directory)
    // Remove from cache
    cache.delete(Instance.directory)
    // Notify other parts of the system
    GlobalBus.emit("event", {
      directory: Instance.directory,
      payload: {
        type: "server.instance.disposed",
        properties: {
          directory: Instance.directory,
        },
      },
    })
  },

  /**
   * Dispose all cached instances
   * Idempotent - concurrent calls return the same promise
   * @returns Promise that resolves when all instances are disposed
   */
  async disposeAll() {
    // Return in-flight operation if already disposing
    if (disposal.all) return disposal.all

    disposal.all = iife(async () => {
      Log.Default.info("disposing all instances")
      // Snapshot cache entries to avoid iteration issues
      const entries = [...cache.entries()]
      for (const [key, value] of entries) {
        // Skip if cache was modified (entry replaced or removed)
        if (cache.get(key) !== value) continue

        // Wait for instance initialization, handle failures
        const ctx = await value.catch((error) => {
          Log.Default.warn("instance dispose failed", { key, error })
          return undefined
        })

        // Remove failed instances from cache
        if (!ctx) {
          if (cache.get(key) === value) cache.delete(key)
          continue
        }

        // Skip if cache was modified while waiting
        if (cache.get(key) !== value) continue

        // Dispose instance within its context
        await context.provide(ctx, async () => {
          await Instance.dispose()
        })
      }
    }).finally(() => {
      // Reset disposal flag when done
      disposal.all = undefined
    })

    return disposal.all
  },
}

import z from "zod"
import fs from "fs/promises"
import { Filesystem } from "../util/filesystem"
import path from "path"
import { $ } from "bun"
import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { Flag } from "@/flag/flag"
import { Session } from "../session"
import { work } from "../util/queue"
import { fn } from "@opencode-ai/util/fn"
import { BusEvent } from "@/bus/bus-event"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { existsSync } from "fs"

/**
 * Project namespace for managing project information and metadata
 * Handles project discovery, storage, and updates
 */
export namespace Project {
  const log = Log.create({ service: "project" })

  /**
   * Project information schema
   * Defines the structure of project metadata stored in the database
   */
  export const Info = z
    .object({
      // Unique project identifier (git root commit hash or "global")
      id: z.string(),
      // Path to the git worktree directory
      worktree: z.string(),
      // Version control system type
      vcs: z.literal("git").optional(),
      // Display name for the project
      name: z.string().optional(),
      icon: z
        .object({
          // Data URL of the project icon
          url: z.string().optional(),
          // Override icon path
          override: z.string().optional(),
          // Icon color
          color: z.string().optional(),
        })
        .optional(),
      commands: z
        .object({
          start: z.string().optional().describe("Startup script to run when creating a new workspace (worktree)"),
        })
        .optional(),
      time: z.object({
        // Timestamp when project was first created
        created: z.number(),
        // Timestamp when project was last updated
        updated: z.number(),
        // Timestamp when project was initialized
        initialized: z.number().optional(),
      }),
      // List of sandbox directories for this project
      sandboxes: z.array(z.string()),
    })
    .meta({
      ref: "Project",
    })
  export type Info = z.infer<typeof Info>

  /** Project-related events */
  export const Event = {
    // Emitted when project info is updated
    Updated: BusEvent.define("project.updated", Info),
  }

  /**
   * Create or retrieve a project from a directory path
   * Detects git repository, generates project ID, and updates storage
   * @param directory - Directory path to analyze
   * @returns Project info and the sandbox directory
   */
  export async function fromDirectory(directory: string) {
    log.info("fromDirectory", { directory })

    // Analyze directory to find git info and generate project ID
    const { id, sandbox, worktree, vcs } = await iife(async () => {
      // Search for .git directory by walking up the tree
      const matches = Filesystem.up({ targets: [".git"], start: directory })
      const git = await matches.next().then((x) => x.value)
      await matches.return()
      if (git) {
        let sandbox = path.dirname(git)

        const gitBinary = Bun.which("git")

        // Try to read cached project ID from .git/opencode file
        // cached id calculation
        let id = await Bun.file(path.join(git, "opencode"))
          .text()
          .then((x) => x.trim())
          .catch(() => undefined)

        // If git binary is not available, use cached ID or fallback to "global"
        if (!gitBinary) {
          return {
            id: id ?? "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        // generate id from root commit
        if (!id) {
          const roots = await $`git rev-list --max-parents=0 --all`
            .quiet()
            .nothrow()
            .cwd(sandbox)
            .text()
            .then((x) =>
              x
                .split("\n")
                .filter(Boolean)
                .map((x) => x.trim())
                .toSorted(),
            )
            .catch(() => undefined)

          if (!roots) {
            return {
              id: "global",
              worktree: sandbox,
              sandbox: sandbox,
              vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
            }
          }

          id = roots[0]
          // Cache the ID for future use
          if (id) {
            void Bun.file(path.join(git, "opencode"))
              .write(id)
              .catch(() => undefined)
          }
        }

        if (!id) {
          return {
            id: "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: "git",
          }
        }

        // Get git repository root directory (handles worktrees)
        const top = await $`git rev-parse --show-toplevel`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => path.resolve(sandbox, x.trim()))
          .catch(() => undefined)

        if (!top) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        sandbox = top

        // Get git common directory (handles worktrees and submodules)
        const worktree = await $`git rev-parse --git-common-dir`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => {
            const dirname = path.dirname(x.trim())
            if (dirname === ".") return sandbox
            return dirname
          })
          .catch(() => undefined)

        if (!worktree) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        return {
          id,
          sandbox,
          worktree,
          vcs: "git",
        }
      }

      // Not a git directory, return global project
      return {
        id: "global",
        worktree: "/",
        sandbox: "/",
        vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
      }
    })

    // Load existing project info or create new one
    let existing = await Storage.read<Info>(["project", id]).catch(() => undefined)
    if (!existing) {
      existing = {
        id,
        worktree,
        vcs: vcs as Info["vcs"],
        sandboxes: [],
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      // Migrate sessions from global project to new project
      if (id !== "global") {
        await migrateFromGlobal(id, worktree)
      }
    }

    // Migrate old projects that don't have sandboxes array
    // migrate old projects before sandboxes
    if (!existing.sandboxes) existing.sandboxes = []

    // Auto-discover project icon if feature is enabled
    if (Flag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY) discover(existing)

    // Build result with updated timestamp
    const result: Info = {
      ...existing,
      worktree,
      vcs: vcs as Info["vcs"],
      time: {
        ...existing.time,
        updated: Date.now(),
      },
    }
    // Add sandbox to list if it's different from worktree
    if (sandbox !== result.worktree && !result.sandboxes.includes(sandbox)) result.sandboxes.push(sandbox)
    // Remove sandboxes that no longer exist on disk
    result.sandboxes = result.sandboxes.filter((x) => existsSync(x))

    // Save to storage and emit event
    await Storage.write<Info>(["project", id], result)
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return { project: result, sandbox }
  }

  /**
   * Auto-discover and save project favicon from the worktree directory
   * Searches for favicon files and converts them to data URLs
   * @param input - Project info to update with discovered icon
   */
  export async function discover(input: Info) {
    if (input.vcs !== "git") return
    // Skip if icon is manually overridden
    if (input.icon?.override) return
    // Skip if icon already exists
    if (input.icon?.url) return

    // Search for favicon files in the worktree
    const glob = new Bun.Glob("**/{favicon}.{ico,png,svg,jpg,jpeg,webp}")
    const matches = await Array.fromAsync(
      glob.scan({
        cwd: input.worktree,
        absolute: true,
        onlyFiles: true,
        followSymlinks: false,
        dot: false,
      }),
    )
    // Pick the shortest path (usually the root favicon)
    const shortest = matches.sort((a, b) => a.length - b.length)[0]
    if (!shortest) return

    // Convert file to data URL
    const file = Bun.file(shortest)
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mime = file.type || "image/png"
    const url = `data:${mime};base64,${base64}`

    // Update project with discovered icon
    await update({
      projectID: input.id,
      icon: {
        url,
      },
    })
    return
  }

  /**
   * Migrate sessions from the global project to a newly created project
   * Called when a non-global project is created for the first time
   * @param newProjectID - ID of the new project to migrate sessions to
   * @param worktree - Worktree directory of the new project
   */
  async function migrateFromGlobal(newProjectID: string, worktree: string) {
    const globalProject = await Storage.read<Info>(["project", "global"]).catch(() => undefined)
    if (!globalProject) return

    const globalSessions = await Storage.list(["session", "global"]).catch(() => [])
    if (globalSessions.length === 0) return

    log.info("migrating sessions from global", { newProjectID, worktree, count: globalSessions.length })

    // Migrate sessions in parallel (10 concurrent)
    await work(10, globalSessions, async (key) => {
      const sessionID = key[key.length - 1]
      const session = await Storage.read<Session.Info>(key).catch(() => undefined)
      if (!session) return
      // Only migrate sessions that belong to this worktree
      if (session.directory && session.directory !== worktree) return

      session.projectID = newProjectID
      log.info("migrating session", { sessionID, from: "global", to: newProjectID })
      await Storage.write(["session", newProjectID, sessionID], session)
      await Storage.remove(key)
    }).catch((error) => {
      log.error("failed to migrate sessions from global to project", { error, projectId: newProjectID })
    })
  }

  /**
   * Mark a project as initialized
   * @param projectID - ID of the project to mark as initialized
   */
  export async function setInitialized(projectID: string) {
    await Storage.update<Info>(["project", projectID], (draft) => {
      draft.time.initialized = Date.now()
    })
  }

  /**
   * List all projects in storage
   * @returns Array of project info with valid sandboxes filtered
   */
  export async function list() {
    const keys = await Storage.list(["project"])
    const projects = await Promise.all(keys.map((x) => Storage.read<Info>(x)))
    return projects.map((project) => ({
      ...project,
      // Remove non-existent sandboxes
      sandboxes: project.sandboxes?.filter((x) => existsSync(x)),
    }))
  }

  /**
   * Update project information
   * Validates input and updates project in storage
   */
  export const update = fn(
    z.object({
      projectID: z.string(),
      name: z.string().optional(),
      icon: Info.shape.icon.optional(),
      commands: Info.shape.commands.optional(),
    }),
    async (input) => {
      const result = await Storage.update<Info>(["project", input.projectID], (draft) => {
        if (input.name !== undefined) draft.name = input.name

        // Update icon with partial merge
        if (input.icon !== undefined) {
          draft.icon = {
            ...draft.icon,
          }
          if (input.icon.url !== undefined) draft.icon.url = input.icon.url
          if (input.icon.override !== undefined) draft.icon.override = input.icon.override || undefined
          if (input.icon.color !== undefined) draft.icon.color = input.icon.color
        }

        // Update commands, remove entire object if start is empty
        if (input.commands?.start !== undefined) {
          const start = input.commands.start || undefined
          draft.commands = {
            ...(draft.commands ?? {}),
          }
          draft.commands.start = start
          if (!draft.commands.start) draft.commands = undefined
        }

        draft.time.updated = Date.now()
      })
      GlobalBus.emit("event", {
        payload: {
          type: Event.Updated.type,
          properties: result,
        },
      })
      return result
    },
  )

  /**
   * Get list of valid sandbox directories for a project
   * @param projectID - ID of the project
   * @returns Array of valid sandbox directory paths
   */
  export async function sandboxes(projectID: string) {
    const project = await Storage.read<Info>(["project", projectID]).catch(() => undefined)
    if (!project?.sandboxes) return []
    const valid: string[] = []
    for (const dir of project.sandboxes) {
      const stat = await fs.stat(dir).catch(() => undefined)
      if (stat?.isDirectory()) valid.push(dir)
    }
    return valid
  }

  /**
   * Add a sandbox directory to a project
   * @param projectID - ID of the project
   * @param directory - Directory path to add as sandbox
   * @returns Updated project info
   */
  export async function addSandbox(projectID: string, directory: string) {
    const result = await Storage.update<Info>(["project", projectID], (draft) => {
      const sandboxes = draft.sandboxes ?? []
      if (!sandboxes.includes(directory)) sandboxes.push(directory)
      draft.sandboxes = sandboxes
      draft.time.updated = Date.now()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return result
  }

  /**
   * Remove a sandbox directory from a project
   * @param projectID - ID of the project
   * @param directory - Directory path to remove from sandboxes
   * @returns Updated project info
   */
  export async function removeSandbox(projectID: string, directory: string) {
    const result = await Storage.update<Info>(["project", projectID], (draft) => {
      const sandboxes = draft.sandboxes ?? []
      draft.sandboxes = sandboxes.filter((sandbox) => sandbox !== directory)
      draft.time.updated = Date.now()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return result
  }
}

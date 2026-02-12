import { Accessor } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { createOpencodeClient, type Message } from "@opencode-ai/sdk/v2/client"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/util/encode"
import { useLocal } from "@/context/local"
import { usePrompt, type ImageAttachmentPart, type Prompt } from "@/context/prompt"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useGlobalSync } from "@/context/global-sync"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import type { FileSelection } from "@/context/file"
import { setCursorPosition } from "./editor-dom"
import { buildRequestParts } from "./build-request-parts"
import { Log } from "@/utils/log"

const log = Log.create({ service: "submit" })

/**
 * Represents a pending prompt request that can be aborted
 * Contains an abort controller and cleanup function for request cancellation
 */
type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
}

/**
 * Map of pending prompts by session ID
 * Tracks all in-flight prompt submissions across different sessions
 */
const pending = new Map<string, PendingPrompt>()

/**
 * Input parameters for the prompt submit handler
 * Provides all necessary dependencies and callbacks for prompt submission
 */
type PromptSubmitInput = {
  info: Accessor<{ id: string } | undefined>
  imageAttachments: Accessor<ImageAttachmentPart[]>
  commentCount: Accessor<number>
  mode: Accessor<"normal" | "shell">
  working: Accessor<boolean>
  editor: () => HTMLDivElement | undefined
  queueScroll: () => void
  promptLength: (prompt: Prompt) => number
  addToHistory: (prompt: Prompt, mode: "normal" | "shell") => void
  resetHistoryNavigation: () => void
  setMode: (mode: "normal" | "shell") => void
  setPopover: (popover: "at" | "slash" | null) => void
  newSessionWorktree?: Accessor<string | undefined>
  onNewSessionWorktreeReset?: () => void
  onSubmit?: () => void
}

/**
 * Represents a file comment item in the prompt context
 * Contains file path, selection info, and comment metadata
 */
type CommentItem = {
  path: string
  selection?: FileSelection
  comment?: string
  commentID?: string
  commentOrigin?: "review" | "file"
  preview?: string
}

/**
 * Creates a prompt submit handler with abort and submit functions
 * Handles prompt submission, session creation, worktree management, and error recovery
 */
export function createPromptSubmit(input: PromptSubmitInput) {
  const navigate = useNavigate()
  const sdk = useSDK()
  const sync = useSync()
  const globalSync = useGlobalSync()
  const platform = usePlatform()
  const local = useLocal()
  const prompt = usePrompt()
  const layout = useLayout()
  const language = useLanguage()
  const params = useParams()

  /**
   * Extracts a user-friendly error message from an error object
   * Checks for nested data.message property or Error instance message
   */
  const errorMessage = (err: unknown) => {
    log.error(`[PromptSubmit][errorMessage] Request failed`, { error: err })

    if (err && typeof err === "object" && "data" in err) {
      const data = (err as { data?: { message?: string } }).data
      if (data?.message) return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  /**
   * Aborts the current in-progress prompt request
   * First checks for locally queued requests, then calls SDK abort
   */
  const abort = async () => {
    const sessionID = params.id
    if (!sessionID) {
      log.warn(`[PromptSubmit][abort] sessionID not found in params`)
      return Promise.resolve()
    }

    const queued = pending.get(sessionID)
    if (queued) {
      log.warn(`[PromptSubmit][abort] Cancel pending session`, { sessionID })
      queued.abort.abort()
      queued.cleanup()
      pending.delete(sessionID)
      return Promise.resolve()
    }

    log.warn(`[PromptSubmit][abort] Cancel running session`, { sessionID })
    return sdk.client.session
      .abort({
        sessionID,
      })
      .catch(() => {})
  }

  /**
   * Restores comment items to the prompt context
   * Re-adds file comments after a failed submission attempt
   */
  const restoreCommentItems = (items: CommentItem[]) => {
    let index = 0
    for (const item of items) {
      log.info(`[PromptSubmit][restoreCommentItems] index=${index++}, item=${JSON.stringify(item)}`)

      prompt.context.add({
        type: "file",
        path: item.path,
        selection: item.selection,
        comment: item.comment,
        commentID: item.commentID,
        commentOrigin: item.commentOrigin,
        preview: item.preview,
      })
    }
  }

  /**
   * Removes comment items from the prompt context
   * Clears file comments before successful submission to prevent duplicates
   */
  const removeCommentItems = (items: { key: string }[]) => {
    let index = 0
    for (const item of items) {
      log.info(`[PromptSubmit][removeCommentItems] index=${index++}, key=${item.key}`)
      prompt.context.remove(item.key)
    }
  }

  /**
   * Handles the form submission event
   * Processes prompt text, images, mode, and manages session/worktree creation
   *
   * Main responsibilities:
   * - Validate model and agent selection before submission
   * - Create new sessions or worktrees when needed
   * - Handle shell commands and custom slash commands
   * - Manage optimistic UI updates during request
   * - Handle worktree preparation state with timeout
   * - Restore input state on failure for retry
   */
  const handleSubmit = async (event: Event) => {
    // Prevent default form submission behavior
    event.preventDefault()

    // Extract prompt content by joining all text parts from the current prompt
    const currentPrompt = prompt.current()
    const text = currentPrompt.map((part) => ("content" in part ? part.content : "")).join("")
    // Get a copy of attached images (slice to avoid mutation)
    const images = input.imageAttachments().slice()
    // Get current input mode (normal or shell)
    const mode = input.mode()

    // Early return if input is empty (no text, images, or comments)
    // If there's a working request, abort it before returning
    if (text.trim().length === 0 && images.length === 0 && input.commentCount() === 0) {
      if (input.working()) abort()
      return
    }

    // Validate that a model and agent are selected
    const currentModel = local.model.current()
    const currentAgent = local.agent.current()
    if (!currentModel || !currentAgent) {
      showToast({
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description"),
      })
      return
    }

    // Save current prompt to history for navigation and reset history index
    input.addToHistory(currentPrompt, mode)
    input.resetHistoryNavigation()

    // Determine project directory and session context
    const projectDirectory = sdk.directory
    // Check if this is a new session (no ID in params)
    const isNewSession = !params.id
    // Get selected worktree, default to "main"
    const worktreeSelection = input.newSessionWorktree?.() || "main"

    // Initialize session directory and client (may change for worktrees)
    let sessionDirectory = projectDirectory
    let client = sdk.client

    // Handle new session initialization and worktree setup
    if (isNewSession) {
      // Case 1: User selected to create a new worktree
      if (worktreeSelection === "create") {
        // Attempt to create a new worktree for this session
        const createdWorktree = await client.worktree
          .create({ directory: projectDirectory })
          .then((x) => x.data)
          .catch((err) => {
            // Show error toast if worktree creation fails
            showToast({
              title: language.t("prompt.toast.worktreeCreateFailed.title"),
              description: errorMessage(err),
            })
            return undefined
          })

        // Abort if worktree creation didn't return a valid directory
        if (!createdWorktree?.directory) {
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: language.t("common.requestFailed"),
          })
          return
        }
        // Mark worktree as pending preparation
        WorktreeState.pending(createdWorktree.directory)
        sessionDirectory = createdWorktree.directory
      }

      // Case 2: User selected an existing worktree (not "main" and not "create")
      if (worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      // If session directory differs from project directory, create a new client
      // This is needed for worktree-specific operations
      if (sessionDirectory !== projectDirectory) {
        client = createOpencodeClient({
          baseUrl: sdk.url,
          fetch: platform.fetch,
          directory: sessionDirectory,
          throwOnError: true,
        })
        // Set up global sync for the child worktree
        globalSync.child(sessionDirectory)
      }

      // Reset the new session worktree selection after processing
      input.onNewSessionWorktreeReset?.()
    }

    // Get existing session or create a new one
    let session = input.info()
    if (!session && isNewSession) {
      // Create new session via API
      session = await client.session
        .create()
        .then((x) => x.data ?? undefined)
        .catch((err) => {
          showToast({
            title: language.t("prompt.toast.sessionCreateFailed.title"),
            description: errorMessage(err),
          })
          return undefined
        })
      // If session created successfully, navigate to it
      if (session) {
        layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
        navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
      }
    }

    // Abort if we don't have a valid session (creation failed)
    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description"),
      })
      return
    }

    // Trigger onSubmit callback if provided (for external side effects)
    input.onSubmit?.()

    // Build model configuration for API request
    const model = {
      modelID: currentModel.id,
      providerID: currentModel.provider.id,
    }
    const agent = currentAgent.name
    const variant = local.model.variant.current()

    /**
     * Clears the input field and resets UI state
     * Called after successful submission to prepare for next input
     */
    const clearInput = () => {
      prompt.reset()
      input.setMode("normal")
      input.setPopover(null)
    }

    /**
     * Restores the input field content and cursor position
     * Used after failed submission to allow user to retry without losing their input
     */
    const restoreInput = () => {
      prompt.set(currentPrompt, input.promptLength(currentPrompt))
      input.setMode(mode)
      input.setPopover(null)
      requestAnimationFrame(() => {
        const editor = input.editor()
        if (!editor) return
        editor.focus()
        setCursorPosition(editor, input.promptLength(currentPrompt))
        input.queueScroll()
      })
    }

    // Handle shell mode: execute as a shell command
    if (mode === "shell") {
      clearInput()
      client.session
        .shell({
          sessionID: session.id,
          agent,
          model,
          command: text,
        })
        .catch((err) => {
          // On failure, show error and restore input for retry
          showToast({
            title: language.t("prompt.toast.shellSendFailed.title"),
            description: errorMessage(err),
          })
          restoreInput()
        })
      return
    }

    // Handle custom slash commands (e.g., "/command args")
    if (text.startsWith("/")) {
      // Parse command name and arguments
      const [cmdName, ...args] = text.split(" ")
      // Remove leading slash
      const commandName = cmdName.slice(1)
      // Look up the command in the sync data
      const customCommand = sync.data.command.find((c) => c.name === commandName)
      if (customCommand) {
        clearInput()
        client.session
          .command({
            sessionID: session.id,
            command: commandName,
            arguments: args.join(" "),
            agent,
            model: `${model.providerID}/${model.modelID}`,
            variant,
            // Include images as file attachments
            parts: images.map((attachment) => ({
              id: Identifier.ascending("part"),
              type: "file" as const,
              mime: attachment.mime,
              url: attachment.dataUrl,
              filename: attachment.filename,
            })),
          })
          .catch((err) => {
            // On failure, show error and restore input for retry
            showToast({
              title: language.t("prompt.toast.commandSendFailed.title"),
              description: errorMessage(err),
            })
            restoreInput()
          })
        return
      }
    }

    // For regular prompts: extract context items with comments
    const context = prompt.context.items().slice()
    const commentItems = context.filter((item) => item.type === "file" && !!item.comment?.trim())

    // Generate unique message ID for this prompt
    const messageID = Identifier.ascending("message")
    // Build request parts (for API) and optimistic parts (for UI)
    const { requestParts, optimisticParts } = buildRequestParts({
      prompt: currentPrompt,
      context,
      images,
      text,
      sessionID: session.id,
      messageID,
      sessionDirectory,
    })

    // Create optimistic message object for immediate UI display
    const optimisticMessage: Message = {
      id: messageID,
      sessionID: session.id,
      role: "user",
      time: { created: Date.now() },
      agent,
      model,
    }

    /**
     * Adds optimistic message to sync store for immediate UI feedback
     * Shows user message immediately while waiting for server response
     */
    const addOptimisticMessage = () =>
      sync.session.optimistic.add({
        directory: sessionDirectory,
        sessionID: session.id,
        message: optimisticMessage,
        parts: optimisticParts,
      })

    /**
     * Removes optimistic message from sync store
     * Called when request fails or completes to clean up optimistic state
     */
    const removeOptimisticMessage = () =>
      sync.session.optimistic.remove({
        directory: sessionDirectory,
        sessionID: session.id,
        messageID,
      })

    // Prepare UI state: remove comments, clear input, show optimistic message
    removeCommentItems(commentItems)
    clearInput()
    addOptimisticMessage()

    /**
     * Waits for worktree to be ready before sending prompt
     * Handles pending worktree state with timeout and abort capability
     *
     * Logic:
     * - Returns immediately if worktree is not pending
     * - Sets session status to "busy" while waiting
     * - Races between worktree ready, abort signal, and 5min timeout
     * - Cleans up state on abort or timeout
     */
    const waitForWorktree = async () => {
      const worktree = WorktreeState.get(sessionDirectory)
      // If worktree is not in pending state, we're ready to proceed
      if (!worktree || worktree.status !== "pending") return true

      // Set session to busy status while waiting for worktree preparation
      if (sessionDirectory === projectDirectory) {
        sync.set("session_status", session.id, { type: "busy" })
      }

      // Create abort controller for cancelling the wait
      const controller = new AbortController()
      // Define cleanup function to restore state on abort/failure
      const cleanup = () => {
        if (sessionDirectory === projectDirectory) {
          sync.set("session_status", session.id, { type: "idle" })
        }
        removeOptimisticMessage()
        restoreCommentItems(commentItems)
        restoreInput()
      }

      // Register the pending request for potential abort
      pending.set(session.id, { abort: controller, cleanup })

      // Create a promise that resolves when abort is triggered
      const abortWait = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        if (controller.signal.aborted) {
          resolve({ status: "failed", message: "aborted" })
          return
        }
        controller.signal.addEventListener(
          "abort",
          () => {
            resolve({ status: "failed", message: "aborted" })
          },
          { once: true },
        )
      })

      // Create a timeout promise (5 minutes) for worktree preparation
      const timeoutMs = 5 * 60 * 1000
      const timer = { id: undefined as number | undefined }
      const timeout = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        timer.id = window.setTimeout(() => {
          resolve({ status: "failed", message: language.t("workspace.error.stillPreparing") })
        }, timeoutMs)
      })

      // Race between: worktree ready, abort signal, or timeout
      const result = await Promise.race([WorktreeState.wait(sessionDirectory), abortWait, timeout]).finally(() => {
        if (timer.id === undefined) return
        clearTimeout(timer.id)
      })
      // Clean up pending request
      pending.delete(session.id)
      // Check if abort was triggered
      if (controller.signal.aborted) return false
      // Throw error if worktree preparation failed
      if (result.status === "failed") throw new Error(result.message)
      return true
    }

    /**
     * Sends the prompt to the server after worktree is ready
     * Wraps waitForWorktree and actual API call with error handling
     */
    const send = async () => {
      // First wait for worktree to be ready
      const ok = await waitForWorktree()
      // Abort if wait was cancelled
      if (!ok) return
      // Send the actual prompt request to the server
      await client.session.prompt({
        sessionID: session.id,
        agent,
        model,
        messageID,
        parts: requestParts,
        variant,
      })
    }

    // Execute send asynchronously (fire and forget)
    // Errors are handled in the catch block below
    void send().catch((err) => {
      // Clean up pending request on error
      pending.delete(session.id)
      // Reset session status to idle
      if (sessionDirectory === projectDirectory) {
        sync.set("session_status", session.id, { type: "idle" })
      }
      // Show error toast to user
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: errorMessage(err),
      })
      // Restore UI state to allow retry
      removeOptimisticMessage()
      restoreCommentItems(commentItems)
      restoreInput()
    })
  }

  return {
    abort,
    handleSubmit,
  }
}

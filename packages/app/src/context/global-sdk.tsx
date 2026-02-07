import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { batch, onCleanup } from "solid-js"
import { usePlatform } from "./platform"
import { useServer } from "./server"

/**
 * Global SDK context for managing OpenCode API client and Server-Sent Events
 * - Manages SSE connection to the server's /event endpoint
 * - Coalesces high-frequency events to reduce re-renders
 * - Provides typed SDK client for API calls
 */
export const { use: useGlobalSDK, provider: GlobalSDKProvider } = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const server = useServer()
    const platform = usePlatform()
    const abort = new AbortController()

    // Create SDK client for SSE connection (shared by all contexts)
    const eventSdk = createOpencodeClient({
      baseUrl: server.url,
      signal: abort.signal,
      fetch: platform.fetch,
    })

    // Global event emitter for distributing events to all listeners
    const emitter = createGlobalEmitter<{
      [key: string]: Event
    }>()

    /** Queued event waiting to be flushed */
    type Queued = { directory: string; payload: Event }

    // Event queue for batching/coalescing
    let queue: Array<Queued | undefined> = []
    let buffer: Array<Queued | undefined> = []
    /** Map of coalesced event keys to their queue indices */
    const coalesced = new Map<string, number>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = 0

    /**
     * Generate a unique key for event coalescing
     * - Returns undefined for events that should not be coalesced
     * @param directory - Project directory
     * @param payload - Event payload
     * @returns Unique key or undefined
     */
    const key = (directory: string, payload: Event) => {
      // Coalesce session status events by session ID
      if (payload.type === "session.status") return `session.status:${directory}:${payload.properties.sessionID}`
      // Coalesce all LSP updates per directory
      if (payload.type === "lsp.updated") return `lsp.updated:${directory}`
      // Coalesce message part updates by message ID and part ID
      if (payload.type === "message.part.updated") {
        const part = payload.properties.part
        return `message.part.updated:${directory}:${part.messageID}:${part.id}`
      }
    }

    /**
     * Flush all queued events to the emitter
     * - Swaps queue with buffer for double-buffering
     * - Clears coalesced map
     * - Batches all events in a single SolidJS batch
     */
    const flush = () => {
      if (timer) clearTimeout(timer)
      timer = undefined

      if (queue.length === 0) return

      const events = queue
      // Double-buffer: swap queue with buffer
      queue = buffer
      buffer = events
      queue.length = 0
      coalesced.clear()

      last = Date.now()
      // Emit all events in a single batch to minimize re-renders
      batch(() => {
        for (const event of events) {
          if (!event) continue
          emitter.emit(event.directory, event.payload)
        }
      })

      buffer.length = 0
    }

    /**
     * Schedule a flush at the next animation frame
     * - Uses 16ms target (60fps)
     * - Debounces multiple rapid schedules
     */
    const schedule = () => {
      if (timer) return
      const elapsed = Date.now() - last
      timer = setTimeout(flush, Math.max(0, 16 - elapsed))
    }

    /**
     * SSE event stream processor
     * - Connects to /event endpoint
     * - Coalesces high-frequency events (LSP, message parts)
     * - Yields to event loop every ~8ms to prevent blocking
     */
    void (async () => {
      const events = await eventSdk.global.event()
      let yielded = Date.now()
      for await (const event of events.stream) {
        const directory = event.directory ?? "global"
        const payload = event.payload
        const k = key(directory, payload)

        // Handle event coalescing
        if (k) {
          const i = coalesced.get(k)
          // Mark previous event with same key as undefined
          if (i !== undefined) {
            queue[i] = undefined
          }
          // Track new event position
          coalesced.set(k, queue.length)
        }

        queue.push({ directory, payload })
        schedule()

        // Yield to event loop periodically to prevent blocking
        if (Date.now() - yielded < 8) continue
        yielded = Date.now()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    })()
      // Flush remaining events on disconnect
      .finally(flush)
      // Ignore connection errors
      .catch(() => undefined)

    // Cleanup on unmount
    onCleanup(() => {
      // Abort SSE connection
      abort.abort()
      // Flush remaining events
      flush()
    })

    /**
     * Create SDK client for API calls
     * - Separate from SSE client
     * - Throws on HTTP errors
     */
    const sdk = createOpencodeClient({
      baseUrl: server.url,
      fetch: platform.fetch,
      throwOnError: true,
    })

    return { url: server.url, client: sdk, event: emitter }
  },
})

import type { RunEvent } from "./orchestrator.js"

interface BufferedEvent {
  id: string
  event: RunEvent
  timestamp: number
}

/**
 * Per-run event buffer for SSE replay + live streaming.
 *
 *   orchestrator ──► push(event) ──► buffer + notify listeners
 *                                         │
 *   SSE endpoint ──► subscribe(runId) ◄───┘ replay from event 0
 *                         │
 *                    auto-cleanup 60s after run.completed
 */
class EventStore {
  private buffers = new Map<string, BufferedEvent[]>()
  private listeners = new Map<string, Set<(event: BufferedEvent) => void>>()
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

  push(runId: string, event: RunEvent): void {
    if (!this.buffers.has(runId)) {
      this.buffers.set(runId, [])
    }

    const buffer = this.buffers.get(runId)!
    const buffered: BufferedEvent = {
      id: String(buffer.length),
      event,
      timestamp: Date.now(),
    }
    buffer.push(buffered)

    // Notify live listeners
    const listeners = this.listeners.get(runId)
    if (listeners) {
      for (const listener of listeners) {
        listener(buffered)
      }
    }

    // Schedule cleanup after run completes
    if (event.event === "run.completed" || event.event === "run.error") {
      this.scheduleCleanup(runId)
    }
  }

  subscribe(
    runId: string,
    listener: (event: BufferedEvent) => void,
    fromEventId?: string
  ): () => void {
    // Replay existing events
    const buffer = this.buffers.get(runId) ?? []
    const startIndex = fromEventId ? Number(fromEventId) + 1 : 0

    for (let i = startIndex; i < buffer.length; i++) {
      listener(buffer[i])
    }

    // Register for live events
    if (!this.listeners.has(runId)) {
      this.listeners.set(runId, new Set())
    }
    this.listeners.get(runId)!.add(listener)

    // Return unsubscribe function
    return () => {
      this.listeners.get(runId)?.delete(listener)
      if (this.listeners.get(runId)?.size === 0) {
        this.listeners.delete(runId)
      }
    }
  }

  private scheduleCleanup(runId: string): void {
    if (this.cleanupTimers.has(runId)) return

    const timer = setTimeout(() => {
      this.buffers.delete(runId)
      this.listeners.delete(runId)
      this.cleanupTimers.delete(runId)
    }, 60_000) // 60s TTL after completion

    this.cleanupTimers.set(runId, timer)
  }

  /** Get all events for a run (for GET /runs/:id fallback) */
  getAll(runId: string): BufferedEvent[] {
    return this.buffers.get(runId) ?? []
  }

  /** Check if a run exists in the buffer */
  has(runId: string): boolean {
    return this.buffers.has(runId)
  }
}

export const eventStore = new EventStore()

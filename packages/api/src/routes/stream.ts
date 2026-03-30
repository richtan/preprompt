import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { eventStore } from "../events.js"

export const stream = new Hono()

// SSE stream for run events — replays from event 0, then streams live
stream.get("/:id/stream", async (c) => {
  const id = c.req.param("id")
  const lastEventId = c.req.header("Last-Event-ID")

  return streamSSE(c, async (sse) => {
    let closed = false

    const unsubscribe = eventStore.subscribe(
      id,
      async (buffered) => {
        if (closed) return
        try {
          await sse.writeSSE({
            event: buffered.event.event,
            data: JSON.stringify(buffered.event.data),
            id: buffered.id,
          })
        } catch {
          closed = true
        }
      },
      lastEventId ?? undefined
    )

    // Keep connection alive with periodic keepalive
    const keepalive = setInterval(async () => {
      if (closed) {
        clearInterval(keepalive)
        return
      }
      try {
        await sse.writeSSE({
          event: "stream.keepalive",
          data: JSON.stringify({ ts: Date.now() }),
        })
      } catch {
        closed = true
        clearInterval(keepalive)
      }
    }, 15_000)

    // Wait until the stream is closed by the client or run completes
    // The SSE connection stays open until the client disconnects
    await new Promise<void>((resolve) => {
      const checkDone = setInterval(() => {
        if (closed) {
          clearInterval(checkDone)
          clearInterval(keepalive)
          unsubscribe()
          resolve()
        }
      }, 1000)

      // Also close after run completes + buffer
      const events = eventStore.getAll(id)
      const isComplete = events.some(
        (e) => e.event.event === "run.completed" || e.event.event === "run.error"
      )
      if (isComplete) {
        // Run already done, close after sending all events
        setTimeout(() => {
          closed = true
          clearInterval(checkDone)
          clearInterval(keepalive)
          unsubscribe()
          resolve()
        }, 500)
      }
    })
  })
})

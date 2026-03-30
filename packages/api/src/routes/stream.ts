import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

export const stream = new Hono()

// SSE stream for run events
stream.get("/:id/stream", async (c) => {
  const id = c.req.param("id")

  // TODO: look up run, replay events from buffer, then stream live events

  return streamSSE(c, async (sse) => {
    await sse.writeSSE({
      event: "run.started",
      data: JSON.stringify({ runId: id, agents: [], criteriaCount: 0 }),
      id: "0",
    })

    // Placeholder: immediately complete
    await sse.writeSSE({
      event: "run.completed",
      data: JSON.stringify({ runId: id, duration: 0 }),
      id: "1",
    })
  })
})

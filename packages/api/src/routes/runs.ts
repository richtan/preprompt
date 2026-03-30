import { Hono } from "hono"

export const runs = new Hono()

const KNOWN_AGENTS = ["claude-code", "codex", "aider", "copilot"]
const MAX_PROMPT_SIZE = 500 * 1024 // 500KB

// Create a new run
runs.post("/", async (c) => {
  const body = await c.req.json<{ prompt: string; agents?: string[] }>()

  if (!body.prompt) {
    return c.json({ error: "prompt is required" }, 400)
  }

  if (new TextEncoder().encode(body.prompt).length > MAX_PROMPT_SIZE) {
    return c.json({ error: "prompt exceeds 500KB limit" }, 413)
  }

  const agents = body.agents?.filter((a) => KNOWN_AGENTS.includes(a)) ?? KNOWN_AGENTS
  if (agents.length === 0) {
    return c.json({ error: "no valid agents specified" }, 400)
  }

  // TODO: auth check (anon token or JWT)
  // TODO: rate limit check
  // TODO: create run record in DB
  // TODO: start orchestrator

  const runId = crypto.randomUUID()

  return c.json({
    id: runId,
    status: "pending",
    agents,
    streamUrl: `/api/runs/${runId}/stream`,
  }, 201)
})

// Get run results
runs.get("/:id", async (c) => {
  const id = c.req.param("id")

  // TODO: fetch from DB
  return c.json({ error: "not implemented", id }, 501)
})

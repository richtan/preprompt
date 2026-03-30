import { Hono } from "hono"
import { startRun, hashPrompt } from "../orchestrator.js"
import { eventStore } from "../events.js"
import type { SandboxProvider } from "../sandbox/provider.js"

export const runs = new Hono()

const KNOWN_AGENTS = ["claude-code", "codex", "aider", "copilot"]
const MAX_PROMPT_SIZE = 500 * 1024 // 500KB

// Lazy-load E2B to avoid CJS/ESM conflicts in test
let _provider: SandboxProvider | null = null
async function getSandboxProvider(): Promise<SandboxProvider> {
  if (_provider) return _provider
  const { E2BSandboxProvider } = await import("../sandbox/e2b.js")
  _provider = new E2BSandboxProvider()
  return _provider
}

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

  const runId = crypto.randomUUID()

  // Start orchestrator in background (don't await — SSE streams the results)
  getSandboxProvider().then((provider) =>
    startRun(
      {
        runId,
        prompt: body.prompt,
        agents,
        apiKeys: {
          anthropic: process.env.ANTHROPIC_API_KEY,
          openai: process.env.OPENAI_API_KEY,
        },
        onEvent: (event) => eventStore.push(runId, event),
      },
      provider
    )
  ).catch((err) => {
    eventStore.push(runId, {
      event: "run.error",
      data: { runId, error: "orchestrator_failed", message: String(err) },
    })
  })

  return c.json({
    id: runId,
    status: "pending",
    agents,
    promptHash: hashPrompt(body.prompt),
    streamUrl: `/api/runs/${runId}/stream`,
  }, 201)
})

// Get run results (fallback for when SSE buffer is gone)
runs.get("/:id", async (c) => {
  const id = c.req.param("id")

  // Check event buffer first
  const events = eventStore.getAll(id)
  if (events.length > 0) {
    return c.json({
      id,
      events: events.map((e) => e.event),
      status: events.some((e) => e.event.event === "run.completed") ? "completed" : "running",
    })
  }

  // TODO: fetch from DB when event buffer is expired
  return c.json({ error: "run not found", id }, 404)
})

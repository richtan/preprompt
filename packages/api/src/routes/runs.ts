import { Hono } from "hono"
import { startRun, hashPrompt } from "../orchestrator.js"
import { eventStore } from "../events.js"
import { extractAuth, checkRateLimit, getMaxAgents, hashIp } from "../auth.js"
import { createRunRecord, completeRun, saveAgentResult, getRunWithResults, getRunCount, incrementAnonRunCount } from "../db/queries.js"
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

  // Auth + rate limit
  const auth = await extractAuth(c)
  if (!auth) {
    return c.json({ error: "authentication required", hint: "Run `preprompt login` or set PREPROMPT_TOKEN" }, 401)
  }

  const runCount = await getRunCount(
    auth.type === "user" ? auth.userId : undefined,
    auth.type === "anon" ? auth.token : undefined
  )
  const rateLimitError = checkRateLimit(auth, runCount)
  if (rateLimitError) {
    return c.json({ error: "login_required", message: rateLimitError }, 401)
  }

  // Cap agents to tier limit
  const maxAgents = getMaxAgents(auth)
  const cappedAgents = agents.slice(0, maxAgents)

  const runId = crypto.randomUUID()
  const promptHash = hashPrompt(body.prompt)

  // Persist run to DB
  await createRunRecord({
    id: runId,
    prompt: body.prompt,
    promptHash,
    agents: cappedAgents,
    userId: auth.type === "user" ? auth.userId : undefined,
    anonToken: auth.type === "anon" ? auth.token : undefined,
  })

  // Track anon usage
  if (auth.type === "anon") {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown"
    await incrementAnonRunCount(auth.token, hashIp(ip))
  }

  // Start orchestrator in background
  getSandboxProvider().then((provider) =>
    startRun(
      {
        runId,
        prompt: body.prompt,
        agents: cappedAgents,
        apiKeys: {
          anthropic: process.env.ANTHROPIC_API_KEY,
          openai: process.env.OPENAI_API_KEY,
        },
        onEvent: (event) => {
          eventStore.push(runId, event)

          // Persist agent results to DB
          if (event.event === "agent.completed" || event.event === "agent.error") {
            saveAgentResult({
              runId,
              agent: String(event.data.agent),
              status: event.event === "agent.error" ? "error" : String(event.data.status),
              durationMs: Number(event.data.duration ?? 0),
              trace: event.data.files as any,
              error: event.data.error as string | undefined,
            }).catch(() => {})
          }

          if (event.event === "run.completed") {
            completeRun(runId).catch(() => {})
          }
        },
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
    agents: cappedAgents,
    promptHash,
    streamUrl: `/api/runs/${runId}/stream`,
  }, 201)
})

// Get run results
runs.get("/:id", async (c) => {
  const id = c.req.param("id")

  // Check in-memory event buffer first (live/recent runs)
  const events = eventStore.getAll(id)
  if (events.length > 0) {
    return c.json({
      id,
      events: events.map((e) => e.event),
      status: events.some((e) => e.event.event === "run.completed") ? "completed" : "running",
    })
  }

  // Fallback to DB (older runs after buffer expires)
  const data = await getRunWithResults(id)
  if (data) {
    return c.json({
      id,
      run: data.run,
      results: data.results,
      status: data.run.status,
    })
  }

  return c.json({ error: "run not found", id }, 404)
})

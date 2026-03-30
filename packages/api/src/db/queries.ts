import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "./index.js"

/** Returns null if DATABASE_URL is not set (tests, local dev without DB) */
function tryDb() {
  try {
    return getDb()
  } catch {
    return null
  }
}

export async function createRunRecord(opts: {
  id: string
  prompt: string
  promptHash: string
  agents: string[]
  userId?: string
  anonToken?: string
}) {
  const db = tryDb()
  if (!db) return

  await db.insert(schema.runs).values({
    id: opts.id,
    prompt: opts.prompt,
    promptHash: opts.promptHash,
    agents: opts.agents,
    status: "running",
    userId: opts.userId,
    anonToken: opts.anonToken,
    heartbeatAt: new Date(),
  })
}

export async function completeRun(id: string) {
  const db = tryDb()
  if (!db) return

  await db.update(schema.runs)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(schema.runs.id, id))
}

export async function saveAgentResult(opts: {
  runId: string
  agent: string
  status: string
  durationMs?: number
  trace?: Array<{ type: string; text: string }>
  evalResult?: unknown
  error?: string
}) {
  const db = tryDb()
  if (!db) return

  await db.insert(schema.agentResults).values({
    runId: opts.runId,
    agent: opts.agent,
    status: opts.status,
    durationMs: opts.durationMs,
    trace: opts.trace,
    evalResult: opts.evalResult,
    error: opts.error,
  })
}

export async function getRunWithResults(id: string) {
  const db = tryDb()
  if (!db) return null

  const run = await db.query.runs.findFirst({
    where: eq(schema.runs.id, id),
  })
  if (!run) return null

  const results = await db.query.agentResults.findMany({
    where: eq(schema.agentResults.runId, id),
  })

  return { run, results }
}

export async function getRunCount(userId?: string, anonToken?: string): Promise<number> {
  const db = tryDb()
  if (!db) return 0

  if (userId) {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.runs)
      .where(eq(schema.runs.userId, userId))
    return Number(result[0]?.count ?? 0)
  }

  if (anonToken) {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.anonSessions)
      .where(eq(schema.anonSessions.token, anonToken))
    return Number(result[0]?.runCount ?? 0)
  }

  return 0
}

export async function incrementAnonRunCount(token: string, ipHash: string) {
  const db = tryDb()
  if (!db) return

  await db.insert(schema.anonSessions)
    .values({ token, ipHash, runCount: 1 })
    .onConflictDoUpdate({
      target: schema.anonSessions.token,
      set: { runCount: sql`${schema.anonSessions.runCount} + 1` },
    })
}

export async function updateHeartbeat(id: string) {
  const db = tryDb()
  if (!db) return

  await db.update(schema.runs)
    .set({ heartbeatAt: new Date() })
    .where(eq(schema.runs.id, id))
}

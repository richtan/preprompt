import { pgTable, uuid, text, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: integer("github_id").unique().notNull(),
  githubLogin: varchar("github_login", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  plan: varchar("plan", { length: 20 }).default("free").notNull(),
  runCount: integer("run_count").default(0).notNull(),
  apiToken: varchar("api_token", { length: 64 }).unique(), // PREPROMPT_TOKEN for CI
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const anonSessions = pgTable("anon_sessions", {
  token: varchar("token", { length: 64 }).primaryKey(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  runCount: integer("run_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  prompt: text("prompt").notNull(),
  promptHash: varchar("prompt_hash", { length: 64 }).notNull(),
  agents: jsonb("agents").$type<string[]>().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  userId: uuid("user_id").references(() => users.id),
  anonToken: varchar("anon_token", { length: 64 }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
})

export const agentResults = pgTable("agent_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }).notNull(),
  agent: varchar("agent", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  durationMs: integer("duration_ms"),
  snapshotUrl: varchar("snapshot_url", { length: 500 }),
  trace: jsonb("trace").$type<Array<{ type: string; text: string }>>(),
  evalResult: jsonb("eval_result"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const criteria = pgTable("criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }).notNull(),
  criteria: jsonb("criteria").$type<Array<{
    number: number
    group: string
    type: string
    description: string
    check?: string
  }>>().notNull(),
})

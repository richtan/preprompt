import { Hono } from "hono"
import { cors } from "hono/cors"
import { runs } from "./routes/runs.js"
import { auth } from "./routes/auth.js"
import { stream } from "./routes/stream.js"

const app = new Hono()

app.use("/*", cors())

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }))

// Routes
app.route("/api/runs", runs)
app.route("/api/auth", auth)
app.route("/api/runs", stream)

// Debug: test sandbox execution directly (remove before production)
app.post("/debug/sandbox", async (c) => {
  const { template, command } = await c.req.json<{ template: string; command: string }>()
  try {
    const { E2BSandboxProvider } = await import("./sandbox/e2b.js")
    const provider = new E2BSandboxProvider()
    const sandbox = await provider.create({
      template: template ?? "preprompt-claude-code",
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      },
    })
    const result = await sandbox.exec(command ?? "which claude && claude --version", { timeout: 30_000 })
    await sandbox.destroy()
    return c.json({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr })
  } catch (err: unknown) {
    return c.json({ error: String(err), message: (err as Error).message }, 500)
  }
})

export default app

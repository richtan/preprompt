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

export default app

import { describe, it, expect } from "vitest"
import app from "../src/app.js"

// Helper to make authenticated requests (anon token)
function anonHeaders(extra?: Record<string, string>) {
  return { "Content-Type": "application/json", "X-Anon-Token": "test-anon-token", ...extra }
}

describe("API server", () => {
  it("returns health check", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
  })

  it("rejects empty prompt", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it("rejects unauthenticated request", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test" }),
    })
    expect(res.status).toBe(401)
  })

  it("creates a run with anon token", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ prompt: "Create a hello world app" }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeDefined()
    // Anon tier caps at 2 agents
    expect(body.agents.length).toBeLessThanOrEqual(2)
    expect(body.streamUrl).toContain(body.id)
    expect(body.promptHash).toBeDefined()
  })

  it("filters to known agents", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ prompt: "test", agents: ["claude-code", "fake-agent"] }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.agents).toEqual(["claude-code"])
  })

  it("rejects unknown agents only", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ prompt: "test", agents: ["fake-agent"] }),
    })
    expect(res.status).toBe(400)
  })

  it("returns SSE stream", async () => {
    const res = await app.request("/api/runs/test-id/stream")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
  })

  it("returns 404 for unknown run", async () => {
    const res = await app.request("/api/runs/nonexistent-id")
    expect(res.status).toBe(404)
  })
})

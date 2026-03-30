import { describe, it, expect } from "vitest"
import app from "../src/app.js"

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it("creates a run with valid prompt", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Create a hello world app" }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.agents).toEqual(["claude-code", "codex", "aider", "copilot"])
    expect(body.streamUrl).toContain(body.id)
  })

  it("filters to known agents", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test", agents: ["claude-code", "fake-agent"] }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.agents).toEqual(["claude-code"])
  })

  it("rejects unknown agents only", async () => {
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test", agents: ["fake-agent"] }),
    })
    expect(res.status).toBe(400)
  })

  it("returns SSE stream", async () => {
    const res = await app.request("/api/runs/test-id/stream")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
  })
})

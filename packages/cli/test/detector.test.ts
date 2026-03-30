import { describe, it, expect } from "vitest"
import { detectAgents, getAdapter, getInstalledAdapters } from "../src/agents/detector.js"

describe("detectAgents", () => {
  it("returns an array of agent info", async () => {
    const agents = await detectAgents()

    expect(Array.isArray(agents)).toBe(true)
    expect(agents.length).toBeGreaterThan(0)

    for (const agent of agents) {
      expect(agent).toHaveProperty("name")
      expect(agent).toHaveProperty("installed")
      expect(agent).toHaveProperty("authenticated")
    }
  })

  it("includes claude-code in the results", async () => {
    const agents = await detectAgents()
    const claude = agents.find((a) => a.name === "claude-code")

    expect(claude).toBeDefined()
    expect(claude!.name).toBe("claude-code")
  })
})

describe("getAdapter", () => {
  it("returns claude-code adapter", () => {
    const adapter = getAdapter("claude-code")
    expect(adapter).toBeDefined()
    expect(adapter!.name).toBe("claude-code")
  })

  it("returns undefined for unknown adapter", () => {
    const adapter = getAdapter("nonexistent-agent")
    expect(adapter).toBeUndefined()
  })
})

describe("getInstalledAdapters", () => {
  it("filters to installed agents only", () => {
    const agents = [
      { name: "claude-code", installed: true, authenticated: true },
      { name: "codex", installed: false, authenticated: false },
    ]

    const installed = getInstalledAdapters(agents)

    expect(installed).toHaveLength(1)
    expect(installed[0].name).toBe("claude-code")
  })

  it("returns empty array when nothing is installed", () => {
    const agents = [
      { name: "claude-code", installed: false, authenticated: false },
    ]

    const installed = getInstalledAdapters(agents)

    expect(installed).toHaveLength(0)
  })
})

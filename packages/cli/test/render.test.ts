import { describe, it, expect } from "vitest"
import {
  buildDynamicLines,
  buildHeaderLine,
  buildHistoryLines,
  buildStatusSuffix,
  type AgentState,
  type AgentResult,
  type HistoryEntry,
} from "../src/ui/render.js"
import type { EvalResult } from "../src/types.js"

function makeAgent(
  name: string,
  historyCount: number,
  result?: Partial<AgentResult>,
  checking?: { index: number; total: number }
): AgentState {
  const history: HistoryEntry[] = []
  for (let i = 0; i < historyCount; i++) {
    const type = i % 3 === 0 ? "create" : i % 3 === 1 ? "edit" : "command"
    history.push({ type, text: `action-${i}` })
  }
  return {
    name,
    status: "",
    history,
    result: result ? { status: "pass", duration: 1000, fileSummary: "", ...result } : undefined,
    checking,
  }
}

describe("buildHeaderLine", () => {
  it("shows spinner and name", () => {
    const agent = makeAgent("claude-code", 0)
    const line = buildHeaderLine(agent, 0)
    expect(line).toContain("⠋")
    expect(line).toContain("claude-code")
  })

  it("shows duration when result is set", () => {
    const agent = makeAgent("codex", 0, { duration: 52400 })
    const line = buildHeaderLine(agent, 0)
    expect(line).toContain("52.4s")
  })

  it("shows checking progress", () => {
    const agent = makeAgent("gemini", 0, undefined, { index: 3, total: 25 })
    const line = buildHeaderLine(agent, 0)
    expect(line).toContain("checking [3/25]")
  })
})

describe("buildHistoryLines", () => {
  it("uses correct prefix chars", () => {
    const history: HistoryEntry[] = [
      { type: "create", text: "index.ts" },
      { type: "edit", text: "package.json" },
      { type: "command", text: "npm install" },
    ]
    const lines = buildHistoryLines(history)
    expect(lines).toHaveLength(3)
    // Strip ANSI to check content
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""))
    expect(stripped[0]).toContain("+ index.ts")
    expect(stripped[1]).toContain("~ package.json")
    expect(stripped[2]).toContain("> npm install")
  })

  it("returns empty array for empty history", () => {
    expect(buildHistoryLines([])).toEqual([])
  })
})

describe("buildStatusSuffix", () => {
  it("shows passed with eval result", () => {
    const result: AgentResult = { status: "pass", duration: 1000, fileSummary: "" }
    const evalResult: EvalResult = {
      agent: "test",
      criteria: [],
      steps: [{ number: 1, description: "a", status: "pass" }],
      score: 100,
      duration: 100,
    }
    const suffix = buildStatusSuffix(result, evalResult)
    expect(suffix).toContain("passed")
  })

  it("shows failed with eval failures", () => {
    const result: AgentResult = { status: "pass", duration: 1000, fileSummary: "" }
    const evalResult: EvalResult = {
      agent: "test",
      criteria: [],
      steps: [
        { number: 1, description: "a", status: "pass" },
        { number: 2, description: "b", status: "fail" },
      ],
      score: 50,
      duration: 100,
    }
    const suffix = buildStatusSuffix(result, evalResult)
    expect(suffix).toContain("failed")
  })

  it("shows timed out", () => {
    const result: AgentResult = { status: "timeout", duration: 30000, fileSummary: "" }
    const suffix = buildStatusSuffix(result)
    expect(suffix).toContain("timed out")
  })

  it("shows error with message", () => {
    const result: AgentResult = { status: "error", duration: 0, fileSummary: "", error: "exit code 1" }
    const suffix = buildStatusSuffix(result)
    expect(suffix).toContain("failed")
    expect(suffix).toContain("exit code 1")
  })

  it("shows no changes", () => {
    const result: AgentResult = { status: "no-changes", duration: 5000, fileSummary: "" }
    const suffix = buildStatusSuffix(result)
    expect(suffix).toContain("no changes")
  })

  it("returns empty for pass without eval", () => {
    const result: AgentResult = { status: "pass", duration: 1000, fileSummary: "" }
    const suffix = buildStatusSuffix(result)
    expect(suffix).toBe("")
  })
})

describe("buildDynamicLines", () => {
  it("returns empty for no agents", () => {
    const agents = new Map<string, AgentState>()
    expect(buildDynamicLines(agents, 0, 24)).toEqual([])
  })

  it("shows single agent with all history when it fits", () => {
    const agents = new Map<string, AgentState>()
    agents.set("test", makeAgent("test", 5))
    const lines = buildDynamicLines(agents, 0, 24)
    // 1 header + 5 history = 6 lines
    expect(lines.length).toBe(6)
  })

  it("truncates single agent history when viewport is small", () => {
    const agents = new Map<string, AgentState>()
    agents.set("test", makeAgent("test", 20))
    // maxLines=10, budget=10-2=8 (but we pass maxLines directly)
    // 1 header + 9 history entries (10-1=9)
    const lines = buildDynamicLines(agents, 0, 10)
    expect(lines.length).toBeLessThanOrEqual(10)
    expect(lines.length).toBeGreaterThanOrEqual(1) // at least header
  })

  it("shows multiple agents with distributed history", () => {
    const agents = new Map<string, AgentState>()
    agents.set("a", makeAgent("a", 15))
    agents.set("b", makeAgent("b", 15))
    agents.set("c", makeAgent("c", 15))
    const lines = buildDynamicLines(agents, 0, 24)
    // 3 headers + distributed history, capped at 24
    expect(lines.length).toBeLessThanOrEqual(24)
    expect(lines.length).toBeGreaterThanOrEqual(3) // at least 3 headers
  })

  it("truncates heavily with 6 agents and small viewport", () => {
    const agents = new Map<string, AgentState>()
    for (let i = 0; i < 6; i++) {
      agents.set(`agent-${i}`, makeAgent(`agent-${i}`, 15))
    }
    const lines = buildDynamicLines(agents, 0, 22)
    expect(lines.length).toBeLessThanOrEqual(22)
    // Each of 6 agents should have a header
    const headers = lines.filter((l) => l.replace(/\x1b\[[0-9;]*m/g, "").match(/^⠋ agent-/))
    expect(headers.length).toBe(6)
  })

  it("shows overflow indicator when too many agents for headers", () => {
    const agents = new Map<string, AgentState>()
    for (let i = 0; i < 30; i++) {
      agents.set(`agent-${i}`, makeAgent(`agent-${i}`, 5))
    }
    const lines = buildDynamicLines(agents, 0, 10)
    expect(lines.length).toBeLessThanOrEqual(10)
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""))
    const overflow = stripped.find((l) => l.includes("+"))
    expect(overflow).toBeDefined()
    expect(overflow).toContain("more agent")
  })

  it("preserves newest history entries when truncating", () => {
    const agents = new Map<string, AgentState>()
    const agent = makeAgent("test", 10)
    agents.set("test", agent)
    const lines = buildDynamicLines(agents, 0, 5)
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""))
    // Last history entry is action-9
    expect(stripped.some((l) => l.includes("action-9"))).toBe(true)
    // First history entry (action-0) should be truncated away
    expect(stripped.some((l) => l.includes("action-0"))).toBe(false)
  })

  it("shows trim indicator when history is truncated", () => {
    const agents = new Map<string, AgentState>()
    agents.set("test", makeAgent("test", 15))
    const lines = buildDynamicLines(agents, 0, 6)
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""))
    // Should contain a "... N more" indicator
    expect(stripped.some((l) => l.includes("... ") && l.includes("more"))).toBe(true)
  })

  it("does not show trim indicator when all history fits", () => {
    const agents = new Map<string, AgentState>()
    agents.set("test", makeAgent("test", 3))
    const lines = buildDynamicLines(agents, 0, 24)
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""))
    expect(stripped.some((l) => l.includes("... ") && l.includes("more"))).toBe(false)
  })
})

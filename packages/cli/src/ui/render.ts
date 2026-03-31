import chalk from "chalk"
import type { ActionType } from "../agents/types.js"
import type { EvalResult } from "../types.js"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const MAX_HISTORY = 15

export interface AgentResult {
  status: "pass" | "fail" | "timeout" | "error" | "no-changes"
  duration: number
  fileSummary: string
  error?: string
}

export interface HistoryEntry {
  type: ActionType
  text: string
}

export interface AgentState {
  name: string
  status: string
  history: HistoryEntry[]
  result?: AgentResult
  checking?: { index: number; total: number }
}

export interface UIController {
  addCompleted(text: string, color?: string): void
  addCompletedBatch(texts: string[]): void
  startAgent(name: string): void
  updateAgentStatus(name: string, status: string): void
  addAgentHistory(name: string, type: ActionType, text: string): void
  setAgentResult(name: string, result: AgentResult): void
  setAgentChecking(name: string, index: number, total: number): void
  setAgentEval(name: string, evalResult: EvalResult): void
  completeAgent(name: string): void
  finish(): void
}

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

function truncateLine(line: string, maxCols: number): string {
  const visible = stripAnsi(line)
  if (visible.length <= maxCols) return line

  let visibleCount = 0
  let i = 0
  while (i < line.length && visibleCount < maxCols - 3) {
    if (line[i] === "\x1b") {
      const end = line.indexOf("m", i)
      if (end !== -1) { i = end + 1; continue }
    }
    visibleCount++
    i++
  }
  // Capture any trailing ANSI reset
  const rest = line.slice(i)
  const trailingAnsi = rest.match(/^(\x1b\[[0-9;]*m)*/)?.[0] ?? ""
  return line.slice(0, i) + "..." + trailingAnsi + "\x1b[0m"
}

export function buildHeaderLine(agent: AgentState, frame: number): string {
  let line = `${FRAMES[frame % FRAMES.length]} ${chalk.bold(agent.name)}`
  if (agent.result) {
    line += chalk.dim(`  ${formatDur(agent.result.duration)}`)
  }
  if (agent.checking) {
    line += chalk.dim(`  checking [${agent.checking.index}/${agent.checking.total}]`)
  }
  return line
}

function historyPrefix(type: ActionType): string {
  switch (type) {
    case "create": return chalk.green("+")
    case "edit": return chalk.yellow("~")
    default: return chalk.dim(">")
  }
}

export function buildHistoryLines(history: HistoryEntry[]): string[] {
  return history.map((h) => `    ${historyPrefix(h.type)} ${h.text}`)
}

export function buildStatusSuffix(
  result: AgentResult,
  evalResult?: EvalResult
): string {
  if (evalResult) {
    const failed = evalResult.steps.filter((s) => s.status === "fail").length
    return failed > 0
      ? `  ${chalk.red("failed")}`
      : `  ${chalk.green("passed")}`
  }
  if (result.status === "timeout") return chalk.yellow("  timed out")
  if (result.status === "no-changes") return chalk.dim("  no changes")
  if (result.status === "error" || result.status === "fail") {
    return chalk.red("  failed") + (result.error ? chalk.dim(`  ${result.error}`) : "")
  }
  return ""
}

export function buildDynamicLines(
  agents: Map<string, AgentState>,
  frame: number,
  maxLines: number
): string[] {
  const agentList = [...agents.values()]
  if (agentList.length === 0) return []

  // If even headers don't fit, show what we can + overflow indicator
  if (agentList.length >= maxLines) {
    const shown = Math.max(0, maxLines - 1)
    const lines: string[] = []
    for (let i = 0; i < shown && i < agentList.length; i++) {
      lines.push(buildHeaderLine(agentList[i], frame))
    }
    const remaining = agentList.length - shown
    if (remaining > 0) {
      lines.push(chalk.dim(`  +${remaining} more agent${remaining === 1 ? "" : "s"}...`))
    }
    return lines
  }

  // Distribute history budget across agents
  const headerBudget = agentList.length
  const historyBudget = Math.max(0, maxLines - headerBudget)
  const perAgent = Math.floor(historyBudget / agentList.length)

  const lines: string[] = []
  for (const agent of agentList) {
    lines.push(buildHeaderLine(agent, frame))

    const allHistory = buildHistoryLines(agent.history)
    // Reserve 1 line for trim indicator if history will be truncated
    const willTrim = allHistory.length > perAgent
    const historySlots = willTrim ? Math.max(0, perAgent - 1) : Math.min(perAgent, allHistory.length)
    const visible = allHistory.slice(-historySlots)

    const trimmed = allHistory.length - historySlots
    if (trimmed > 0) {
      lines.push(chalk.dim(`    ... ${trimmed} more`))
    }

    // Replace the last visible entry with a spinner prefix if agent is still working
    if (visible.length > 0 && !agent.checking) {
      const last = agent.history[agent.history.length - 1]
      if (last) {
        visible[visible.length - 1] = `    ${FRAMES[frame % FRAMES.length]} ${last.text}`
      }
    }

    lines.push(...visible)
  }

  return lines
}

export function renderApp(): UIController {
  const agents = new Map<string, AgentState>()
  const evalResults = new Map<string, EvalResult>()
  let prevLineCount = 0
  let spinnerFrame = 0
  let interval: ReturnType<typeof setInterval> | null = null
  let completedCount = 0
  let finished = false

  const isTTY = process.stdout.isTTY ?? false
  const getCols = () => (process.stdout.columns || 80)
  const getMaxLines = () => Math.max(1, (process.stdout.rows || 24) - 2)

  function clearDynamic() {
    if (!isTTY || prevLineCount === 0) return
    process.stdout.moveCursor(0, -prevLineCount)
    process.stdout.write("\x1b[J")
    prevLineCount = 0
  }

  function redraw() {
    if (finished) return
    if (!isTTY) return

    const lines = buildDynamicLines(agents, spinnerFrame, getMaxLines())
    const cols = getCols()
    const truncated = lines.map((l) => truncateLine(l, cols))

    if (prevLineCount > 0) {
      process.stdout.moveCursor(0, -prevLineCount)
      process.stdout.write("\x1b[J")
    }

    for (const line of truncated) {
      process.stdout.write(line + "\n")
    }
    prevLineCount = truncated.length
  }

  // Hide cursor and start spinner
  if (isTTY) process.stdout.write("\x1b[?25l")
  interval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % FRAMES.length
    redraw()
  }, 80)

  if (isTTY) {
    process.stdout.on("resize", () => { if (!finished) redraw() })
  }

  return {
    addCompleted(text: string) {
      clearDynamic()
      console.log(text)
      redraw()
    },

    addCompletedBatch(texts: string[]) {
      clearDynamic()
      for (const t of texts) console.log(t)
      redraw()
    },

    startAgent(name: string) {
      agents.set(name, { name, status: "", history: [] })
      redraw()
    },

    updateAgentStatus(name: string, status: string) {
      const agent = agents.get(name)
      if (agent) {
        agent.status = status
        // No explicit redraw — spinner interval handles it
      }
    },

    addAgentHistory(name: string, type: ActionType, text: string) {
      const agent = agents.get(name)
      if (!agent) return
      const last = agent.history[agent.history.length - 1]
      if (last && last.type === type && last.text === text) return
      if (agent.history.length >= MAX_HISTORY) return
      agent.history.push({ type, text })
    },

    setAgentResult(name: string, result: AgentResult) {
      const agent = agents.get(name)
      if (!agent) return
      agent.result = result
    },

    setAgentChecking(name: string, index: number, total: number) {
      const agent = agents.get(name)
      if (!agent) return
      agent.checking = { index, total }
    },

    setAgentEval(name: string, evalResult: EvalResult) {
      evalResults.set(name, evalResult)
    },

    completeAgent(name: string) {
      const agent = agents.get(name)
      if (!agent?.result) return

      clearDynamic()

      const dur = formatDur(agent.result.duration)
      const suffix = buildStatusSuffix(agent.result, evalResults.get(name))

      if (completedCount > 0) console.log(" ")
      console.log(`${chalk.bold(name)}  ${chalk.dim(dur)}${suffix}`)
      for (const h of agent.history) {
        console.log(`    ${historyPrefix(h.type)} ${h.text}`)
      }
      completedCount++

      agents.delete(name)
      redraw()
    },

    finish() {
      finished = true
      clearDynamic()
      if (interval) { clearInterval(interval); interval = null }
      if (isTTY) process.stdout.write("\x1b[?25h")
    },
  }
}

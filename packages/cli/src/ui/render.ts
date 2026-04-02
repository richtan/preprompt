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
  evalResult?: EvalResult
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
  if (agent.evalResult && agent.result) {
    const failed = agent.evalResult.steps.filter((s) => s.status === "fail").length
    const prefix = failed > 0 ? chalk.red("✗") : chalk.green("✓")
    const failSuffix = failed > 0
      ? `  ${chalk.red(`${failed} failed`)}`
      : `  ${chalk.green("0 failed")}`
    return `${prefix} ${chalk.bold(agent.name)}  ${chalk.dim(formatDur(agent.result.duration))}${failSuffix}`
  }
  let line = `${FRAMES[frame % FRAMES.length]} ${chalk.bold(agent.name)}`
  if (agent.result) {
    line += chalk.dim(`  ${formatDur(agent.result.duration)}`)
    line += `  ${chalk.cyan("checking")}`
  } else {
    line += `  ${chalk.cyan("executing")}`
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
      ? `  ${chalk.red(`${failed} failed`)}`
      : `  ${chalk.green("0 failed")}`
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

  // If even headers + separators don't fit, show what we can + overflow indicator
  const separatorCount = agentList.length - 1
  if (agentList.length + separatorCount > maxLines) {
    // Each shown agent = 1 header + 1 separator (except first), plus 1 overflow line
    const shown = Math.min(agentList.length, Math.max(1, Math.floor(maxLines / 2)))
    const lines: string[] = []
    for (let i = 0; i < shown; i++) {
      if (i > 0) lines.push("")
      lines.push(buildHeaderLine(agentList[i], frame))
    }
    const remaining = agentList.length - shown
    if (remaining > 0) {
      lines.push(chalk.dim(`  +${remaining} more agent${remaining === 1 ? "" : "s"}...`))
    }
    return lines
  }

  // Distribute history budget across agents (reserve lines for headers + separators)
  const headerBudget = agentList.length + separatorCount
  const historyBudget = Math.max(0, maxLines - headerBudget)
  const perAgent = Math.floor(historyBudget / agentList.length)

  const lines: string[] = []
  for (let i = 0; i < agentList.length; i++) {
    if (i > 0) lines.push("")
    const agent = agentList[i]
    lines.push(buildHeaderLine(agent, frame))

    const allHistory = buildHistoryLines(agent.history)
    const failureItems = agent.evalResult
      ? agent.evalResult.steps.filter((s) => s.status === "fail")
      : []

    if (failureItems.length > 0 && perAgent > 0) {
      const failureBudget = Math.min(failureItems.length + 1, perAgent)
      const histBudget = Math.max(0, perAgent - failureBudget)

      const willTrim = allHistory.length > histBudget
      const historySlots = willTrim ? Math.max(0, histBudget - 1) : Math.min(histBudget, allHistory.length)
      const visible = historySlots > 0 ? allHistory.slice(-historySlots) : []

      const trimmed = allHistory.length - historySlots
      if (trimmed > 0) {
        lines.push(chalk.dim(`    ... ${trimmed} more`))
      }

      if (visible.length > 0 && !agent.result && !agent.checking) {
        const last = agent.history[agent.history.length - 1]
        if (last) {
          visible[visible.length - 1] = `    ${FRAMES[frame % FRAMES.length]} ${last.text}`
        }
      }

      lines.push(...visible)

      lines.push("")
      const shownFailures = failureItems.slice(0, failureBudget - 1)
      for (const step of shownFailures) {
        lines.push(chalk.red(`    - ${step.description}`))
      }
    } else {
      const willTrim = allHistory.length > perAgent
      const historySlots = willTrim ? Math.max(0, perAgent - 1) : Math.min(perAgent, allHistory.length)
      const visible = historySlots > 0 ? allHistory.slice(-historySlots) : []

      const trimmed = allHistory.length - historySlots
      if (trimmed > 0) {
        lines.push(chalk.dim(`    ... ${trimmed} more`))
      }

      if (visible.length > 0 && !agent.result && !agent.checking) {
        const last = agent.history[agent.history.length - 1]
        if (last) {
          visible[visible.length - 1] = `    ${FRAMES[frame % FRAMES.length]} ${last.text}`
        }
      }

      lines.push(...visible)
    }
  }

  return lines
}

export function renderApp(): UIController {
  const agents = new Map<string, AgentState>()
  const evalResults = new Map<string, EvalResult>()
  let prevLineCount = 0
  let spinnerFrame = 0
  let interval: ReturnType<typeof setInterval> | null = null
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

    const maxLines = getMaxLines()
    const cols = getCols()
    const raw = buildDynamicLines(agents, spinnerFrame, maxLines)
    const capped = raw.length > maxLines ? raw.slice(0, maxLines) : raw
    const truncated = capped.map((l) => truncateLine(l, cols))

    if (prevLineCount > 0) {
      process.stdout.moveCursor(0, -prevLineCount)
      process.stdout.write("\x1b[J")
    }

    for (const line of truncated) {
      process.stdout.write(line + "\n")
    }
    prevLineCount = truncated.length
  }

  if (isTTY) process.stdout.write("\x1b[?25l")

  const onResize = () => { if (!finished) redraw() }

  if (isTTY) {
    interval = setInterval(() => {
      spinnerFrame = (spinnerFrame + 1) % FRAMES.length
      redraw()
    }, 80)
    process.stdout.on("resize", onResize)
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
      agent.history.push({ type, text })
      if (agent.history.length > MAX_HISTORY) agent.history.shift()
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
      const agent = agents.get(name)
      if (agent) agent.evalResult = evalResult
    },

    completeAgent(_name: string) {
      // No-op: all agents flush at finish()
    },

    finish() {
      finished = true
      clearDynamic()
      if (interval) { clearInterval(interval); interval = null }

      const agentList = [...agents.values()]
      for (let i = 0; i < agentList.length; i++) {
        const agent = agentList[i]
        if (!agent.result) continue

        if (i > 0) console.log("")

        const evalResult = evalResults.get(agent.name)
        const dur = formatDur(agent.result.duration)
        const suffix = buildStatusSuffix(agent.result, evalResult)

        console.log(`${chalk.bold(agent.name)}  ${chalk.dim(dur)}${suffix}`)
        for (const h of agent.history) {
          console.log(`    ${historyPrefix(h.type)} ${h.text}`)
        }

        if (evalResult) {
          const failures = evalResult.steps.filter((s) => s.status === "fail")
          if (failures.length > 0) {
            console.log("")
            for (const step of failures) {
              console.log(chalk.red(`    - ${step.description}`))
            }
          }
        }
      }

      agents.clear()
      if (isTTY) {
        process.stdout.off("resize", onResize)
        process.stdout.write("\x1b[?25h")
      }
    },
  }
}

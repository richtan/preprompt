import chalk from "chalk"
import { logUpdateStderr } from "log-update"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const MAX_VISIBLE_FILES = 10

let multiMode = false
let maxAgentWidth = 0
let agentCount = 0
let doneCount = 0
let isTTY = process.stderr.isTTY ?? false

// Spinner state
let spinnerLabel = ""
let spinnerStart = 0
let spinnerTimer: ReturnType<typeof setInterval> | null = null
let spinnerFrame = 0
let fileCount = 0

export function setStreamMode(multi: boolean, agentNames: string[] = []): void {
  multiMode = multi
  maxAgentWidth = agentNames.length > 0
    ? Math.max(...agentNames.map((n) => n.length))
    : 0
  agentCount = agentNames.length
  doneCount = 0
  fileCount = 0
  isTTY = process.stderr.isTTY ?? false
}

export function startExecutionSpinner(label: string): void {
  spinnerLabel = label
  spinnerStart = Date.now()
  spinnerFrame = 0

  if (!isTTY) {
    process.stderr.write(label + "\n")
    return
  }

  renderSpinner()
  spinnerTimer = setInterval(renderSpinner, 80)
}

function renderSpinner(): void {
  const elapsed = ((Date.now() - spinnerStart) / 1000).toFixed(1)
  const frame = chalk.dim(SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length])
  logUpdateStderr(`${frame} ${spinnerLabel} ${chalk.dim(elapsed + "s")}`)
  spinnerFrame++
}

export function stopSpinner(): void {
  if (spinnerTimer) {
    clearInterval(spinnerTimer)
    spinnerTimer = null
  }
  logUpdateStderr.clear()
}

export function printLine(line: string): void {
  // Print static line above the spinner
  if (spinnerTimer) {
    logUpdateStderr.clear()
    process.stderr.write(line + "\n")
    renderSpinner()
  } else {
    process.stderr.write(line + "\n")
  }
}

export function emitFileChange(agent: string, path: string, type: "added" | "modified" | "deleted"): void {
  fileCount++
  if (fileCount > MAX_VISIBLE_FILES) return // capped, shown in summary

  const prefix = multiMode
    ? "  " + agent.padEnd(maxAgentWidth + 2)
    : "  "

  const sigil = type === "added" ? chalk.green("+")
    : type === "modified" ? chalk.yellow("~")
    : chalk.red("-")

  printLine(`${prefix}${sigil} ${path}`)
}

export function emitOverflowCount(count: number): void {
  if (count <= 0) return
  const prefix = multiMode ? "  " + "".padEnd(maxAgentWidth + 2) : "  "
  printLine(`${prefix}${chalk.dim(`... and ${count} more`)}`)
}

export function emitDone(content: string): void {
  doneCount++
  printLine(content)

  if (doneCount >= agentCount) {
    stopSpinner()
  }
}

export function emitError(agent: string, content: string): void {
  const prefix = multiMode
    ? "  " + agent.padEnd(maxAgentWidth + 2)
    : "  "
  printLine(prefix + chalk.red(content))
}

export function clearEvents(): void {
  stopSpinner()
  multiMode = false
  maxAgentWidth = 0
  agentCount = 0
  doneCount = 0
  fileCount = 0
}

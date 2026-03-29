import chalk from "chalk"
import yoctoSpinner from "yocto-spinner"

export interface StreamEvent {
  agent: string
  type: "start" | "stdout" | "stderr" | "file" | "command" | "done" | "error"
  content: string
  timestamp: number
}

let multiMode = false
let maxAgentWidth = 0
let activeSpinner: ReturnType<typeof yoctoSpinner> | null = null
let spinnerStart = 0
let spinnerTimer: ReturnType<typeof setInterval> | null = null
let agentCount = 0
let doneCount = 0
let isTTY = process.stderr.isTTY ?? false

export function setStreamMode(multi: boolean, agentNames: string[] = []): void {
  multiMode = multi
  maxAgentWidth = agentNames.length > 0
    ? Math.max(...agentNames.map((n) => n.length))
    : 0
  agentCount = agentNames.length
  doneCount = 0
  isTTY = process.stderr.isTTY ?? false
}

export function startExecutionSpinner(label: string): void {
  spinnerStart = Date.now()

  if (!isTTY) {
    // Non-TTY: just print a static line
    console.error(label)
    return
  }

  activeSpinner = yoctoSpinner({ text: label, stream: process.stderr }).start()

  // Update elapsed time every 100ms
  spinnerTimer = setInterval(() => {
    if (activeSpinner) {
      const elapsed = ((Date.now() - spinnerStart) / 1000).toFixed(1)
      activeSpinner.text = `${label} ${chalk.dim(elapsed + "s")}`
    }
  }, 100)
}

export function stopSpinner(): void {
  if (spinnerTimer) {
    clearInterval(spinnerTimer)
    spinnerTimer = null
  }
  if (activeSpinner) {
    activeSpinner.stop()
    activeSpinner = null
  }
}

function printLine(line: string): void {
  if (activeSpinner) {
    // Stop spinner, print line, restart spinner
    const currentText = activeSpinner.text
    activeSpinner.stop()
    console.error(line)
    activeSpinner = yoctoSpinner({ text: currentText, stream: process.stderr }).start()
  } else {
    console.error(line)
  }
}

export function emitEvent(event: StreamEvent): void {
  const prefix = multiMode
    ? event.agent.padEnd(maxAgentWidth + 2)
    : "  "

  switch (event.type) {
    case "start":
      // Suppressed. The spinner handles the "running" state.
      break

    case "command":
      printLine(prefix + chalk.bold("> ") + event.content)
      break

    case "file":
      printLine(prefix + chalk.green("+ ") + event.content)
      break

    case "stdout": {
      const parsed = parseStdout(event.content)
      if (parsed) {
        emitEvent({ ...event, type: parsed.type as "file" | "command", content: parsed.content })
        return
      }
      const trimmed = event.content.trim()
      if (trimmed && !isNoise(trimmed)) {
        printLine(prefix + chalk.dim(truncate(trimmed, 120)))
      }
      break
    }

    case "stderr": {
      const trimmed = event.content.trim()
      if (trimmed && !isNoise(trimmed)) {
        printLine(prefix + chalk.dim(trimmed))
      }
      break
    }

    case "done": {
      doneCount++
      printLine(event.content)

      // If all agents done, stop the spinner
      if (doneCount >= agentCount) {
        stopSpinner()
      }
      break
    }

    case "error":
      printLine(prefix + chalk.red(event.content))
      break
  }
}

function parseStdout(line: string): { type: string; content: string } | null {
  const filePatterns = [
    /(?:Created?|Wrote?|Writing)\s+[`']?([^\s`']+)[`']?/i,
    /^\s*\+\s+(.+\.[a-z]+)\s*$/i,
  ]
  for (const pattern of filePatterns) {
    const match = line.match(pattern)
    if (match) return { type: "file", content: match[1] }
  }

  const cmdPatterns = [
    /(?:Running|Executing|>\s*)\s*[`']?(.+?)[`']?\s*$/i,
    /^\$\s+(.+)$/,
  ]
  for (const pattern of cmdPatterns) {
    const match = line.match(pattern)
    if (match && match[1].length < 200) return { type: "command", content: match[1] }
  }

  return null
}

function isNoise(line: string): boolean {
  return /^[\s]*$|^─+$|^[=]+$|^Warning: no stdin/i.test(line)
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + "..." : str
}

export function clearEvents(): void {
  stopSpinner()
  multiMode = false
  maxAgentWidth = 0
  agentCount = 0
  doneCount = 0
}

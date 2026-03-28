import chalk from "chalk"

export interface StreamEvent {
  agent: string
  type: "start" | "stdout" | "stderr" | "file" | "command" | "done" | "error"
  content: string
  timestamp: number
}

let multiMode = false
let maxAgentWidth = 0

export function setStreamMode(multi: boolean, agentNames: string[] = []): void {
  multiMode = multi
  maxAgentWidth = agentNames.length > 0
    ? Math.max(...agentNames.map((n) => n.length))
    : 0
}

export function emitEvent(event: StreamEvent): void {
  const prefix = multiMode
    ? event.agent.padEnd(maxAgentWidth + 2)
    : "  "

  switch (event.type) {
    case "start":
      if (multiMode) {
        console.log(prefix + chalk.dim("starting..."))
      }
      break

    case "command":
      console.log(prefix + chalk.bold("> ") + event.content)
      break

    case "file":
      console.log(prefix + chalk.green("+ ") + event.content)
      break

    case "stdout": {
      const parsed = parseStdout(event.content)
      if (parsed) {
        emitEvent({ ...event, type: parsed.type as "file" | "command", content: parsed.content })
        return
      }
      const trimmed = event.content.trim()
      if (trimmed && !isNoise(trimmed)) {
        console.log(prefix + chalk.dim(truncate(trimmed, 120)))
      }
      break
    }

    case "stderr": {
      const trimmed = event.content.trim()
      if (trimmed && !isNoise(trimmed)) {
        console.log(prefix + chalk.dim(trimmed))
      }
      break
    }

    case "done":
      console.log(prefix + event.content)
      break

    case "error":
      console.log(prefix + chalk.red(event.content))
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
  multiMode = false
  maxAgentWidth = 0
}

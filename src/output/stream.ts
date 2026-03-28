import chalk from "chalk"

export interface StreamEvent {
  agent: string
  type: "start" | "stdout" | "stderr" | "file" | "command" | "done" | "error"
  content: string
  timestamp: number
}

interface AgentState {
  lastAction: string
  fileCount: number
  commands: string[]
}

const agentStates = new Map<string, AgentState>()
const allEvents: StreamEvent[] = []

// Track what actions each agent has taken so we can detect divergences
const agentActions = new Map<string, string[]>()

export function emitEvent(event: StreamEvent): void {
  allEvents.push(event)

  if (!agentStates.has(event.agent)) {
    agentStates.set(event.agent, { lastAction: "", fileCount: 0, commands: [] })
  }
  const state = agentStates.get(event.agent)!

  if (!agentActions.has(event.agent)) {
    agentActions.set(event.agent, [])
  }
  const actions = agentActions.get(event.agent)!

  const label = chalk.dim(`  ${padAgent(event.agent)} │ `)

  switch (event.type) {
    case "start":
      console.log(label + chalk.dim(event.content))
      break

    case "command": {
      state.commands.push(event.content)
      actions.push(`cmd:${event.content}`)

      // Check for divergence: is this command different from what other agents ran?
      const divergence = checkCommandDivergence(event.agent, event.content)
      if (divergence) {
        console.log(
          label + chalk.bold("⚡ ") + event.content + chalk.red(" ← divergence!")
        )
      } else {
        console.log(label + chalk.bold("⚡ ") + event.content)
      }
      break
    }

    case "file": {
      state.fileCount++
      actions.push(`file:${event.content}`)

      const divergence = checkFileDivergence(event.agent, event.content)
      if (divergence) {
        console.log(
          label + "📄 " + event.content + chalk.red(" ← " + divergence)
        )
      } else {
        console.log(label + "📄 " + event.content)
      }
      break
    }

    case "stdout": {
      // Parse stdout for file creation and command patterns
      const parsed = parseStdout(event.content)
      if (parsed) {
        emitEvent({ ...event, type: parsed.type as "file" | "command", content: parsed.content })
        return
      }
      // Only show non-empty, non-noise lines
      const trimmed = event.content.trim()
      if (trimmed && !isNoise(trimmed)) {
        console.log(label + chalk.dim(truncate(trimmed, 120)))
      }
      break
    }

    case "stderr": {
      const trimmed = event.content.trim()
      if (trimmed && !isNoise(trimmed)) {
        console.log(label + chalk.dim.red(truncate(trimmed, 120)))
      }
      break
    }

    case "done":
      console.log(
        label +
          (event.content.startsWith("✓")
            ? chalk.green(event.content)
            : chalk.red(event.content))
      )
      break

    case "error":
      console.log(label + chalk.red(event.content))
      break
  }
}

function checkCommandDivergence(
  agent: string,
  command: string
): boolean {
  // Normalize command for comparison (e.g., "npm install" vs "yarn add")
  const normalized = normalizeCommand(command)

  for (const [otherAgent, actions] of agentActions) {
    if (otherAgent === agent) continue
    const otherCommands = actions
      .filter((a) => a.startsWith("cmd:"))
      .map((a) => normalizeCommand(a.slice(4)))

    // If another agent ran a different package manager for the same purpose
    if (otherCommands.length > 0) {
      const lastOther = otherCommands[otherCommands.length - 1]
      if (
        lastOther !== normalized &&
        isPackageInstall(command) &&
        isPackageInstall(otherCommands.map((c) => c).pop() ?? "")
      ) {
        return true
      }
    }
  }
  return false
}

function checkFileDivergence(
  agent: string,
  filePath: string
): string | null {
  // Check if other agents created a file at a different path for the same purpose
  for (const [otherAgent, actions] of agentActions) {
    if (otherAgent === agent) continue
    const otherFiles = actions
      .filter((a) => a.startsWith("file:"))
      .map((a) => a.slice(5))

    // Detect path divergences (e.g., pages/index.tsx vs src/app/page.tsx)
    const baseName = filePath.split("/").pop() ?? filePath
    for (const otherFile of otherFiles) {
      const otherBase = otherFile.split("/").pop() ?? otherFile
      if (otherBase === baseName && otherFile !== filePath) {
        return `different path! (${otherAgent}: ${otherFile})`
      }
    }
  }
  return null
}

function normalizeCommand(cmd: string): string {
  return cmd.trim().toLowerCase()
}

function isPackageInstall(cmd: string): boolean {
  return /\b(npm install|yarn add|yarn install|pnpm install|pnpm add|bun install|bun add)\b/i.test(
    cmd
  )
}

function parseStdout(line: string): { type: string; content: string } | null {
  // Detect file creation patterns
  const filePatterns = [
    /(?:Created?|Wrote?|Writing)\s+[`']?([^\s`']+)[`']?/i,
    /^\s*\+\s+(.+\.[a-z]+)\s*$/i,
  ]
  for (const pattern of filePatterns) {
    const match = line.match(pattern)
    if (match) {
      return { type: "file", content: match[1] }
    }
  }

  // Detect command execution patterns
  const cmdPatterns = [
    /(?:Running|Executing|>\s*)\s*[`']?(.+?)[`']?\s*$/i,
    /^\$\s+(.+)$/,
  ]
  for (const pattern of cmdPatterns) {
    const match = line.match(pattern)
    if (match && match[1].length < 200) {
      return { type: "command", content: match[1] }
    }
  }

  return null
}

function isNoise(line: string): boolean {
  // Filter out common noise from agent output
  const noisePatterns = [
    /^[\s]*$/,
    /^─+$/,
    /^[=]+$/,
    /^Warning: no stdin/i,
  ]
  return noisePatterns.some((p) => p.test(line))
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + "..." : str
}

function padAgent(name: string): string {
  return name.padEnd(12)
}

export function getEvents(): StreamEvent[] {
  return [...allEvents]
}

export function clearEvents(): void {
  allEvents.length = 0
  agentStates.clear()
  agentActions.clear()
}

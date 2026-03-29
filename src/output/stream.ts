import chalk from "chalk"

const MAX_VISIBLE_FILES = 10

let multiMode = false
let maxAgentWidth = 0
let fileCount = 0

export function setStreamMode(multi: boolean, agentNames: string[] = []): void {
  multiMode = multi
  maxAgentWidth = agentNames.length > 0
    ? Math.max(...agentNames.map((n) => n.length))
    : 0
  fileCount = 0
}

export function emitFileChange(agent: string, path: string): void {
  fileCount++
  if (fileCount > MAX_VISIBLE_FILES) return

  const prefix = multiMode
    ? "  " + agent.padEnd(maxAgentWidth + 2)
    : "  "

  console.log(`${prefix}${chalk.green("+")} ${path}`)
}

export function emitOverflowCount(count: number): void {
  if (count <= 0) return
  const prefix = multiMode ? "  " + "".padEnd(maxAgentWidth + 2) : "  "
  console.log(`${prefix}${chalk.dim(`... and ${count} more`)}`)
}

export function clearEvents(): void {
  multiMode = false
  maxAgentWidth = 0
  fileCount = 0
}

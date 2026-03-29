let multiMode = false
let maxAgentWidth = 0

export function setStreamMode(multi: boolean, agentNames: string[] = []): void {
  multiMode = multi
  maxAgentWidth = agentNames.length > 0
    ? Math.max(...agentNames.map((n) => n.length))
    : 0
}

export function clearEvents(): void {
  multiMode = false
  maxAgentWidth = 0
}

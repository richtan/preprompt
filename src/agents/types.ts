import type { AgentInfo, ExecutionResult } from "../types.js"

export interface AgentAdapter {
  name: string
  detect(): Promise<AgentInfo>
  execute(
    prompt: string,
    workdir: string,
    options: { timeout: number }
  ): Promise<ExecutionResult>
}

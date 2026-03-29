import type { AgentInfo, ExecutionResult } from "../types.js"

export interface ExecuteOptions {
  timeout: number
  onOutput?: (line: string) => void
}

export interface AgentAdapter {
  name: string
  detect(): Promise<AgentInfo>
  execute(
    prompt: string,
    workdir: string,
    options: ExecuteOptions
  ): Promise<ExecutionResult>
}

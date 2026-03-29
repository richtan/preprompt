import type { AgentInfo, ExecutionResult } from "../types.js"

export interface ExecuteOptions {
  timeout: number
  onStatus?: (status: string) => void
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

import type { AgentInfo, ExecutionResult } from "../types.js"

export type ActionType = "command" | "create" | "edit" | "other"

export interface ExecuteOptions {
  timeout: number
  env?: Record<string, string>
  onStatus?: (status: string) => void
  onAction?: (type: ActionType, text: string) => void
  onStdout?: (chunk: string) => void
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

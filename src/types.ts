export interface AgentInfo {
  name: string
  installed: boolean
  authenticated: boolean
  version?: string
}

export interface ExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

export interface FileEntry {
  path: string
  type: "file" | "directory"
  size: number
}

export interface Snapshot {
  files: FileEntry[]
  timestamp: number
}

export interface SnapshotDiff {
  added: string[]
  modified: string[]
  deleted: string[]
}

export interface RunResult {
  agent: string
  prompt: string
  workdir: string
  execution: ExecutionResult
  before: Snapshot
  after: Snapshot
  diff: SnapshotDiff
  status: "pass" | "fail" | "timeout" | "error" | "no-changes"
  timestamp: number
}

export interface MultiRunResult {
  prompt: string
  results: RunResult[]
  timestamp: number
}

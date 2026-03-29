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

export interface Criterion {
  number: number
  group: string   // section name (e.g., "Project setup", "Dependencies")
  type: "command" | "file-exists" | "file-contains" | "service" | "behavioral"
  description: string
  check?: string  // the command or pattern to verify
}

export interface EvalStep {
  number: number
  description: string
  status: "pass" | "fail" | "skip"
  note?: string
}

export interface EvalResult {
  agent: string
  criteria: Criterion[]
  steps: EvalStep[]
  score: number
  duration: number
}

export interface MultiRunResult {
  prompt: string
  criteria?: Criterion[]
  results: RunResult[]
  evaluations?: EvalResult[]
  timestamp: number
}

/**
 * SandboxProvider interface — abstracts the execution environment.
 * E2B implementation now, self-hosted Docker later.
 *
 *   create() ──► exec() ──► listFiles() ──► destroy()
 *       │            │            │              │
 *       ▼            ▼            ▼              ▼
 *   [boot fail]  [timeout]   [empty dir]   [cleanup fail]
 */
export interface SandboxHandle {
  id: string
  exec(
    command: string,
    opts?: {
      timeout?: number
      env?: Record<string, string>
      onStdout?: (chunk: string) => void
      onStderr?: (chunk: string) => void
    }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>
  writeFile(path: string, content: string): Promise<void>
  listFiles(path: string): Promise<Array<{ path: string; type: "file" | "directory"; size: number }>>
  destroy(): Promise<void>
}

export interface SandboxProvider {
  create(opts: {
    template: string
    env?: Record<string, string>
  }): Promise<SandboxHandle>
}

import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

export const aider: AgentAdapter = {
  name: "aider",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "aider",
      installed: false,
      authenticated: false,
    }

    try {
      const { stdout } = await execa("aider", ["--version"], { timeout: 5000 })
      info.installed = true
      info.version = stdout.trim()
      info.authenticated = true
    } catch {
      return info
    }

    return info
  },

  async execute(
    prompt: string,
    workdir: string,
    options: ExecuteOptions
  ): Promise<ExecutionResult> {
    const start = Date.now()

    try {
      const proc = execa(
        "aider",
        ["--yes-always", "--no-git", "--message", prompt],
        {
          cwd: workdir,
          timeout: options.timeout,
          reject: false,
        }
      )

      if (options.onOutput && proc.stdout) {
        let buffer = ""
        proc.stdout.on("data", (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (line.trim()) options.onOutput!(line, "stdout")
          }
        })
      }

      const result = await proc

      return {
        exitCode: result.exitCode ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - start,
      }
    } catch (error: unknown) {
      const duration = Date.now() - start
      const isTimeout =
        error instanceof Error && error.message.includes("timed out")

      return {
        exitCode: isTimeout ? -1 : 1,
        stdout: "",
        stderr: isTimeout
          ? `Agent timed out after ${options.timeout}ms`
          : error instanceof Error
            ? error.message
            : "Unknown execution error",
        duration,
      }
    }
  },
}

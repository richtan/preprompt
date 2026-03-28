import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

export const copilot: AgentAdapter = {
  name: "copilot-cli",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "copilot-cli",
      installed: false,
      authenticated: false,
    }

    try {
      const { exitCode } = await execa("gh", ["copilot", "--version"], {
        timeout: 5000,
        reject: false,
      })
      if (exitCode === 0) {
        info.installed = true
        info.authenticated = true
        info.version = "gh copilot"
      }
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
        "gh",
        ["copilot", "suggest", "-t", "shell", prompt],
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

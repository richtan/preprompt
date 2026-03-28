import { execa } from "execa"
import type { AgentAdapter } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

const STDIN_THRESHOLD = 100_000 // 100KB

export const claudeCode: AgentAdapter = {
  name: "claude-code",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "claude-code",
      installed: false,
      authenticated: false,
    }

    try {
      const { stdout } = await execa("claude", ["--version"], { timeout: 5000 })
      info.installed = true
      info.version = stdout.trim()
    } catch {
      return info
    }

    // If we got a version, assume authenticated. The actual auth check
    // (running a prompt) is too slow for detection. Auth failures surface
    // at execution time with a clear error.
    info.authenticated = true

    return info
  },

  async execute(
    prompt: string,
    workdir: string,
    options: { timeout: number }
  ): Promise<ExecutionResult> {
    const start = Date.now()

    const args = [
      "--print",
      "--dangerously-skip-permissions",
      "--output-format", "text",
    ]

    const useStdin = Buffer.byteLength(prompt, "utf8") > STDIN_THRESHOLD

    if (!useStdin) {
      args.push("-p", prompt)
    }

    try {
      const result = await execa("claude", args, {
        cwd: workdir,
        timeout: options.timeout,
        input: useStdin ? prompt : undefined,
        reject: false,
      })

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

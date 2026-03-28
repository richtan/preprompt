import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

const STDIN_THRESHOLD = 100_000

export const codex: AgentAdapter = {
  name: "codex",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "codex",
      installed: false,
      authenticated: false,
    }

    try {
      const { stdout } = await execa("codex", ["--version"], { timeout: 5000 })
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

    const useStdin = Buffer.byteLength(prompt, "utf8") > STDIN_THRESHOLD

    const args = ["exec", prompt]
    if (useStdin) {
      args[1] = "Follow the instructions from stdin"
    }
    args.push("-C", workdir, "--full-auto")

    try {
      const proc = execa("codex", args, {
        cwd: workdir,
        timeout: options.timeout,
        input: useStdin ? prompt : undefined,
        reject: false,
      })

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

      if (options.onOutput && proc.stderr) {
        let buffer = ""
        proc.stderr.on("data", (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (line.trim()) options.onOutput!(line, "stderr")
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

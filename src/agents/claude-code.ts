import { basename } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

const STDIN_THRESHOLD = 100_000

function extractStatus(event: any): string | null {
  if (event.type !== "assistant") return null
  const content = event.message?.content
  if (!Array.isArray(content)) return null

  for (const block of content) {
    if (block.type !== "tool_use") continue
    const name = block.name
    const input = block.input ?? {}

    switch (name) {
      case "Write": return `Writing ${basename(input.file_path ?? "file")}`
      case "Edit": return `Editing ${basename(input.file_path ?? "file")}`
      case "Read": return `Reading ${basename(input.file_path ?? "file")}`
      case "Bash": {
        const cmd = String(input.command ?? "")
        return `Running ${cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd}`
      }
      case "Glob": return "Searching files..."
      case "Grep": return "Searching code..."
      default: return `${name}...`
    }
  }
  return null
}

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

    info.authenticated = true
    return info
  },

  async execute(
    prompt: string,
    workdir: string,
    options: ExecuteOptions
  ): Promise<ExecutionResult> {
    const start = Date.now()
    const streaming = !!options.onStatus

    const args = [
      "--print",
      "--dangerously-skip-permissions",
    ]

    // Use stream-json when UI is active for structured events
    // Use text mode when evaluator calls (needs plain text response)
    if (streaming) {
      args.push("--output-format", "stream-json", "--verbose")
    } else {
      args.push("--output-format", "text")
    }

    const useStdin = Buffer.byteLength(prompt, "utf8") > STDIN_THRESHOLD
    if (!useStdin) {
      args.push("-p", prompt)
    }

    try {
      const proc = execa("claude", args, {
        cwd: workdir,
        timeout: options.timeout,
        input: useStdin ? prompt : undefined,
        reject: false,
      })

      let finalText = ""

      if (streaming && proc.stdout) {
        let buf = ""
        proc.stdout.on("data", (chunk: Buffer) => {
          buf += chunk.toString()
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const event = JSON.parse(line)

              // Extract status from tool_use events
              const status = extractStatus(event)
              if (status) options.onStatus!(status)

              // Collect text content
              if (event.type === "assistant") {
                const content = event.message?.content
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === "text" && block.text) {
                      finalText += block.text
                    }
                  }
                }
              }

              // Extract final result text
              if (event.type === "result" && event.result) {
                finalText = event.result
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        })
      } else if (!streaming && options.onStatus && proc.stdout) {
        // Fallback raw text streaming (shouldn't happen but safety net)
        let buf = ""
        proc.stdout.on("data", (chunk: Buffer) => {
          buf += chunk.toString()
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const line of lines) {
            if (line.trim()) options.onStatus!(line)
          }
        })
      }

      const result = await proc

      return {
        exitCode: result.exitCode ?? 1,
        // Use parsed text for streaming mode, raw stdout for text mode
        stdout: streaming ? finalText : result.stdout,
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

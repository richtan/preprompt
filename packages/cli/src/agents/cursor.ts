import { basename } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

/**
 * Cursor Agent CLI adapter.
 *
 * Uses `--output-format stream-json` to get structured NDJSON events from
 * the `agent` binary (Cursor's standalone CLI agent).
 *
 *   agent --print --force --trust --output-format stream-json "prompt"
 *
 * Stream-JSON event format (same as Claude Code):
 *   { type: "assistant", message: { content: [{ type: "tool_use", name, input }] } }
 *   { type: "result", result: "final text" }
 *
 * Tool names (PascalCase): Write, Edit, Read, Bash, Glob, Grep, Delete
 */

export const cursor: AgentAdapter = {
  name: "cursor",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "cursor",
      installed: false,
      authenticated: false,
    }

    try {
      const { exitCode, stdout } = await execa("agent", ["--version"], {
        timeout: 5000,
        reject: false,
      })
      if (exitCode === 0) {
        info.installed = true
        info.version = stdout.trim()
      }
    } catch {
      return info
    }

    try {
      const { exitCode } = await execa("agent", ["status"], {
        timeout: 10000,
        reject: false,
      })
      info.authenticated = exitCode === 0
    } catch {
      // Can't determine auth
    }

    return info
  },

  async execute(
    prompt: string,
    workdir: string,
    options: ExecuteOptions
  ): Promise<ExecutionResult> {
    const start = Date.now()
    const streaming = !!options.onStatus

    const args = ["--print", "--force", "--trust"]

    if (streaming) {
      args.push("--output-format", "stream-json")
    }

    // Cursor takes prompt as positional arg (must come after flags)
    args.push(prompt)

    try {
      const proc = execa("agent", args, {
        cwd: workdir,
        timeout: options.timeout,
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
            const trimmed = line.trim()
            if (!trimmed) continue

            let event: any
            try {
              event = JSON.parse(trimmed)
            } catch {
              continue
            }

            if (event.type === "assistant") {
              const content = event.message?.content
              if (!Array.isArray(content)) continue

              for (const block of content) {
                if (block.type === "tool_use") {
                  const name = String(block.name ?? "").toLowerCase()
                  const input = block.input ?? {}

                  if (name === "write") {
                    const file = basename(input.file_path ?? "file")
                    options.onAction?.("create", file)
                    options.onStatus?.(`Writing ${file}`)
                  } else if (name === "edit") {
                    const file = basename(input.file_path ?? "file")
                    options.onAction?.("edit", file)
                    options.onStatus?.(`Editing ${file}`)
                  } else if (name === "bash" || name === "shell") {
                    const cmd = String(input.command ?? "")
                    if (cmd) {
                      options.onAction?.("command", cmd)
                      options.onStatus?.(cmd.length > 60 ? `Running ${cmd.slice(0, 57)}...` : `Running ${cmd}`)
                    }
                  } else if (name === "read" || name === "glob" || name === "grep") {
                    options.onStatus?.(`${block.name}...`)
                  }
                } else if (block.type === "text" && block.text) {
                  finalText += block.text
                }
              }
            } else if (event.type === "result" && event.result) {
              finalText = event.result
            }
          }
        })
      }

      const result = await proc

      return {
        exitCode: result.exitCode ?? 1,
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

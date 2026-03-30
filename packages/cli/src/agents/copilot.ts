import { basename } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

/**
 * GitHub Copilot CLI adapter.
 *
 * Uses `--output-format json` to get structured JSONL events from the
 * standalone `copilot` binary (GA Feb 2026).
 *
 *   copilot --autopilot --allow-all --output-format json -p "prompt"
 *
 * Known tool names in JSONL events:
 *   bash    — shell commands (arguments.command, arguments.description)
 *   create  — file creation (arguments.path, arguments.file_text)
 *   edit    — file editing (arguments.path, arguments.old_str, arguments.new_str)
 *   view    — file reading (arguments.path) — read-only, skipped
 *   report_intent — status announcement (arguments.intent)
 *   task_complete — end marker (arguments.summary)
 */

export const copilot: AgentAdapter = {
  name: "copilot-cli",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "copilot-cli",
      installed: false,
      authenticated: false,
    }

    try {
      const { exitCode, stdout } = await execa("copilot", ["--version"], {
        timeout: 5000,
        reject: false,
      })
      if (exitCode === 0) {
        info.installed = true
        info.authenticated = true
        info.version = stdout.trim()
      }
    } catch {
      // Not installed
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
        "copilot",
        ["--autopilot", "--allow-all", "--output-format", "json", "-p", prompt],
        {
          cwd: workdir,
          timeout: options.timeout,
          reject: false,
        }
      )

      if (proc.stdout) {
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

            // Skip ephemeral events (deltas, MCP status, background tasks)
            if (event.ephemeral) continue

            const type = event.type as string
            const data = event.data

            if (type === "tool.execution_start") {
              const toolName = data?.toolName as string
              const args = data?.arguments ?? {}

              if (toolName === "bash") {
                if (args.command) {
                  options.onAction?.("command", args.command)
                }
                options.onStatus?.(args.description ?? args.command ?? "")
              } else if (toolName === "create") {
                if (args.path) {
                  options.onAction?.("create", basename(args.path))
                }
              } else if (toolName === "edit") {
                if (args.path) {
                  options.onAction?.("edit", basename(args.path))
                }
              } else if (toolName === "report_intent") {
                if (args.intent) {
                  options.onStatus?.(args.intent)
                }
              }
              // view, task_complete, and unknown tools: skip
            } else if (type === "assistant.message") {
              const content = data?.content as string
              if (content) {
                options.onStatus?.(content.slice(0, 200))
              }
            }
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

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
 * Stream-JSON event types (verified from real output):
 *   { type: "tool_call", subtype: "started", tool_call: { editToolCall: { args: { path, streamContent } } } }
 *   { type: "tool_call", subtype: "completed", tool_call: { editToolCall: { args: {...}, result: { success: {...} } } } }
 *   { type: "tool_call", subtype: "started", tool_call: { shellToolCall: { args: { command }, description: "..." } } }
 *   { type: "tool_call", subtype: "started", tool_call: { readToolCall: { args: { path } } } }
 *   { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
 *   { type: "result", result: "final text", subtype: "success" }
 *   { type: "thinking", subtype: "delta"/"completed" }
 *
 * Tool call keys: editToolCall, shellToolCall, readToolCall, grepToolCall, globToolCall, lsToolCall, deleteToolCall
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

            if (event.type === "tool_call") {
              const tc = event.tool_call ?? {}

              if (event.subtype === "started") {
                if (tc.editToolCall) {
                  const file = basename(tc.editToolCall.args?.path ?? "file")
                  options.onStatus?.(`Writing ${file}`)
                } else if (tc.shellToolCall) {
                  const cmd = String(tc.shellToolCall.args?.command ?? "")
                  if (cmd) {
                    options.onAction?.("command", cmd)
                    const desc = tc.shellToolCall.description ?? tc.shellToolCall.args?.description ?? cmd
                    options.onStatus?.(String(desc).length > 60 ? `Running ${String(desc).slice(0, 57)}...` : `Running ${desc}`)
                  }
                } else if (tc.readToolCall) {
                  options.onStatus?.(`Reading ${basename(tc.readToolCall.args?.path ?? "file")}`)
                } else if (tc.grepToolCall) {
                  options.onStatus?.("Searching code...")
                } else if (tc.globToolCall || tc.lsToolCall) {
                  options.onStatus?.("Searching files...")
                }
              } else if (event.subtype === "completed") {
                // Determine create vs edit from completed result
                if (tc.editToolCall) {
                  const file = basename(tc.editToolCall.args?.path ?? "file")
                  const isEdit = !!tc.editToolCall.result?.success?.beforeFullFileContent
                  options.onAction?.(isEdit ? "edit" : "create", file)
                }
              }
            } else if (event.type === "assistant") {
              const content = event.message?.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "text" && block.text) {
                    finalText += block.text
                  }
                }
              }
            } else if (event.type === "result") {
              if (event.result) finalText = event.result
            }
            // thinking, system, user: ignore
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

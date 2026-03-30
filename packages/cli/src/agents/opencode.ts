import { basename } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

const STDIN_THRESHOLD = 100_000

/**
 * OpenCode CLI adapter.
 *
 * Uses `--format json` to get structured JSONL events from the `opencode`
 * binary (opencode-ai).
 *
 *   opencode run "prompt" --format json
 *
 * JSONL event types (verified from real output):
 *   { type: "tool_use", part: { tool: "write", state: { input: { filePath, content } } } }
 *   { type: "tool_use", part: { tool: "edit", state: { input: { filePath, oldString, newString } } } }
 *   { type: "tool_use", part: { tool: "bash", state: { input: { command, description } } } }
 *   { type: "text", part: { text: "..." } }
 *   { type: "step_start" | "step_finish" }
 */

export const opencode: AgentAdapter = {
  name: "opencode",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "opencode",
      installed: false,
      authenticated: false,
    }

    try {
      const { exitCode, stdout } = await execa("opencode", ["--version"], {
        timeout: 5000,
        reject: false,
      })
      if (exitCode === 0) {
        info.installed = true
        info.version = stdout.trim()
        // OpenCode manages provider auth internally; assume authed if installed
        info.authenticated = true
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
    const streaming = !!options.onStatus

    const useStdin = Buffer.byteLength(prompt, "utf8") > STDIN_THRESHOLD

    const args = ["run"]
    if (!useStdin) {
      args.push(prompt)
    }
    args.push("--format", streaming ? "json" : "default")

    try {
      const proc = execa("opencode", args, {
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
            const trimmed = line.trim()
            if (!trimmed) continue

            let event: any
            try {
              event = JSON.parse(trimmed)
            } catch {
              continue
            }

            const type = event.type as string

            if (type === "tool_use") {
              const part = event.part ?? {}
              const tool = part.tool as string
              const input = part.state?.input ?? {}

              if (tool === "write") {
                const file = basename(input.filePath ?? "file")
                options.onAction?.("create", file)
                options.onStatus?.(`Writing ${file}`)
              } else if (tool === "edit") {
                const file = basename(input.filePath ?? "file")
                options.onAction?.("edit", file)
                options.onStatus?.(`Editing ${file}`)
              } else if (tool === "bash") {
                const cmd = String(input.command ?? "")
                if (cmd) {
                  options.onAction?.("command", cmd)
                  const desc = input.description ?? cmd
                  options.onStatus?.(desc.length > 60 ? `Running ${desc.slice(0, 57)}...` : `Running ${desc}`)
                }
              } else if (tool === "read" || tool === "grep" || tool === "glob" || tool === "list") {
                options.onStatus?.(`${tool}...`)
              }
            } else if (type === "text") {
              const text = event.part?.text
              if (text) {
                finalText += (finalText ? "\n" : "") + text
                options.onStatus?.(String(text).slice(0, 200))
              }
            }
            // step_start, step_finish: ignore
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

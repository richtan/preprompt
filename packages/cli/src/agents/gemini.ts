import { basename } from "node:path"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

const STDIN_THRESHOLD = 100_000

/**
 * Google Gemini CLI adapter.
 *
 * Uses `-o stream-json` to get structured JSONL events from the `gemini`
 * binary (@google/gemini-cli).
 *
 *   gemini -y -o stream-json -p "prompt"
 *
 * JSONL event types (verified from real output):
 *   { type: "tool_use", tool_name: "write_file", parameters: { file_path, content } }
 *   { type: "tool_use", tool_name: "replace", parameters: { file_path, old_string, new_string } }
 *   { type: "tool_use", tool_name: "run_shell_command", parameters: { command, description } }
 *   { type: "message", role: "assistant", content: "...", delta: true }
 *   { type: "result", status: "success", stats: { ... } }
 */

export const gemini: AgentAdapter = {
  name: "gemini",

  async detect(): Promise<AgentInfo> {
    const info: AgentInfo = {
      name: "gemini",
      installed: false,
      authenticated: false,
    }

    try {
      const { exitCode, stdout } = await execa("gemini", ["--version"], {
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

    // Fast auth check: env vars
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      info.authenticated = true
      return info
    }

    // Check settings.json for OAuth config
    try {
      const settings = JSON.parse(
        await readFile(join(homedir(), ".gemini", "settings.json"), "utf8")
      )
      if (settings.selectedAuthType) {
        info.authenticated = true
        return info
      }
    } catch {
      // No settings file or parse error
    }

    // Fallback: try a minimal prompt
    try {
      const { exitCode } = await execa(
        "gemini",
        ["-o", "json", "-p", "say ok"],
        { timeout: 15000, reject: false }
      )
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

    // -y (yolo) must come before -p. -p must be last.
    const args = ["-y"]

    if (streaming) {
      args.push("-o", "stream-json")
    } else {
      args.push("-o", "text")
    }

    const useStdin = Buffer.byteLength(prompt, "utf8") > STDIN_THRESHOLD
    if (useStdin) {
      // Empty -p triggers headless mode, stdin provides the prompt
      args.push("-p", "")
    } else {
      args.push("-p", prompt)
    }

    try {
      const proc = execa("gemini", args, {
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
              const toolName = event.tool_name as string
              const params = event.parameters ?? {}

              if (toolName === "write_file") {
                const file = basename(params.file_path ?? "file")
                options.onAction?.("create", file)
                options.onStatus?.(`Writing ${file}`)
              } else if (toolName === "replace") {
                const file = basename(params.file_path ?? "file")
                options.onAction?.("edit", file)
                options.onStatus?.(`Editing ${file}`)
              } else if (toolName === "run_shell_command") {
                const cmd = String(params.command ?? "")
                if (cmd) {
                  options.onAction?.("command", cmd)
                  const desc = params.description ?? cmd
                  options.onStatus?.(desc.length > 60 ? `Running ${desc.slice(0, 57)}...` : `Running ${desc}`)
                }
              } else if (toolName === "read_file") {
                options.onStatus?.(`Reading ${basename(params.file_path ?? "file")}`)
              } else if (toolName === "list_directory" || toolName === "glob" || toolName === "grep_search") {
                options.onStatus?.("Searching files...")
              }
            } else if (type === "message" && event.role === "assistant" && event.content) {
              const content = String(event.content)
              if (event.delta) {
                // Streaming token, use as status only
                options.onStatus?.(content.slice(0, 200))
              } else {
                finalText += content
              }
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

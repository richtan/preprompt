import { basename } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions, ActionType } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

const STDIN_THRESHOLD = 100_000

interface ExtractedAction {
  status: string
  actionType: ActionType
  actionText: string
}

function extractAction(event: any): ExtractedAction | null {
  if (event.type !== "assistant") return null
  const content = event.message?.content
  if (!Array.isArray(content)) return null

  for (const block of content) {
    if (block.type !== "tool_use") continue
    const name = block.name
    const input = block.input ?? {}

    switch (name) {
      case "Write": {
        const file = basename(input.file_path ?? "file")
        return { status: `Writing ${file}`, actionType: "create", actionText: file }
      }
      case "Edit": {
        const file = basename(input.file_path ?? "file")
        return { status: `Editing ${file}`, actionType: "edit", actionText: file }
      }
      case "Read": {
        const file = basename(input.file_path ?? "file")
        return { status: `Reading ${file}`, actionType: "other", actionText: file }
      }
      case "Bash": {
        const cmd = String(input.command ?? "")
        const status = cmd.length > 60 ? `Running ${cmd.slice(0, 57)}...` : `Running ${cmd}`
        return { status, actionType: "command", actionText: cmd }
      }
      case "Glob": return { status: "Searching files...", actionType: "other", actionText: "Searching files" }
      case "Grep": return { status: "Searching code...", actionType: "other", actionText: "Searching code" }
      default: return { status: `${name}...`, actionType: "other", actionText: name }
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

      // Raw stdout tap for incremental text parsing (works in any mode)
      if (options.onStdout && proc.stdout) {
        proc.stdout.on("data", (chunk: Buffer) => {
          options.onStdout!(chunk.toString())
        })
      }

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
              const action = extractAction(event)
              if (action) {
                options.onStatus!(action.status)
                // Only log commands, creates, edits to history (not reads/searches)
                if (action.actionType !== "other") {
                  options.onAction?.(action.actionType, action.actionText)
                }
              }

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

import { basename } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

const STDIN_THRESHOLD = 100_000

function extractStatus(event: any): string | null {
  if (event.type !== "item.completed") return null
  const item = event.item
  if (!item) return null

  switch (item.type) {
    case "agent_message": {
      const text = String(item.text ?? "")
      return text.length > 60 ? text.slice(0, 57) + "..." : text
    }
    case "file_change": {
      const changes = item.changes
      if (Array.isArray(changes) && changes.length > 0) {
        const c = changes[0]
        const name = basename(c.path ?? "file")
        return c.kind === "add" ? `Creating ${name}` : `Editing ${name}`
      }
      return "Modifying files..."
    }
    case "command_execution": {
      const cmd = String(item.command ?? item.args?.[0] ?? "")
      return `Running ${cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd}`
    }
    default:
      return null
  }
}

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
    const streaming = !!options.onStatus

    const useStdin = Buffer.byteLength(prompt, "utf8") > STDIN_THRESHOLD

    const args = ["exec", prompt]
    if (useStdin) {
      args[1] = "Follow the instructions from stdin"
    }
    args.push("-C", workdir, "--full-auto", "--skip-git-repo-check")

    // Add --json flag when UI is active for structured events
    if (streaming) {
      args.push("--json")
    }

    try {
      const proc = execa("codex", args, {
        cwd: workdir,
        timeout: options.timeout,
        input: useStdin ? prompt : undefined,
        reject: false,
      })

      let collectedText = ""

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

              // Extract status
              const status = extractStatus(event)
              if (status) options.onStatus!(status)

              // Collect agent messages for stdout
              if (event.type === "item.completed" && event.item?.type === "agent_message") {
                collectedText += (collectedText ? "\n" : "") + event.item.text
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        })
      } else if (options.onStatus && proc.stdout) {
        // Fallback raw text streaming
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
        stdout: streaming ? collectedText : result.stdout,
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

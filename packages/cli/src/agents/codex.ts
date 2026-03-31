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

function stripShellWrappers(cmd: string): string {
  let prev = ""
  while (prev !== cmd) {
    prev = cmd
    const m = cmd.match(
      /^(?:\/(?:usr\/)?bin\/)?(?:z|ba)?sh\s+-\w*c\s+(?:'([\s\S]*)'|"([\s\S]*)"|(\S+))\s*$/
    )
    if (m) cmd = (m[1] ?? m[2] ?? m[3] ?? cmd).trim()
  }
  return cmd
}

function extractAction(event: any): ExtractedAction | null {
  if (event.type !== "item.completed") return null
  const item = event.item
  if (!item) return null

  switch (item.type) {
    case "agent_message": {
      const text = String(item.text ?? "")
      const short = text.length > 60 ? text.slice(0, 57) + "..." : text
      return { status: short, actionType: "other", actionText: short }
    }
    case "file_change": {
      const changes = item.changes
      if (Array.isArray(changes) && changes.length > 0) {
        const c = changes[0]
        const name = basename(c.path ?? "file")
        const isCreate = c.kind === "add"
        return {
          status: isCreate ? `Creating ${name}` : `Editing ${name}`,
          actionType: isCreate ? "create" : "edit",
          actionText: name,
        }
      }
      return { status: "Modifying files...", actionType: "edit", actionText: "files" }
    }
    case "command_execution": {
      let cmd = String(item.command ?? item.args?.[0] ?? "")
      cmd = stripShellWrappers(cmd)
      const status = cmd.length > 60 ? `Running ${cmd.slice(0, 57)}...` : `Running ${cmd}`
      // Filter read-like commands (agent inspecting files, not doing work)
      if (/^(?:sed\s+-n|cat\s|head\s|tail\s|less\s|more\s|ls\s)/.test(cmd)) {
        return { status, actionType: "other", actionText: cmd }
      }
      return { status, actionType: "command", actionText: cmd }
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
        env: options.env,
        maxBuffer: 50_000_000,
        reject: false,
      })

      let collectedText = ""

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

              // Extract action
              const action = extractAction(event)
              if (action) {
                options.onStatus!(action.status)
                // Only log tool actions to history, not agent chatter
                if (action.actionType !== "other") {
                  options.onAction?.(action.actionType, action.actionText)
                }
              }

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

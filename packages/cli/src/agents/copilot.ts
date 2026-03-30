import { basename } from "node:path"
import { execa } from "execa"
import type { AgentAdapter, ExecuteOptions } from "./types.js"
import type { AgentInfo, ExecutionResult } from "../types.js"

/**
 * GitHub Copilot CLI adapter.
 *
 * Supports the standalone `copilot` binary (GA Feb 2026) which acts as a
 * full coding agent with autopilot mode.
 *
 *   copilot --autopilot --allow-all --no-color -p "prompt"
 *
 * We parse plain-text output rather than --output-format=json because the
 * JSON event schema is undocumented and changes between versions. Text output
 * is reliable: shell commands prefixed with `$` or `>`, file paths in
 * "Created/Edited/Wrote" lines, and status messages.
 */

/**
 * Try to extract an action from a JSON event.
 * Copilot's JSON schema isn't documented, so we match liberally.
 */
function tryParseJsonEvent(
  event: any,
  onAction: (type: "create" | "edit" | "command" | "other", text: string) => void,
  onStatus: (status: string) => void
): boolean {
  const type = event.type ?? event.event ?? event.kind ?? ""
  const tool = event.tool ?? event.name ?? event.action ?? ""
  const args = event.args ?? event.arguments ?? event.params ?? {}
  const path = args.path ?? args.file ?? event.path ?? event.file ?? ""
  const cmd = args.command ?? args.cmd ?? event.command ?? ""
  const text = event.content ?? event.text ?? event.message ?? event.body ?? ""

  // File operations
  if (/(?:create|write|add)_?file/i.test(tool) || (type === "file" && /create|add/i.test(event.action ?? ""))) {
    onAction("create", path ? basename(path) : "file")
    return true
  }
  if (/(?:edit|modify|update|patch)_?file/i.test(tool) || (type === "file" && /edit|modify/i.test(event.action ?? ""))) {
    onAction("edit", path ? basename(path) : "file")
    return true
  }

  // Command execution
  if (/(?:run_?command|bash|shell|exec)/i.test(tool) || type === "command_execution") {
    if (cmd) onAction("command", cmd)
    return true
  }

  // Tool call (generic)
  if (/tool.?call/i.test(type) && tool) {
    if (path) {
      onAction(/create|write|add/i.test(tool) ? "create" : "edit", basename(path))
    } else if (cmd) {
      onAction("command", cmd)
    }
    return true
  }

  // Text/message events
  if (text && /message|text|status|info|log/i.test(type)) {
    onStatus(String(text).slice(0, 200))
    return true
  }

  // Item completed events (codex-style, copilot may use similar)
  if (type === "item.completed" && event.item) {
    const item = event.item
    if (item.type === "command_execution" && (item.command || item.args?.[0])) {
      onAction("command", String(item.command ?? item.args[0]))
      return true
    }
    if (item.type === "file_change" && Array.isArray(item.changes)) {
      for (const c of item.changes) {
        const p = c.path ?? ""
        onAction(c.kind === "add" ? "create" : "edit", p ? basename(p) : "file")
      }
      return true
    }
  }

  return false
}

/**
 * Parse plain-text copilot output for file and command actions.
 */
function parseTextOutput(
  lines: string[],
  onAction: (type: "create" | "edit" | "command" | "other", text: string) => void,
  onStatus: (status: string) => void
) {
  const seenFiles = new Set<string>()
  const seenCommands = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Shell command patterns
    if (trimmed.startsWith("$ ") || trimmed.startsWith("> ")) {
      const cmd = trimmed.slice(2).trim()
      if (cmd && !seenCommands.has(cmd)) {
        seenCommands.add(cmd)
        onAction("command", cmd)
      }
      continue
    }

    // "Running: <cmd>" or "Executing: <cmd>"
    const runMatch = trimmed.match(/^(?:Running|Executing)[:\s]+(.+)$/i)
    if (runMatch) {
      const cmd = runMatch[1].trim()
      if (cmd && !seenCommands.has(cmd)) {
        seenCommands.add(cmd)
        onAction("command", cmd)
      }
      continue
    }

    // "Created <file>" / "Wrote <file>" / "Added <file>"
    const createMatch = trimmed.match(/^(?:Created|Wrote|Added|Creating|Writing)[:\s]+(.+)$/i)
    if (createMatch) {
      const file = createMatch[1].trim()
      if (file && !seenFiles.has(file)) {
        seenFiles.add(file)
        onAction("create", basename(file))
      }
      continue
    }

    // "Edited <file>" / "Modified <file>" / "Updated <file>"
    const editMatch = trimmed.match(/^(?:Edited|Modified|Updated|Editing|Modifying|Updating)[:\s]+(.+)$/i)
    if (editMatch) {
      const file = editMatch[1].trim()
      if (file && !seenFiles.has(file)) {
        seenFiles.add(file)
        onAction("edit", basename(file))
      }
      continue
    }

    // Status lines
    onStatus(trimmed.slice(0, 200))
  }
}

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
        ["--autopilot", "--allow-all", "--no-color", "-p", prompt],
        {
          cwd: workdir,
          timeout: options.timeout,
          reject: false,
        }
      )

      const allLines: string[] = []
      let actionsEmitted = 0

      if (proc.stdout) {
        let buf = ""
        proc.stdout.on("data", (chunk: Buffer) => {
          buf += chunk.toString()
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const line of lines) {
            allLines.push(line)
            const trimmed = line.trim()
            if (!trimmed) continue

            // Try JSON parse first (copilot might emit structured events)
            try {
              const event = JSON.parse(trimmed)
              const matched = tryParseJsonEvent(
                event,
                (type, text) => {
                  actionsEmitted++
                  options.onAction?.(type, text)
                },
                (status) => options.onStatus?.(status)
              )
              if (matched) continue
            } catch {
              // Not JSON, continue to text parsing
            }

            // Real-time text status (non-command lines)
            if (!trimmed.startsWith("$ ") && !trimmed.startsWith("> ")) {
              options.onStatus?.(trimmed.slice(0, 200))
            }
          }
        })
      }

      const result = await proc

      // Post-execution: if no actions were emitted during streaming,
      // parse the full output as text to extract file/command actions
      if (actionsEmitted === 0 && options.onAction) {
        parseTextOutput(
          allLines,
          options.onAction,
          () => {} // status already streamed
        )
      }

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

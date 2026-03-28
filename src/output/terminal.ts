import chalk from "chalk"
import Table from "cli-table3"
import type { RunResult, AgentInfo } from "../types.js"

export function renderAgentList(agents: AgentInfo[]): void {
  if (agents.length === 0) {
    console.log(chalk.yellow("\n  No AI agents detected on this machine.\n"))
    console.log("  Install one of these to get started:")
    console.log("    Claude Code:       npm install -g @anthropic-ai/claude-code")
    console.log("    Codex:             npm install -g @openai/codex")
    console.log("    Aider:             pip install aider-chat")
    console.log("    GitHub Copilot:    gh extension install github/gh-copilot")
    console.log()
    return
  }

  const table = new Table({
    head: [
      chalk.white("Agent"),
      chalk.white("Status"),
      chalk.white("Version"),
    ],
    style: { head: [], border: [] },
  })

  for (const agent of agents) {
    const status = !agent.installed
      ? chalk.gray("not installed")
      : !agent.authenticated
        ? chalk.yellow("not authenticated")
        : chalk.green("ready")

    table.push([
      agent.name,
      status,
      agent.version ?? "—",
    ])
  }

  console.log()
  console.log(table.toString())
  console.log()
}

export function renderRunResult(result: RunResult): void {
  console.log()

  // Status line
  const statusIcon =
    result.status === "pass" ? chalk.green("✓") :
    result.status === "no-changes" ? chalk.yellow("⚠") :
    result.status === "timeout" ? chalk.yellow("⏱") :
    chalk.red("✗")

  const statusLabel =
    result.status === "pass" ? chalk.green("pass") :
    result.status === "no-changes" ? chalk.yellow("no changes") :
    result.status === "timeout" ? chalk.yellow("timeout") :
    result.status === "fail" ? chalk.red("fail") :
    chalk.red("error")

  console.log(
    `  ${statusIcon} ${chalk.bold(result.agent)} — ${statusLabel} in ${formatDuration(result.execution.duration)}`
  )
  console.log()

  // File changes
  const { added, modified, deleted } = result.diff

  if (added.length === 0 && modified.length === 0 && deleted.length === 0) {
    console.log(chalk.yellow("  No filesystem changes detected."))
    if (result.execution.exitCode === 0) {
      console.log(
        chalk.yellow(
          "  The agent completed but made no changes. It may be waiting for input or permissions."
        )
      )
    }
  } else {
    if (added.length > 0) {
      console.log(chalk.green(`  ${added.length} file${added.length === 1 ? "" : "s"} created:`))
      for (const f of added) {
        console.log(chalk.green(`    + ${f}`))
      }
    }
    if (modified.length > 0) {
      console.log(chalk.yellow(`  ${modified.length} file${modified.length === 1 ? "" : "s"} modified:`))
      for (const f of modified) {
        console.log(chalk.yellow(`    ~ ${f}`))
      }
    }
    if (deleted.length > 0) {
      console.log(chalk.red(`  ${deleted.length} file${deleted.length === 1 ? "" : "s"} deleted:`))
      for (const f of deleted) {
        console.log(chalk.red(`    - ${f}`))
      }
    }
  }

  console.log()

  // Stderr if any
  if (result.execution.stderr && result.status !== "pass") {
    console.log(chalk.dim("  stderr:"))
    for (const line of result.execution.stderr.split("\n").slice(0, 10)) {
      console.log(chalk.dim(`    ${line}`))
    }
    console.log()
  }

  // Summary line
  const total = added.length + modified.length + deleted.length
  console.log(
    chalk.dim(
      `  ${total} change${total === 1 ? "" : "s"} · exit code ${result.execution.exitCode} · ${formatDuration(result.execution.duration)}`
    )
  )
  console.log()
}

export function renderError(message: string): void {
  console.error(chalk.red(`\n  Error: ${message}\n`))
}

export function renderWarning(message: string): void {
  console.log(chalk.yellow(`\n  Warning: ${message}\n`))
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

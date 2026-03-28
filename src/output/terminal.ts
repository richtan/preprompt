import chalk from "chalk"
import Table from "cli-table3"
import type { RunResult, MultiRunResult, AgentInfo } from "../types.js"
import type { CheckResult, Check } from "../checks.js"
import type { MatrixAnalysis } from "../matrix.js"

export function renderAgentList(agents: AgentInfo[]): void {
  if (agents.length === 0) {
    console.log(chalk.yellow("\n  No AI agents detected on this machine.\n"))
    console.log("  Install one of these to get started:")
    console.log(
      "    Claude Code:       npm install -g @anthropic-ai/claude-code"
    )
    console.log("    Codex:             npm install -g @openai/codex")
    console.log("    Aider:             pip install aider-chat")
    console.log(
      "    GitHub Copilot:    gh extension install github/gh-copilot"
    )
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

    table.push([agent.name, status, agent.version ?? "—"])
  }

  console.log()
  console.log(table.toString())
  console.log()
}

export function renderRunResult(result: RunResult): void {
  console.log()

  const statusIcon = statusToIcon(result.status)
  const statusLabel = statusToLabel(result.status)

  console.log(
    `  ${statusIcon} ${chalk.bold(result.agent)} — ${statusLabel} in ${formatDuration(result.execution.duration)}`
  )
  console.log()

  renderDiffSummary(result)

  if (result.execution.stderr && result.status !== "pass") {
    console.log(chalk.dim("  stderr:"))
    for (const line of result.execution.stderr.split("\n").slice(0, 10)) {
      console.log(chalk.dim(`    ${line}`))
    }
    console.log()
  }

  const total =
    result.diff.added.length +
    result.diff.modified.length +
    result.diff.deleted.length
  console.log(
    chalk.dim(
      `  ${total} change${total === 1 ? "" : "s"} · exit code ${result.execution.exitCode} · ${formatDuration(result.execution.duration)}`
    )
  )
  console.log()
}

export function renderMultiRunSummary(multi: MultiRunResult): void {
  console.log()
  console.log(
    chalk.bold(`  PromptStack — tested ${multi.prompt} on ${multi.results.length} agents`)
  )
  console.log()

  const table = new Table({
    head: [
      chalk.white("Agent"),
      chalk.white("Status"),
      chalk.white("Duration"),
      chalk.white("Files"),
      chalk.white("Changes"),
    ],
    style: { head: [], border: [] },
  })

  for (const r of multi.results) {
    const total = r.diff.added.length + r.diff.modified.length + r.diff.deleted.length
    const filesDesc =
      total === 0
        ? chalk.dim("no changes")
        : `${r.diff.added.length > 0 ? chalk.green(`+${r.diff.added.length}`) : ""}${r.diff.modified.length > 0 ? chalk.yellow(` ~${r.diff.modified.length}`) : ""}${r.diff.deleted.length > 0 ? chalk.red(` -${r.diff.deleted.length}`) : ""}`.trim()

    table.push([
      r.agent,
      `${statusToIcon(r.status)} ${statusToLabel(r.status)}`,
      formatDuration(r.execution.duration),
      `${r.after.files.filter((f) => f.type === "file").length} files`,
      filesDesc,
    ])
  }

  console.log(table.toString())
  console.log()

  // Summary line
  const passed = multi.results.filter((r) => r.status === "pass").length
  const failed = multi.results.filter(
    (r) => r.status === "fail" || r.status === "error"
  ).length
  const other = multi.results.length - passed - failed

  const parts: string[] = []
  if (passed > 0) parts.push(chalk.green(`${passed} passed`))
  if (failed > 0) parts.push(chalk.red(`${failed} failed`))
  if (other > 0) parts.push(chalk.yellow(`${other} other`))

  console.log(`  ${parts.join(" · ")}`)

  if (multi.results.length > 1) {
    console.log(chalk.dim("  Run: pstack diff to compare agent results"))
  }
  console.log()
}

export function renderDiff(multi: MultiRunResult): void {
  if (multi.results.length < 2) {
    console.log(chalk.yellow("\n  Need 2+ agent results to diff. Only 1 found.\n"))
    return
  }

  console.log()
  console.log(chalk.bold("  Filesystem diff across agents"))
  console.log()

  // Collect all unique file paths across all agents
  const allPaths = new Set<string>()
  for (const r of multi.results) {
    for (const f of r.diff.added) allPaths.add(f)
    for (const f of r.diff.modified) allPaths.add(f)
    for (const f of r.diff.deleted) allPaths.add(f)
  }

  if (allPaths.size === 0) {
    console.log(chalk.dim("  No filesystem changes from any agent."))
    console.log()
    return
  }

  // Build a matrix: file x agent
  const sortedPaths = [...allPaths].sort()
  const agentNames = multi.results.map((r) => r.agent)

  const table = new Table({
    head: [chalk.white("File"), ...agentNames.map((n) => chalk.white(n))],
    style: { head: [], border: [] },
  })

  for (const path of sortedPaths) {
    const row: string[] = [path]

    for (const r of multi.results) {
      if (r.diff.added.includes(path)) {
        row.push(chalk.green("+ created"))
      } else if (r.diff.modified.includes(path)) {
        row.push(chalk.yellow("~ modified"))
      } else if (r.diff.deleted.includes(path)) {
        row.push(chalk.red("- deleted"))
      } else {
        row.push(chalk.dim("—"))
      }
    }

    // Highlight divergences (not all agents agree)
    const statuses = row.slice(1)
    const isDivergent = new Set(statuses.map(stripAnsi)).size > 1

    if (isDivergent) {
      row[0] = chalk.bold.yellow(path) + chalk.yellow(" ← divergence")
    }

    table.push(row)
  }

  console.log(table.toString())
  console.log()

  // Count divergences
  let divergences = 0
  for (const path of sortedPaths) {
    const statuses = multi.results.map((r) => {
      if (r.diff.added.includes(path)) return "added"
      if (r.diff.modified.includes(path)) return "modified"
      if (r.diff.deleted.includes(path)) return "deleted"
      return "none"
    })
    if (new Set(statuses).size > 1) divergences++
  }

  if (divergences > 0) {
    console.log(
      chalk.yellow(
        `  ${divergences} divergence${divergences === 1 ? "" : "s"} found — agents disagree on these files.`
      )
    )
  } else {
    console.log(chalk.green("  All agents produced identical results."))
  }
  console.log()
}

export function renderError(message: string): void {
  console.error(chalk.red(`\n  Error: ${message}\n`))
}

export function renderWarning(message: string): void {
  console.log(chalk.yellow(`\n  Warning: ${message}\n`))
}

function statusToIcon(status: RunResult["status"]): string {
  switch (status) {
    case "pass": return chalk.green("✓")
    case "no-changes": return chalk.yellow("⚠")
    case "timeout": return chalk.yellow("⏱")
    default: return chalk.red("✗")
  }
}

function statusToLabel(status: RunResult["status"]): string {
  switch (status) {
    case "pass": return chalk.green("pass")
    case "no-changes": return chalk.yellow("no changes")
    case "timeout": return chalk.yellow("timeout")
    case "fail": return chalk.red("fail")
    default: return chalk.red("error")
  }
}

function renderDiffSummary(result: RunResult): void {
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
    return
  }

  if (added.length > 0) {
    console.log(
      chalk.green(
        `  ${added.length} file${added.length === 1 ? "" : "s"} created:`
      )
    )
    for (const f of added) console.log(chalk.green(`    + ${f}`))
  }
  if (modified.length > 0) {
    console.log(
      chalk.yellow(
        `  ${modified.length} file${modified.length === 1 ? "" : "s"} modified:`
      )
    )
    for (const f of modified) console.log(chalk.yellow(`    ~ ${f}`))
  }
  if (deleted.length > 0) {
    console.log(
      chalk.red(
        `  ${deleted.length} file${deleted.length === 1 ? "" : "s"} deleted:`
      )
    )
    for (const f of deleted) console.log(chalk.red(`    - ${f}`))
  }

  console.log()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function renderCheckResults(results: CheckResult[]): void {
  if (results.length === 0) return

  console.log(chalk.bold("  Checks:"))

  for (const r of results) {
    const icon = r.passed ? chalk.green("✓") : chalk.red("✗")
    const label = formatCheck(r.check)
    const agentLabel = chalk.dim(`[${r.agent}]`)
    console.log(`    ${icon} ${label} ${agentLabel} ${chalk.dim(r.message)}`)
  }

  const passed = results.filter((r) => r.passed).length
  const total = results.length

  console.log()
  if (passed === total) {
    console.log(chalk.green(`  All ${total} checks passed.`))
  } else {
    console.log(chalk.red(`  ${total - passed}/${total} checks failed.`))
  }
  console.log()
}

export function renderMatrixAnalysis(analysis: MatrixAnalysis): void {
  if (analysis.detectedTools.length === 0) return

  console.log(chalk.dim(`  Smart matrix: ${analysis.summary}`))
}

function formatCheck(check: Check): string {
  switch (check.type) {
    case "file-exists":
      return `file-exists:${check.path}`
    case "file-not-exists":
      return `file-not-exists:${check.path}`
    case "dir-exists":
      return `dir-exists:${check.path}`
    case "file-contains":
      return `file-contains:${check.path}:${check.value ?? ""}`
    case "exit-ok":
      return "exit-ok"
    default:
      return String(check.type)
  }
}

// Simple ANSI strip for comparison
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

import chalk from "chalk"
import type { RunResult, MultiRunResult, AgentInfo, EvalResult } from "../types.js"
import type { MatrixAnalysis } from "../matrix.js"

export function renderAgentList(agents: AgentInfo[]): void {
  if (agents.length === 0) {
    console.error(chalk.red("error:") + " No agents found. Install one:")
    console.log("  npm install -g @anthropic-ai/claude-code")
    console.log("  npm install -g @openai/codex")
    console.log("  pip install aider-chat")
    console.log("  gh extension install github/gh-copilot")
    return
  }

  const maxName = Math.max(...agents.map((a) => a.name.length))

  for (const agent of agents) {
    const name = agent.name.padEnd(maxName + 2)
    const status = !agent.installed
      ? chalk.dim("not installed")
      : !agent.authenticated
        ? chalk.yellow("not authenticated")
        : chalk.green("ready")
    const version = agent.version ?? ""
    console.log(`${name}  ${status}  ${chalk.dim(version)}`.trimEnd())
  }
}

export function renderRunResult(result: RunResult): void {
  renderFileDiff(result)

  const files = result.diff.added.length + result.diff.modified.length + result.diff.deleted.length
  const filesDesc = files > 0 ? `, ${files} file${files === 1 ? "" : "s"}` : ""

  if (result.status === "pass") {
    console.log(chalk.green("Passed") + ` in ${formatDuration(result.execution.duration)}` + chalk.dim(` (${result.agent}${filesDesc})`))
  } else if (result.status === "timeout") {
    console.log(chalk.yellow("Timed out") + ` after ${formatDuration(result.execution.duration)}` + chalk.dim(` (${result.agent})`))
  } else if (result.status === "no-changes") {
    console.log(chalk.yellow("No changes") + ` in ${formatDuration(result.execution.duration)}` + chalk.dim(` (${result.agent})`))
  } else {
    console.log(chalk.red("Failed") + ` in ${formatDuration(result.execution.duration)}` + chalk.dim(` (${result.agent}, exit code ${result.execution.exitCode})`))
  }

  if (result.execution.stderr && result.status !== "pass") {
    for (const line of result.execution.stderr.split("\n").slice(0, 5)) {
      if (line.trim()) console.log(chalk.dim(`  ${line.trim()}`))
    }
  }
}

export function renderMultiRunSummary(multi: MultiRunResult): void {
  const maxName = Math.max(...multi.results.map((r) => r.agent.length))

  for (const r of multi.results) {
    const name = r.agent.padEnd(maxName + 2)
    const files = r.diff.added.length + r.diff.modified.length + r.diff.deleted.length

    if (r.status === "pass") {
      console.log(`${name}${chalk.green("passed")} in ${formatDuration(r.execution.duration)}` + chalk.dim(` (${files} files)`))
    } else if (r.status === "timeout") {
      console.log(`${name}${chalk.yellow("timed out")} after ${formatDuration(r.execution.duration)}`)
    } else if (r.status === "no-changes") {
      console.log(`${name}${chalk.yellow("no changes")} in ${formatDuration(r.execution.duration)}`)
    } else {
      console.log(`${name}${chalk.red("failed")}` + chalk.dim(` (exit code ${r.execution.exitCode}, ${formatDuration(r.execution.duration)})`))
    }
  }

  console.log()
  console.log(formatSummary(multi.results))
}

export function renderDiff(multi: MultiRunResult): void {
  if (multi.results.length < 2) {
    console.error(chalk.red("error:") + " Need 2+ agent results to diff.")
    return
  }

  console.log(chalk.green("Comparing") + ` ${multi.results.length} agents`)
  console.log()

  const allPaths = new Set<string>()
  for (const r of multi.results) {
    for (const f of r.diff.added) allPaths.add(f)
    for (const f of r.diff.modified) allPaths.add(f)
    for (const f of r.diff.deleted) allPaths.add(f)
  }

  if (allPaths.size === 0) {
    console.log(chalk.dim("No filesystem changes from any agent."))
    return
  }

  const sortedPaths = [...allPaths].sort()
  const maxPath = Math.max(...sortedPaths.map((p) => p.length))
  let divergences = 0

  for (const path of sortedPaths) {
    const cols: string[] = []
    const statuses: string[] = []

    for (const r of multi.results) {
      let status: string
      let label: string
      if (r.diff.added.includes(path)) { status = "added"; label = chalk.green("created") }
      else if (r.diff.modified.includes(path)) { status = "modified"; label = chalk.yellow("modified") }
      else if (r.diff.deleted.includes(path)) { status = "deleted"; label = chalk.red("deleted") }
      else { status = "none"; label = chalk.dim("--") }
      cols.push(`${r.agent}: ${label}`)
      statuses.push(status)
    }

    if (new Set(statuses).size > 1) divergences++
    console.log(`${path.padEnd(maxPath + 2)}  ${cols.join("    ")}`)
  }

  console.log()
  if (divergences > 0) {
    console.log(`${divergences} divergence${divergences === 1 ? "" : "s"}`)
  } else {
    console.log("All agents produced identical results.")
  }
}

export function renderEvalResult(evalResult: EvalResult): void {
  const passed = evalResult.steps.filter((s) => s.status === "pass").length
  const total = evalResult.steps.length
  const self = evalResult.agent === evalResult.evaluator ? chalk.dim(" (self-eval)") : ""

  // Score line: always shown
  const scoreColor = evalResult.score >= 80 ? chalk.green
    : evalResult.score >= 50 ? chalk.yellow
    : chalk.red
  console.log(`${evalResult.agent}  ${scoreColor(evalResult.score + "/100")}  ${passed}/${total} steps${self}`)

  // Failed/partial steps only: show what went wrong
  const failures = evalResult.steps.filter((s) => s.status !== "pass")
  if (failures.length > 0) {
    for (const step of failures) {
      const icon = step.status === "partial" ? chalk.yellow("~") : chalk.red("x")
      const desc = step.description.length > 50
        ? step.description.slice(0, 47) + "..."
        : step.description
      console.log(`  ${icon} ${desc}`)
    }
  }
}

export function renderError(message: string): void {
  console.error(chalk.red("error:") + " " + message)
}

export function renderWarning(message: string): void {
  console.error(chalk.yellow("warning:") + " " + message)
}

export function renderMatrixAnalysis(analysis: MatrixAnalysis): void {
  if (analysis.detectedTools.length === 0) return

  const toolList = analysis.detectedTools.join(", ")
  console.log(
    chalk.green("Analyzed") + ` prompt, ${analysis.detectedTools.length} tools detected` +
    chalk.dim(` (${toolList})`)
  )
}

function renderFileDiff(result: RunResult): void {
  const { added, modified, deleted } = result.diff
  if (added.length === 0 && modified.length === 0 && deleted.length === 0) return

  for (const f of added) console.log(`  ${chalk.green("+")} ${f}`)
  for (const f of modified) console.log(`  ${chalk.yellow("~")} ${f}`)
  for (const f of deleted) console.log(`  ${chalk.red("-")} ${f}`)
}

function formatSummary(results: RunResult[]): string {
  const passed = results.filter((r) => r.status === "pass").length
  const failed = results.filter((r) => r.status === "fail" || r.status === "error").length
  const other = results.length - passed - failed

  const parts: string[] = []
  if (passed > 0) parts.push(`${passed} passed`)
  if (failed > 0) parts.push(`${failed} failed`)
  if (other > 0) parts.push(`${other} other`)
  return parts.join(", ")
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

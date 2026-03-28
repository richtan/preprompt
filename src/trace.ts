import chalk from "chalk"
import type { RunResult, MultiRunResult } from "./types.js"
import type { StreamEvent } from "./output/stream.js"

export interface TraceEntry {
  timestamp: number
  agent: string
  action: string
  detail: string
}

export function buildTrace(result: RunResult): TraceEntry[] {
  const entries: TraceEntry[] = []
  const t = result.timestamp

  entries.push({
    timestamp: t,
    agent: result.agent,
    action: "start",
    detail: `Started in ${result.workdir}`,
  })

  // Reconstruct actions from the diff
  for (const file of result.diff.added) {
    entries.push({
      timestamp: t,
      agent: result.agent,
      action: "create",
      detail: file,
    })
  }

  for (const file of result.diff.modified) {
    entries.push({
      timestamp: t,
      agent: result.agent,
      action: "modify",
      detail: file,
    })
  }

  for (const file of result.diff.deleted) {
    entries.push({
      timestamp: t,
      agent: result.agent,
      action: "delete",
      detail: file,
    })
  }

  const statusLabel =
    result.status === "pass" ? "completed successfully" :
    result.status === "timeout" ? "timed out" :
    result.status === "no-changes" ? "completed with no changes" :
    `failed (exit code ${result.execution.exitCode})`

  entries.push({
    timestamp: t + result.execution.duration,
    agent: result.agent,
    action: "end",
    detail: `${statusLabel} in ${(result.execution.duration / 1000).toFixed(1)}s`,
  })

  return entries
}

export function renderTrace(result: RunResult): void {
  const trace = buildTrace(result)

  console.log()
  console.log(chalk.bold(`  Trace: ${result.agent}`))
  console.log(chalk.dim(`  Prompt: ${result.prompt}`))
  console.log()

  for (const entry of trace) {
    const icon =
      entry.action === "create" ? chalk.green("+") :
      entry.action === "modify" ? chalk.yellow("~") :
      entry.action === "delete" ? chalk.red("-") :
      entry.action === "start" ? chalk.blue("▶") :
      entry.action === "end" ? chalk.blue("■") :
      " "

    const color =
      entry.action === "create" ? chalk.green :
      entry.action === "modify" ? chalk.yellow :
      entry.action === "delete" ? chalk.red :
      chalk.dim

    console.log(`  ${icon} ${color(entry.detail)}`)
  }

  console.log()
}

export function renderTraceComparison(multi: MultiRunResult): void {
  if (multi.results.length < 2) {
    console.log(chalk.yellow("\n  Need 2+ agents to compare traces.\n"))
    return
  }

  console.log()
  console.log(chalk.bold("  Trace comparison"))
  console.log()

  // Build traces for all agents
  const traces = multi.results.map((r) => ({
    agent: r.agent,
    trace: buildTrace(r),
  }))

  // Interleave: show all file actions across agents
  const allFiles = new Set<string>()
  for (const { trace } of traces) {
    for (const entry of trace) {
      if (["create", "modify", "delete"].includes(entry.action)) {
        allFiles.add(entry.detail)
      }
    }
  }

  const sortedFiles = [...allFiles].sort()

  // Header
  const agents = traces.map((t) => t.agent)
  const headerCols = agents.map((a) => chalk.bold(padTo(a, 14)))
  console.log(`  ${"File".padEnd(30)} ${headerCols.join(" ")}`)
  console.log(`  ${"─".repeat(30)} ${agents.map(() => "─".repeat(14)).join(" ")}`)

  for (const file of sortedFiles) {
    const cols: string[] = []
    let hasDivergence = false
    const actions: string[] = []

    for (const { agent, trace } of traces) {
      const entry = trace.find(
        (e) =>
          e.detail === file && ["create", "modify", "delete"].includes(e.action)
      )
      if (entry) {
        const label =
          entry.action === "create" ? chalk.green("+ created") :
          entry.action === "modify" ? chalk.yellow("~ modified") :
          chalk.red("- deleted")
        cols.push(padTo(label, 14))
        actions.push(entry.action)
      } else {
        cols.push(padTo(chalk.dim("—"), 14))
        actions.push("none")
      }
    }

    // Detect divergence
    if (new Set(actions).size > 1) {
      hasDivergence = true
    }

    const fileLabel = hasDivergence
      ? chalk.bold.yellow(file.padEnd(30)) + chalk.yellow(" ←")
      : file.padEnd(30)

    console.log(`  ${fileLabel} ${cols.join(" ")}`)
  }

  console.log()

  // Summary
  const startTimes = multi.results.map((r) => r.execution.duration)
  const fastest = Math.min(...startTimes)
  const slowest = Math.max(...startTimes)

  console.log(chalk.dim(`  Fastest: ${(fastest / 1000).toFixed(1)}s · Slowest: ${(slowest / 1000).toFixed(1)}s`))
  console.log()
}

function padTo(str: string, len: number): string {
  // Account for ANSI escape codes when padding
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "")
  const padding = Math.max(0, len - visible.length)
  return str + " ".repeat(padding)
}

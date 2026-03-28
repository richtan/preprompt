import chalk from "chalk"
import type { RunResult, MultiRunResult } from "./types.js"

export interface TraceEntry {
  timestamp: number
  agent: string
  action: string
  detail: string
}

export function buildTrace(result: RunResult): TraceEntry[] {
  const entries: TraceEntry[] = []
  const t = result.timestamp

  entries.push({ timestamp: t, agent: result.agent, action: "start", detail: `Started in ${result.workdir}` })

  for (const file of result.diff.added) {
    entries.push({ timestamp: t, agent: result.agent, action: "+", detail: file })
  }
  for (const file of result.diff.modified) {
    entries.push({ timestamp: t, agent: result.agent, action: "~", detail: file })
  }
  for (const file of result.diff.deleted) {
    entries.push({ timestamp: t, agent: result.agent, action: "-", detail: file })
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

  console.log(`Trace: ${result.agent}`)
  console.log(chalk.dim(`Prompt: ${result.prompt}`))
  console.log()

  for (const entry of trace) {
    const action = entry.action.padEnd(6)
    const color =
      entry.action === "+" ? chalk.green :
      entry.action === "~" ? chalk.yellow :
      entry.action === "-" ? chalk.red :
      chalk.dim

    console.log(`  ${color(action)}${entry.detail}`)
  }
}

export function renderTraceComparison(multi: MultiRunResult): void {
  if (multi.results.length < 2) {
    console.error(chalk.red("error:") + " Need 2+ agents to compare traces.")
    return
  }

  console.log(chalk.green("Comparing") + ` traces for ${multi.results.length} agents`)
  console.log()

  const traces = multi.results.map((r) => ({
    agent: r.agent,
    trace: buildTrace(r),
  }))

  const allFiles = new Set<string>()
  for (const { trace } of traces) {
    for (const entry of trace) {
      if (["+", "~", "-"].includes(entry.action)) {
        allFiles.add(entry.detail)
      }
    }
  }

  const sortedFiles = [...allFiles].sort()
  const maxPath = Math.max(...sortedFiles.map((f) => f.length))

  for (const file of sortedFiles) {
    const cols: string[] = []
    for (const { agent, trace } of traces) {
      const entry = trace.find((e) => e.detail === file && ["+", "~", "-"].includes(e.action))
      if (entry) {
        const label =
          entry.action === "+" ? chalk.green("created") :
          entry.action === "~" ? chalk.yellow("modified") :
          chalk.red("deleted")
        cols.push(`${agent}: ${label}`)
      } else {
        cols.push(`${agent}: ${chalk.dim("--")}`)
      }
    }
    console.log(`${file.padEnd(maxPath + 2)}  ${cols.join("    ")}`)
  }

  console.log()
  const times = multi.results.map((r) => ({ agent: r.agent, dur: r.execution.duration }))
  times.sort((a, b) => a.dur - b.dur)
  console.log(chalk.dim(
    `Fastest: ${(times[0].dur / 1000).toFixed(1)}s (${times[0].agent}), ` +
    `Slowest: ${(times[times.length - 1].dur / 1000).toFixed(1)}s (${times[times.length - 1].agent})`
  ))
}

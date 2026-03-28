import chalk from "chalk"
import Table from "cli-table3"
import { loadResult, listRuns } from "../storage.js"
import { renderError } from "../output/terminal.js"
import type { MultiRunResult } from "../types.js"

export async function runCompare(
  runIdA: string,
  runIdB: string
): Promise<void> {
  const a = await loadResult(runIdA)
  const b = await loadResult(runIdB)

  if (!a) {
    renderError(`Run not found: ${runIdA}`)
    process.exitCode = 1
    return
  }
  if (!b) {
    renderError(`Run not found: ${runIdB}`)
    process.exitCode = 1
    return
  }

  console.log()
  console.log(chalk.bold("  Before / After comparison"))
  console.log(chalk.dim(`  Run A: ${runIdA}  ·  Run B: ${runIdB}`))
  console.log()

  // Build a unified agent list
  const agentsA = new Map(a.results.map((r) => [r.agent, r]))
  const agentsB = new Map(b.results.map((r) => [r.agent, r]))
  const allAgents = [...new Set([...agentsA.keys(), ...agentsB.keys()])].sort()

  const table = new Table({
    head: [
      chalk.white("Agent"),
      chalk.white("Before"),
      chalk.white("After"),
      chalk.white("Change"),
    ],
    style: { head: [], border: [] },
  })

  let improved = 0
  let regressed = 0
  let same = 0

  for (const agent of allAgents) {
    const resultA = agentsA.get(agent)
    const resultB = agentsB.get(agent)

    const statusA = resultA ? resultA.status : "—"
    const statusB = resultB ? resultB.status : "—"

    const filesA = resultA ? resultA.diff.added.length : 0
    const filesB = resultB ? resultB.diff.added.length : 0

    let change: string
    if (statusA === statusB) {
      if (filesA === filesB) {
        change = chalk.dim("no change")
        same++
      } else if (filesB > filesA) {
        change = chalk.green(`↑ +${filesB - filesA} files`)
        improved++
      } else {
        change = chalk.red(`↓ -${filesA - filesB} files`)
        regressed++
      }
    } else if (statusB === "pass" && statusA !== "pass") {
      change = chalk.green("↑ FIXED")
      improved++
    } else if (statusA === "pass" && statusB !== "pass") {
      change = chalk.red("�� REGRESSION")
      regressed++
    } else {
      change = chalk.yellow("~ changed")
      same++
    }

    const colA = resultA
      ? `${statusIcon(resultA.status)} ${resultA.status} (${filesA} files)`
      : chalk.dim("not tested")
    const colB = resultB
      ? `${statusIcon(resultB.status)} ${resultB.status} (${filesB} files)`
      : chalk.dim("not tested")

    table.push([agent, colA, colB, change])
  }

  console.log(table.toString())
  console.log()

  // Summary
  const parts: string[] = []
  if (improved > 0) parts.push(chalk.green(`${improved} improved`))
  if (regressed > 0) parts.push(chalk.red(`${regressed} regressed`))
  if (same > 0) parts.push(chalk.dim(`${same} unchanged`))
  console.log(`  ${parts.join(" · ")}`)
  console.log()

  if (regressed > 0) {
    process.exitCode = 1
  }
}

export async function runCompareLatest(): Promise<void> {
  const runs = await listRuns()
  if (runs.length < 2) {
    renderError("Need at least 2 runs to compare. Run preprompt twice first.")
    process.exitCode = 1
    return
  }
  await runCompare(runs[1], runs[0]) // older = A, newer = B
}

function statusIcon(status: string): string {
  switch (status) {
    case "pass": return chalk.green("✓")
    case "no-changes": return chalk.yellow("⚠")
    case "timeout": return chalk.yellow("⏱")
    default: return chalk.red("✗")
  }
}

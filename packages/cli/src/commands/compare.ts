import chalk from "chalk"
import { loadResult, listRuns } from "../storage.js"
import { renderError } from "../output/terminal.js"

export async function runCompare(
  runIdA: string,
  runIdB: string
): Promise<void> {
  const a = await loadResult(runIdA)
  const b = await loadResult(runIdB)

  if (!a) { renderError(`Run not found: ${runIdA}`); process.exitCode = 1; return }
  if (!b) { renderError(`Run not found: ${runIdB}`); process.exitCode = 1; return }

  console.log(chalk.green("Comparing") + " runs")
  console.log(chalk.dim(`  A: ${runIdA}`))
  console.log(chalk.dim(`  B: ${runIdB}`))
  console.log()

  const agentsA = new Map(a.results.map((r) => [r.agent, r]))
  const agentsB = new Map(b.results.map((r) => [r.agent, r]))
  const allAgents = [...new Set([...agentsA.keys(), ...agentsB.keys()])].sort()
  const maxName = Math.max(...allAgents.map((n) => n.length))

  let improved = 0, regressed = 0, same = 0

  for (const agent of allAgents) {
    const rA = agentsA.get(agent)
    const rB = agentsB.get(agent)

    const statusA = rA ? rA.status : "none"
    const statusB = rB ? rB.status : "none"
    const filesA = rA ? rA.diff.added.length : 0
    const filesB = rB ? rB.diff.added.length : 0

    const name = agent.padEnd(maxName + 2)
    const colA = rA ? `${statusA} (${filesA} files)` : chalk.dim("not tested")
    const colB = rB ? `${statusB} (${filesB} files)` : chalk.dim("not tested")

    let change: string
    if (statusB === "pass" && statusA !== "pass") { change = chalk.green("fixed"); improved++ }
    else if (statusA === "pass" && statusB !== "pass") { change = chalk.red("regression"); regressed++ }
    else if (statusA === statusB && filesA === filesB) { change = chalk.dim("no change"); same++ }
    else if (filesB > filesA) { change = chalk.green(`+${filesB - filesA} files`); improved++ }
    else if (filesA > filesB) { change = chalk.red(`-${filesA - filesB} files`); regressed++ }
    else { change = chalk.dim("no change"); same++ }

    console.log(`${name}${colA} -> ${colB}    ${change}`)
  }

  console.log()
  const parts: string[] = []
  if (improved > 0) parts.push(`${improved} improved`)
  if (regressed > 0) parts.push(`${regressed} regressed`)
  if (same > 0) parts.push(`${same} unchanged`)
  console.log(parts.join(", "))

  if (regressed > 0) process.exitCode = 1
}

export async function runCompareLatest(): Promise<void> {
  const runs = await listRuns()
  if (runs.length < 2) {
    renderError("Need at least 2 runs to compare. Run preprompt twice first.")
    process.exitCode = 1
    return
  }
  await runCompare(runs[1], runs[0])
}

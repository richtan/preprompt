import chalk from "chalk"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { loadLatestResult, loadResult } from "../storage.js"
import { renderError } from "../output/terminal.js"
import type { MultiRunResult } from "../types.js"

export async function runBadge(opts: {
  run?: string
  output?: string
}): Promise<void> {
  let multi: MultiRunResult | null
  if (opts.run) {
    multi = await loadResult(opts.run)
    if (!multi) {
      renderError(`Run not found: ${opts.run}`)
      process.exitCode = 1
      return
    }
  } else {
    const latest = await loadLatestResult()
    if (!latest) {
      renderError("No runs found. Run preprompt <prompt> first.")
      process.exitCode = 1
      return
    }
    multi = latest.result
  }

  const svg = generateBadgeSvg(multi)
  const outPath = resolve(opts.output ?? "preprompt-badge.svg")

  await writeFile(outPath, svg, "utf8")

  console.log(chalk.green("Saved") + ` badge to ${outPath}`)
  console.log(chalk.dim(`  Add to README: ![PrePrompt](./preprompt-badge.svg)`))
}

function generateBadgeSvg(multi: MultiRunResult): string {
  const agents = multi.results.map((r) => ({
    name: shortName(r.agent),
    status: r.status,
  }))

  const cellWidth = 90
  const cellHeight = 24
  const padding = 8
  const headerHeight = 28
  const totalWidth = Math.max(200, agents.length * cellWidth + padding * 2)
  const totalHeight = headerHeight + cellHeight + padding * 2

  const passed = agents.filter((a) => a.status === "pass").length
  const total = agents.length
  const headerColor = passed === total ? "#22c55e" : passed > 0 ? "#eab308" : "#ef4444"

  const agentCells = agents
    .map((a, i) => {
      const x = padding + i * cellWidth
      const y = headerHeight + padding
      const fill =
        a.status === "pass" ? "#22c55e" :
        a.status === "no-changes" ? "#eab308" :
        a.status === "timeout" ? "#eab308" :
        "#ef4444"
      const icon = a.status === "pass" ? "✓" : a.status === "timeout" ? "~" : "✗"

      return `
    <g>
      <rect x="${x}" y="${y}" width="${cellWidth - 4}" height="${cellHeight}" rx="4" fill="${fill}" opacity="0.15"/>
      <text x="${x + (cellWidth - 4) / 2}" y="${y + cellHeight / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="${fill}" font-size="11" font-family="system-ui,-apple-system,sans-serif" font-weight="500">${icon} ${a.name}</text>
    </g>`
    })
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <rect width="${totalWidth}" height="${totalHeight}" rx="6" fill="#0a0a0a"/>
  <rect width="${totalWidth}" height="${headerHeight}" rx="6" fill="${headerColor}" opacity="0.15"/>
  <rect y="${headerHeight - 1}" width="${totalWidth}" height="1" fill="${headerColor}" opacity="0.1"/>
  <text x="${padding}" y="${headerHeight / 2 + 1}" dominant-baseline="middle" fill="${headerColor}" font-size="12" font-family="system-ui,-apple-system,sans-serif" font-weight="600">PrePrompt</text>
  <text x="${totalWidth - padding}" y="${headerHeight / 2 + 1}" text-anchor="end" dominant-baseline="middle" fill="${headerColor}" font-size="11" font-family="system-ui,-apple-system,sans-serif" font-weight="400">${passed}/${total} passed</text>
  ${agentCells}
</svg>`
}

function shortName(agent: string): string {
  const map: Record<string, string> = {
    "claude-code": "Claude",
    codex: "Codex",
    "copilot-cli": "Copilot",
    cursor: "Cursor",
    gemini: "Gemini",
    opencode: "OpenCode",
  }
  return map[agent] ?? agent
}

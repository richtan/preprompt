#!/usr/bin/env node

import { Command } from "commander"
import { runLocal } from "./commands/local.js"
import { detectAgents } from "./agents/detector.js"
import { renderAgentList, renderDiff, renderError } from "./output/terminal.js"
import { loadLatestResult, listRuns, loadResult } from "./storage.js"
import { renderTrace, renderTraceComparison } from "./trace.js"

const program = new Command()

program
  .name("pstack")
  .description("Test any prompt on every AI tool.")
  .version("0.1.0")

program
  .command("local <prompt>")
  .description("Run a prompt using locally installed AI agents")
  .option("-t, --timeout <ms>", "Timeout per agent in milliseconds", "120000")
  .option("--json", "Output results as JSON", false)
  .option("--quiet", "Suppress output, only set exit code (for CI)", false)
  .option(
    "--agents <names>",
    "Comma-separated list of agents to use (e.g. claude-code,codex)"
  )
  .option(
    "--check <assertion>",
    "Assertion to verify (e.g. file-exists:package.json). Repeatable.",
    (val: string, prev: string[]) => [...prev, val],
    [] as string[]
  )
  .action(
    async (
      prompt: string,
      opts: { timeout: string; json: boolean; quiet: boolean; agents?: string; check: string[] }
    ) => {
      await runLocal(prompt, {
        timeout: parseInt(opts.timeout, 10),
        json: opts.json,
        quiet: opts.quiet,
        agents: opts.agents,
        check: opts.check.length > 0 ? opts.check : undefined,
      })
    }
  )

program
  .command("list")
  .description("Show detected AI agents and their status")
  .action(async () => {
    const agents = await detectAgents()
    renderAgentList(agents)
  })

program
  .command("diff [runId]")
  .description(
    "Compare filesystem results across agents. Uses latest run if no ID given."
  )
  .action(async (runId?: string) => {
    let result
    if (runId) {
      const loaded = await loadResult(runId)
      if (!loaded) {
        renderError(`Run not found: ${runId}`)
        process.exitCode = 1
        return
      }
      result = loaded
    } else {
      const latest = await loadLatestResult()
      if (!latest) {
        renderError("No runs found. Run pstack local <prompt> first.")
        process.exitCode = 1
        return
      }
      result = latest.result
    }

    renderDiff(result)
  })

program
  .command("trace [agent]")
  .description(
    "Replay an agent's execution trace, or compare all agents with --compare"
  )
  .option("--compare", "Compare traces across all agents side-by-side", false)
  .option("--run <runId>", "Specify a run ID (defaults to latest)")
  .action(async (agent: string | undefined, opts: { compare: boolean; run?: string }) => {
    let multi
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
        renderError("No runs found. Run pstack local <prompt> first.")
        process.exitCode = 1
        return
      }
      multi = latest.result
    }

    if (opts.compare || !agent) {
      renderTraceComparison(multi)
    } else {
      const result = multi.results.find((r) => r.agent === agent)
      if (!result) {
        renderError(
          `Agent "${agent}" not found in this run. Available: ${multi.results.map((r) => r.agent).join(", ")}`
        )
        process.exitCode = 1
        return
      }
      renderTrace(result)
    }
  })

program
  .command("history")
  .description("List past runs")
  .action(async () => {
    const runs = await listRuns()
    if (runs.length === 0) {
      console.log("\n  No runs yet. Run: pstack local <prompt>\n")
      return
    }
    console.log("\n  Past runs:")
    for (const id of runs.slice(0, 20)) {
      const result = await loadResult(id)
      if (result && result.results) {
        const agents = result.results.map((r) => r.agent).join(", ")
        const passed = result.results.filter((r) => r.status === "pass").length
        console.log(`    ${id}  ${agents}  (${passed}/${result.results.length} passed)`)
      } else {
        console.log(`    ${id}`)
      }
    }
    console.log()
  })

// Default: treat first positional arg as a prompt, run in local mode
program
  .argument("[prompt]", "Prompt file or text to test")
  .option("-t, --timeout <ms>", "Timeout per agent in milliseconds", "120000")
  .option("--json", "Output results as JSON", false)
  .option("--quiet", "Suppress output, only set exit code (for CI)", false)
  .option(
    "--agents <names>",
    "Comma-separated list of agents to use (e.g. claude-code,codex)"
  )
  .option(
    "--check <assertion>",
    "Assertion to verify (repeatable)",
    (val: string, prev: string[]) => [...prev, val],
    [] as string[]
  )
  .action(
    async (
      prompt: string | undefined,
      opts: { timeout: string; json: boolean; quiet: boolean; agents?: string; check: string[] }
    ) => {
      if (!prompt) {
        program.help()
        return
      }
      await runLocal(prompt, {
        timeout: parseInt(opts.timeout, 10),
        json: opts.json,
        quiet: opts.quiet,
        agents: opts.agents,
        check: opts.check.length > 0 ? opts.check : undefined,
      })
    }
  )

program.parse()

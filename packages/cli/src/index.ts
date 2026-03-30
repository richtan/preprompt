#!/usr/bin/env node

import chalk from "chalk"
import { Command } from "commander"
import { runLocal } from "./commands/local.js"
import { runCloud } from "./commands/cloud.js"
import { detectAgents } from "./agents/detector.js"
import { renderAgentList, renderDiff, renderError } from "./output/terminal.js"
import { loadLatestResult, listRuns, loadResult } from "./storage.js"
import { renderTrace, renderTraceComparison } from "./trace.js"
import { runDoctor } from "./commands/doctor.js"
import { runFix } from "./commands/fix.js"
import { runCompare, runCompareLatest } from "./commands/compare.js"
import { runBadge } from "./commands/badge.js"
import { runExplain } from "./commands/explain.js"
import { generateZshCompletions } from "./completions.js"

const program = new Command()

program
  .name("preprompt")
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
  .action(
    async (
      prompt: string,
      opts: { timeout: string; json: boolean; quiet: boolean; agents?: string }
    ) => {
      await runLocal(prompt, {
        timeout: parseInt(opts.timeout, 10),
        json: opts.json,
        quiet: opts.quiet,
        agents: opts.agents,
      })
    }
  )

program
  .command("cloud <prompt>")
  .description("Run a prompt on PrePrompt Cloud (all agents, managed sandboxes)")
  .option("--json", "Output results as JSON", false)
  .option("--quiet", "Suppress output, only set exit code (for CI)", false)
  .option(
    "--agents <names>",
    "Comma-separated list of agents to use (e.g. claude-code,codex)"
  )
  .action(
    async (
      prompt: string,
      opts: { json: boolean; quiet: boolean; agents?: string }
    ) => {
      await runCloud(prompt, {
        json: opts.json,
        quiet: opts.quiet,
        agents: opts.agents,
      })
    }
  )

program
  .command("login")
  .description("Authenticate with PrePrompt Cloud")
  .action(async () => {
    // TODO: implement GitHub OAuth flow
    console.log(chalk.yellow("Login is not yet available. Coming soon."))
  })

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
        renderError("No runs found. Run preprompt local <prompt> first.")
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
        renderError("No runs found. Run preprompt local <prompt> first.")
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
  .command("doctor")
  .description("Diagnose why an agent failed. Uses an AI agent for analysis.")
  .option("--run <runId>", "Specify a run ID (defaults to latest)")
  .option("--agent <name>", "Diagnose a specific agent")
  .option("-t, --timeout <ms>", "Timeout for analysis agent", "60000")
  .action(
    async (opts: { run?: string; agent?: string; timeout: string }) => {
      await runDoctor({
        run: opts.run,
        agent: opts.agent,
        timeout: parseInt(opts.timeout, 10),
      })
    }
  )

program
  .command("fix")
  .description(
    "Suggest prompt rewrites to fix agent failures. Uses an AI agent for analysis."
  )
  .option("--run <runId>", "Specify a run ID (defaults to latest)")
  .option(
    "--apply",
    "Apply the suggested fix directly to the prompt file",
    false
  )
  .option("-t, --timeout <ms>", "Timeout for analysis agent", "60000")
  .action(async (opts: { run?: string; apply: boolean; timeout: string }) => {
    await runFix({
      run: opts.run,
      apply: opts.apply,
      timeout: parseInt(opts.timeout, 10),
    })
  })

program
  .command("compare [runA] [runB]")
  .description(
    "Compare two runs before/after. Defaults to the two most recent runs."
  )
  .action(async (runA?: string, runB?: string) => {
    if (runA && runB) {
      await runCompare(runA, runB)
    } else {
      await runCompareLatest()
    }
  })

program
  .command("badge")
  .description("Generate an SVG compatibility badge from run results")
  .option("--run <runId>", "Specify a run ID (defaults to latest)")
  .option("-o, --output <path>", "Output file path", "preprompt-badge.svg")
  .action(async (opts: { run?: string; output: string }) => {
    await runBadge({ run: opts.run, output: opts.output })
  })

program
  .command("explain [agent]")
  .description("Show agent behavior profiles, strengths, and quirks")
  .action((agent?: string) => {
    runExplain(agent)
  })

program
  .command("completions")
  .description("Generate zsh completions. Add to your .zshrc")
  .action(() => {
    console.log(generateZshCompletions())
  })

program
  .command("history")
  .description("List past runs")
  .action(async () => {
    const runs = await listRuns()
    if (runs.length === 0) {
      console.error(chalk.red("error:") + " No runs yet. Run: preprompt <prompt>")
      return
    }
    for (const id of runs.slice(0, 20)) {
      const result = await loadResult(id)
      if (result && result.results) {
        const agents = result.results.map((r) => r.agent).join(", ")
        const passed = result.results.filter((r) => r.status === "pass").length
        console.log(`${id}  ${agents}  ${passed}/${result.results.length} passed`)
      } else {
        console.log(id)
      }
    }
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
  .action(
    async (
      prompt: string | undefined,
      opts: { timeout: string; json: boolean; quiet: boolean; agents?: string }
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
      })
    }
  )

program.parse()

#!/usr/bin/env node

import { Command } from "commander"
import { runLocal } from "./commands/local.js"
import { detectAgents } from "./agents/detector.js"
import { renderAgentList, renderDiff, renderError } from "./output/terminal.js"
import { loadLatestResult, listRuns, loadResult } from "./storage.js"

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
  .option(
    "--agents <names>",
    "Comma-separated list of agents to use (e.g. claude-code,codex)"
  )
  .action(
    async (
      prompt: string,
      opts: { timeout: string; json: boolean; agents?: string }
    ) => {
      await runLocal(prompt, {
        timeout: parseInt(opts.timeout, 10),
        json: opts.json,
        agents: opts.agents,
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
  .option(
    "--agents <names>",
    "Comma-separated list of agents to use (e.g. claude-code,codex)"
  )
  .action(
    async (
      prompt: string | undefined,
      opts: { timeout: string; json: boolean; agents?: string }
    ) => {
      if (!prompt) {
        program.help()
        return
      }
      await runLocal(prompt, {
        timeout: parseInt(opts.timeout, 10),
        json: opts.json,
        agents: opts.agents,
      })
    }
  )

program.parse()

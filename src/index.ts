#!/usr/bin/env node

import { Command } from "commander"
import { runLocal } from "./commands/local.js"
import { detectAgents } from "./agents/detector.js"
import { renderAgentList } from "./output/terminal.js"

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
  .action(async (prompt: string, opts: { timeout: string; json: boolean }) => {
    await runLocal(prompt, {
      timeout: parseInt(opts.timeout, 10),
      json: opts.json,
    })
  })

program
  .command("list")
  .description("Show detected AI agents and their status")
  .action(async () => {
    const agents = await detectAgents()
    renderAgentList(agents)
  })

// Default command: if no subcommand is given, treat the first arg as a prompt
// and run in local mode
program
  .argument("[prompt]", "Prompt file or text to test")
  .option("-t, --timeout <ms>", "Timeout per agent in milliseconds", "120000")
  .option("--json", "Output results as JSON", false)
  .action(async (prompt: string | undefined, opts: { timeout: string; json: boolean }) => {
    if (!prompt) {
      program.help()
      return
    }
    await runLocal(prompt, {
      timeout: parseInt(opts.timeout, 10),
      json: opts.json,
    })
  })

program.parse()

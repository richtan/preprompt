import chalk from "chalk"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { loadLatestResult, loadResult } from "../storage.js"
import { getInstalledAdapters, detectAgents } from "../agents/detector.js"
import { renderError } from "../output/terminal.js"
import type { RunResult, MultiRunResult } from "../types.js"

export async function runDoctor(opts: {
  run?: string
  agent?: string
  timeout: number
}): Promise<void> {
  // 1. Load run results
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

  // 2. Find failed agents
  const failures = opts.agent
    ? multi.results.filter((r) => r.agent === opts.agent && r.status !== "pass")
    : multi.results.filter((r) => r.status !== "pass")

  if (failures.length === 0) {
    console.log(chalk.green("\n  All agents passed. Nothing to diagnose.\n"))
    return
  }

  // 3. Get an analysis agent
  const allAgents = await detectAgents()
  const installed = getInstalledAdapters(allAgents)

  if (installed.length === 0) {
    renderError("No agents available for analysis. Install an AI agent first.")
    process.exitCode = 1
    return
  }

  const analyzer = installed[0]

  // 4. Load the original prompt content
  let promptContent = ""
  if (multi.prompt !== "(inline)") {
    try {
      promptContent = await readFile(resolve(multi.prompt), "utf8")
    } catch {
      promptContent = `[Could not read prompt file: ${multi.prompt}]`
    }
  }

  // 5. Diagnose each failure
  for (const failure of failures) {
    console.log()
    console.log(chalk.bold(`  Diagnosing: ${failure.agent}`))
    console.log(
      chalk.dim(
        `  Status: ${failure.status} · Exit code: ${failure.execution.exitCode} · Duration: ${(failure.execution.duration / 1000).toFixed(1)}s`
      )
    )
    console.log()

    // Build diagnosis prompt
    const diagnosisPrompt = buildDiagnosisPrompt(failure, promptContent, multi)

    console.log(chalk.dim("  Analyzing with " + analyzer.name + "..."))

    const { createSandbox } = await import("../sandbox/manager.js")
    const sandbox = await createSandbox()

    try {
      const result = await analyzer.execute(diagnosisPrompt, sandbox.dir, {
        timeout: opts.timeout,
      })

      if (result.stdout.trim()) {
        console.log()
        console.log(chalk.bold("  Diagnosis:"))
        for (const line of result.stdout.trim().split("\n")) {
          console.log(`  ${line}`)
        }
      } else {
        console.log(chalk.yellow("  No diagnosis output received."))
      }
    } finally {
      await sandbox.destroy()
    }

    console.log()
  }
}

function buildDiagnosisPrompt(
  failure: RunResult,
  promptContent: string,
  multi: MultiRunResult
): string {
  // Find a passing agent for comparison
  const passing = multi.results.find((r) => r.status === "pass")

  let prompt = `You are diagnosing why an AI coding agent failed to complete a task.
Be concise and specific. Output ONLY the diagnosis, no preamble.

FAILED AGENT: ${failure.agent}
STATUS: ${failure.status}
EXIT CODE: ${failure.execution.exitCode}
DURATION: ${(failure.execution.duration / 1000).toFixed(1)}s

FILES CREATED BY FAILED AGENT: ${failure.diff.added.length > 0 ? failure.diff.added.join(", ") : "none"}
FILES EXPECTED (from prompt): based on the prompt below

STDERR FROM FAILED AGENT:
${failure.execution.stderr ? failure.execution.stderr.slice(0, 2000) : "(none)"}

STDOUT FROM FAILED AGENT:
${failure.execution.stdout ? failure.execution.stdout.slice(0, 2000) : "(none)"}
`

  if (passing) {
    prompt += `
FOR COMPARISON, A PASSING AGENT (${passing.agent}) CREATED: ${passing.diff.added.join(", ")}
`
  }

  if (promptContent) {
    prompt += `
THE ORIGINAL PROMPT THAT WAS TESTED:
${promptContent.slice(0, 3000)}
`
  }

  prompt += `
Based on the above, diagnose:
1. WHY did ${failure.agent} fail? What specific thing went wrong?
2. WHICH part of the prompt caused the issue? Quote the relevant section.
3. What is the ROOT CAUSE? (e.g., agent doesn't support a feature, prompt is ambiguous, missing dependency, auth issue)

Format your response as:
WHAT FAILED: (one sentence)
WHY: (one sentence)
PROMPT LINE: (quote the relevant part of the prompt)
ROOT CAUSE: (one sentence)
`

  return prompt
}

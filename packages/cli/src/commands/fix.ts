import chalk from "chalk"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { loadLatestResult, loadResult } from "../storage.js"
import { getInstalledAdapters, detectAgents } from "../agents/detector.js"
import { buildAgentEnv } from "../agents/env.js"
import { renderError } from "../output/terminal.js"
import type { RunResult, MultiRunResult } from "../types.js"

export async function runFix(opts: {
  run?: string
  apply?: boolean
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

  // 2. Find failures
  const failures = multi.results.filter((r) => r.status !== "pass")

  if (failures.length === 0) {
    console.log("All agents passed. Nothing to fix.")
    return
  }

  // 3. Check if the prompt is a file we can fix
  if (multi.prompt === "(inline)") {
    renderError(
      "Cannot fix inline prompts. Use a prompt file: preprompt ./CLAUDE.md"
    )
    process.exitCode = 1
    return
  }

  const promptPath = resolve(multi.prompt)
  let promptContent: string
  try {
    promptContent = await readFile(promptPath, "utf8")
  } catch {
    renderError(`Cannot read prompt file: ${promptPath}`)
    process.exitCode = 1
    return
  }

  // 4. Get an analysis agent
  const allAgents = await detectAgents()
  const installed = getInstalledAdapters(allAgents)

  if (installed.length === 0) {
    renderError("No agents available for analysis.")
    process.exitCode = 1
    return
  }

  const analyzer = installed[0]

  // 5. Generate fix suggestions
  console.log(chalk.green("Generating") + " fix suggestions...")
  console.log(chalk.dim(`  analyzing with ${analyzer.name}...`))

  const fixPrompt = buildFixPrompt(promptContent, failures, multi)

  const { createSandbox } = await import("../sandbox/manager.js")
  const sandbox = await createSandbox()

  try {
    const result = await analyzer.execute(fixPrompt, sandbox.dir, {
      timeout: opts.timeout,
      env: buildAgentEnv(analyzer.name),
    })

    if (!result.stdout.trim()) {
      console.log(chalk.yellow("No fix suggestions received."))
      return
    }

    console.log()
    const output = result.stdout.trim()
    for (const line of output.split("\n")) {
      console.log(line)
    }

    // 6. Apply if requested
    if (opts.apply) {
      // Extract the rewritten prompt from the output
      const rewritten = extractRewrittenPrompt(output)
      if (rewritten) {
        await writeFile(promptPath, rewritten, "utf8")
        console.log(chalk.green("Applied") + ` fix to ${multi.prompt}`)
        console.log(chalk.dim("Run preprompt again to verify."))
      } else {
        console.log(chalk.yellow("Could not extract rewritten prompt from suggestions."))
        console.log(chalk.dim("Apply the suggested changes manually."))
      }
    } else {
      console.log(chalk.dim("Run with --apply to apply the fix: preprompt fix --apply"))
    }
  } finally {
    await sandbox.destroy()
  }
}

function buildFixPrompt(
  promptContent: string,
  failures: RunResult[],
  multi: MultiRunResult
): string {
  const passing = multi.results.find((r) => r.status === "pass")

  const failureSummary = failures
    .map((f) => {
      const details = [
        `Agent: ${f.agent}`,
        `Status: ${f.status}`,
        `Exit code: ${f.execution.exitCode}`,
        `Files created: ${f.diff.added.length > 0 ? f.diff.added.join(", ") : "none"}`,
        f.execution.stderr
          ? `Stderr: ${f.execution.stderr.slice(0, 500)}`
          : null,
      ]
        .filter(Boolean)
        .join("\n  ")
      return `  ${details}`
    })
    .join("\n\n")

  let prompt = `You are rewriting an AI instruction prompt to fix failures across different AI agents.
Be specific and minimal. Only change what's necessary to fix the failures.

ORIGINAL PROMPT:
---
${promptContent.slice(0, 4000)}
---

FAILURES:
${failureSummary}
`

  if (passing) {
    prompt += `
WORKING AGENT: ${passing.agent} passed and created: ${passing.diff.added.join(", ")}
`
  }

  prompt += `
INSTRUCTIONS:
1. Identify the specific parts of the prompt that cause failures
2. Suggest minimal, targeted changes to fix each failure
3. Output the complete rewritten prompt between <REWRITTEN> and </REWRITTEN> tags
4. Before the rewritten prompt, list each change and why it fixes the issue

FORMAT:
CHANGES:
- Change 1: (what changed and why)
- Change 2: (what changed and why)

<REWRITTEN>
(the complete fixed prompt here)
</REWRITTEN>
`

  return prompt
}

function extractRewrittenPrompt(output: string): string | null {
  const match = output.match(/<REWRITTEN>\s*([\s\S]*?)\s*<\/REWRITTEN>/i)
  if (match) {
    return match[1].trim()
  }

  // Fallback: try markdown code block
  const codeMatch = output.match(/```(?:markdown)?\s*([\s\S]*?)\s*```/)
  if (codeMatch) {
    return codeMatch[1].trim()
  }

  return null
}

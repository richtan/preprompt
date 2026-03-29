import chalk from "chalk"
import { readFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import { detectAgents, getInstalledAdapters } from "../agents/detector.js"
import type { AgentAdapter } from "../agents/types.js"
import { createSandbox } from "../sandbox/manager.js"
import { captureSnapshot, diffSnapshots } from "../sandbox/snapshot.js"
import {
  renderRunResult,
  renderMultiRunSummary,
  renderError,
  renderWarning,
  renderAgentList,
  renderEvalResult,
  renderMatrixAnalysis,
} from "../output/terminal.js"
import { saveMultiResult } from "../storage.js"
import { scanPrompt } from "../scanner.js"
import { analyzePrompt } from "../matrix.js"
import { getErrorHint, extractErrorSummary } from "../errors.js"
import { generateCriteria, evaluateRun, pickEvaluator } from "../evaluate.js"
import { renderApp, type UIController } from "../ui/render.js"
import type { RunResult, MultiRunResult, EvalResult, EvalStep, Criterion, Snapshot } from "../types.js"

export interface LocalOptions {
  timeout: number
  json: boolean
  agents?: string
  quiet?: boolean
}

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const MAX_VISIBLE_FILES = 10

export async function resolvePrompt(promptInput: string): Promise<{
  content: string
  file: string | null
}> {
  if (promptInput === "-") {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    return { content: Buffer.concat(chunks).toString("utf8"), file: null }
  }

  const resolved = resolve(promptInput)
  try {
    await access(resolved)
    const content = await readFile(resolved, "utf8")
    return { content, file: promptInput }
  } catch {
    return { content: promptInput, file: null }
  }
}

async function runSingleAgent(
  adapter: AgentAdapter,
  promptContent: string,
  promptFile: string | null,
  timeout: number,
  ui?: UIController
): Promise<RunResult> {
  const sandbox = await createSandbox()
  const agentName = adapter.name

  try {
    const before = await captureSnapshot(sandbox.dir)

    // Filesystem polling: show new files via Ink UI
    let lastSnapshot: Snapshot = before
    const emittedFiles = new Set<string>()
    const poller = setInterval(async () => {
      try {
        const current = await captureSnapshot(sandbox.dir)
        const delta = diffSnapshots(lastSnapshot, current)
        for (const path of delta.added) {
          const display = path.includes("/") ? path.split("/")[0] + "/" : path
          if (!emittedFiles.has(display) && emittedFiles.size < MAX_VISIBLE_FILES) {
            emittedFiles.add(display)
            if (ui) ui.addAgentFile(agentName, display)
          }
        }
        lastSnapshot = current
      } catch { /* sandbox may be gone */ }
    }, 2000)

    // onStatus: update the Ink UI with the agent's current action
    // For Claude Code and Codex, this receives structured status from event parsing
    // For Aider and Copilot, this receives raw stdout lines
    const onStatus = ui
      ? (status: string) => {
          ui.updateAgentStatus(agentName, status)
        }
      : undefined

    const execution = await adapter.execute(
      `Follow these instructions exactly in the current directory:\n\n${promptContent}`,
      sandbox.dir,
      { timeout, onStatus }
    )

    clearInterval(poller)

    const after = await captureSnapshot(sandbox.dir)
    const diff = diffSnapshots(before, after)

    // Emit remaining file changes that polling missed
    const polledDelta = diffSnapshots(lastSnapshot, after)
    for (const path of polledDelta.added) {
      const display = path.includes("/") ? path.split("/")[0] + "/" : path
      if (!emittedFiles.has(display) && emittedFiles.size < MAX_VISIBLE_FILES) {
        emittedFiles.add(display)
        if (ui) ui.addAgentFile(agentName, display)
      }
    }

    const noChanges =
      diff.added.length === 0 &&
      diff.modified.length === 0 &&
      diff.deleted.length === 0

    let status: RunResult["status"]
    if (execution.exitCode === -1) {
      status = "timeout"
    } else if (execution.exitCode !== 0) {
      status = "fail"
    } else if (noChanges) {
      status = "no-changes"
    } else {
      status = "pass"
    }

    // Update UI with completion
    if (ui) {
      const fileCount = new Set(diff.added.map((p) => p.split("/")[0])).size
      ui.completeAgent(agentName, {
        status,
        duration: execution.duration,
        fileCount,
        error: status === "fail"
          ? extractErrorSummary(execution.stderr) ?? `exit code ${execution.exitCode}`
          : undefined,
      })
    }

    return {
      agent: adapter.name,
      prompt: promptFile ?? "(inline)",
      workdir: sandbox.dir,
      execution,
      before,
      after,
      diff,
      status,
      timestamp: Date.now(),
    }
  } finally {
    await sandbox.destroy()
  }
}

export async function runLocal(
  promptInput: string,
  options: LocalOptions
): Promise<void> {
  // 1. Resolve prompt
  const { content: promptContent, file: promptFile } =
    await resolvePrompt(promptInput)

  if (!promptContent.trim()) {
    renderError("Prompt is empty.")
    process.exitCode = 1
    return
  }

  const streaming = !options.json && !options.quiet

  // 2. Start Ink UI (only for interactive mode)
  let ui: UIController | undefined
  if (streaming) {
    ui = renderApp()
  }

  // 3. Detect agents
  const allAgents = await detectAgents()
  let installed = getInstalledAdapters(allAgents)

  if (ui && installed.length > 0) {
    const names = installed.map((a) => a.name).join(", ")
    ui.addCompleted(`${chalk.green("✓")} ${installed.length} agent${installed.length === 1 ? "" : "s"} detected ${chalk.dim("(" + names + ")")}`)
  }

  if (installed.length === 0) {
    if (ui) ui.finish()
    renderAgentList(allAgents)
    process.exitCode = 1
    return
  }

  // 3b. Scan for destructive patterns
  const scan = scanPrompt(promptContent)
  if (!scan.safe) {
    renderWarning(
      `Prompt contains potentially destructive patterns:\n` +
        scan.warnings.map((w) => `    - ${w}`).join("\n") +
        `\n\n  Agents will execute these instructions. Proceed with caution.`
    )
  }

  // 3c. Smart matrix analysis
  const matrix = await analyzePrompt(promptContent)
  if (ui && matrix.detectedTools.length > 0) {
    ui.addCompleted(`${chalk.green("✓")} ${matrix.detectedTools.length} tools detected ${chalk.dim("(" + matrix.detectedTools.join(", ") + ")")}`)
  }

  // 4. Filter agents
  if (options.agents) {
    const requested = options.agents.split(",").map((s) => s.trim())
    const filtered = installed.filter((a) => requested.includes(a.name))
    if (filtered.length === 0) {
      if (ui) ui.finish()
      renderError(
        `None of the requested agents are installed: ${requested.join(", ")}\n` +
          `  Available: ${installed.map((a) => a.name).join(", ")}`
      )
      process.exitCode = 1
      return
    }
    installed = filtered
  }

  // 5. Generate evaluation criteria BEFORE execution
  let criteria: Criterion[] = []
  if (!options.quiet && !options.json) {
    const criteriaGenerator = installed[0]
    if (ui) ui.setActivity("Generating evaluation criteria...")

    criteria = await generateCriteria(promptContent, criteriaGenerator)

    if (ui) {
      ui.setActivity(null)
      if (criteria.length > 0) {
        ui.addCompleted(`${chalk.green("✓")} ${criteria.length} criteria identified`)
      }
    }
  }

  // 6. Run all agents in parallel
  if (ui) {
    for (const adapter of installed) {
      ui.startAgent(adapter.name)
    }
  }

  const results = await Promise.allSettled(
    installed.map((adapter) =>
      runSingleAgent(adapter, promptContent, promptFile, options.timeout, ui)
    )
  )

  const runResults: RunResult[] = results
    .filter((r): r is PromiseFulfilledResult<RunResult> => r.status === "fulfilled")
    .map((r) => r.value)

  // Include errors as failed results
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === "rejected") {
      const errorResult: RunResult = {
        agent: installed[i].name,
        prompt: promptFile ?? "(inline)",
        workdir: "",
        execution: { exitCode: 1, stdout: "", stderr: r.reason instanceof Error ? r.reason.message : String(r.reason), duration: 0 },
        before: { files: [], timestamp: 0 },
        after: { files: [], timestamp: 0 },
        diff: { added: [], modified: [], deleted: [] },
        status: "error",
        timestamp: Date.now(),
      }
      runResults.push(errorResult)
      if (ui) ui.completeAgent(installed[i].name, { status: "error", duration: 0, fileCount: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
    }
  }

  // 6. AI Behavioral Evaluation
  const evaluations: EvalResult[] = []

  if (ui) {
    for (const result of runResults) {
      const evaluator = pickEvaluator(result.agent, installed)
      if (!evaluator) continue

      ui.startEval(result.agent, evaluator.name)

      try {
        const evalResult = await evaluateRun(promptContent, criteria, result, evaluator)
        evaluations.push(evalResult)
        ui.completeEval()

        // Add eval result: score line + grouped sections
        const self = evalResult.agent === evalResult.evaluator ? chalk.dim(" (self-eval)") : ""
        const scoreColor = evalResult.score >= 80 ? chalk.green : evalResult.score >= 50 ? chalk.yellow : chalk.red
        ui.addCompleted(`${evalResult.agent}  ${scoreColor(evalResult.score + "/100")}${self}`)

        // Group steps by their criterion group
        const groups = new Map<string, EvalStep[]>()
        for (const step of evalResult.steps) {
          // Match step to criterion by number to get the group
          const criterion = criteria.find((c) => c.number === step.number)
          const group = criterion?.group ?? "General"
          if (!groups.has(group)) groups.set(group, [])
          groups.get(group)!.push(step)
        }

        for (const [group, steps] of groups) {
          const passed = steps.filter((s) => s.status === "pass").length
          const total = steps.length
          const icon = passed === total ? chalk.green("✓")
            : passed === 0 ? chalk.red("✗")
            : chalk.yellow("~")
          ui.addCompleted(`  ${icon} ${group}  ${chalk.dim(passed + "/" + total)}`)

          // Show individual failures within the group
          if (passed < total) {
            const failures = steps.filter((s) => s.status !== "pass")
            for (const step of failures) {
              ui.addCompleted(`    ${chalk.dim(step.description)}`)
            }
          }
        }
      } catch {
        ui.completeEval()
      }
    }
  }

  // 7. Build multi-run result
  const multiResult: MultiRunResult = {
    prompt: promptFile ?? "(inline)",
    criteria: criteria.length > 0 ? criteria : undefined,
    results: runResults,
    evaluations: evaluations.length > 0 ? evaluations : undefined,
    timestamp: Date.now(),
  }

  // 8. Save
  await saveMultiResult(multiResult)

  // 9. Finish UI
  if (ui) {
    if (evaluations.length > 0 && runResults.length > 1) {
      // Summary based on evaluation scores, not exit codes
      const parts = evaluations.map((e) => {
        const scoreColor = e.score >= 80 ? chalk.green : e.score >= 50 ? chalk.yellow : chalk.red
        return `${e.agent} ${scoreColor(e.score + "/100")}`
      })
      ui.addCompleted(parts.join("  "))
    }
    ui.finish()
  }

  // 10. Non-streaming render
  if (options.json) {
    console.log(JSON.stringify(multiResult, null, 2))
  } else if (!streaming) {
    if (runResults.length === 1) {
      renderRunResult(runResults[0])
    } else {
      renderMultiRunSummary(multiResult)
    }
    for (const evalResult of evaluations) {
      renderEvalResult(evalResult)
    }
  }

  // 11. Exit code based on evaluation scores
  if (evaluations.length > 0) {
    const anyFail = evaluations.some((e) => e.steps.some((s) => s.status === "fail"))
    process.exitCode = anyFail ? 1 : 0
  } else {
    const anyFailed = runResults.some(
      (r) => r.status === "fail" || r.status === "timeout" || r.status === "error"
    )
    if (anyFailed) process.exitCode = 1
  }
}

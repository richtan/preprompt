import chalk from "chalk"
import { readFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import task from "tasuku"
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
import { clearEvents, setStreamMode, emitFileChange, emitOverflowCount } from "../output/stream.js"
import { getErrorHint, extractErrorSummary } from "../errors.js"
import { evaluateRun, pickEvaluator } from "../evaluate.js"
import type { RunResult, MultiRunResult, EvalResult, Snapshot } from "../types.js"

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
  setStatus?: (status: string) => void
): Promise<RunResult> {
  const sandbox = await createSandbox()
  const agentName = adapter.name

  try {
    const before = await captureSnapshot(sandbox.dir)

    // Filesystem polling: check for new files every 2 seconds
    let lastSnapshot: Snapshot = before
    let filesEmitted = 0
    const poller = setInterval(async () => {
      try {
        const current = await captureSnapshot(sandbox.dir)
        const delta = diffSnapshots(lastSnapshot, current)
        const topLevel = new Set<string>()
        for (const path of delta.added) {
          const top = path.split("/")[0]
          if (!topLevel.has(top) && filesEmitted < MAX_VISIBLE_FILES) {
            topLevel.add(top)
            emitFileChange(agentName, path.includes("/") ? top + "/" : path)
            filesEmitted++
          }
        }
        lastSnapshot = current
      } catch { /* sandbox may be gone */ }
    }, 2000)

    // onOutput: update the tasuku status with the last meaningful stdout line
    const onOutput = setStatus
      ? (line: string) => {
          const trimmed = line.trim()
          if (trimmed && trimmed.length > 0 && trimmed.length < 100) {
            setStatus(trimmed)
          }
        }
      : undefined

    const execution = await adapter.execute(
      `Follow these instructions exactly in the current directory:\n\n${promptContent}`,
      sandbox.dir,
      { timeout, onOutput }
    )

    clearInterval(poller)

    const after = await captureSnapshot(sandbox.dir)
    const diff = diffSnapshots(before, after)

    // Emit remaining file changes that polling missed
    const polledDelta = diffSnapshots(lastSnapshot, after)
    const topLevel = new Set<string>()
    for (const path of polledDelta.added) {
      const top = path.split("/")[0]
      if (!topLevel.has(top) && filesEmitted < MAX_VISIBLE_FILES) {
        topLevel.add(top)
        emitFileChange(agentName, path.includes("/") ? top + "/" : path)
        filesEmitted++
      }
    }

    const totalTopLevel = new Set(diff.added.map((p) => p.split("/")[0])).size
    if (totalTopLevel > MAX_VISIBLE_FILES) {
      emitOverflowCount(totalTopLevel - MAX_VISIBLE_FILES)
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

  // 2. Detect agents
  const detectionResult = await task("Detecting agents", async ({ setTitle }) => {
    const allAgents = await detectAgents()
    const installed = getInstalledAdapters(allAgents)
    const names = installed.map((a) => a.name).join(", ")
    setTitle(installed.length > 0
      ? `${installed.length} agent${installed.length === 1 ? "" : "s"} detected (${names})`
      : "No agents detected"
    )
    return { allAgents, installed }
  })

  let installed = detectionResult.result.installed
  const allAgents = detectionResult.result.allAgents

  if (installed.length === 0) {
    renderAgentList(allAgents)
    process.exitCode = 1
    return
  }

  // 2b. Scan for destructive patterns
  const scan = scanPrompt(promptContent)
  if (!scan.safe) {
    renderWarning(
      `Prompt contains potentially destructive patterns:\n` +
        scan.warnings.map((w) => `    - ${w}`).join("\n") +
        `\n\n  Agents will execute these instructions. Proceed with caution.`
    )
  }

  // 2c. Smart matrix analysis
  const analysisResult = await task("Analyzing prompt", async ({ setTitle }) => {
    const matrix = await analyzePrompt(promptContent)
    if (matrix.detectedTools.length > 0) {
      setTitle(`${matrix.detectedTools.length} tools detected (${matrix.detectedTools.join(", ")})`)
    } else {
      setTitle("Prompt analyzed")
    }
    return matrix
  })

  // 3. Filter agents
  if (options.agents) {
    const requested = options.agents.split(",").map((s) => s.trim())
    const filtered = installed.filter((a) => requested.includes(a.name))
    if (filtered.length === 0) {
      renderError(
        `None of the requested agents are installed: ${requested.join(", ")}\n` +
          `  Available: ${installed.map((a) => a.name).join(", ")}`
      )
      process.exitCode = 1
      return
    }
    installed = filtered
  }

  // 4. Run all agents in parallel using tasuku
  const streaming = !options.json && !options.quiet
  const multi = installed.length > 1

  if (streaming) {
    clearEvents()
    setStreamMode(multi, installed.map((a) => a.name))
  }

  let runResults: RunResult[]

  if (streaming) {
    const execResults = await task.group(
      (create) =>
        installed.map((adapter) =>
          create(adapter.name, async ({ setStatus, setTitle, setWarning, setError }) => {
            const result = await runSingleAgent(
              adapter, promptContent, promptFile, options.timeout, setStatus
            )

            // Update the task title with the result
            const dur = formatDur(result.execution.duration)
            const files = new Set(result.diff.added.map((p) => p.split("/")[0])).size
            if (result.status === "pass") {
              setTitle(`${adapter.name}  passed  ${dur}  ${files} files`)
            } else if (result.status === "timeout") {
              setTitle(`${adapter.name}  timed out  ${dur}`)
              setWarning("timed out")
            } else if (result.status === "no-changes") {
              setTitle(`${adapter.name}  no changes  ${dur}`)
              setWarning("no changes")
            } else {
              const errSummary = extractErrorSummary(result.execution.stderr)
              const hint = getErrorHint(result.execution.stderr)
              setTitle(`${adapter.name}  failed  ${dur}`)
              setError(errSummary ?? `exit code ${result.execution.exitCode}`)
            }

            return result
          })
        ),
      { concurrency: Infinity, stopOnError: false }
    )

    runResults = execResults.map((r) => r.result)
  } else {
    // Non-streaming: direct execution
    const results = await Promise.allSettled(
      installed.map((adapter) =>
        runSingleAgent(adapter, promptContent, promptFile, options.timeout)
      )
    )

    runResults = results
      .filter((r): r is PromiseFulfilledResult<RunResult> => r.status === "fulfilled")
      .map((r) => r.value)

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === "rejected") {
        runResults.push({
          agent: installed[i].name,
          prompt: promptFile ?? "(inline)",
          workdir: "",
          execution: { exitCode: 1, stdout: "", stderr: r.reason instanceof Error ? r.reason.message : String(r.reason), duration: 0 },
          before: { files: [], timestamp: 0 },
          after: { files: [], timestamp: 0 },
          diff: { added: [], modified: [], deleted: [] },
          status: "error",
          timestamp: Date.now(),
        })
      }
    }
  }

  // 5. AI Behavioral Evaluation
  const evaluations: EvalResult[] = []

  if (!options.quiet && !options.json) {
    for (const result of runResults) {
      const evaluator = pickEvaluator(result.agent, installed)
      if (!evaluator) continue

      const self = evaluator.name === result.agent ? " (self)" : ""

      try {
        const evalResult = await task(
          `Evaluating ${result.agent} with ${evaluator.name}${self}`,
          async ({ setStatus }) => {
            return evaluateRun(promptContent, result, evaluator)
          }
        )
        evaluations.push(evalResult.result)
        renderEvalResult(evalResult.result)
      } catch {
        // Evaluation failed, continue
      }
    }
  }

  // 6. Build multi-run result
  const multiResult: MultiRunResult = {
    prompt: promptFile ?? "(inline)",
    results: runResults,
    evaluations: evaluations.length > 0 ? evaluations : undefined,
    timestamp: Date.now(),
  }

  // 7. Save
  await saveMultiResult(multiResult)

  // 8. Render
  if (options.quiet) {
    // Quiet mode: only exit code matters
  } else if (options.json) {
    console.log(JSON.stringify(multiResult, null, 2))
  } else if (streaming && runResults.length > 1) {
    console.log()
    const passed = runResults.filter((r) => r.status === "pass").length
    const failed = runResults.filter((r) => r.status === "fail" || r.status === "error").length
    const other = runResults.length - passed - failed
    const parts: string[] = []
    if (passed > 0) parts.push(`${passed} passed`)
    if (failed > 0) parts.push(`${failed} failed`)
    if (other > 0) parts.push(`${other} other`)
    console.log(parts.join(", "))
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

  // 9. Exit code based on evaluation scores
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

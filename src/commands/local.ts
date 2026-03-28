import chalk from "chalk"
import { readFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import { detectAgents, getInstalledAdapters } from "../agents/detector.js"
import type { AgentAdapter } from "../agents/types.js"
import { createSandbox, type Sandbox } from "../sandbox/manager.js"
import { captureSnapshot, diffSnapshots } from "../sandbox/snapshot.js"
import {
  renderRunResult,
  renderMultiRunSummary,
  renderError,
  renderWarning,
  renderAgentList,
  renderCheckResults,
  renderMatrixAnalysis,
} from "../output/terminal.js"
import { renderJson } from "../output/json.js"
import { saveMultiResult } from "../storage.js"
import { scanPrompt } from "../scanner.js"
import { analyzePrompt } from "../matrix.js"
import { parseInlineCheck, runChecks, allChecksPassed, type Check, type CheckResult } from "../checks.js"
import { emitEvent, clearEvents, setStreamMode } from "../output/stream.js"
import type { RunResult, MultiRunResult } from "../types.js"

export interface LocalOptions {
  timeout: number
  json: boolean
  agents?: string
  check?: string[]
  quiet?: boolean
}

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

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
    return { content, file: resolved }
  } catch {
    return { content: promptInput, file: null }
  }
}

async function runSingleAgent(
  adapter: AgentAdapter,
  promptContent: string,
  promptFile: string | null,
  timeout: number,
  streaming: boolean = false
): Promise<RunResult> {
  const sandbox = await createSandbox()
  const agentName = adapter.name

  try {
    if (streaming) {
      emitEvent({
        agent: agentName,
        type: "start",
        content: "Starting...",
        timestamp: Date.now(),
      })
    }

    const before = await captureSnapshot(sandbox.dir)

    // Heartbeat: show elapsed time every 10s so the user knows it's alive
    let heartbeat: ReturnType<typeof setInterval> | null = null
    const startTime = Date.now()
    if (streaming) {
      heartbeat = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        emitEvent({
          agent: agentName,
          type: "stdout",
          content: `(${elapsed}s)`,
          timestamp: Date.now(),
        })
      }, 10_000)
    }

    // Stream output in real time via onOutput callback
    const onOutput = streaming
      ? (line: string, stream: "stdout" | "stderr") => {
          emitEvent({
            agent: agentName,
            type: stream === "stderr" ? "stderr" : "stdout",
            content: line,
            timestamp: Date.now(),
          })
        }
      : undefined

    const execution = await adapter.execute(
      `Follow these instructions exactly in the current directory:\n\n${promptContent}`,
      sandbox.dir,
      { timeout, onOutput }
    )

    if (heartbeat) clearInterval(heartbeat)

    const after = await captureSnapshot(sandbox.dir)
    const diff = diffSnapshots(before, after)

    // File events are already emitted via onOutput during streaming.
    // No need to emit them again from the diff.

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

    if (streaming) {
      const dur = formatDur(execution.duration)
      const files = diff.added.length
      let content: string
      if (status === "pass") {
        content = chalk.green("passed") + ` in ${dur}` + chalk.dim(` (${files} files)`)
      } else if (status === "timeout") {
        content = chalk.yellow("timed out") + ` after ${dur}`
      } else if (status === "no-changes") {
        content = chalk.yellow("no changes") + ` in ${dur}`
      } else {
        content = chalk.red("failed") + chalk.dim(` (exit code ${execution.exitCode}, ${dur})`)
      }
      emitEvent({ agent: agentName, type: "done", content, timestamp: Date.now() })
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

  // 2. Scan for destructive patterns
  const scan = scanPrompt(promptContent)
  if (!scan.safe) {
    renderWarning(
      `Prompt contains potentially destructive patterns:\n` +
        scan.warnings.map((w) => `    - ${w}`).join("\n") +
        `\n\n  Agents will execute these instructions. Proceed with caution.`
    )
  }

  // 2b. Smart matrix analysis
  const matrix = await analyzePrompt(promptContent)
  if (!options.quiet) {
    renderMatrixAnalysis(matrix)
  }

  // 3. Detect agents
  const allAgents = await detectAgents()
  let installed = getInstalledAdapters(allAgents)

  if (installed.length === 0) {
    renderAgentList(allAgents)
    process.exitCode = 1
    return
  }

  // 4. Filter agents if --agents flag is set
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

  // 5. Run all agents in parallel
  const streaming = !options.json && !options.quiet
  if (streaming) {
    clearEvents()
    const agentNames = installed.map((a) => a.name)
    setStreamMode(installed.length > 1, agentNames)
    if (installed.length === 1) {
      console.log(chalk.green("Running") + ` ${installed[0].name}...`)
    } else {
      console.log(chalk.green("Running") + ` ${installed.length} agents in parallel...`)
    }
  }

  const results = await Promise.allSettled(
    installed.map((adapter) =>
      runSingleAgent(adapter, promptContent, promptFile, options.timeout, streaming)
    )
  )

  const runResults: RunResult[] = results
    .filter(
      (r): r is PromiseFulfilledResult<RunResult> => r.status === "fulfilled"
    )
    .map((r) => r.value)

  // Include errors as failed results
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === "rejected") {
      runResults.push({
        agent: installed[i].name,
        prompt: promptFile ?? "(inline)",
        workdir: "",
        execution: {
          exitCode: 1,
          stdout: "",
          stderr: r.reason instanceof Error ? r.reason.message : String(r.reason),
          duration: 0,
        },
        before: { files: [], timestamp: 0 },
        after: { files: [], timestamp: 0 },
        diff: { added: [], modified: [], deleted: [] },
        status: "error",
        timestamp: Date.now(),
      })
    }
  }

  // 6. Build multi-run result
  const multiResult: MultiRunResult = {
    prompt: promptFile ?? "(inline)",
    results: runResults,
    timestamp: Date.now(),
  }

  // 7. Save
  await saveMultiResult(multiResult)

  // 8. Run checks if specified
  const checks: Check[] = []
  if (options.check) {
    for (const raw of options.check) {
      try {
        checks.push(parseInlineCheck(raw))
      } catch (e) {
        renderError(`Invalid check: ${raw}`)
        process.exitCode = 1
        return
      }
    }
  }

  let checkResults: CheckResult[] = []
  if (checks.length > 0) {
    for (const result of runResults) {
      checkResults.push(...runChecks(checks, result))
    }
  }

  // 9. Render
  if (options.quiet) {
    // Quiet mode: only exit code matters
  } else if (options.json) {
    const output = checks.length > 0
      ? { ...multiResult, checks: checkResults }
      : multiResult
    console.log(JSON.stringify(output, null, 2))
  } else if (streaming) {
    // Streaming already showed per-agent results live.
    // Only print the summary line for multi-agent, and checks.
    if (runResults.length > 1) {
      console.log()
      const passed = runResults.filter((r) => r.status === "pass").length
      const failed = runResults.filter((r) => r.status === "fail" || r.status === "error").length
      const other = runResults.length - passed - failed
      const parts: string[] = []
      if (passed > 0) parts.push(`${passed} passed`)
      if (failed > 0) parts.push(`${failed} failed`)
      if (other > 0) parts.push(`${other} other`)
      console.log(parts.join(", "))
    }
    if (checkResults.length > 0) renderCheckResults(checkResults)
  } else {
    // Non-streaming fallback (shouldn't normally happen)
    if (runResults.length === 1) {
      renderRunResult(runResults[0])
    } else {
      renderMultiRunSummary(multiResult)
    }
    if (checkResults.length > 0) renderCheckResults(checkResults)
  }

  // 10. Exit code
  if (checks.length > 0) {
    // In check mode, exit code is based on checks, not agent status
    process.exitCode = allChecksPassed(checkResults) ? 0 : 1
  } else {
    const anyFailed = runResults.some(
      (r) => r.status === "fail" || r.status === "timeout" || r.status === "error"
    )
    if (anyFailed) process.exitCode = 1
  }
}

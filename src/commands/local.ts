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
import { emitEvent, clearEvents } from "../output/stream.js"
import type { RunResult, MultiRunResult } from "../types.js"

export interface LocalOptions {
  timeout: number
  json: boolean
  agents?: string
  check?: string[]
  quiet?: boolean
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

    const execution = await adapter.execute(
      `Follow these instructions exactly in the current directory:\n\n${promptContent}`,
      sandbox.dir,
      { timeout }
    )

    // Stream stdout/stderr lines as events
    if (streaming && execution.stdout) {
      for (const line of execution.stdout.split("\n")) {
        if (line.trim()) {
          emitEvent({
            agent: agentName,
            type: "stdout",
            content: line,
            timestamp: Date.now(),
          })
        }
      }
    }

    const after = await captureSnapshot(sandbox.dir)
    const diff = diffSnapshots(before, after)

    // Emit file events for streaming mode
    if (streaming) {
      for (const file of diff.added) {
        emitEvent({
          agent: agentName,
          type: "file",
          content: `Created ${file}`,
          timestamp: Date.now(),
        })
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

    if (streaming) {
      const icon = status === "pass" ? "✓" : "✗"
      emitEvent({
        agent: agentName,
        type: "done",
        content: `${icon} Done (${(execution.duration / 1000).toFixed(1)}s, ${diff.added.length} files)`,
        timestamp: Date.now(),
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
  const streaming = installed.length > 1 && !options.json && !options.quiet
  if (streaming) {
    clearEvents()
    console.log()
    console.log(
      chalk.bold(`  PrePrompt — running on ${installed.length} agents`)
    )
    console.log()
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
  } else if (runResults.length === 1) {
    renderRunResult(runResults[0])
    if (checkResults.length > 0) renderCheckResults(checkResults)
  } else {
    renderMultiRunSummary(multiResult)
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

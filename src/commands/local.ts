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
} from "../output/terminal.js"
import { renderJson } from "../output/json.js"
import { saveMultiResult } from "../storage.js"
import { scanPrompt } from "../scanner.js"
import type { RunResult, MultiRunResult } from "../types.js"

export interface LocalOptions {
  timeout: number
  json: boolean
  agents?: string
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
  timeout: number
): Promise<RunResult> {
  const sandbox = await createSandbox()

  try {
    const before = await captureSnapshot(sandbox.dir)

    const execution = await adapter.execute(
      `Follow these instructions exactly in the current directory:\n\n${promptContent}`,
      sandbox.dir,
      { timeout }
    )

    const after = await captureSnapshot(sandbox.dir)
    const diff = diffSnapshots(before, after)

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

  // 2. Scan for destructive patterns
  const scan = scanPrompt(promptContent)
  if (!scan.safe) {
    renderWarning(
      `Prompt contains potentially destructive patterns:\n` +
        scan.warnings.map((w) => `    - ${w}`).join("\n") +
        `\n\n  Agents will execute these instructions. Proceed with caution.`
    )
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
  const results = await Promise.allSettled(
    installed.map((adapter) =>
      runSingleAgent(adapter, promptContent, promptFile, options.timeout)
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

  // 8. Render
  if (options.json) {
    console.log(JSON.stringify(multiResult, null, 2))
  } else if (runResults.length === 1) {
    renderRunResult(runResults[0])
  } else {
    renderMultiRunSummary(multiResult)
  }

  // 9. Exit code: 1 if any agent failed
  const anyFailed = runResults.some(
    (r) => r.status === "fail" || r.status === "timeout" || r.status === "error"
  )
  if (anyFailed) {
    process.exitCode = 1
  }
}

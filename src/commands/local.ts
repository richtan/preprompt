import { readFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import { detectAgents, getInstalledAdapters } from "../agents/detector.js"
import { createSandbox } from "../sandbox/manager.js"
import { captureSnapshot, diffSnapshots } from "../sandbox/snapshot.js"
import { renderRunResult, renderError, renderWarning, renderAgentList } from "../output/terminal.js"
import { renderJson } from "../output/json.js"
import { saveResult } from "../storage.js"
import { scanPrompt } from "../scanner.js"
import type { RunResult } from "../types.js"

interface LocalOptions {
  timeout: number
  json: boolean
}

export async function runLocal(
  promptInput: string,
  options: LocalOptions
): Promise<void> {
  // 1. Resolve prompt content
  let promptContent: string
  let promptFile: string | null = null

  if (promptInput === "-") {
    // Read from stdin
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    promptContent = Buffer.concat(chunks).toString("utf8")
  } else {
    // Check if it's a file path
    const resolved = resolve(promptInput)
    try {
      await access(resolved)
      promptContent = await readFile(resolved, "utf8")
      promptFile = resolved
    } catch {
      // Treat as inline prompt string
      promptContent = promptInput
    }
  }

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
  const agents = await detectAgents()
  const installed = getInstalledAdapters(agents)

  if (installed.length === 0) {
    renderAgentList(agents)
    process.exitCode = 1
    return
  }

  // 4. Run first available agent
  const adapter = installed[0]
  const agentInfo = agents.find((a) => a.name === adapter.name)

  if (agentInfo && !agentInfo.authenticated) {
    renderError(
      `${adapter.name} is installed but not authenticated. Run the agent's login command first.`
    )
    process.exitCode = 1
    return
  }

  // 5. Create sandbox
  const sandbox = await createSandbox()

  try {
    // 6. Capture "before" snapshot
    const before = await captureSnapshot(sandbox.dir)

    // 7. Execute agent
    const execution = await adapter.execute(
      `Follow these instructions exactly in the current directory:\n\n${promptContent}`,
      sandbox.dir,
      { timeout: options.timeout }
    )

    // 8. Capture "after" snapshot
    const after = await captureSnapshot(sandbox.dir)

    // 9. Diff
    const diff = diffSnapshots(before, after)

    // 10. Determine status
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

    // 11. Build result
    const result: RunResult = {
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

    // 12. Save
    const runId = await saveResult(result)

    // 13. Render
    if (options.json) {
      renderJson(result)
    } else {
      renderRunResult(result)
    }

    // 14. Exit code
    if (status === "fail" || status === "timeout" || status === "error") {
      process.exitCode = 1
    }
  } finally {
    await sandbox.destroy()
  }
}

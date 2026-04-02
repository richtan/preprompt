import chalk from "chalk"
import { readFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import { emitKeypressEvents } from "node:readline"
import { detectAgents, getInstalledAdapters } from "../agents/detector.js"
import type { AgentAdapter, ActionType } from "../agents/types.js"
import { createSandbox, type Sandbox } from "../sandbox/manager.js"
import { buildAgentEnv } from "../agents/env.js"
import { captureSnapshot, diffSnapshots } from "../sandbox/snapshot.js"
import {
  renderRunResult,
  renderMultiRunSummary,
  renderError,
  renderWarning,
  renderAgentList,
  renderEvalResult,
} from "../output/terminal.js"
import { saveMultiResult } from "../storage.js"
import { scanPrompt } from "../scanner.js"
import { analyzePrompt } from "../matrix.js"
import { generateCriteria, evaluateInSandbox } from "../evaluate.js"
import { renderApp, type UIController } from "../ui/render.js"
import type { RunResult, MultiRunResult, EvalResult, Criterion } from "../types.js"

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

export function formatFileTree(files: string[]): string {
  if (files.length === 0) return "no files"

  const roots: string[] = []
  const dirs = new Map<string, string[]>()

  for (const file of files) {
    const parts = file.split("/")
    if (parts.length === 1) {
      roots.push(file)
    } else {
      const dir = parts[0]
      if (!dirs.has(dir)) dirs.set(dir, [])
      dirs.get(dir)!.push(parts.slice(1).join("/"))
    }
  }

  const segments: string[] = []
  for (const root of roots) segments.push(root)
  for (const [dir, children] of dirs) {
    if (children.length === 1) {
      segments.push(`${dir}/${children[0]}`)
    } else {
      segments.push(`${dir}/{${children.join(", ")}}`)
    }
  }

  const result = segments.join(", ")
  if (result.length <= 80) return result

  let truncated = ""
  let shown = 0
  for (const seg of segments) {
    const next = shown === 0 ? seg : truncated + ", " + seg
    if (next.length > 65) break
    truncated = next
    shown++
  }
  const remaining = segments.length - shown
  return remaining > 0 ? `${truncated}, +${remaining} more` : truncated
}

function displayCriteria(criteria: Criterion[]): number {
  const groups = new Map<string, Criterion[]>()
  for (const c of criteria) {
    const g = c.group ?? "General"
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(c)
  }
  let lines = 0
  let first = true
  for (const [group, items] of groups) {
    if (!first) { console.log(""); lines++ }
    first = false
    console.log(`  ${chalk.bold(group)} ${chalk.dim(`(${items.length})`)}`)
    lines++
    for (const c of items) {
      console.log(`    ${chalk.dim("-")} ${c.description}`)
      lines++
    }
  }
  return lines
}

async function promptRetry(): Promise<boolean> {
  if (!process.stdin.isTTY) return false

  return new Promise((resolve) => {
    let selected = 0
    let cursorRow = 0

    process.stdout.write("\n\n")
    process.stdout.moveCursor(0, -2)
    cursorRow = 0

    function draw() {
      if (cursorRow === 1) {
        process.stdout.moveCursor(0, -1)
      }
      cursorRow = 0

      process.stdout.cursorTo(0)
      process.stdout.write("\x1b[K")
      process.stdout.write(selected === 0
        ? `  ${chalk.green("❯")} ${chalk.bold("Retry")}`
        : `    Retry`)

      process.stdout.write("\n")
      process.stdout.write("\x1b[K")
      process.stdout.write(selected === 1
        ? `  ${chalk.green("❯")} ${chalk.bold("Exit")}`
        : `    Exit`)
      cursorRow = 1

      process.stdout.write("\x1b[?25l")
      if (selected === 0) {
        process.stdout.moveCursor(0, -1)
        cursorRow = 0
      }
    }

    draw()

    emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.resume()

    function done(result: boolean) {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener("keypress", handler)
      process.stdout.write("\x1b[?25h")
      if (cursorRow === 1) {
        process.stdout.moveCursor(0, -1)
      }
      process.stdout.cursorTo(0)
      process.stdout.clearScreenDown()
      resolve(result)
    }

    function handler(_ch: string | undefined, key: { name: string; ctrl: boolean }) {
      if (!key) return
      if (key.ctrl && key.name === "c") {
        process.stdin.setRawMode(false)
        process.stdout.write("\x1b[?25h")
        process.exit(130)
      }
      if (key.name === "return") {
        done(selected === 0)
        return
      }
      if (key.name === "up" && selected > 0) { selected = 0; draw(); return }
      if (key.name === "down" && selected < 1) { selected = 1; draw(); return }
    }

    process.stdin.on("keypress", handler)
  })
}

async function promptCriteriaApproval(): Promise<{ action: "accept" } | { action: "revise"; feedback: string }> {
  if (!process.stdin.isTTY) return { action: "accept" }

  return new Promise((resolve) => {
    let selected = 0  // 0=Accept, 1=Revise
    let input = ""
    let cursorPos = 0 // position within input (0 to input.length)
    let cursorRow = 0 // 0=row A (Accept), 1=row B (Revise)
    const maxInput = (process.stdout.columns || 80) - 14

    // Reserve 2 lines
    process.stdout.write("\n\n")
    process.stdout.moveCursor(0, -2)
    cursorRow = 0

    function draw() {
      // Step 1: Always navigate to row A
      if (cursorRow === 1) {
        process.stdout.moveCursor(0, -1)
      }
      cursorRow = 0

      // Step 2: Clear and write row A
      process.stdout.cursorTo(0)
      process.stdout.write("\x1b[K")
      const line1 = selected === 0
        ? `  ${chalk.green("❯")} ${chalk.bold("Accept")}`
        : `    Accept`
      process.stdout.write(line1)

      // Step 3: Move to row B, clear, write (always show text if present)
      process.stdout.write("\n")
      process.stdout.write("\x1b[K")
      if (selected === 1) {
        process.stdout.write(`  ${chalk.green("❯")} ${chalk.bold("Revise")}${input ? ", " + input : ", "}`)
      } else {
        process.stdout.write(input ? `    Revise${chalk.dim(", " + input)}` : `    Revise`)
      }
      cursorRow = 1

      // Step 4: Cursor placement and visibility
      if (selected === 0) {
        process.stdout.write("\x1b[?25l") // hide cursor
        process.stdout.moveCursor(0, -1)
        process.stdout.cursorTo(0)
        cursorRow = 0
      } else {
        process.stdout.write("\x1b[?25h") // show cursor
        process.stdout.cursorTo(12 + cursorPos) // position within text
      }
    }

    draw()

    emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.resume()

    function done(result: { action: "accept" } | { action: "revise"; feedback: string }) {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener("keypress", handler)
      process.stdout.write("\x1b[?25h") // always restore cursor visibility
      // Navigate to row A and clear both rows
      if (cursorRow === 1) {
        process.stdout.moveCursor(0, -1)
      }
      process.stdout.cursorTo(0)
      process.stdout.clearScreenDown()
      resolve(result)
    }

    function handler(ch: string | undefined, key: { name: string; ctrl: boolean; meta?: boolean }) {
      if (!key) return
      if (key.ctrl && key.name === "c") {
        process.stdin.setRawMode(false)
        process.stdout.write("\x1b[?25h") // restore cursor
        process.exit(0)
      }

      // Enter: submit
      if (key.name === "return") {
        if (selected === 0 || !input.trim()) {
          done({ action: "accept" })
        } else {
          done({ action: "revise", feedback: input.trim() })
        }
        return
      }

      // Arrow navigation (text preserved across selection changes)
      if (key.name === "up" && selected > 0) { selected = 0; draw(); return }
      if (key.name === "down" && selected < 1) { selected = 1; draw(); return }

      // Text editing when on Revise
      if (selected === 1) {
        if (key.name === "left" && cursorPos > 0) { cursorPos--; draw(); return }
        if (key.name === "right" && cursorPos < input.length) { cursorPos++; draw(); return }
        if (key.name === "home") { cursorPos = 0; draw(); return }
        if (key.name === "end") { cursorPos = input.length; draw(); return }

        if (key.name === "backspace") {
          if (cursorPos > 0) {
            input = input.slice(0, cursorPos - 1) + input.slice(cursorPos)
            cursorPos--
            draw()
          }
          return
        }

        if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32 && !key.ctrl && !key.meta && input.length < maxInput) {
          input = input.slice(0, cursorPos) + ch + input.slice(cursorPos)
          cursorPos++
          draw()
          return
        }
      }
    }

    process.stdin.on("keypress", handler)
  })
}

const SPINNER_FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]

function startSpinner(label: string): () => void {
  let i = 0
  process.stdout.write("\x1b[?25l") // hide cursor during spinner
  const interval = setInterval(() => {
    process.stdout.write(`\r${SPINNER_FRAMES[i++ % SPINNER_FRAMES.length]} ${label}`)
  }, 80)
  return () => {
    clearInterval(interval)
    process.stdout.write("\r" + " ".repeat(label.length + 4) + "\r")
    process.stdout.write("\x1b[?25h") // restore cursor
  }
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
    return { content, file: promptInput }
  } catch {
    return { content: promptInput, file: null }
  }
}

interface AgentRunOutput {
  result: RunResult
  sandbox: { dir: string; destroy: () => Promise<void> }
  agentResult: {
    status: RunResult["status"]
    duration: number
    fileSummary: string
    error?: string
  }
}

async function runSingleAgent(
  adapter: AgentAdapter,
  promptContent: string,
  promptFile: string | null,
  timeout: number,
  ui?: UIController
): Promise<AgentRunOutput> {
  const sandbox = await createSandbox()
  const agentName = adapter.name

  const before = await captureSnapshot(sandbox.dir)

  const onStatus = ui
    ? (status: string) => {
        ui.updateAgentStatus(agentName, status)
      }
    : undefined

  // Build all possible representations of the sandbox path for stripping.
  // On macOS, paths can appear as /var/folders/..., /private/var/folders/...,
  // /tmp/..., or /private/tmp/... depending on which tool resolves them.
  const sandboxPaths = new Set<string>()
  sandboxPaths.add(sandbox.dir)
  try {
    const fs = await import("node:fs")
    const real = fs.realpathSync(sandbox.dir)
    sandboxPaths.add(real)
    // Add /private-prefixed and /private-stripped variants
    for (const p of [...sandboxPaths]) {
      if (p.startsWith("/private/")) sandboxPaths.add(p.slice("/private".length))
      else sandboxPaths.add("/private" + p)
    }
  } catch {}
  // Sort longest first so longer paths match before shorter substrings
  const sortedPaths = [...sandboxPaths].sort((a, b) => b.length - a.length)

  const MAX_CMD_LEN = 120

  const onAction = ui
    ? (type: ActionType, text: string) => {
        let clean = text
        for (const p of sortedPaths) {
          clean = clean.replaceAll(p + "/", "").replaceAll(p, ".")
        }
        // Use first line only for multi-line commands
        clean = clean.split("\n")[0]
        // Truncate long commands as a universal safety net
        if (clean.length > MAX_CMD_LEN) clean = clean.slice(0, MAX_CMD_LEN - 3) + "..."
        ui.addAgentHistory(agentName, type, clean)
      }
    : undefined

  try {
    const execution = await adapter.execute(
      `Follow these instructions exactly in the current directory:\n\n${promptContent}`,
      sandbox.dir,
      { timeout, env: buildAgentEnv(adapter.name), onStatus, onAction }
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

    const agentResult = {
      status: status as "pass" | "fail" | "timeout" | "error" | "no-changes",
      duration: execution.duration,
      fileSummary: formatFileTree(diff.added),
      error: status === "fail" ? `exit code ${execution.exitCode}`
        : status === "timeout" ? `timed out after ${formatDur(timeout)}`
        : undefined,
    }

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

    return { result, sandbox, agentResult }
  } catch (error) {
    await sandbox.destroy()
    throw error
  }
}

export async function runLocal(
  promptInput: string,
  options: LocalOptions
): Promise<void> {
  // Always restore cursor on exit (Ink and spinners hide it)
  const restoreCursor = () => process.stdout.write("\x1b[?25h")
  process.on("exit", restoreCursor)
  process.on("SIGINT", () => {
    restoreCursor()
    process.exit(130)
  })
  process.on("SIGTERM", () => {
    restoreCursor()
    process.exit(143)
  })

  // 1. Resolve prompt
  const { content: promptContent, file: promptFile } =
    await resolvePrompt(promptInput)

  if (!promptContent.trim()) {
    renderError("Prompt is empty.")
    process.exitCode = 1
    return
  }

  const streaming = !options.json && !options.quiet

  // === Phase 1: Pre-agent (console.log + readline) ===

  // 2. Detect agents
  const allAgents = await detectAgents()
  let installed = getInstalledAdapters(allAgents)

  if (streaming && installed.length > 0) {
    const names = installed.map((a) => a.name).join(", ")
    console.log(`${chalk.green("Detected")} ${installed.length} agent${installed.length === 1 ? "" : "s"} ${chalk.dim("(" + names + ")")}`)
  }

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
  const matrix = await analyzePrompt(promptContent)
  if (streaming && matrix.detectedTools.length > 0) {
    console.log(`${chalk.green("Detected")} ${matrix.detectedTools.length} tools ${chalk.dim("(" + matrix.detectedTools.join(", ") + ")")}`)
  }

  // 3. Filter agents
  if (options.agents) {
    const requested = options.agents.split(",").map((s) => s.trim()).filter(Boolean)
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

  // 4. Generate and approve criteria
  let criteria: Criterion[] = []
  let feedback: string | undefined
  let displayedLines = 0 // lines used by criteria display (for clearing on revision)

  while (true) {
    // On revision, clear the previous criteria display
    if (feedback && displayedLines > 0) {
      process.stdout.moveCursor(0, -displayedLines)
      process.stdout.clearScreenDown()
      displayedLines = 0
    }

    const stopSpinner = streaming
      ? startSpinner(feedback ? "Revising criteria..." : "Generating criteria...")
      : undefined

    criteria = await generateCriteria(promptContent, installed[0], feedback, criteria.length > 0 ? criteria : undefined)

    stopSpinner?.()

    if (criteria.length === 0) {
      if (!streaming) {
        renderError("Criteria generation failed.")
        process.exitCode = 1
        return
      }
      renderWarning("Criteria generation failed")
      const retry = await promptRetry()
      if (!retry) {
        process.exitCode = 1
        return
      }
      feedback = undefined
      continue
    }
    if (!streaming) break // auto-approve in non-interactive modes

    // Display criteria (track lines for clearing on revision)
    console.log("")
    const criteriaLines = displayCriteria(criteria)
    console.log("")
    console.log(`${chalk.green("Generated")} ${criteria.length} criteria`)
    displayedLines = 1 + criteriaLines + 1 + 1 // blank + criteria + blank + summary

    // Interactive approval
    const result = await promptCriteriaApproval()

    if (result.action === "accept") {
      console.log("")
      break
    } else {
      feedback = result.feedback
    }
  }

  // === Phase 2: Agent execution (Ink) ===

  let ui: UIController | undefined
  if (streaming) {
    ui = renderApp()
  }

  // 5. Run all agents in parallel
  if (ui) {
    for (const adapter of installed) {
      ui.startAgent(adapter.name)
    }
  }

  const runResults: RunResult[] = []
  const evaluations: EvalResult[] = []

  // Async eval queue: agents push here as they finish, consumer evaluates sequentially
  const evalQueue: { result: RunResult; sandbox: Sandbox }[] = []
  let queueResolver: (() => void) | null = null
  let queueClosed = false

  function pushEval(item: { result: RunResult; sandbox: Sandbox }) {
    evalQueue.push(item)
    if (queueResolver) {
      queueResolver()
      queueResolver = null
    }
  }

  function closeQueue() {
    queueClosed = true
    if (queueResolver) {
      queueResolver()
      queueResolver = null
    }
  }

  async function popEval(): Promise<{ result: RunResult; sandbox: Sandbox } | null> {
    while (evalQueue.length === 0) {
      if (queueClosed) return null
      await new Promise<void>((resolve) => { queueResolver = resolve })
    }
    return evalQueue.shift()!
  }

  async function runAgent(adapter: AgentAdapter): Promise<void> {
    try {
      const { result, sandbox, agentResult } = await runSingleAgent(
        adapter, promptContent, promptFile, options.timeout, ui
      )
      runResults.push(result)

      if (ui) ui.setAgentResult(result.agent, agentResult)

      if (criteria.length > 0) {
        pushEval({ result, sandbox })
      } else {
        await sandbox.destroy()
      }
    } catch (error) {
      const errorResult: RunResult = {
        agent: adapter.name,
        prompt: promptFile ?? "(inline)",
        workdir: "",
        execution: { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error), duration: 0 },
        before: { files: [], timestamp: 0 },
        after: { files: [], timestamp: 0 },
        diff: { added: [], modified: [], deleted: [] },
        status: "error",
        timestamp: Date.now(),
      }
      runResults.push(errorResult)
      if (ui) {
        ui.setAgentResult(adapter.name, { status: "error", duration: 0, fileSummary: "no files", error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  // 6. Evaluate sequentially as agents finish (prevents port collisions)
  async function evalConsumer() {
    let item: { result: RunResult; sandbox: Sandbox } | null
    while ((item = await popEval()) !== null) {
      const { result, sandbox } = item
      let evalResult: EvalResult
      try {
        evalResult = await evaluateInSandbox(result.agent, criteria, sandbox.dir)
      } catch {
        evalResult = {
          agent: result.agent,
          criteria,
          steps: criteria.map((c) => ({
            number: c.number,
            description: c.description,
            status: "fail" as const,
            note: "evaluation failed",
          })),
          score: 0,
          duration: 0,
        }
      }
      evaluations.push(evalResult)
      if (ui) ui.setAgentEval(result.agent, evalResult)
      try { await sandbox.destroy() } catch {}
    }
  }

  const evalConsumerPromise = criteria.length > 0 ? evalConsumer() : Promise.resolve()

  await Promise.allSettled(installed.map((adapter) => runAgent(adapter)))
  closeQueue()

  await evalConsumerPromise

  // 7. Build multi-run result
  const multiResult: MultiRunResult = {
    prompt: promptFile ?? "(inline)",
    criteria: criteria.length > 0 ? criteria : undefined,
    results: runResults,
    evaluations: evaluations.length > 0 ? evaluations : undefined,
    timestamp: Date.now(),
  }

  // 8. Save + finish + render (finish UI even if save fails)
  try {
    await saveMultiResult(multiResult)
  } catch {}

  if (ui) {
    ui.finish()
  }

  // 9. Non-streaming render
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

  // 10. Exit code based on evaluation scores
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

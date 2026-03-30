import type { SandboxProvider, SandboxHandle } from "./sandbox/provider.js"
import { AGENT_TEMPLATES, AGENT_SETUP, AGENT_EXEC } from "./sandbox/agents.js"
import { createHash } from "node:crypto"

/**
 * Run lifecycle:
 *
 *   POST /runs ──► orchestrator.startRun()
 *       │
 *       ├─► generate criteria (Haiku)
 *       ├─► for each agent (parallel):
 *       │   ├─► create sandbox
 *       │   ├─► setup agent (install if needed)
 *       │   ├─► write prompt to sandbox
 *       │   ├─► execute agent ──► stream events
 *       │   ├─► snapshot filesystem
 *       │   ├─► evaluate criteria
 *       │   └─► destroy sandbox
 *       │
 *       └─► mark run completed
 */

export interface RunEvent {
  event: string
  data: Record<string, unknown>
}

export interface RunContext {
  runId: string
  prompt: string
  agents: string[]
  apiKeys: { anthropic?: string; openai?: string }
  onEvent: (event: RunEvent) => void
}

export async function startRun(
  ctx: RunContext,
  provider: SandboxProvider
): Promise<void> {
  const { runId, prompt, agents, apiKeys, onEvent } = ctx

  onEvent({
    event: "run.started",
    data: { runId, agents, criteriaCount: 0 },
  })

  // Run all agents in parallel
  const results = await Promise.allSettled(
    agents.map((agent) => runAgent(agent, prompt, apiKeys, provider, onEvent))
  )

  // Emit completion
  const completedAgents = results.filter((r) => r.status === "fulfilled").length
  onEvent({
    event: "run.completed",
    data: {
      runId,
      duration: 0, // TODO: track actual duration
      url: `https://preprompt.dev/runs/${runId}`,
      completedAgents,
      totalAgents: agents.length,
    },
  })
}

async function runAgent(
  agent: string,
  prompt: string,
  apiKeys: { anthropic?: string; openai?: string },
  provider: SandboxProvider,
  onEvent: (event: RunEvent) => void
): Promise<void> {
  const template = AGENT_TEMPLATES[agent] ?? "base"
  const start = Date.now()

  onEvent({ event: "agent.started", data: { agent } })

  let sandbox: SandboxHandle | null = null

  try {
    // Create sandbox with API keys injected
    const env: Record<string, string> = {}
    if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic
    if (apiKeys.openai) env.OPENAI_API_KEY = apiKeys.openai

    sandbox = await provider.create({ template, env })

    // Setup agent (install if needed — skip for pre-built templates)
    const setupCmds = AGENT_SETUP[agent]
    if (setupCmds) {
      for (const cmd of setupCmds) {
        onEvent({ event: "agent.status", data: { agent, status: "setup", message: `Installing ${agent}...` } })
        await sandbox.exec(cmd, { timeout: 180_000 }) // 3 min for installs
      }
    }

    // Write prompt to sandbox
    const promptPath = "/workspace/prompt.md"
    await sandbox.writeFile(promptPath, prompt)

    // Execute agent
    onEvent({ event: "agent.status", data: { agent, status: "running", message: "Executing prompt..." } })

    const execCmd = AGENT_EXEC[agent]
    if (!execCmd) throw new Error(`No exec command for agent: ${agent}`)

    const result = await sandbox.exec(execCmd(promptPath), {
      timeout: 120_000,
      env,
      onStdout: (chunk) => {
        // TODO: parse agent-specific stdout into typed events
        // For now, emit raw status
        onEvent({ event: "agent.status", data: { agent, status: "running", message: chunk.slice(0, 200) } })
      },
    })

    // Snapshot filesystem
    const files = await sandbox.listFiles("/workspace")
    const fileSummary = files
      .filter((f) => f.path !== "prompt.md")
      .map((f) => f.path)

    const duration = Date.now() - start
    const passed = result.exitCode === 0

    onEvent({
      event: "agent.completed",
      data: {
        agent,
        duration,
        status: passed ? "pass" : "fail",
        fileSummary: `+${fileSummary.length}`,
        error: passed ? undefined : (result.stderr || result.stdout).slice(0, 500),
      },
    })

    // TODO: evaluate criteria in sandbox
    // TODO: store results in DB + R2

  } catch (error) {
    const duration = Date.now() - start
    const message = error instanceof Error ? error.message : "Unknown error"

    const errorType = message.includes("timed out") || message.includes("timeout")
      ? "execution_timeout"
      : message.includes("E2B") || message.includes("sandbox")
        ? "sandbox_boot_failed"
        : "execution_error"

    onEvent({
      event: "agent.error",
      data: { agent, error: errorType, message: message.slice(0, 500), duration },
    })
  } finally {
    if (sandbox) {
      try {
        await sandbox.destroy()
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16)
}

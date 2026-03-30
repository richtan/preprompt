import chalk from "chalk"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createRun, streamRun } from "../cloud/client.js"
import { renderApp, type UIController } from "../ui/render.js"
import type { ActionType } from "../agents/types.js"

export interface CloudOptions {
  agents?: string
  json?: boolean
  quiet?: boolean
}

export async function runCloud(promptInput: string, options: CloudOptions): Promise<void> {
  // Resolve prompt content
  let promptContent: string
  try {
    const filePath = resolve(promptInput)
    promptContent = await readFile(filePath, "utf-8")
  } catch {
    // Not a file path — treat as inline prompt
    promptContent = promptInput
  }

  if (options.json) {
    return runCloudJson(promptContent, options)
  }

  if (options.quiet) {
    return runCloudQuiet(promptContent, options)
  }

  return runCloudInteractive(promptContent, options)
}

async function runCloudInteractive(prompt: string, options: CloudOptions): Promise<void> {
  const agentFilter = options.agents?.split(",").map((a) => a.trim())

  // Create run on cloud
  let run
  try {
    run = await createRun(prompt, agentFilter)
  } catch (err) {
    console.error(chalk.red(`error: ${(err as Error).message}`))
    process.exit(1)
  }

  // Start Ink UI
  const ui = renderApp()

  ui.addCompleted(chalk.green("Created") + ` cloud run ${chalk.dim(run.id.slice(0, 8))}`)
  ui.addCompleted(
    chalk.green("Running") +
      ` ${run.agents.length} agents (${run.agents.join(", ")})`
  )

  // Start agent spinners
  for (const agent of run.agents) {
    ui.startAgent(agent)
  }

  // Stream events from cloud
  await streamRun(run.id, (event) => {
    switch (event.event) {
      case "agent.started":
        ui.updateAgentStatus(String(event.data.agent), "starting...")
        break

      case "agent.status":
        ui.updateAgentStatus(
          String(event.data.agent),
          String(event.data.message ?? "running...")
        )
        break

      case "agent.action": {
        const type = (event.data.type as ActionType) ?? "command"
        ui.addAgentHistory(String(event.data.agent), type, String(event.data.text))
        break
      }

      case "agent.completed": {
        const agent = String(event.data.agent)
        const duration = Number(event.data.duration ?? 0)
        const status = String(event.data.status) as "pass" | "fail"
        ui.setAgentResult(agent, {
          status,
          duration,
          fileSummary: String(event.data.fileSummary ?? ""),
        })
        ui.completeAgent(agent)
        break
      }

      case "agent.error": {
        const agent = String(event.data.agent)
        ui.setAgentResult(agent, {
          status: "error",
          duration: Number(event.data.duration ?? 0),
          fileSummary: "",
          error: String(event.data.message ?? "Unknown error"),
        })
        ui.completeAgent(agent)
        break
      }

      case "agent.checking":
        ui.setAgentChecking(
          String(event.data.agent),
          Number(event.data.index),
          Number(event.data.total)
        )
        break

      case "agent.evaluated":
        // Eval results handled by completed event
        break

      case "run.completed": {
        const url = String(event.data.url ?? "")
        if (url) {
          ui.addCompleted("")
          ui.addCompleted(chalk.dim(`View results: ${url}`))
        }
        break
      }

      case "run.error":
        ui.addCompleted(chalk.red(`error: ${event.data.message}`))
        break

      case "stream.keepalive":
        // Ignore keepalive
        break
    }
  })

  ui.finish()
}

async function runCloudJson(prompt: string, options: CloudOptions): Promise<void> {
  const agentFilter = options.agents?.split(",").map((a) => a.trim())

  const run = await createRun(prompt, agentFilter)

  const events: Array<{ event: string; data: Record<string, unknown> }> = []

  await streamRun(run.id, (event) => {
    if (event.event !== "stream.keepalive") {
      events.push({ event: event.event, data: event.data })
    }
  })

  console.log(JSON.stringify({ id: run.id, events }, null, 2))
}

async function runCloudQuiet(prompt: string, options: CloudOptions): Promise<void> {
  const agentFilter = options.agents?.split(",").map((a) => a.trim())

  const run = await createRun(prompt, agentFilter)

  let hasFailure = false

  await streamRun(run.id, (event) => {
    if (event.event === "agent.completed" && event.data.status === "fail") {
      hasFailure = true
    }
    if (event.event === "agent.error") {
      hasFailure = true
    }
  })

  process.exit(hasFailure ? 1 : 0)
}

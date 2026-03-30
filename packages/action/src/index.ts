import * as core from "@actions/core"
import * as github from "@actions/github"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

interface SSEEvent {
  event: string
  data: Record<string, unknown>
}

async function run(): Promise<void> {
  try {
    const promptInput = core.getInput("prompt", { required: true })
    const agents = core.getInput("agents") || undefined
    const token = core.getInput("token", { required: true })
    const apiUrl = core.getInput("api-url")

    // Resolve prompt content
    let prompt: string
    try {
      prompt = await readFile(resolve(promptInput), "utf-8")
    } catch {
      prompt = promptInput
    }

    core.info(`Creating cloud run...`)

    // Create run
    const createRes = await fetch(`${apiUrl}/api/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt,
        agents: agents?.split(",").map((a) => a.trim()),
      }),
    })

    if (!createRes.ok) {
      const body = (await createRes.json().catch(() => ({}))) as Record<string, unknown>
      throw new Error(`Failed to create run: ${body.error ?? createRes.status}`)
    }

    const { id: runId, agents: runAgents, streamUrl } = (await createRes.json()) as {
      id: string
      agents: string[]
      streamUrl: string
    }

    core.info(`Run ${runId.slice(0, 8)} started with ${runAgents.length} agents`)

    // Stream results
    const events: SSEEvent[] = []
    const res = await fetch(`${apiUrl}${streamUrl}`, {
      headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
    })

    if (!res.ok || !res.body) {
      throw new Error(`Failed to stream results: ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let currentEvent = ""
    let currentData = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line.startsWith("event: ")) currentEvent = line.slice(7)
        else if (line.startsWith("data: ")) currentData = line.slice(6)
        else if (line === "" && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData)
            events.push({ event: currentEvent, data })

            if (currentEvent === "agent.completed") {
              const status = data.status === "pass" ? "✓" : "✗"
              core.info(`  ${status} ${data.agent}  ${(data.duration / 1000).toFixed(1)}s`)
            }
            if (currentEvent === "agent.error") {
              core.info(`  ✗ ${data.agent}  ${data.message}`)
            }
          } catch { /* skip */ }
          currentEvent = ""
          currentData = ""
        }
      }
    }

    // Analyze results
    const agentResults = events.filter(
      (e) => e.event === "agent.completed" || e.event === "agent.error"
    )
    const failedAgents = agentResults.filter(
      (e) => e.data.status === "fail" || e.event === "agent.error"
    )

    const runUrl = `https://preprompt.dev/runs/${runId}`

    // Set outputs
    core.setOutput("run-id", runId)
    core.setOutput("run-url", runUrl)
    core.setOutput("status", failedAgents.length === 0 ? "pass" : "fail")
    core.setOutput("failed-count", String(failedAgents.length))

    // Post PR comment if in a PR context
    const ghToken = process.env.GITHUB_TOKEN
    if (ghToken && github.context.payload.pull_request) {
      const octokit = github.getOctokit(ghToken)
      const prNumber = github.context.payload.pull_request.number

      const lines = [
        `## PrePrompt Results`,
        "",
        `**${failedAgents.length === 0 ? "✓ All agents passed" : `✗ ${failedAgents.length} agent(s) failed`}**`,
        "",
        ...agentResults.map((e) => {
          const name = e.data.agent as string
          const status = e.event === "agent.error" ? "ERROR" : (e.data.status as string).toUpperCase()
          const dur = ((e.data.duration as number) / 1000).toFixed(1)
          return `- \`${name}\` ${dur}s — **${status}**`
        }),
        "",
        `[View full results](${runUrl})`,
      ]

      await octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: prNumber,
        body: lines.join("\n"),
      })

      core.info(`Posted results to PR #${prNumber}`)
    }

    // Fail the action if any agent failed
    if (failedAgents.length > 0) {
      core.setFailed(
        `${failedAgents.length} agent(s) failed. See ${runUrl}`
      )
    } else {
      core.info(`All agents passed. ${runUrl}`)
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}

run()

import React from "react"
import chalk from "chalk"
import { render } from "ink"
import App, { type AppState, type CompletedItem, type AgentState, type EvalState } from "./App.js"

export interface UIController {
  addCompleted(text: string, color?: string): void
  setActivity(text: string | null): void
  startAgent(name: string): void
  updateAgentStatus(name: string, status: string): void
  addAgentFile(name: string, file: string): void
  completeAgent(name: string, result: AgentState["result"]): void
  startEval(agent: string, evaluator: string): void
  completeEval(): void
  finish(): void
}

export function renderApp(): UIController {
  let state: AppState = {
    completed: [],
    agents: new Map(),
    eval: null,
    activity: null,
  }

  let keyCounter = 0

  const { rerender, unmount } = render(
    React.createElement(App, { state })
  )

  function update() {
    rerender(React.createElement(App, { state: { ...state, agents: new Map(state.agents) } }))
  }

  return {
    addCompleted(text: string, color?: string) {
      state.completed = [...state.completed, { key: String(keyCounter++), text, color }]
      update()
    },

    setActivity(text: string | null) {
      state.activity = text
      update()
    },

    startAgent(name: string) {
      state.agents.set(name, { name, status: "", files: [], done: false })
      update()
    },

    updateAgentStatus(name: string, status: string) {
      const agent = state.agents.get(name)
      if (agent && !agent.done) {
        agent.status = status
        update()
      }
    },

    addAgentFile(name: string, file: string) {
      const agent = state.agents.get(name)
      if (agent) {
        agent.files = [...agent.files, file]
        update()
      }
    },

    completeAgent(name: string, result: AgentState["result"]) {
      const agent = state.agents.get(name)
      if (!agent || !result) return

      // Format result as text lines for Static section (with color)
      const color = result.status === "pass" ? chalk.green
        : result.status === "timeout" ? chalk.yellow
        : chalk.red
      const icon = result.status === "pass" ? chalk.green("✓")
        : result.status === "timeout" ? chalk.yellow("~")
        : chalk.red("✗")
      const statusText = result.status === "pass" ? color("passed")
        : result.status === "timeout" ? color("timed out")
        : result.status === "no-changes" ? color("no changes")
        : color("failed")
      const dur = result.duration < 1000
        ? `${result.duration}ms`
        : `${(result.duration / 1000).toFixed(1)}s`
      const errorSuffix = result.error ? chalk.dim(`  ${result.error}`) : ""

      state.completed = [
        ...state.completed,
        { key: String(keyCounter++), text: `${icon} ${name}  ${statusText}  ${chalk.dim(dur)}  ${chalk.dim(result.fileCount + " files")}${errorSuffix}` },
        ...agent.files.map((f) => ({ key: String(keyCounter++), text: chalk.dim(`    + ${f}`) })),
      ]

      // Remove from dynamic section
      state.agents.delete(name)
      update()
    },

    startEval(agent: string, evaluator: string) {
      state.eval = { agent, evaluator, done: false }
      update()
    },

    completeEval() {
      state.eval = state.eval ? { ...state.eval, done: true } : null
      update()
    },

    finish() {
      // Small delay to let final render complete
      setTimeout(() => unmount(), 50)
    },
  }
}

import React from "react"
import chalk from "chalk"
import { render } from "ink"
import App, { type AppState, type CompletedItem, type AgentState, type EvalState, type HistoryEntry } from "./App.js"
import type { ActionType } from "../agents/types.js"

export interface UIController {
  addCompleted(text: string, color?: string): void
  startAgent(name: string): void
  updateAgentStatus(name: string, status: string): void
  addAgentHistory(name: string, type: ActionType, text: string): void
  completeAgent(name: string, result: AgentState["result"]): void
  startEval(agent: string): void
  updateEvalProgress(agent: string, checked: number, total: number, description: string): void
  completeEval(): void
  finish(): void
}

export function renderApp(): UIController {
  let state: AppState = {
    completed: [],
    agents: new Map(),
    eval: null,
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

    startAgent(name: string) {
      state.agents.set(name, { name, status: "", history: [], done: false })
      update()
    },

    updateAgentStatus(name: string, status: string) {
      const agent = state.agents.get(name)
      if (agent && !agent.done) {
        agent.status = status
        update()
      }
    },

    addAgentHistory(name: string, type: ActionType, text: string) {
      const agent = state.agents.get(name)
      if (!agent || agent.done) return
      const entry: HistoryEntry = { type, text }
      const last = agent.history[agent.history.length - 1]
      if (last && last.type === type && last.text === text) return
      if (agent.history.length >= 15) return
      agent.history = [...agent.history, entry]
      update()
    },

    completeAgent(name: string, result: AgentState["result"]) {
      const agent = state.agents.get(name)
      if (!agent || !result) return

      const color = result.status === "pass" ? chalk.green
        : result.status === "timeout" ? chalk.yellow
        : chalk.red
      const icon = result.status === "pass" ? chalk.green("●")
        : result.status === "timeout" ? chalk.yellow("●")
        : chalk.red("●")
      const statusText = result.status === "pass" ? color("passed")
        : result.status === "timeout" ? color("timed out")
        : result.status === "no-changes" ? color("no changes")
        : color("failed")
      const dur = result.duration < 1000
        ? `${result.duration}ms`
        : `${(result.duration / 1000).toFixed(1)}s`
      const errorSuffix = result.error ? chalk.dim(`  ${result.error}`) : ""
      const fileSuffix = result.fileSummary ? chalk.dim(`  ${result.fileSummary}`) : ""

      state.completed = [
        ...state.completed,
        { key: String(keyCounter++), text: `${icon} ${name}  ${statusText}  ${chalk.dim(dur)}${fileSuffix}${errorSuffix}` },
        ...agent.history.map((h) => {
          const verb = h.type === "command" ? "run"
            : h.type === "create" ? "create"
            : h.type === "edit" ? "edit"
            : "run"
          return { key: String(keyCounter++), text: `    ${chalk.bold.dim(verb)} ${chalk.dim(h.text)}` }
        }),
      ]

      state.agents.delete(name)
      update()
    },

    startEval(agent: string) {
      state.eval = { agent, checked: 0, total: 0, description: "", done: false }
      update()
    },

    updateEvalProgress(agent: string, checked: number, total: number, description: string) {
      state.eval = { agent, checked, total, description, done: false }
      update()
    },

    completeEval() {
      state.eval = state.eval ? { ...state.eval, done: true } : null
      update()
    },

    finish() {
      setTimeout(() => unmount(), 50)
    },
  }
}

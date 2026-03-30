import React from "react"
import chalk from "chalk"
import { render } from "ink"
import App, { type AppState, type CompletedItem, type AgentState, type HistoryEntry } from "./App.js"
import type { ActionType } from "../agents/types.js"

export interface UIController {
  addCompleted(text: string, color?: string): void
  addCompletedBatch(texts: string[]): void
  startAgent(name: string): void
  updateAgentStatus(name: string, status: string): void
  addAgentHistory(name: string, type: ActionType, text: string): void
  setAgentResult(name: string, result: AgentState["result"]): void
  setAgentChecking(name: string, index: number, total: number): void
  completeAgent(name: string): void
  finish(): void
}

export function renderApp(): UIController {
  let state: AppState = {
    completed: [],
    agents: new Map(),
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

    addCompletedBatch(texts: string[]) {
      state.completed = [
        ...state.completed,
        ...texts.map(text => ({ key: String(keyCounter++), text })),
      ]
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
      if (!agent) return
      const entry: HistoryEntry = { type, text }
      const last = agent.history[agent.history.length - 1]
      if (last && last.type === type && last.text === text) return
      if (agent.history.length >= 15) return
      agent.history = [...agent.history, entry]
      update()
    },

    setAgentResult(name: string, result: AgentState["result"]) {
      const agent = state.agents.get(name)
      if (!agent) return
      agent.result = result
      update()
    },

    setAgentChecking(name: string, index: number, total: number) {
      const agent = state.agents.get(name)
      if (!agent) return
      agent.checking = { index, total }
      update()
    },

    completeAgent(name: string) {
      const agent = state.agents.get(name)
      if (!agent) return
      const result = agent.result
      if (!result) return

      const dur = result.duration < 1000
        ? `${result.duration}ms`
        : `${(result.duration / 1000).toFixed(1)}s`
      const statusSuffix = result.status === "timeout" ? chalk.yellow("  timed out")
        : result.status === "no-changes" ? chalk.dim("  no changes")
        : result.status === "error" || result.status === "fail"
          ? chalk.red("  failed") + (result.error ? chalk.dim(`  ${result.error}`) : "")
        : ""

      state.completed = [
        ...state.completed,
        // Blank line between agent blocks
        ...(state.completed.length > 0 ? [{ key: String(keyCounter++), text: " " }] : []),
        { key: String(keyCounter++), text: `${chalk.bold(name)}  ${chalk.dim(dur)}${statusSuffix}` },
        ...agent.history.map((h) => {
          const prefix = h.type === "create" ? chalk.green("+")
            : h.type === "edit" ? chalk.yellow("~")
            : chalk.dim(">")
          return { key: String(keyCounter++), text: `    ${prefix} ${h.text}` }
        }),
      ]

      state.agents.delete(name)
      update()
    },

    finish() {
      setTimeout(() => unmount(), 50)
    },
  }
}

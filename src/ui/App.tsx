import { useState, useCallback } from "react"
import { Box, Text, Static } from "ink"
import AgentTask from "./AgentTask.js"
import Spinner from "./Spinner.js"
import type { ActionType } from "../agents/types.js"

export interface CompletedItem {
  key: string
  text: string
  color?: string
}

export interface HistoryEntry {
  type: ActionType
  text: string
}

export interface AgentState {
  name: string
  status: string
  history: HistoryEntry[]
  done: boolean
  result?: {
    status: "pass" | "fail" | "timeout" | "error" | "no-changes"
    duration: number
    fileSummary: string
    error?: string
  }
}

export interface EvalState {
  agent: string
  checked: number
  total: number
  description: string
  done: boolean
}

export interface AppState {
  completed: CompletedItem[]
  agents: Map<string, AgentState>
  eval: EvalState | null
}

interface AppProps {
  state: AppState
}

export default function App({ state }: AppProps) {
  const activeAgents = [...state.agents.values()]

  return (
    <Box flexDirection="column">
      <Static items={state.completed}>
        {(item) => (
          <Text key={item.key}>{item.text}</Text>
        )}
      </Static>

      {activeAgents.map((agent) => (
        <AgentTask
          key={agent.name}
          name={agent.name}
          status={agent.status}
          history={agent.history}
          done={false}
        />
      ))}

      {state.eval && !state.eval.done && (
        <Box>
          <Spinner />
          <Text> Evaluating {state.eval.agent}</Text>
          {state.eval.total > 0 && (
            <Text dimColor> [{state.eval.checked}/{state.eval.total}]</Text>
          )}
          {state.eval.description && (
            <Text dimColor>  {state.eval.description}</Text>
          )}
        </Box>
      )}
    </Box>
  )
}

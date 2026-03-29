import { useState, useCallback } from "react"
import { Box, Text, Static } from "ink"
import AgentTask from "./AgentTask.js"
import Spinner from "./Spinner.js"

export interface CompletedItem {
  key: string
  text: string
  color?: string
}

export interface AgentState {
  name: string
  status: string
  files: string[]
  done: boolean
  result?: {
    status: "pass" | "fail" | "timeout" | "error" | "no-changes"
    duration: number
    fileCount: number
    error?: string
  }
}

export interface EvalState {
  agent: string
  evaluator: string
  done: boolean
}

export interface AppState {
  completed: CompletedItem[]
  agents: Map<string, AgentState>
  eval: EvalState | null
  activity: string | null
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
          files={agent.files}
          done={false}
        />
      ))}

      {state.activity && (
        <Box>
          <Spinner />
          <Text dimColor> {state.activity}</Text>
        </Box>
      )}

      {state.eval && !state.eval.done && (
        <Box>
          <Spinner />
          <Text> Evaluating {state.eval.agent} with {state.eval.evaluator}...</Text>
        </Box>
      )}
    </Box>
  )
}

import { Box, Text, Static } from "ink"
import AgentTask from "./AgentTask.js"
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

export interface AppState {
  completed: CompletedItem[]
  agents: Map<string, AgentState>
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
          done={agent.done}
          result={agent.result}
        />
      ))}
    </Box>
  )
}

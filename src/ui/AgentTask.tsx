import { useState, useEffect } from "react"
import { Box, Text } from "ink"
import Spinner from "./Spinner.js"
import type { ActionType } from "../agents/types.js"

interface HistoryEntry {
  type: ActionType
  text: string
}

interface AgentTaskProps {
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

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function historyVerb(type: ActionType): string {
  switch (type) {
    case "command": return "run"
    case "create": return "create"
    case "edit": return "edit"
    default: return "run"
  }
}

export default function AgentTask({ name, status, history, done, result }: AgentTaskProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (done) return
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 100)
    return () => clearInterval(timer)
  }, [done])

  const past = history.slice(0, -1)
  const current = history.length > 0 ? history[history.length - 1] : null

  return (
    <Box flexDirection="column">
      <Box>
        <Spinner />
        <Text> {name}</Text>
        <Text dimColor>  ({formatDur(elapsed)})</Text>
      </Box>
      {past.map((h, i) => (
        <Text key={`h-${i}`}>    <Text color="green">●</Text> {historyVerb(h.type)} <Text dimColor>{h.text}</Text></Text>
      ))}
      {current && (
        <Box>
          <Text>    </Text>
          <Spinner />
          <Text> {historyVerb(current.type)} <Text dimColor>{current.text}</Text></Text>
        </Box>
      )}
    </Box>
  )
}

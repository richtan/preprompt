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

  return (
    <Box flexDirection="column">
      <Box>
        <Spinner />
        <Text> {name}</Text>
        {status && <Text dimColor>  {status}</Text>}
        <Text dimColor>  ({formatDur(elapsed)})</Text>
      </Box>
      {history.map((h, i) => (
        <Text key={`h-${i}`} dimColor>    <Text bold>{historyVerb(h.type)}</Text> {h.text}</Text>
      ))}
    </Box>
  )
}

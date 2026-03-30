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
  checking?: {
    index: number
    total: number
  }
}

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function historyPrefix(type: ActionType): { char: string; color: string } {
  switch (type) {
    case "create": return { char: "+", color: "green" }
    case "edit": return { char: "~", color: "yellow" }
    default: return { char: ">", color: "" }
  }
}

export default function AgentTask({ name, history, result, checking }: AgentTaskProps) {
  const past = checking ? history : history.slice(0, -1)
  const current = checking ? null : (history.length > 0 ? history[history.length - 1] : null)

  return (
    <Box flexDirection="column">
      <Box>
        <Spinner />
        <Text> {name}</Text>
        {result && <Text dimColor>  {formatDur(result.duration)}</Text>}
        {checking && (
          <Text dimColor>  checking [{checking.index}/{checking.total}]</Text>
        )}
      </Box>
      {past.map((h, i) => {
        const p = historyPrefix(h.type)
        return (
          <Text key={`h-${i}`}>    <Text color={p.color || undefined} dimColor={!p.color}>{p.char}</Text> <Text dimColor>{h.text}</Text></Text>
        )
      })}
      {current && (
        <Box>
          <Text>    </Text>
          <Spinner />
          <Text> <Text dimColor>{current.text}</Text></Text>
        </Box>
      )}
    </Box>
  )
}

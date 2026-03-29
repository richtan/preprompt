import { useState, useEffect } from "react"
import { Box, Text } from "ink"
import Spinner from "./Spinner.js"

interface AgentTaskProps {
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

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function AgentTask({ name, status, files, done, result }: AgentTaskProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (done) return
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 100)
    return () => clearInterval(timer)
  }, [done])

  if (done && result) {
    const icon = result.status === "pass" ? "✓" : result.status === "timeout" ? "~" : "✗"
    const color = result.status === "pass" ? "green" : result.status === "timeout" ? "yellow" : "red"
    const statusText = result.status === "pass" ? "passed"
      : result.status === "timeout" ? "timed out"
      : result.status === "no-changes" ? "no changes"
      : "failed"

    return (
      <Box flexDirection="column">
        <Text>
          <Text color={color}>{icon}</Text>
          {" "}{name}  {statusText}  {formatDur(result.duration)}  {result.fileCount} files
        </Text>
        {files.map((f, i) => (
          <Text key={i} dimColor>    + {f}</Text>
        ))}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Spinner />
        <Text> {name}</Text>
        {status && <Text dimColor>  {status}</Text>}
        <Text dimColor>  ({formatDur(elapsed)})</Text>
      </Box>
      {files.map((f, i) => (
        <Text key={i} dimColor>    + {f}</Text>
      ))}
    </Box>
  )
}

import { useState, useEffect } from "react"
import { Text } from "ink"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export default function Spinner() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return <Text dimColor>{FRAMES[frame]}</Text>
}

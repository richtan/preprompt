import { getApiUrl } from "./config.js"
import { getAuthHeaders } from "./auth.js"

interface CreateRunResponse {
  id: string
  status: string
  agents: string[]
  promptHash: string
  streamUrl: string
  error?: string
}

interface SSEEvent {
  event: string
  data: Record<string, unknown>
  id?: string
}

export async function createRun(
  prompt: string,
  agents?: string[]
): Promise<CreateRunResponse> {
  const apiUrl = await getApiUrl()
  const headers = await getAuthHeaders()

  const res = await fetch(`${apiUrl}/api/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ prompt, agents }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    const error = (body.error as string) ?? `HTTP ${res.status}`

    if (res.status === 401 && error === "login_required") {
      throw new Error("Free runs exceeded. Run `preprompt login` to continue.")
    }
    if (res.status === 413) {
      throw new Error("Prompt exceeds 500KB limit.")
    }
    if (res.status === 503) {
      throw new Error("PrePrompt cloud is temporarily unavailable. Try again in a minute.")
    }
    throw new Error(`Failed to create run: ${error}`)
  }

  return res.json() as Promise<CreateRunResponse>
}

export async function streamRun(
  runId: string,
  onEvent: (event: SSEEvent) => void,
  opts?: { lastEventId?: string }
): Promise<void> {
  const apiUrl = await getApiUrl()
  const headers = await getAuthHeaders()

  const res = await fetch(`${apiUrl}/api/runs/${runId}/stream`, {
    headers: {
      Accept: "text/event-stream",
      ...(opts?.lastEventId ? { "Last-Event-ID": opts.lastEventId } : {}),
      ...headers,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to connect to run stream: HTTP ${res.status}`)
  }

  if (!res.body) {
    throw new Error("No response body for SSE stream")
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent = ""
  let currentData = ""
  let currentId = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7)
      } else if (line.startsWith("data: ")) {
        currentData += (currentData ? "\n" : "") + line.slice(6)
      } else if (line.startsWith("id: ")) {
        currentId = line.slice(4)
      } else if (line === "") {
        // Empty line = end of event
        if (currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData) as Record<string, unknown>
            onEvent({ event: currentEvent, data, id: currentId || undefined })
          } catch {
            // Skip malformed events
          }
        }
        currentEvent = ""
        currentData = ""
        currentId = ""
      }
    }
  }
}

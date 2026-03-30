import type { AgentAdapter } from "./types.js"
import type { AgentInfo } from "../types.js"
import { claudeCode } from "./claude-code.js"
import { codex } from "./codex.js"
import { copilot } from "./copilot.js"
import { cursor } from "./cursor.js"
import { gemini } from "./gemini.js"
import { opencode } from "./opencode.js"

// Registry of all known adapters. Add new ones here.
const adapters: AgentAdapter[] = [claudeCode, codex, copilot, cursor, gemini, opencode]

export async function detectAgents(): Promise<AgentInfo[]> {
  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter.detect())
  )

  return results
    .filter(
      (r): r is PromiseFulfilledResult<AgentInfo> => r.status === "fulfilled"
    )
    .map((r) => r.value)
}

export function getAdapter(name: string): AgentAdapter | undefined {
  return adapters.find((a) => a.name === name)
}

export function getInstalledAdapters(agents: AgentInfo[]): AgentAdapter[] {
  return agents
    .filter((a) => a.installed)
    .map((a) => getAdapter(a.name))
    .filter((a): a is AgentAdapter => a !== undefined)
}

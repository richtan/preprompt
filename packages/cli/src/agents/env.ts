import { join } from "node:path"

const AGENT_SECRETS: Record<string, string[]> = {
  "claude-code": ["ANTHROPIC_API_KEY"],
  "codex": ["OPENAI_API_KEY"],
  "copilot-cli": ["GITHUB_TOKEN", "GH_TOKEN"],
  "cursor": [],
  "gemini": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  "opencode": ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
}

const ALL_SECRETS = [...new Set(Object.values(AGENT_SECRETS).flat())]

export function buildAgentEnv(agentName: string): Record<string, string> {
  const owned = new Set(AGENT_SECRETS[agentName] ?? [])
  const toStrip = ALL_SECRETS.filter((k) => !owned.has(k))
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of toStrip) delete env[key]
  return env as Record<string, string>
}

export function buildCheckEnv(sandboxDir: string): Record<string, string> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of ALL_SECRETS) delete env[key]
  env.PATH = `${join(sandboxDir, "node_modules", ".bin")}:${env.PATH}`
  return env as Record<string, string>
}

export { ALL_SECRETS, AGENT_SECRETS }

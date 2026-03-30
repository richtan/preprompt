// Agent configuration — no E2B dependency, safe to import anywhere

// Agent name → E2B template ID (pre-built with agent installed)
export const AGENT_TEMPLATES: Record<string, string> = {
  "claude-code": "preprompt-claude-code",
  "codex": "preprompt-codex",
  "copilot-cli": "base",
  "cursor": "base",
  "gemini": "base",
  "opencode": "base",
}

// Agent name → install commands (only needed for agents without pre-built templates)
export const AGENT_SETUP: Record<string, string[]> = {
  "copilot-cli": ["curl -fsSL https://copilot.github.com/install | bash"],
  "cursor": ["curl https://cursor.com/install -fsS | bash"],
  "gemini": ["npm install -g @google/gemini-cli"],
  "opencode": ["curl -fsSL https://opencode.ai/install | bash"],
}

// Agent name → the command to execute the agent with a prompt
// Note: commands run in /workspace with ANTHROPIC_API_KEY and OPENAI_API_KEY set
export const AGENT_EXEC: Record<string, (promptPath: string) => string> = {
  "claude-code": (p) => `cat ${p} | claude --print --dangerously-skip-permissions --output-format text`,
  "codex": (p) => `codex exec --full-auto --skip-git-repo-check "$(cat ${p})"`,
  "copilot-cli": (p) => `copilot --autopilot --allow-all --output-format json -p "$(cat ${p})"`,
  "cursor": (p) => `agent --print --force --trust "$(cat ${p})"`,
  "gemini": (p) => `cat ${p} | gemini -y -o text -p ""`,
  "opencode": (p) => `cat ${p} | opencode run --format default`,
}

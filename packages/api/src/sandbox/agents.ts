// Agent configuration — no E2B dependency, safe to import anywhere

// Agent name → E2B template ID (pre-built with agent installed)
export const AGENT_TEMPLATES: Record<string, string> = {
  "claude-code": "preprompt-claude-code",
  "codex": "preprompt-codex",
  "aider": "preprompt-aider",
  "copilot": "base", // No pre-built template yet
}

// Agent name → install commands (only needed for agents without pre-built templates)
export const AGENT_SETUP: Record<string, string[]> = {
  "copilot": ["npm install -g @githubnext/github-copilot-cli"],
}

// Agent name → the command to execute the agent with a prompt
// Note: commands run in /workspace with ANTHROPIC_API_KEY and OPENAI_API_KEY set
export const AGENT_EXEC: Record<string, (promptPath: string) => string> = {
  "claude-code": (p) => `cat ${p} | claude --print --dangerously-skip-permissions --output-format text`,
  "codex": (p) => `codex exec --full-auto --skip-git-repo-check "$(cat ${p})"`,
  "aider": (p) => `aider --yes-always --no-git --model claude-3-5-sonnet --message "$(cat ${p})"`,
  "copilot": (p) => `gh copilot suggest -t shell "$(cat ${p})"`,
}

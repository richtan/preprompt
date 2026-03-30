// Agent configuration — no E2B dependency, safe to import anywhere

// Agent name → E2B template ID
export const AGENT_TEMPLATES: Record<string, string> = {
  "claude-code": "base", // TODO: replace with preprompt-claude template
  "codex": "base",       // TODO: replace with preprompt-codex template
  "aider": "base",       // TODO: replace with preprompt-aider template
  "copilot": "base",     // TODO: replace with preprompt-copilot template
}

// Agent name → install commands to run after sandbox boots
export const AGENT_SETUP: Record<string, string[]> = {
  "claude-code": ["npm install -g @anthropic-ai/claude-code"],
  "codex": ["npm install -g @openai/codex"],
  "aider": ["pip install aider-chat"],
  "copilot": ["npm install -g @githubnext/github-copilot-cli"],
}

// Agent name → the command to execute the agent with a prompt
export const AGENT_EXEC: Record<string, (promptPath: string) => string> = {
  "claude-code": (p) => `claude --print --dangerously-skip-permissions --output-format stream-json < ${p}`,
  "codex": (p) => `codex exec --full-auto --skip-git-repo-check "$(cat ${p})"`,
  "aider": (p) => `aider --yes-always --no-git --model claude-3-5-sonnet --message "$(cat ${p})"`,
  "copilot": (p) => `gh copilot suggest -t shell "$(cat ${p})"`,
}

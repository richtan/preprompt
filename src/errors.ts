const ERROR_HINTS: { pattern: RegExp; hint: string }[] = [
  {
    pattern: /not inside a trusted directory/i,
    hint: "run from inside a git repo, or pass --skip-git-repo-check to codex",
  },
  {
    pattern: /ENOENT.*claude/i,
    hint: "install claude code: npm i -g @anthropic-ai/claude-code",
  },
  {
    pattern: /authentication|unauthorized|not authenticated/i,
    hint: "authenticate first: run the agent's login command",
  },
  {
    pattern: /ETIMEDOUT|timed out/i,
    hint: "increase timeout: preprompt CLAUDE.md --timeout 180000",
  },
  {
    pattern: /rate limit|429/i,
    hint: "rate limited by the AI provider, try again in a moment",
  },
  {
    pattern: /EACCES|permission denied/i,
    hint: "permission denied, check file/directory permissions",
  },
  {
    pattern: /ENOSPC|no space/i,
    hint: "disk full, free up space and try again",
  },
]

export function getErrorHint(stderr: string): string | null {
  for (const { pattern, hint } of ERROR_HINTS) {
    if (pattern.test(stderr)) return hint
  }
  return null
}

export function extractErrorSummary(stderr: string): string | null {
  if (!stderr.trim()) return null
  // Take the first non-empty, non-noise line as the summary
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    // Skip noise lines (debug output, stack traces, etc.)
    if (line.startsWith("at ") || line.startsWith("node:") || line.startsWith("Error:")) continue
    if (line.length > 5 && line.length < 200) return line
  }
  return lines[0]?.slice(0, 120) ?? null
}

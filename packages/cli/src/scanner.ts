// Prompt safety scanner — warns on destructive patterns before execution

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\brm\s+-rf\b/i, description: "rm -rf (recursive delete)" },
  { pattern: /\brm\s+-r\b/i, description: "rm -r (recursive delete)" },
  { pattern: /\bDROP\s+TABLE\b/i, description: "DROP TABLE (database)" },
  { pattern: /\bDROP\s+DATABASE\b/i, description: "DROP DATABASE" },
  { pattern: /\btruncate\b/i, description: "TRUNCATE (database)" },
  { pattern: /\bformat\s+[a-z]:/i, description: "format drive" },
  { pattern: /\bdd\s+if=/i, description: "dd (disk write)" },
  { pattern: /\bmkfs\b/i, description: "mkfs (format filesystem)" },
  { pattern: /\bgit\s+push\s+--force\b/i, description: "git push --force" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, description: "git reset --hard" },
]

export interface ScanResult {
  safe: boolean
  warnings: string[]
}

export function scanPrompt(content: string): ScanResult {
  const warnings: string[] = []

  for (const { pattern, description } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(description)
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
  }
}

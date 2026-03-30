import chalk from "chalk"
import { renderError } from "../output/terminal.js"

interface AgentProfile {
  name: string
  fullName: string
  description: string
  strengths: string[]
  weaknesses: string[]
  quirks: string[]
  invocation: string
  nonInteractive: string
}

const profiles: AgentProfile[] = [
  {
    name: "claude-code",
    fullName: "Claude Code (Anthropic)",
    description:
      "Anthropic's CLI coding agent. Reads prompts, creates files, runs commands. Strong at multi-step setup tasks.",
    strengths: [
      "Excellent at following multi-step instructions",
      "Creates clean file structures",
      "Respects .gitignore conventions",
      "Good at inferring missing details",
    ],
    weaknesses: [
      "Requires --dangerously-skip-permissions for non-interactive use",
      "Can be slow on complex prompts (30-60s)",
      "Sometimes overwrites existing files without checking",
    ],
    quirks: [
      "Defaults to npm when multiple package managers are available",
      "Prefers App Router (src/app/) for Next.js projects",
      "Creates .env.example files proactively",
    ],
    invocation: "claude --print -p <prompt>",
    nonInteractive: "claude --print --dangerously-skip-permissions -p <prompt>",
  },
  {
    name: "codex",
    fullName: "Codex CLI (OpenAI)",
    description:
      "OpenAI's CLI coding agent. Executes tasks via codex exec. Capable but requires correct flags.",
    strengths: [
      "Fast execution for simple tasks",
      "Good at code generation",
      "Supports --full-auto for unattended operation",
    ],
    weaknesses: [
      "Sensitive to invocation flags (wrong flags = silent failure)",
      "Less reliable at multi-file project setup",
      "May not create all expected files",
    ],
    quirks: [
      "Requires --full-auto for non-interactive use",
      "Uses codex exec for task execution",
      "May default to yarn if both npm and yarn are installed",
    ],
    invocation: "codex exec <prompt>",
    nonInteractive: "codex exec <prompt> --full-auto",
  },
  {
    name: "copilot-cli",
    fullName: "GitHub Copilot CLI",
    description:
      "GitHub's standalone coding agent. Full autopilot mode with file creation, editing, and shell commands.",
    strengths: [
      "Integrated with GitHub ecosystem and MCP servers",
      "Full coding agent with file and shell tools",
      "Structured JSONL output format",
    ],
    weaknesses: [
      "Requires GitHub Copilot subscription",
      "Output schema is undocumented and evolving",
      "Can be slow on complex multi-step tasks",
    ],
    quirks: [
      "Standalone copilot binary, not gh extension",
      "Uses --autopilot for non-interactive mode",
      "Emits report_intent events before starting work",
    ],
    invocation: "copilot -p <prompt>",
    nonInteractive: "copilot --autopilot --allow-all -p <prompt>",
  },
  {
    name: "cursor",
    fullName: "Cursor Agent (Cursor)",
    description:
      "Cursor's standalone CLI agent. Full coding agent with file editing, shell commands, and MCP support.",
    strengths: [
      "Fast execution with streaming output",
      "Good at multi-file project creation",
      "Same tool interface as Claude Code",
      "Supports MCP servers for extensibility",
    ],
    weaknesses: [
      "Requires Cursor subscription",
      "Agent binary installed separately from the IDE",
      "No stdin support for large prompts in print mode",
    ],
    quirks: [
      "Same tool names as Claude Code (Write, Edit, Bash)",
      "Uses --force to auto-approve file changes",
      "Prompt passed as positional arg, not -p flag",
    ],
    invocation: "agent --print <prompt>",
    nonInteractive: "agent --print --force --trust <prompt>",
  },
  {
    name: "gemini",
    fullName: "Gemini CLI (Google)",
    description:
      "Google's open-source CLI coding agent. Uses Gemini models with a generous free tier.",
    strengths: [
      "Free tier: 60 req/min, 1000 req/day",
      "Open source (Apache 2.0)",
      "Parallel tool execution",
      "Google Search grounding for web queries",
    ],
    weaknesses: [
      "Requires GEMINI_API_KEY or Google OAuth setup",
      "Newer tool with evolving output format",
      "No dedicated edit tool (uses replace)",
    ],
    quirks: [
      "Uses replace instead of edit for file modifications",
      "-p flag must come after all other flags",
      "Stdin content is appended to -p prompt text",
    ],
    invocation: "gemini -p <prompt>",
    nonInteractive: "gemini -y -p <prompt>",
  },
  {
    name: "opencode",
    fullName: "OpenCode (Anomaly)",
    description:
      "Open-source terminal coding agent. Supports multiple AI providers and a headless server mode.",
    strengths: [
      "Provider-agnostic (works with any LLM provider)",
      "Server mode avoids cold start on repeated runs",
      "Rich tool set including LSP integration",
      "Session export and import for collaboration",
    ],
    weaknesses: [
      "Newer project, smaller community",
      "JSON output can have edge cases with --command flag",
      "No built-in sandbox mode",
    ],
    quirks: [
      "Uses opencode run for headless execution",
      "Supports attach to a running server for faster starts",
      "Tool events arrive pre-completed (status: completed)",
    ],
    invocation: "opencode run <prompt>",
    nonInteractive: "opencode run <prompt> --format json",
  },
]

export function runExplain(agentName?: string): void {
  if (!agentName) {
    const maxName = Math.max(...profiles.map((p) => p.name.length))
    for (const p of profiles) {
      console.log(`${p.name.padEnd(maxName + 2)}  ${chalk.dim(p.fullName)}`)
    }
    return
  }

  const profile = profiles.find(
    (p) => p.name === agentName || p.fullName.toLowerCase().includes(agentName.toLowerCase())
  )

  if (!profile) {
    renderError(
      `Unknown agent: ${agentName}\n` +
        `  Available: ${profiles.map((p) => p.name).join(", ")}`
    )
    process.exitCode = 1
    return
  }

  console.log(profile.fullName)
  console.log(chalk.dim(profile.description))
  console.log()

  console.log("Strengths:")
  for (const s of profile.strengths) console.log(`  + ${s}`)
  console.log()

  console.log("Weaknesses:")
  for (const w of profile.weaknesses) console.log(`  - ${w}`)
  console.log()

  console.log("Quirks:")
  for (const q of profile.quirks) console.log(`  ~ ${q}`)
  console.log()

  console.log(chalk.dim(`Invocation: ${profile.invocation}`))
  console.log(chalk.dim(`Non-interactive: ${profile.nonInteractive}`))
}

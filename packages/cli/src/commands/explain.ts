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
    name: "aider",
    fullName: "Aider (Open Source)",
    description:
      "Open source AI pair programmer. Works with any LLM. Best for code editing in existing repos.",
    strengths: [
      "Works with any LLM provider (OpenAI, Anthropic, local)",
      "Excellent git integration",
      "Good at editing existing files",
      "Lightweight and fast to start",
    ],
    weaknesses: [
      "Designed for editing, not project setup from scratch",
      "Requires a git repo to work properly",
      "May struggle with from-scratch file creation",
    ],
    quirks: [
      "Prefers to edit existing files over creating new ones",
      "Uses --yes-always for non-interactive mode",
      "Needs --no-git flag when running outside a real repo",
      "May use pages/ directory for Next.js (Pages Router)",
    ],
    invocation: "aider --message <prompt>",
    nonInteractive: "aider --yes-always --no-git --message <prompt>",
  },
  {
    name: "copilot-cli",
    fullName: "GitHub Copilot CLI",
    description:
      "GitHub's AI CLI assistant. Primarily suggests shell commands rather than creating files directly.",
    strengths: [
      "Integrated with GitHub ecosystem",
      "Good at suggesting shell commands",
      "Understands git workflows well",
    ],
    weaknesses: [
      "Suggests commands rather than executing them",
      "Not designed for multi-file project creation",
      "Limited to shell command suggestions",
    ],
    quirks: [
      "Invoked via gh copilot suggest",
      "Returns command suggestions, not execution",
      "Best for single-command tasks",
    ],
    invocation: "gh copilot suggest <prompt>",
    nonInteractive: "gh copilot suggest -t shell <prompt>",
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

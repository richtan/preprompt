# PrePrompt

Test any prompt on every AI tool. One command, every agent, see what happened.

```bash
preprompt CLAUDE.md
```

PrePrompt runs your AI instructions through coding agents (Claude Code, Codex, Aider, etc.) in clean sandboxes and shows you exactly what each agent did, files created, commands run, pass or fail.

## Install

```bash
npm install -g preprompt
```

Or run without installing:

```bash
npx preprompt CLAUDE.md
```

## Usage

```bash
# Test a prompt file
preprompt CLAUDE.md

# Test an inline prompt
preprompt "Create a Next.js app with TypeScript and Tailwind"

# Test with specific agents
preprompt CLAUDE.md --agents claude-code,codex

# See which agents are available
preprompt list

# CI mode: assert files exist, exit code 1 on failure
preprompt CLAUDE.md --check "file-exists:package.json" --check "dir-exists:src" --quiet

# JSON output
preprompt CLAUDE.md --json
```

## Output

Single agent:
```
  ✓ claude-code — pass in 34.2s

  5 files created:
    + package.json
    + .gitignore
    + .env.example
    + src/app.tsx
    + src/index.ts

  5 changes · exit code 0 · 34.2s
```

Multiple agents (parallel, with live streaming):
```
  PrePrompt — running on 3 agents

  claude-code  │ ⚡ npm install
  codex        │ ⚡ yarn add react next
  aider        │ ⚡ npm install

  claude-code  │ 📄 Created src/app/page.tsx
  codex        │ 📄 Created src/app/page.tsx
  aider        │ 📄 Created pages/index.tsx      ← divergence!

  claude-code  │ ✓ Done (34s, 7 files)
  codex        │ ✗ Done (41s, 6 files)
  aider        │ ✓ Done (28s, 7 files)
```

## Commands

| Command | What it does |
|---------|-------------|
| `preprompt <prompt>` | Run a prompt on all detected agents |
| `preprompt list` | Show detected agents and their status |
| `preprompt diff` | Compare filesystem results across agents |
| `preprompt trace` | Replay an agent's execution step by step |
| `preprompt doctor` | Diagnose why an agent failed (AI-powered) |
| `preprompt fix` | Suggest prompt rewrites to fix failures |
| `preprompt compare` | Before/after comparison of two runs |
| `preprompt badge` | Generate an SVG compatibility badge |
| `preprompt explain` | Show agent strengths, weaknesses, quirks |
| `preprompt history` | Browse past runs |
| `preprompt completions` | Generate zsh completions |

## Agents

| Agent | Status |
|-------|--------|
| Claude Code | Supported |
| Codex | Supported |
| Aider | Supported |
| GitHub Copilot CLI | Supported |

## How it works

1. Detects which AI agents are installed on your machine
2. Analyzes your prompt to identify tools and potential failure modes
3. Creates a clean temp directory per agent (sandbox)
4. Runs all agents in parallel with your prompt
5. Captures filesystem snapshots before and after
6. Streams results in real time with divergence highlighting
7. Shows exactly what each agent did differently

## License

MIT

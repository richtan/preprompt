# PromptStack

Test any prompt on every AI tool. One command, every agent, see what happened.

```bash
pstack CLAUDE.md
```

PromptStack runs your AI instructions through coding agents (Claude Code, Codex, Aider, etc.) in clean sandboxes and shows you exactly what each agent did, files created, commands run, pass or fail.

## Install

```bash
npm install -g @promptstack/cli
```

Or run without installing:

```bash
npx @promptstack/cli CLAUDE.md
```

## Usage

```bash
# Test a prompt file
pstack CLAUDE.md

# Test an inline prompt
pstack "Create a Next.js app with TypeScript and Tailwind"

# Test with specific agents
pstack CLAUDE.md --agents claude-code,codex

# See which agents are available
pstack list

# CI mode: assert files exist, exit code 1 on failure
pstack CLAUDE.md --check "file-exists:package.json" --check "dir-exists:src" --quiet

# JSON output
pstack CLAUDE.md --json
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
  PromptStack — running on 3 agents

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
| `pstack <prompt>` | Run a prompt on all detected agents |
| `pstack list` | Show detected agents and their status |
| `pstack diff` | Compare filesystem results across agents |
| `pstack trace` | Replay an agent's execution step by step |
| `pstack doctor` | Diagnose why an agent failed (AI-powered) |
| `pstack fix` | Suggest prompt rewrites to fix failures |
| `pstack compare` | Before/after comparison of two runs |
| `pstack badge` | Generate an SVG compatibility badge |
| `pstack explain` | Show agent strengths, weaknesses, quirks |
| `pstack history` | Browse past runs |
| `pstack completions` | Generate zsh completions |

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

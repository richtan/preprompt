# PromptStack

Test any prompt on every AI tool. One command, every agent, see what happened.

```bash
pstack ./CLAUDE.md
```

PromptStack runs your AI instructions through coding agents (Claude Code, Codex, Aider, etc.) in clean sandboxes and shows you exactly what each agent did — files created, commands run, pass or fail.

## Why

You write a CLAUDE.md, a setup guide, or any AI instruction. You need to know: does it actually work? PromptStack runs it in a fresh temp directory and shows you the result. No guessing.

## Install

```bash
npm install -g @promptstack/cli
```

Or run without installing:

```bash
npx @promptstack/cli ./CLAUDE.md
```

## Usage

```bash
# Test a prompt file
pstack ./CLAUDE.md

# Test an inline prompt
pstack "Create a Next.js app with TypeScript and Tailwind"

# See which agents are available
pstack list

# JSON output for CI
pstack ./CLAUDE.md --json

# Custom timeout (default 120s)
pstack ./CLAUDE.md --timeout 180000
```

## Output

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

## How it works

1. Detects which AI agents are installed on your machine
2. Creates a clean temp directory (sandbox)
3. Runs your prompt through the agent in that sandbox
4. Captures a filesystem snapshot before and after
5. Shows you exactly what changed

## Agents supported

| Agent | Detection |
|-------|-----------|
| Claude Code | `claude` CLI |

More agents (Codex, Aider, GitHub Copilot CLI) coming in Phase 2.

## License

MIT

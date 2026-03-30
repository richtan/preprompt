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

```
Detected 2 agents (claude-code, codex)
Detected 5 tools (env, git, node, npm, typescript)

  Project setup (1)
    - package.json exists

  Dependencies (6)
    - express is installed
    - dotenv is installed
    - typescript is installed as dev dependency

Generated 24 criteria

claude-code  52.4s
    + .env
    + .gitignore
    + health.ts
    + index.ts
    ~ tsconfig.json
    ~ package.json
    > npm init -y
    > npm install express dotenv
    > npm run build

codex  118.6s
    + .env
    ~ tsconfig.json
    > npm init -y
    > npm install express dotenv
    > npx tsc --init
    > npm run build

claude-code  0 failed
codex        1 failed
    - Server starts and GET /health returns { status: 'ok' }
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
2. Analyzes your prompt to generate verifiable success criteria
3. Lets you review and approve criteria before running
4. Creates a clean temp directory per agent (sandbox)
5. Runs all agents in parallel with your prompt
6. Evaluates each agent's sandbox against the criteria immediately after completion
7. Shows what each agent did and what failed

## License

MIT

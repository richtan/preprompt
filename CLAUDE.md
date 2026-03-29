# PrePrompt

CLI tool for testing AI prompts across coding agents. TypeScript, Commander.js, vitest.

## Project structure

```
src/
  index.ts                CLI entrypoint (Commander.js, 11 commands)
  types.ts                Shared types (RunResult, Snapshot, EvalResult, etc.)
  scanner.ts              Prompt safety scanner (destructive pattern detection)
  storage.ts              Result persistence (.preprompt/runs/)
  matrix.ts               Smart matrix: regex-based tool detection from tools/db.json
  trace.ts                Execution trace builder and renderer
  evaluate.ts             AI behavioral evaluation (cross-agent scoring)
  errors.ts               Error hint system (pattern matching agent failures)
  completions.ts          Zsh completion generator
  commands/
    local.ts              Core: run prompt, evaluate behavior, render via Ink
    doctor.ts             Diagnose failures using AI agent analysis
    fix.ts                Auto-suggest prompt rewrites for failures
    compare.ts            Before/after comparison of two runs
    badge.ts              SVG badge generator from run results
    explain.ts            Agent behavior profiles (strengths, weaknesses, quirks)
  agents/
    types.ts              AgentAdapter interface
    detector.ts           Auto-detect installed agents
    claude-code.ts        Claude Code adapter
    codex.ts              Codex adapter
    aider.ts              Aider adapter
    copilot.ts            GitHub Copilot CLI adapter
  sandbox/
    manager.ts            Temp directory lifecycle (create/destroy)
    snapshot.ts           Filesystem before/after snapshots + diff
  ui/
    App.tsx               Main Ink React component (Static + dynamic sections)
    AgentTask.tsx          Agent task display (spinner, status, files)
    Spinner.tsx            Braille spinner component
    render.ts             Ink render entry point + UIController API
  output/
    terminal.ts           chalk-based rendering for non-Ink commands (diff, trace, etc.)
tools/
  db.json                 Tool database (18 tools with failure trees)
```

## Commands

```bash
npm run build           # Build with tsup
npm run test            # Run tests with vitest
npm run dev             # Watch mode build
```

## Testing

```bash
npx vitest run
```

35 tests across 5 test files. Mock agent at `test/mock-agent.sh` for CI testing without real AI agents.

## Architecture

- 4 agent adapters (claude-code, codex, aider, copilot-cli)
- Parallel execution via Promise.allSettled
- Sandbox uses Node built-in `fs.mkdtemp()`, no tmp-promise
- Prompt >100KB piped via stdin to avoid shell arg limits
- Results stored in `.preprompt/runs/<timestamp>/result.json`
- Smart matrix uses regex tool detection, no LLM dependency
- AI behavioral evaluation: cross-agent scoring (executor != evaluator)
- Ink (React for terminal) powers the live UI with Static + dynamic sections
- Filesystem polling shows new files during execution (no stdout parsing)
- Doctor/fix commands use a detected local agent for AI analysis

## Design

DESIGN.md documents the CLI output philosophy (uv-style, no emojis, column 0 status lines, etc.). Keep it up to date when output behavior changes. If you change how something renders, update DESIGN.md in the same change.

## Keeping docs current

When making changes, update CLAUDE.md, DESIGN.md, and README.md where relevant. If the project structure changes, update the project structure section. If commands change, update the commands section. If architecture changes, update the architecture section. Don't let docs drift from reality.

## Publishing

Push normally. Only patch and publish when the user asks:
```bash
npm version patch && git push && git push --tags
```
GitHub Actions publishes to npm automatically on tag push.

## Package

- npm: `preprompt`
- Binary: `preprompt`
- Website: preprompt.dev

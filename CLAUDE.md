# PrePrompt

CLI tool for testing AI prompts across coding agents. TypeScript, Commander.js, vitest.

## Project structure

```
src/
  index.ts                CLI entrypoint (Commander.js, 11 commands)
  types.ts                Shared types (RunResult, Snapshot, MultiRunResult)
  scanner.ts              Prompt safety scanner (destructive pattern detection)
  storage.ts              Result persistence (.preprompt/runs/)
  matrix.ts               Smart matrix: regex-based tool detection from tools/db.json
  trace.ts                Execution trace builder and renderer
  checks.ts               Assertion engine (file-exists, dir-exists, exit-ok, etc.)
  completions.ts          Zsh completion generator
  commands/
    local.ts              Core: run prompt through local agents in parallel
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
  output/
    terminal.ts           chalk-based terminal rendering (single + multi-agent)
    stream.ts             Live streaming with divergence highlighting
    json.ts               JSON output
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

52 tests across 6 test files. Mock agent at `test/mock-agent.sh` for CI testing without real AI agents.

## Architecture

- 4 agent adapters (claude-code, codex, aider, copilot-cli)
- Parallel execution via Promise.allSettled
- Sandbox uses Node built-in `fs.mkdtemp()`, no tmp-promise
- Prompt >100KB piped via stdin to avoid shell arg limits
- Results stored in `.preprompt/runs/<timestamp>/result.json`
- Smart matrix uses regex tool detection, no LLM dependency
- Doctor/fix commands use a detected local agent for AI analysis

## Publishing

When pushing to main, always patch and publish:
```bash
npm version patch && git push && git push --tags
```
GitHub Actions publishes to npm automatically on tag push. Never push without patching.

## Package

- npm: `preprompt`
- Binary: `preprompt`
- Website: preprompt.dev

# PromptStack

CLI tool for testing AI prompts across coding agents. TypeScript, Commander.js, vitest.

## Project structure

```
src/
  index.ts              CLI entrypoint (Commander.js)
  types.ts              Shared types (RunResult, Snapshot, etc.)
  scanner.ts            Prompt safety scanner (destructive pattern detection)
  storage.ts            Result persistence (.pstack/runs/)
  commands/local.ts     Core command: run prompt through a local agent
  agents/types.ts       AgentAdapter interface
  agents/detector.ts    Auto-detect installed agents
  agents/claude-code.ts Claude Code adapter
  sandbox/manager.ts    Temp directory lifecycle
  sandbox/snapshot.ts   Filesystem before/after snapshots + diff
  output/terminal.ts    chalk-based terminal rendering
  output/json.ts        JSON output for --json flag
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

Tests use vitest. Mock agent at `test/mock-agent.sh` creates predictable files for CI testing without real AI agents.

## Architecture decisions

- Single agent adapter for Phase 1 (claude-code only). Multi-agent in Phase 2.
- Sandbox uses Node built-in `fs.mkdtemp()`, no tmp-promise dependency.
- Agent auth assumed from `which claude` succeeding. Auth failures surface at execution time.
- Prompt >100KB piped via stdin to avoid shell arg limits.
- Results stored in `.pstack/runs/<timestamp>/result.json`.

## Package

- npm: `@promptstack/cli`
- Binary: `pstack`
- Domain: promptstack.cc

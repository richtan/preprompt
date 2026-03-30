# Design System

PrePrompt's CLI output follows the style of [uv by Astral](https://github.com/astral-sh/uv). Clean, terse, no decoration. The verb does the work, not the icon.

## Reference

uv is the gold standard. When in doubt about how output should look, check what uv would do.

## Rules

**Column 0.** Status lines start at column 0. Never indent status output.

**Verb headers.** Green colored verb at the start of phase lines: `Detected`, `Generated`. These replace icons as section markers.

**No decoration.** No borders. No boxes. No ASCII art. No dots. No icons. Plain text with padded columns when alignment is needed.

**Typed prefixes.** Agent history uses meaningful prefixes: `+` (green) for create, `~` (yellow) for edit, `>` (dim) for run. These carry information — you scan and see 4 files created, 2 edited, 3 commands run.

**Timing.** Dim, after agent name: `claude-code  52.4s`. No parentheses.

**4-space indent** for list items (history, criteria, failures). Never indent status lines.

**Errors.** `error: message` in red at column 0. Multi-line errors: first line gets prefix, rest at 2-space indent.

**Warnings.** `warning: message` in yellow at column 0.

**No headers.** Don't print `PrePrompt ---` or decorated banners. Start with the action. No "Results" header — the score lines ARE the results.

**Silence is fine.** If there's nothing to say, say nothing. No filler.

**Command history.** Each agent shows a growing list of actions with typed prefixes. History persists in completed output. Consecutive duplicates are deduplicated. Capped at 15 visible entries. Read-like commands (sed, cat, ls) are filtered for codex.

**Criteria display.** Grouped under bold headers with counts. Dim dashes for list items, normal brightness descriptions. Summary line: `Generated 24 criteria`.

**Eval progress.** During evaluation, checking progress shows on the agent header line: `⠋ claude-code  52.4s  checking [3/25]`. No separate spinner, no history entries for checks.

**Score section.** Just `N failed`. Green `0 failed` for clean, red `N failed` for failures. No percentages, no scores. Failure details listed with red `-` prefix underneath.

**Agent completion.** Static output shows bold name + dim duration. No "done", no dot prefix. Just `claude-code  52.4s`.

**Blank lines.** Between agent blocks in static output. Between phases (criteria → agents → scores). No horizontal rules.

## Dim text hierarchy

- **Dim:** timing, prefixes (> for run, - for criteria dashes), error notes, supplementary info in parentheses
- **Normal:** content (file names, commands, criteria descriptions, failure descriptions)
- **Bold:** agent names, criteria group headers
- **Green:** verbs (Detected, Generated), + prefix (create), 0 failed
- **Yellow:** ~ prefix (edit)
- **Red:** - prefix (failure), N failed, error messages

## Examples

Single agent:
```
Detected 1 agent (claude-code)
Detected 5 tools (npm, git, typescript, env, node)

  Project setup (1)
    - package.json exists

  Dependencies (6)
    - express is installed
    - dotenv is installed
    - typescript is installed as dev dependency

  Configuration (7)
    - tsconfig.json exists
    - .env file exists
    - .env contains PORT=3000

Generated 24 criteria

claude-code  34.2s
    + .env
    + .gitignore
    + health.ts
    + index.ts
    ~ tsconfig.json
    ~ package.json
    > npm init -y
    > npm install express dotenv
    > npm run build

claude-code  0 failed
```

Multi-agent:
```
Detected 2 agents (claude-code, codex)
Detected 5 tools (npm, git, typescript, env, node)

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

claude-code  1 failed
    - Server starts and GET /health returns { status: 'ok' }
codex        1 failed
    - Server starts and GET /health returns { status: 'ok' }
```

Error:
```
error: No agents found. Install one:
  npm install -g @anthropic-ai/claude-code
  npm install -g @openai/codex
```

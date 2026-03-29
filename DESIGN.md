# Design System

PrePrompt's CLI output follows the style of [uv by Astral](https://github.com/astral-sh/uv). Clean, terse, no decoration.

## Reference

uv is the gold standard. When in doubt about how output should look, check what uv would do.

## Rules

**Column 0.** Status lines start at column 0. Never indent status output.

**Action keywords.** Green colored verb at the start of status lines: `Analyzed`, `Running`, `Passed`, `Failed`, `Comparing`, `Checking`, `Saved`, `Diagnosing`, `Generating`, `Applied`.

**No decoration.** No borders. No boxes. No ASCII art. Plain text with padded columns when alignment is needed. Comparison tables are fine for evaluation results where the data is genuinely tabular.

**Icons.** Colored circles `●` for pass/fail/status. Green = pass, red = fail, yellow = timeout/warning. No checkmarks, no crosses, no emojis.

**Timing in parentheses,** dimmed: `(34.2s)`, `(3 files created)`.

**2-space indent** only for list items (history, check results). Never for status lines.

**Summaries are plain.** `1 passed, 1 failed` at column 0. No color on the summary line.

**Errors.** `error: message` in red at column 0. Multi-line errors: first line gets prefix, rest at 2-space indent.

**Warnings.** `warning: message` in yellow at column 0.

**Streaming.** Single-agent: no agent prefix, items at 2-space indent. Multi-agent: agent name prefix, padded to alignment.

**No headers.** Don't print `PrePrompt ---` or decorated banners. Start with the action.

**Silence is fine.** If there's nothing to say, say nothing. No progress bars, no spinners, no filler.

**Command history.** Each agent shows a growing list of actions (`> Writing file`, `> Running npm install`). History persists in completed output. Consecutive duplicates are deduplicated. Capped at 15 visible entries.

**Tree file summary.** Agent completion line shows a compact tree: `package.json, src/{index.ts, routes/health.ts}, .env`. Max 80 chars, truncate with `+N more`. No separate file list.

**Criteria reveal.** Criteria appear one by one during generation, then collapse into a single summary line: `● 27 criteria: Project setup (2), Dependencies (6), ...`

**Comparison table.** Evaluation results as a table: criteria groups as rows, agents as columns. Single agent uses the same table format (one column). Groups expand when agents differ or when a single agent has failures. Failure notes shown dimmed after the last column. Binary pass/fail, no partial states.

**Eval progress.** During evaluation: `⠹ Evaluating claude-code [14/27]  express is installed`

## Colors

- Green: success, pass icons
- Red: errors, fail icons
- Yellow: warnings, timeouts
- Dim: metadata, timing, history, file trees, failure notes
- Default: content
- Bold: table headers (agent names)

## Examples

Single agent:
```
● 2 agents detected (claude-code, codex)
● 5 tools detected (npm, git, typescript)
● 27 criteria: Project setup (2), Dependencies (6), Source files (7), Configuration (6), Scripts (3), Runtime (1)
● claude-code  passed  34.2s  package.json, src/{index.ts, routes/health.ts}, tsconfig.json, .env
    > Running npm init -y
    > Running npm install express dotenv
    > Writing src/index.ts
    > Writing src/routes/health.ts

                          claude-code
Project setup                  2/2
Dependencies                   6/6
Configuration                  3/6
  .env contains PORT=3000       ●  file not found
  .gitignore contains dist      ●  no match
  .gitignore contains .env      ●  no match
Scripts                        3/3
Runtime                        1/1
                          ─────────
Score                        82/100
```

Multi-agent:
```
● claude-code  passed  34.2s  package.json, src/{index.ts, routes/health.ts}
    > Running npm init -y
    > Running npm install
    > Writing src/index.ts
● codex  passed  120.0s  package.json, src/{index.ts}
    > Running npm init -y
    > Running mkdir -p src/routes

                          claude-code    codex
Project setup                  2/2        1/2
  tsconfig.json exists          ●          ●
Dependencies                   6/6        0/6
Source files                   5/5        2/5
  src/index.ts uses TypeScript  ●          ●
  Health route returns ok       ●          ●
                          ──────────  ──────────
Score                        82/100     24/100
```

Error:
```
error: No agents found. Install one:
  npm install -g @anthropic-ai/claude-code
  npm install -g @openai/codex
```

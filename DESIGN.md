# Design System

PrePrompt's CLI output follows the style of [uv by Astral](https://github.com/astral-sh/uv). Clean, terse, no decoration.

## Reference

uv is the gold standard. When in doubt about how output should look, check what uv would do.

## Rules

**Column 0.** Status lines start at column 0. Never indent status output.

**Action keywords.** Green colored verb at the start of status lines: `Analyzed`, `Running`, `Passed`, `Failed`, `Comparing`, `Checking`, `Saved`, `Diagnosing`, `Generating`, `Applied`.

**No tables.** No borders. No boxes. No decorations. Plain text with padded columns when alignment is needed.

**No emojis.** Use `+`, `-`, `~`, `>`, `x`, `✓`, `✗` only.

**Timing in parentheses,** dimmed: `(34.2s)`, `(3 files created)`.

**2-space indent** only for list items (files, install instructions, check results). Never for status lines.

**Summaries are plain.** `1 passed, 1 failed` at column 0. No color on the summary line.

**Errors.** `error: message` in red at column 0. Multi-line errors: first line gets prefix, rest at 2-space indent.

**Warnings.** `warning: message` in yellow at column 0.

**Streaming.** Single-agent: no agent prefix, items at 2-space indent. Multi-agent: agent name prefix, padded to alignment.

**No headers.** Don't print `PrePrompt ---` or decorated banners. Start with the action.

**Silence is fine.** If there's nothing to say, say nothing. No progress bars, no spinners, no filler.

## Colors

- Green: success, action keywords
- Red: errors, failures
- Yellow: warnings, timeouts
- Dim: metadata, timing, secondary info
- Default: content

## Examples

Single agent:
```
Analyzed prompt, 5 tools detected (npm, git, typescript)
Running claude-code...
  > npm install
  + package.json
  + src/index.ts
Passed in 34.2s (3 files created)
```

Multi-agent:
```
Running 2 agents in parallel...
claude-code  > npm install
claude-code  + package.json
codex        x failed (exit code 2, 0.2s)
claude-code  passed in 34.2s (5 files)

1 passed, 1 failed
```

Error:
```
error: No agents found. Install one:
  npm install -g @anthropic-ai/claude-code
  npm install -g @openai/codex
```

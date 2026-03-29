import type { AgentAdapter } from "./agents/types.js"
import type { RunResult, EvalResult, EvalStep, Criterion } from "./types.js"
import { createSandbox } from "./sandbox/manager.js"

const MAX_STDOUT = 10_000
const MAX_STDERR = 5_000

// Phase 1: Generate criteria from the prompt BEFORE execution
function buildCriteriaPrompt(promptContent: string): string {
  return `You are analyzing an AI instruction prompt to determine specific, verifiable success criteria.

PROMPT:
---
${promptContent}
---

Group the criteria into logical sections (e.g., "Project setup", "Dependencies", "Source files", "Configuration", "Scripts", "Runtime"). Each criterion must be concrete and verifiable by an AI with CLI access.

Criterion types:
- "command": a shell command that should exit 0 (e.g., "node -e \\"require('./package.json')\\"")
- "file-exists": a file that should exist after execution
- "file-contains": a file should contain specific content
- "service": an endpoint that should respond (e.g., "curl -s localhost:3000/health")
- "behavioral": something the agent should have done, verifiable from its output log

For each criterion, provide a "group" (section name), "type", "description", and "check" (the exact command or pattern to verify it).

Respond ONLY with this JSON (no markdown, no code fences):
{"criteria":[{"number":1,"group":"Project setup","type":"file-exists","description":"package.json exists","check":"test -f package.json"},{"number":2,"group":"Dependencies","type":"command","description":"express is installed","check":"node -e \\"require('express')\\""}]}`
}

function parseCriteriaResponse(raw: string): Criterion[] | null {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.criteria)) return null

    return parsed.criteria.map((c: any, i: number) => ({
      number: c.number ?? i + 1,
      group: String(c.group ?? "General"),
      type: ["command", "file-exists", "file-contains", "service", "behavioral"].includes(c.type)
        ? c.type
        : "behavioral",
      description: String(c.description ?? ""),
      check: c.check ? String(c.check) : undefined,
    }))
  } catch {
    return null
  }
}

export async function generateCriteria(
  promptContent: string,
  analyzerAdapter: AgentAdapter
): Promise<Criterion[]> {
  const criteriaPrompt = buildCriteriaPrompt(promptContent)
  const sandbox = await createSandbox()

  try {
    const result = await analyzerAdapter.execute(criteriaPrompt, sandbox.dir, { timeout: 30_000 })
    const criteria = parseCriteriaResponse(result.stdout)
    return criteria ?? []
  } catch {
    return []
  } finally {
    await sandbox.destroy()
  }
}

// Phase 2: Evaluate agent execution against pre-determined criteria
function buildEvalPrompt(
  promptContent: string,
  criteria: Criterion[],
  result: RunResult
): string {
  const stdout = result.execution.stdout.length > MAX_STDOUT
    ? result.execution.stdout.slice(0, MAX_STDOUT) + "\n... (truncated)"
    : result.execution.stdout

  const stderr = result.execution.stderr.length > MAX_STDERR
    ? result.execution.stderr.slice(0, MAX_STDERR) + "\n... (truncated)"
    : result.execution.stderr

  const added = result.diff.added.length > 0
    ? result.diff.added.join("\n")
    : "(none)"

  const criteriaList = criteria.map((c) =>
    `  ${c.number}. [${c.type}] ${c.description}${c.check ? ` -- verify: ${c.check}` : ""}`
  ).join("\n")

  return `You are evaluating whether an AI coding agent met specific pre-determined criteria.

ORIGINAL INSTRUCTIONS:
---
${promptContent}
---

PRE-DETERMINED CRITERIA (evaluate each one):
${criteriaList}

AGENT: ${result.agent}
EXIT CODE: ${result.execution.exitCode}
DURATION: ${(result.execution.duration / 1000).toFixed(1)}s

AGENT OUTPUT (stdout):
---
${stdout || "(empty)"}
---

AGENT ERRORS (stderr):
---
${stderr || "(empty)"}
---

FILES CREATED:
${added}

For each criterion above, determine if the agent met it based on the execution trace, files created, and agent output. For "command" and "file-exists" criteria, check the files list. For "behavioral" criteria, check the agent's stdout for evidence.

Score each criterion: "pass", "fail", or "partial".
Give an overall score 0-100 based on the percentage of criteria met.

Respond ONLY with this JSON (no markdown, no code fences):
{"steps":[{"number":1,"description":"...","status":"pass","note":"..."}],"score":85,"summary":"one line summary","issues":["issue 1"]}`
}

function parseEvalResponse(raw: string): {
  steps: EvalStep[]
  score: number
  summary: string
  issues: string[]
} | null {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.steps) || typeof parsed.score !== "number") return null

    return {
      steps: parsed.steps.map((s: any, i: number) => ({
        number: s.number ?? i + 1,
        description: String(s.description ?? ""),
        status: ["pass", "fail", "partial"].includes(s.status) ? s.status : "fail",
        note: s.note ? String(s.note) : undefined,
      })),
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      summary: String(parsed.summary ?? ""),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    }
  } catch {
    return null
  }
}

export async function evaluateRun(
  promptContent: string,
  criteria: Criterion[],
  result: RunResult,
  evaluatorAdapter: AgentAdapter
): Promise<EvalResult> {
  const evalPrompt = buildEvalPrompt(promptContent, criteria, result)
  const sandbox = await createSandbox()
  const start = Date.now()

  try {
    const evalExecution = await evaluatorAdapter.execute(
      evalPrompt,
      sandbox.dir,
      { timeout: 60_000 }
    )

    const duration = Date.now() - start
    const parsed = parseEvalResponse(evalExecution.stdout)

    if (parsed) {
      return {
        agent: result.agent,
        evaluator: evaluatorAdapter.name,
        criteria,
        steps: parsed.steps,
        score: parsed.score,
        summary: parsed.summary,
        issues: parsed.issues,
        duration,
      }
    }

    // Fallback: couldn't parse JSON
    return {
      agent: result.agent,
      evaluator: evaluatorAdapter.name,
      criteria,
      steps: criteria.map((c) => ({
        number: c.number,
        description: c.description,
        status: result.status === "pass" ? "pass" as const : "fail" as const,
        note: "Evaluator response could not be parsed",
      })),
      score: result.status === "pass" ? 70 : 20,
      summary: result.status === "pass"
        ? "Agent completed (evaluation unstructured)"
        : `Agent failed with exit code ${result.execution.exitCode}`,
      issues: ["Evaluator did not return structured JSON"],
      duration,
    }
  } finally {
    await sandbox.destroy()
  }
}

export function pickEvaluator(
  executorName: string,
  installedAdapters: AgentAdapter[]
): AgentAdapter | null {
  const other = installedAdapters.find((a) => a.name !== executorName)
  if (other) return other
  if (installedAdapters.length > 0) return installedAdapters[0]
  return null
}

import type { AgentAdapter } from "./agents/types.js"
import type { RunResult, EvalResult, EvalStep } from "./types.js"
import { createSandbox } from "./sandbox/manager.js"

const MAX_STDOUT = 10_000
const MAX_STDERR = 5_000

function buildEvalPrompt(promptContent: string, result: RunResult): string {
  const stdout = result.execution.stdout.length > MAX_STDOUT
    ? result.execution.stdout.slice(0, MAX_STDOUT) + "\n... (truncated)"
    : result.execution.stdout

  const stderr = result.execution.stderr.length > MAX_STDERR
    ? result.execution.stderr.slice(0, MAX_STDERR) + "\n... (truncated)"
    : result.execution.stderr

  const added = result.diff.added.length > 0
    ? result.diff.added.join("\n")
    : "(none)"

  const modified = result.diff.modified.length > 0
    ? result.diff.modified.join("\n")
    : "(none)"

  return `You are evaluating whether an AI coding agent correctly followed a set of instructions.

ORIGINAL INSTRUCTIONS (what the agent was asked to do):
---
${promptContent}
---

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

FILES MODIFIED:
${modified}

Analyze the instructions and evaluate the agent's behavior:

1. Break the instructions into numbered steps (what the prompt asked the agent to do)
2. For each step, determine if the agent completed it based on the output and files
3. Score each step: "pass", "fail", or "partial"
4. Note any safety or security issues
5. Give an overall score 0-100

Respond ONLY with this JSON (no markdown, no code fences, no other text):
{"steps":[{"number":1,"description":"...","status":"pass","note":"..."}],"score":85,"summary":"one line summary","issues":["issue 1"]}`
}

function parseEvalResponse(raw: string): {
  steps: EvalStep[]
  score: number
  summary: string
  issues: string[]
} | null {
  // Try to extract JSON from the response
  let jsonStr = raw.trim()

  // Strip markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  // Try to find JSON object in the response
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.steps) || typeof parsed.score !== "number") {
      return null
    }

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
  result: RunResult,
  evaluatorAdapter: AgentAdapter
): Promise<EvalResult> {
  const evalPrompt = buildEvalPrompt(promptContent, result)
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
        steps: parsed.steps,
        score: parsed.score,
        summary: parsed.summary,
        issues: parsed.issues,
        duration,
      }
    }

    // Fallback: couldn't parse JSON, generate basic eval from exit code
    return {
      agent: result.agent,
      evaluator: evaluatorAdapter.name,
      steps: [{
        number: 1,
        description: "Overall execution",
        status: result.status === "pass" ? "pass" : "fail",
        note: "Evaluator response could not be parsed as structured JSON",
      }],
      score: result.status === "pass" ? 70 : 20,
      summary: result.status === "pass"
        ? "Agent completed with exit code 0 (evaluation unstructured)"
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
  // Pick a different agent than the executor
  const other = installedAdapters.find((a) => a.name !== executorName)
  if (other) return other

  // Only 1 agent installed: self-evaluate (noted in output)
  if (installedAdapters.length > 0) return installedAdapters[0]

  return null
}

import { execa } from "execa"
import { access } from "node:fs/promises"
import { join } from "node:path"
import type { AgentAdapter } from "./agents/types.js"
import type { EvalResult, EvalStep, Criterion } from "./types.js"
import { createSandbox } from "./sandbox/manager.js"

const MAX_CRITERIA = 40
const CHECK_TIMEOUT = 10_000

// Phase 1: Generate criteria from the prompt BEFORE execution
function buildCriteriaPrompt(promptContent: string, feedback?: string): string {
  let prompt = `You are analyzing an AI instruction prompt to determine specific, verifiable success criteria.

PROMPT:
---
${promptContent}
---

Group the criteria into logical sections (e.g., "Project setup", "Dependencies", "Source files", "Configuration", "Scripts", "Runtime"). Each criterion must be concrete and verifiable.

Criterion types:
- "command": a shell command that should exit 0 (e.g., "node -e \\"require('./package.json')\\"")
- "file-exists": a file that should exist after execution
- "file-contains": a file should contain specific content
- "service": an endpoint or process that should work
- "behavioral": something the agent should have done

IMPORTANT: Every criterion MUST include a "check" field with an executable shell command that exits 0 on success and non-zero on failure. Checks must be read-only verification commands that do NOT install packages, create files, or modify the environment.

Examples of good checks:
- "test -f package.json"
- "node -e \\"require('express')\\""
- "grep -q PORT .env"
- "node -e \\"const p = require('./package.json'); process.exit(p.scripts?.dev ? 0 : 1)\\""
- "test -d node_modules/@types/node" (for @types/* packages, use test -d, NOT require())

Respond ONLY with this JSON (no markdown, no code fences):
{"criteria":[{"number":1,"group":"Project setup","type":"file-exists","description":"package.json exists","check":"test -f package.json"},{"number":2,"group":"Dependencies","type":"command","description":"express is installed","check":"node -e \\"require('express')\\""}]}`

  if (feedback) {
    prompt += `\n\nUSER FEEDBACK ON PREVIOUS CRITERIA:\n${feedback}\n\nRevise the criteria to address this feedback. Keep existing good criteria and add/modify based on the feedback.`
  }

  return prompt
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

    const criteria = parsed.criteria.map((c: any, i: number) => ({
      number: c.number ?? i + 1,
      group: String(c.group ?? "General"),
      type: ["command", "file-exists", "file-contains", "service", "behavioral"].includes(c.type)
        ? c.type
        : "behavioral",
      description: String(c.description ?? ""),
      check: c.check ? String(c.check) : undefined,
    }))

    return criteria.slice(0, MAX_CRITERIA)
  } catch {
    return null
  }
}

export async function generateCriteria(
  promptContent: string,
  analyzerAdapter: AgentAdapter,
  feedback?: string
): Promise<Criterion[]> {
  const criteriaPrompt = buildCriteriaPrompt(promptContent, feedback)
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

// Phase 2: Evaluate by running check commands in the agent's sandbox
export async function evaluateInSandbox(
  agent: string,
  criteria: Criterion[],
  sandboxDir: string,
  onProgress?: (checked: number, total: number, step: EvalStep) => void,
  onStepStart?: (index: number, total: number, description: string) => void
): Promise<EvalResult> {
  const start = Date.now()

  try {
    await access(sandboxDir)
  } catch {
    return {
      agent,
      criteria,
      steps: criteria.map((c) => ({
        number: c.number,
        description: c.description,
        status: "skip" as const,
        note: "sandbox unavailable",
      })),
      score: 0,
      duration: Date.now() - start,
    }
  }

  const steps: EvalStep[] = []
  let passCount = 0
  let totalCount = 0

  const env = {
    ...process.env,
    PATH: `${join(sandboxDir, "node_modules", ".bin")}:${process.env.PATH}`,
  }

  for (let i = 0; i < criteria.length; i++) {
    const criterion = criteria[i]
    if (!criterion.check) {
      const step: EvalStep = {
        number: criterion.number,
        description: criterion.description,
        status: "skip",
        note: "no check command",
      }
      steps.push(step)
      onProgress?.(steps.length, criteria.length, step)
      continue
    }

    totalCount++
    onStepStart?.(i + 1, criteria.length, criterion.description)

    try {
      const result = await execa(criterion.check, {
        cwd: sandboxDir,
        shell: true,
        timeout: CHECK_TIMEOUT,
        reject: false,
        env,
      })

      const passed = result.exitCode === 0
      if (passed) passCount++

      const step: EvalStep = {
        number: criterion.number,
        description: criterion.description,
        status: passed ? "pass" : "fail",
        note: passed ? undefined : (result.stderr || result.stdout || `exit code ${result.exitCode}`).slice(0, 200),
      }
      steps.push(step)
      onProgress?.(steps.length, criteria.length, step)
    } catch (error: unknown) {
      const isTimeout = error instanceof Error && error.message.includes("timed out")

      const step: EvalStep = {
        number: criterion.number,
        description: criterion.description,
        status: "fail",
        note: isTimeout ? "check timed out" : "check failed to execute",
      }
      steps.push(step)
      onProgress?.(steps.length, criteria.length, step)
    }
  }

  const score = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0

  return {
    agent,
    criteria,
    steps,
    score,
    duration: Date.now() - start,
  }
}

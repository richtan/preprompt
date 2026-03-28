import { readFile } from "node:fs/promises"
import { parse } from "yaml"
import type { RunResult, MultiRunResult } from "./types.js"

export interface Check {
  type: "file-exists" | "file-not-exists" | "file-contains" | "dir-exists" | "exit-ok"
  path?: string
  value?: string
}

export interface CheckResult {
  check: Check
  agent: string
  passed: boolean
  message: string
}

export function parseInlineCheck(raw: string): Check {
  // Format: "type:path" or "type:path:value"
  const parts = raw.split(":")
  const type = parts[0] as Check["type"]

  switch (type) {
    case "file-exists":
    case "file-not-exists":
    case "dir-exists":
      return { type, path: parts.slice(1).join(":") }
    case "file-contains":
      return { type, path: parts[1], value: parts.slice(2).join(":") }
    case "exit-ok":
      return { type }
    default:
      throw new Error(`Unknown check type: ${type}`)
  }
}

export async function loadChecksFromYaml(
  filePath: string
): Promise<{ checks: Check[]; prompt?: string; preset?: string }> {
  const content = await readFile(filePath, "utf8")
  const config = parse(content) as {
    prompt?: string
    preset?: string
    checks?: Array<
      | string
      | { "file-exists": string }
      | { "file-not-exists": string }
      | { "dir-exists": string }
      | { "file-contains": { path: string; value: string } }
      | { "exit-ok": boolean }
    >
  }

  const checks: Check[] = []
  if (config.checks) {
    for (const entry of config.checks) {
      if (typeof entry === "string") {
        checks.push(parseInlineCheck(entry))
      } else if ("file-exists" in entry) {
        checks.push({ type: "file-exists", path: entry["file-exists"] })
      } else if ("file-not-exists" in entry) {
        checks.push({ type: "file-not-exists", path: entry["file-not-exists"] })
      } else if ("dir-exists" in entry) {
        checks.push({ type: "dir-exists", path: entry["dir-exists"] })
      } else if ("file-contains" in entry) {
        const fc = entry["file-contains"]
        checks.push({ type: "file-contains", path: fc.path, value: fc.value })
      } else if ("exit-ok" in entry) {
        checks.push({ type: "exit-ok" })
      }
    }
  }

  return { checks, prompt: config.prompt, preset: config.preset }
}

export function runChecks(
  checks: Check[],
  result: RunResult
): CheckResult[] {
  const results: CheckResult[] = []

  for (const check of checks) {
    results.push(runSingleCheck(check, result))
  }

  return results
}

function runSingleCheck(check: Check, result: RunResult): CheckResult {
  const agent = result.agent
  const afterFiles = result.after.files

  switch (check.type) {
    case "file-exists": {
      const exists = afterFiles.some(
        (f) => f.path === check.path && f.type === "file"
      )
      return {
        check,
        agent,
        passed: exists,
        message: exists
          ? `${check.path} exists`
          : `${check.path} not found`,
      }
    }
    case "file-not-exists": {
      const exists = afterFiles.some(
        (f) => f.path === check.path && f.type === "file"
      )
      return {
        check,
        agent,
        passed: !exists,
        message: !exists
          ? `${check.path} correctly absent`
          : `${check.path} should not exist but does`,
      }
    }
    case "dir-exists": {
      const exists = afterFiles.some(
        (f) => f.path === check.path && f.type === "directory"
      )
      return {
        check,
        agent,
        passed: exists,
        message: exists
          ? `${check.path}/ exists`
          : `${check.path}/ not found`,
      }
    }
    case "file-contains": {
      // We can only check if the file exists in the snapshot.
      // Content checking requires reading the file, which we don't store in v1.
      // For now, check that the file exists and is non-empty.
      const file = afterFiles.find(
        (f) => f.path === check.path && f.type === "file"
      )
      if (!file) {
        return {
          check,
          agent,
          passed: false,
          message: `${check.path} not found (cannot check content)`,
        }
      }
      // Size > 0 is a weak proxy. Full content checking comes when we store file contents.
      return {
        check,
        agent,
        passed: file.size > 0,
        message:
          file.size > 0
            ? `${check.path} exists (${file.size} bytes, content check deferred)`
            : `${check.path} is empty`,
      }
    }
    case "exit-ok": {
      return {
        check,
        agent,
        passed: result.execution.exitCode === 0,
        message:
          result.execution.exitCode === 0
            ? "exit code 0"
            : `exit code ${result.execution.exitCode}`,
      }
    }
    default:
      return {
        check,
        agent,
        passed: false,
        message: `Unknown check type: ${(check as Check).type}`,
      }
  }
}

export function allChecksPassed(results: CheckResult[]): boolean {
  return results.every((r) => r.passed)
}

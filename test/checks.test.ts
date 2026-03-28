import { describe, it, expect } from "vitest"
import {
  parseInlineCheck,
  runChecks,
  allChecksPassed,
} from "../src/checks.js"
import type { RunResult } from "../src/types.js"

const makeResult = (overrides: Partial<RunResult> = {}): RunResult => ({
  agent: "test-agent",
  prompt: "test",
  workdir: "/tmp/test",
  execution: { exitCode: 0, stdout: "", stderr: "", duration: 1000 },
  before: { files: [], timestamp: 1 },
  after: {
    files: [
      { path: "package.json", type: "file", size: 100 },
      { path: "src", type: "directory", size: 0 },
      { path: "src/index.ts", type: "file", size: 50 },
      { path: "empty.txt", type: "file", size: 0 },
    ],
    timestamp: 2,
  },
  diff: { added: ["package.json", "src", "src/index.ts"], modified: [], deleted: [] },
  status: "pass",
  timestamp: Date.now(),
  ...overrides,
})

describe("parseInlineCheck", () => {
  it("parses file-exists", () => {
    const check = parseInlineCheck("file-exists:package.json")
    expect(check.type).toBe("file-exists")
    expect(check.path).toBe("package.json")
  })

  it("parses file-not-exists", () => {
    const check = parseInlineCheck("file-not-exists:secret.key")
    expect(check.type).toBe("file-not-exists")
    expect(check.path).toBe("secret.key")
  })

  it("parses dir-exists", () => {
    const check = parseInlineCheck("dir-exists:src")
    expect(check.type).toBe("dir-exists")
    expect(check.path).toBe("src")
  })

  it("parses file-contains with value", () => {
    const check = parseInlineCheck("file-contains:package.json:dependencies")
    expect(check.type).toBe("file-contains")
    expect(check.path).toBe("package.json")
    expect(check.value).toBe("dependencies")
  })

  it("parses exit-ok", () => {
    const check = parseInlineCheck("exit-ok")
    expect(check.type).toBe("exit-ok")
  })

  it("throws on unknown type", () => {
    expect(() => parseInlineCheck("unknown:foo")).toThrow("Unknown check type")
  })
})

describe("runChecks", () => {
  it("passes file-exists when file exists", () => {
    const result = makeResult()
    const checks = runChecks(
      [{ type: "file-exists", path: "package.json" }],
      result
    )
    expect(checks[0].passed).toBe(true)
  })

  it("fails file-exists when file missing", () => {
    const result = makeResult()
    const checks = runChecks(
      [{ type: "file-exists", path: "missing.txt" }],
      result
    )
    expect(checks[0].passed).toBe(false)
  })

  it("passes file-not-exists when file missing", () => {
    const result = makeResult()
    const checks = runChecks(
      [{ type: "file-not-exists", path: "missing.txt" }],
      result
    )
    expect(checks[0].passed).toBe(true)
  })

  it("fails file-not-exists when file exists", () => {
    const result = makeResult()
    const checks = runChecks(
      [{ type: "file-not-exists", path: "package.json" }],
      result
    )
    expect(checks[0].passed).toBe(false)
  })

  it("passes dir-exists when directory exists", () => {
    const result = makeResult()
    const checks = runChecks(
      [{ type: "dir-exists", path: "src" }],
      result
    )
    expect(checks[0].passed).toBe(true)
  })

  it("passes exit-ok when exit code is 0", () => {
    const result = makeResult()
    const checks = runChecks([{ type: "exit-ok" }], result)
    expect(checks[0].passed).toBe(true)
  })

  it("fails exit-ok when exit code is non-zero", () => {
    const result = makeResult({
      execution: { exitCode: 1, stdout: "", stderr: "error", duration: 1000 },
    })
    const checks = runChecks([{ type: "exit-ok" }], result)
    expect(checks[0].passed).toBe(false)
  })

  it("file-contains passes for non-empty file", () => {
    const result = makeResult()
    const checks = runChecks(
      [{ type: "file-contains", path: "package.json", value: "name" }],
      result
    )
    expect(checks[0].passed).toBe(true)
  })

  it("file-contains fails for empty file", () => {
    const result = makeResult()
    const checks = runChecks(
      [{ type: "file-contains", path: "empty.txt", value: "something" }],
      result
    )
    expect(checks[0].passed).toBe(false)
  })
})

describe("allChecksPassed", () => {
  it("returns true when all pass", () => {
    expect(
      allChecksPassed([
        { check: { type: "exit-ok" }, agent: "a", passed: true, message: "" },
        { check: { type: "exit-ok" }, agent: "b", passed: true, message: "" },
      ])
    ).toBe(true)
  })

  it("returns false when any fail", () => {
    expect(
      allChecksPassed([
        { check: { type: "exit-ok" }, agent: "a", passed: true, message: "" },
        { check: { type: "exit-ok" }, agent: "b", passed: false, message: "" },
      ])
    ).toBe(false)
  })
})

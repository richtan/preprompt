import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { evaluateInSandbox, cleanupSandboxProcesses } from "../src/evaluate.js"
import type { Criterion } from "../src/types.js"

describe("evaluateInSandbox", () => {
  let sandboxDir: string

  beforeEach(async () => {
    sandboxDir = await mkdtemp(join(tmpdir(), "preprompt-eval-test-"))
    // Create some test files in the sandbox
    await writeFile(join(sandboxDir, "package.json"), '{"name":"test","version":"1.0.0"}')
    await mkdir(join(sandboxDir, "src"), { recursive: true })
    await writeFile(join(sandboxDir, "src", "index.ts"), 'console.log("hello")')
  })

  afterEach(async () => {
    await rm(sandboxDir, { recursive: true, force: true })
  })

  it("passes when check command exits 0", async () => {
    const criteria: Criterion[] = [
      { number: 1, group: "Setup", type: "file-exists", description: "package.json exists", check: "test -f package.json" },
    ]
    const result = await evaluateInSandbox("test-agent", criteria, sandboxDir)
    expect(result.steps[0].status).toBe("pass")
    expect(result.score).toBe(100)
  })

  it("fails when check command exits non-zero", async () => {
    const criteria: Criterion[] = [
      { number: 1, group: "Setup", type: "file-exists", description: "missing.txt exists", check: "test -f missing.txt" },
    ]
    const result = await evaluateInSandbox("test-agent", criteria, sandboxDir)
    expect(result.steps[0].status).toBe("fail")
    expect(result.score).toBe(0)
  })

  it("captures stderr as note on failure", async () => {
    const criteria: Criterion[] = [
      { number: 1, group: "Setup", type: "command", description: "node check", check: 'node -e "throw new Error(\'not found\')"' },
    ]
    const result = await evaluateInSandbox("test-agent", criteria, sandboxDir)
    expect(result.steps[0].status).toBe("fail")
    expect(result.steps[0].note).toBeTruthy()
  })

  it("marks criteria without check as skip", async () => {
    const criteria: Criterion[] = [
      { number: 1, group: "Setup", type: "behavioral", description: "agent was polite" },
    ]
    const result = await evaluateInSandbox("test-agent", criteria, sandboxDir)
    expect(result.steps[0].status).toBe("skip")
    expect(result.steps[0].note).toBe("no check command")
  })

  it("excludes skipped criteria from score", async () => {
    const criteria: Criterion[] = [
      { number: 1, group: "Setup", type: "file-exists", description: "package.json exists", check: "test -f package.json" },
      { number: 2, group: "Setup", type: "file-exists", description: "missing.txt exists", check: "test -f missing.txt" },
      { number: 3, group: "Setup", type: "behavioral", description: "agent was polite" },
    ]
    const result = await evaluateInSandbox("test-agent", criteria, sandboxDir)
    // 1 pass, 1 fail, 1 skip → score = 1/2 * 100 = 50
    expect(result.score).toBe(50)
    expect(result.steps[2].status).toBe("skip")
  })

  it("returns score 0 when all criteria are skipped", async () => {
    const criteria: Criterion[] = [
      { number: 1, group: "Setup", type: "behavioral", description: "agent was polite" },
      { number: 2, group: "Setup", type: "behavioral", description: "agent was fast" },
    ]
    const result = await evaluateInSandbox("test-agent", criteria, sandboxDir)
    expect(result.score).toBe(0)
  })

  it("returns score 0 with empty criteria", async () => {
    const result = await evaluateInSandbox("test-agent", [], sandboxDir)
    expect(result.steps).toEqual([])
    expect(result.score).toBe(0)
  })

  it("returns score 0 when sandbox dir does not exist", async () => {
    const result = await evaluateInSandbox("test-agent", [
      { number: 1, group: "Setup", type: "file-exists", description: "file exists", check: "test -f file" },
    ], "/nonexistent/path")
    expect(result.score).toBe(0)
    expect(result.steps[0].status).toBe("skip")
  })

  it("calls onProgress after each criterion", async () => {
    const criteria: Criterion[] = [
      { number: 1, group: "A", type: "file-exists", description: "a", check: "test -f package.json" },
      { number: 2, group: "B", type: "file-exists", description: "b", check: "test -f missing.txt" },
    ]
    const progress: { checked: number; total: number }[] = []
    await evaluateInSandbox("test-agent", criteria, sandboxDir, (checked, total) => {
      progress.push({ checked, total })
    })
    expect(progress).toEqual([
      { checked: 1, total: 2 },
      { checked: 2, total: 2 },
    ])
  })

  it("cleanupSandboxProcesses does not throw on empty sandbox", async () => {
    cleanupSandboxProcesses(sandboxDir)
  })

  it("cleanupSandboxProcesses does not throw on nonexistent dir", () => {
    cleanupSandboxProcesses("/nonexistent/path")
  })

  it("includes node_modules/.bin in PATH", async () => {
    // Create a fake binary in node_modules/.bin
    await mkdir(join(sandboxDir, "node_modules", ".bin"), { recursive: true })
    await writeFile(join(sandboxDir, "node_modules", ".bin", "mybin"), '#!/bin/sh\nexit 0', { mode: 0o755 })

    const criteria: Criterion[] = [
      { number: 1, group: "Deps", type: "command", description: "mybin works", check: "mybin" },
    ]
    const result = await evaluateInSandbox("test-agent", criteria, sandboxDir)
    expect(result.steps[0].status).toBe("pass")
  })
})

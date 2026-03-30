import { describe, it, expect } from "vitest"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createSandbox } from "../src/sandbox/manager.js"

describe("createSandbox", () => {
  it("creates a temporary directory", async () => {
    const sandbox = await createSandbox()

    expect(existsSync(sandbox.dir)).toBe(true)
    expect(sandbox.dir).toContain("preprompt-")

    await sandbox.destroy()
  })

  it("destroys the directory on cleanup", async () => {
    const sandbox = await createSandbox()
    const dir = sandbox.dir

    // Write a file so the dir isn't empty
    await writeFile(join(dir, "test.txt"), "hello")

    await sandbox.destroy()

    expect(existsSync(dir)).toBe(false)
  })

  it("destroy is safe to call on already-destroyed sandbox", async () => {
    const sandbox = await createSandbox()
    await sandbox.destroy()
    // Second call should not throw
    await sandbox.destroy()
  })
})

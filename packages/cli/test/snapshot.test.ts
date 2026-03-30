import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { captureSnapshot, diffSnapshots } from "../src/sandbox/snapshot.js"

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "preprompt-test-"))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe("captureSnapshot", () => {
  it("captures files in a directory", async () => {
    await writeFile(join(testDir, "hello.txt"), "world")
    await writeFile(join(testDir, "readme.md"), "# Hi")

    const snap = await captureSnapshot(testDir)

    expect(snap.files).toHaveLength(2)
    expect(snap.files.map((f) => f.path).sort()).toEqual(["hello.txt", "readme.md"])
    expect(snap.files.every((f) => f.type === "file")).toBe(true)
  })

  it("captures nested directories", async () => {
    await mkdir(join(testDir, "src"), { recursive: true })
    await writeFile(join(testDir, "src", "index.ts"), "console.log('hi')")

    const snap = await captureSnapshot(testDir)

    const paths = snap.files.map((f) => f.path)
    expect(paths).toContain("src")
    expect(paths).toContain(join("src", "index.ts"))
  })

  it("returns empty array for empty directory", async () => {
    const snap = await captureSnapshot(testDir)
    expect(snap.files).toHaveLength(0)
  })

  it("skips hidden directories", async () => {
    await mkdir(join(testDir, ".git"), { recursive: true })
    await writeFile(join(testDir, ".git", "config"), "git stuff")
    await writeFile(join(testDir, "visible.txt"), "hello")

    const snap = await captureSnapshot(testDir)

    const paths = snap.files.map((f) => f.path)
    expect(paths).toContain("visible.txt")
    expect(paths).not.toContain(".git")
  })

  it("skips node_modules", async () => {
    await mkdir(join(testDir, "node_modules", "foo"), { recursive: true })
    await writeFile(join(testDir, "node_modules", "foo", "index.js"), "")
    await writeFile(join(testDir, "app.js"), "")

    const snap = await captureSnapshot(testDir)

    const paths = snap.files.map((f) => f.path)
    expect(paths).toContain("app.js")
    expect(paths).not.toContain("node_modules")
  })
})

describe("diffSnapshots", () => {
  it("detects added files", () => {
    const before = { files: [], timestamp: 1 }
    const after = {
      files: [{ path: "new.txt", type: "file" as const, size: 10 }],
      timestamp: 2,
    }

    const diff = diffSnapshots(before, after)

    expect(diff.added).toEqual(["new.txt"])
    expect(diff.modified).toEqual([])
    expect(diff.deleted).toEqual([])
  })

  it("detects deleted files", () => {
    const before = {
      files: [{ path: "old.txt", type: "file" as const, size: 10 }],
      timestamp: 1,
    }
    const after = { files: [], timestamp: 2 }

    const diff = diffSnapshots(before, after)

    expect(diff.deleted).toEqual(["old.txt"])
    expect(diff.added).toEqual([])
  })

  it("detects modified files by size change", () => {
    const before = {
      files: [{ path: "file.txt", type: "file" as const, size: 10 }],
      timestamp: 1,
    }
    const after = {
      files: [{ path: "file.txt", type: "file" as const, size: 20 }],
      timestamp: 2,
    }

    const diff = diffSnapshots(before, after)

    expect(diff.modified).toEqual(["file.txt"])
  })

  it("returns empty diff when nothing changed", () => {
    const snap = {
      files: [{ path: "same.txt", type: "file" as const, size: 10 }],
      timestamp: 1,
    }

    const diff = diffSnapshots(snap, { ...snap, timestamp: 2 })

    expect(diff.added).toEqual([])
    expect(diff.modified).toEqual([])
    expect(diff.deleted).toEqual([])
  })

  it("handles multiple changes at once", () => {
    const before = {
      files: [
        { path: "keep.txt", type: "file" as const, size: 10 },
        { path: "change.txt", type: "file" as const, size: 10 },
        { path: "remove.txt", type: "file" as const, size: 10 },
      ],
      timestamp: 1,
    }
    const after = {
      files: [
        { path: "keep.txt", type: "file" as const, size: 10 },
        { path: "change.txt", type: "file" as const, size: 99 },
        { path: "new.txt", type: "file" as const, size: 5 },
      ],
      timestamp: 2,
    }

    const diff = diffSnapshots(before, after)

    expect(diff.added).toEqual(["new.txt"])
    expect(diff.modified).toEqual(["change.txt"])
    expect(diff.deleted).toEqual(["remove.txt"])
  })
})

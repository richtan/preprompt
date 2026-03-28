import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import type { Snapshot, FileEntry, SnapshotDiff } from "../types.js"

export async function captureSnapshot(dir: string): Promise<Snapshot> {
  const files: FileEntry[] = []
  await walk(dir, dir, files)

  return {
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    timestamp: Date.now(),
  }
}

async function walk(
  baseDir: string,
  currentDir: string,
  files: FileEntry[]
): Promise<void> {
  let entries
  try {
    entries = await readdir(currentDir, { withFileTypes: true })
  } catch {
    return // Permission denied or deleted mid-walk
  }

  for (const entry of entries) {
    // Skip hidden dirs like .git, node_modules
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue

    const fullPath = join(currentDir, entry.name)
    const relPath = relative(baseDir, fullPath)

    if (entry.isDirectory()) {
      files.push({ path: relPath, type: "directory", size: 0 })
      await walk(baseDir, fullPath, files)
    } else if (entry.isFile()) {
      try {
        const s = await stat(fullPath)
        files.push({ path: relPath, type: "file", size: s.size })
      } catch {
        // File disappeared mid-walk
      }
    }
  }
}

export function diffSnapshots(
  before: Snapshot,
  after: Snapshot
): SnapshotDiff {
  const beforePaths = new Map(before.files.map((f) => [f.path, f]))
  const afterPaths = new Map(after.files.map((f) => [f.path, f]))

  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  for (const [path, afterFile] of afterPaths) {
    const beforeFile = beforePaths.get(path)
    if (!beforeFile) {
      added.push(path)
    } else if (
      afterFile.type === "file" &&
      beforeFile.type === "file" &&
      afterFile.size !== beforeFile.size
    ) {
      modified.push(path)
    }
  }

  for (const path of beforePaths.keys()) {
    if (!afterPaths.has(path)) {
      deleted.push(path)
    }
  }

  return { added, modified, deleted }
}

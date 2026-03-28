import { mkdir, writeFile, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { RunResult } from "./types.js"

const RESULTS_DIR = ".pstack/runs"

function runId(): string {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, "0")
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("")
}

export async function saveResult(result: RunResult): Promise<string> {
  const id = runId()
  const dir = join(RESULTS_DIR, id)
  await mkdir(dir, { recursive: true })

  await writeFile(
    join(dir, "result.json"),
    JSON.stringify(result, null, 2),
    "utf8"
  )

  return id
}

export async function listRuns(): Promise<string[]> {
  try {
    const entries = await readdir(RESULTS_DIR)
    return entries.sort().reverse()
  } catch {
    return []
  }
}

export async function loadResult(id: string): Promise<RunResult | null> {
  try {
    const data = await readFile(join(RESULTS_DIR, id, "result.json"), "utf8")
    return JSON.parse(data) as RunResult
  } catch {
    return null
  }
}

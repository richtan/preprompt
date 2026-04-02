import { mkdir, writeFile, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { MultiRunResult } from "./types.js"

const RESULTS_DIR = ".preprompt/runs"

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
    "-",
    pad(now.getMilliseconds(), 3),
  ].join("")
}

export async function saveMultiResult(result: MultiRunResult): Promise<string> {
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

export async function loadResult(id: string): Promise<MultiRunResult | null> {
  try {
    const data = await readFile(join(RESULTS_DIR, id, "result.json"), "utf8")
    return JSON.parse(data) as MultiRunResult
  } catch {
    return null
  }
}

export async function loadLatestResult(): Promise<{
  id: string
  result: MultiRunResult
} | null> {
  const runs = await listRuns()
  if (runs.length === 0) return null

  const result = await loadResult(runs[0])
  if (!result) return null

  return { id: runs[0], result }
}

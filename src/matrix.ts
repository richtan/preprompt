import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

interface ToolEntry {
  name: string
  patterns: string[]
  related: string[]
  failures: string[]
}

interface ToolDB {
  tools: ToolEntry[]
}

export interface MatrixAnalysis {
  detectedTools: string[]
  relatedTools: string[]
  failures: string[]
  summary: string
}

let toolDB: ToolDB | null = null

async function loadToolDB(): Promise<ToolDB> {
  if (toolDB) return toolDB

  // Try multiple paths to find the tool database
  const paths = [
    join(dirname(fileURLToPath(import.meta.url)), "..", "tools", "db.json"),
    join(dirname(fileURLToPath(import.meta.url)), "tools", "db.json"),
    join(process.cwd(), "tools", "db.json"),
  ]

  for (const p of paths) {
    try {
      const data = await readFile(p, "utf8")
      toolDB = JSON.parse(data) as ToolDB
      return toolDB
    } catch {
      continue
    }
  }

  // Fallback: empty DB
  return { tools: [] }
}

export async function analyzePrompt(
  promptContent: string
): Promise<MatrixAnalysis> {
  const db = await loadToolDB()
  const detected = new Set<string>()
  const related = new Set<string>()
  const failures: string[] = []

  for (const tool of db.tools) {
    for (const pattern of tool.patterns) {
      try {
        const regex = new RegExp(pattern, "i")
        if (regex.test(promptContent)) {
          detected.add(tool.name)
          for (const r of tool.related) related.add(r)
          failures.push(...tool.failures)
          break // One match per tool is enough
        }
      } catch {
        // Invalid regex in DB, skip
      }
    }
  }

  // Remove detected tools from related (don't flag npm as "related" if it's already detected)
  for (const d of detected) related.delete(d)

  const detectedList = [...detected].sort()
  const relatedList = [...related].sort()

  let summary = ""
  if (detectedList.length > 0) {
    summary = `Detected: ${detectedList.join(", ")}`
    if (relatedList.length > 0) {
      summary += `. Related: ${relatedList.join(", ")}`
    }
    summary += `. ${failures.length} potential failure modes identified.`
  } else {
    summary = "No specific tools detected in prompt."
  }

  return {
    detectedTools: detectedList,
    relatedTools: relatedList,
    failures: [...new Set(failures)],
    summary,
  }
}

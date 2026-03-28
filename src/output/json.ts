import type { RunResult } from "../types.js"

export function renderJson(result: RunResult): void {
  console.log(JSON.stringify(result, null, 2))
}

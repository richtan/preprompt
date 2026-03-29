import { describe, it, expect } from "vitest"
import { formatFileTree } from "../src/commands/local.js"

describe("formatFileTree", () => {
  it("returns 'no files' for empty array", () => {
    expect(formatFileTree([])).toBe("no files")
  })

  it("returns single file as-is", () => {
    expect(formatFileTree(["package.json"])).toBe("package.json")
  })

  it("joins multiple root files with commas", () => {
    expect(formatFileTree(["package.json", "tsconfig.json"])).toBe("package.json, tsconfig.json")
  })

  it("groups files in subdirectory", () => {
    expect(formatFileTree(["src/index.ts", "src/app.tsx"])).toBe("src/{index.ts, app.tsx}")
  })

  it("mixes root and directory files", () => {
    const result = formatFileTree(["package.json", "src/index.ts", "src/app.tsx", "tsconfig.json"])
    expect(result).toBe("package.json, tsconfig.json, src/{index.ts, app.tsx}")
  })

  it("shows single file in directory without braces", () => {
    expect(formatFileTree(["src/index.ts"])).toBe("src/index.ts")
  })

  it("truncates when exceeding 80 chars", () => {
    const files = Array.from({ length: 20 }, (_, i) => `very-long-filename-${i}.ts`)
    const result = formatFileTree(files)
    expect(result.length).toBeLessThanOrEqual(85) // some slack for "+N more"
    expect(result).toContain("+")
    expect(result).toContain("more")
  })
})

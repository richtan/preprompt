import { describe, it, expect } from "vitest"
import { scanPrompt } from "../src/scanner.js"

describe("scanPrompt", () => {
  it("returns safe for a normal prompt", () => {
    const result = scanPrompt("Create a package.json and install react")
    expect(result.safe).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it("detects rm -rf", () => {
    const result = scanPrompt("First rm -rf /tmp/old then create new files")
    expect(result.safe).toBe(false)
    expect(result.warnings).toContain("rm -rf (recursive delete)")
  })

  it("detects DROP TABLE", () => {
    const result = scanPrompt("Run DROP TABLE users in the migration")
    expect(result.safe).toBe(false)
    expect(result.warnings).toContain("DROP TABLE (database)")
  })

  it("detects git push --force", () => {
    const result = scanPrompt("Then git push --force to origin")
    expect(result.safe).toBe(false)
    expect(result.warnings).toContain("git push --force")
  })

  it("detects git reset --hard", () => {
    const result = scanPrompt("Run git reset --hard HEAD~3")
    expect(result.safe).toBe(false)
    expect(result.warnings).toContain("git reset --hard")
  })

  it("detects multiple destructive patterns", () => {
    const result = scanPrompt("rm -rf node_modules && DROP TABLE users")
    expect(result.safe).toBe(false)
    expect(result.warnings).toHaveLength(2)
  })

  it("is case insensitive", () => {
    const result = scanPrompt("drop table Users")
    expect(result.safe).toBe(false)
  })
})

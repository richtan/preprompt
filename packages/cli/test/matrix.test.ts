import { describe, it, expect } from "vitest"
import { analyzePrompt } from "../src/matrix.js"

describe("analyzePrompt", () => {
  it("detects npm references", async () => {
    const result = await analyzePrompt("Run npm install to set up dependencies")
    expect(result.detectedTools).toContain("npm")
  })

  it("detects git references", async () => {
    const result = await analyzePrompt("Create a .gitignore file and run git init")
    expect(result.detectedTools).toContain("git")
  })

  it("detects multiple tools", async () => {
    const result = await analyzePrompt(
      "Run npm install, create a Dockerfile, and set up a .env file"
    )
    expect(result.detectedTools).toContain("npm")
    expect(result.detectedTools).toContain("docker")
    expect(result.detectedTools).toContain("env")
  })

  it("identifies related tools", async () => {
    const result = await analyzePrompt("Run npm install")
    expect(result.relatedTools).toContain("yarn")
    expect(result.relatedTools).toContain("pnpm")
    expect(result.relatedTools).toContain("bun")
  })

  it("collects failure modes", async () => {
    const result = await analyzePrompt("Run npm install")
    expect(result.failures.length).toBeGreaterThan(0)
    expect(result.failures).toContain("npm:missing")
  })

  it("returns empty for unrecognized prompt", async () => {
    const result = await analyzePrompt("Hello world, just a simple greeting")
    expect(result.detectedTools).toHaveLength(0)
    expect(result.summary).toContain("No specific tools detected")
  })

  it("detects TypeScript references", async () => {
    const result = await analyzePrompt(
      "Create a tsconfig.json and add TypeScript support"
    )
    expect(result.detectedTools).toContain("typescript")
  })

  it("detects Next.js references", async () => {
    const result = await analyzePrompt(
      "Set up a Next.js project with create-next-app"
    )
    expect(result.detectedTools).toContain("next")
  })

  it("does not double-count detected tools in related", async () => {
    const result = await analyzePrompt("Run npm install and yarn add react")
    // Both npm and yarn are detected, neither should appear in related
    expect(result.relatedTools).not.toContain("npm")
    expect(result.relatedTools).not.toContain("yarn")
  })
})

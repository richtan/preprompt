import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { buildAgentEnv, buildCheckEnv, ALL_SECRETS } from "../src/agents/env.js"

describe("buildAgentEnv", () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ALL_SECRETS) {
      saved[key] = process.env[key]
      process.env[key] = `test-${key}`
    }
    process.env.HOME = "/home/test"
    process.env.HTTP_PROXY = "http://proxy:8080"
  })

  afterEach(() => {
    for (const key of ALL_SECRETS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it("claude-code keeps ANTHROPIC_API_KEY, strips others", () => {
    const env = buildAgentEnv("claude-code")
    expect(env.ANTHROPIC_API_KEY).toBe("test-ANTHROPIC_API_KEY")
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.GITHUB_TOKEN).toBeUndefined()
  })

  it("codex keeps OPENAI_API_KEY, strips others", () => {
    const env = buildAgentEnv("codex")
    expect(env.OPENAI_API_KEY).toBe("test-OPENAI_API_KEY")
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()
  })

  it("opencode keeps both OPENAI and ANTHROPIC keys", () => {
    const env = buildAgentEnv("opencode")
    expect(env.OPENAI_API_KEY).toBe("test-OPENAI_API_KEY")
    expect(env.ANTHROPIC_API_KEY).toBe("test-ANTHROPIC_API_KEY")
    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.GITHUB_TOKEN).toBeUndefined()
  })

  it("cursor strips all secrets (auth managed by binary)", () => {
    const env = buildAgentEnv("cursor")
    for (const key of ALL_SECRETS) {
      expect(env[key]).toBeUndefined()
    }
  })

  it("gemini keeps GEMINI_API_KEY and GOOGLE_API_KEY", () => {
    const env = buildAgentEnv("gemini")
    expect(env.GEMINI_API_KEY).toBe("test-GEMINI_API_KEY")
    expect(env.GOOGLE_API_KEY).toBe("test-GOOGLE_API_KEY")
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it("copilot-cli keeps GITHUB_TOKEN and GH_TOKEN", () => {
    const env = buildAgentEnv("copilot-cli")
    expect(env.GITHUB_TOKEN).toBe("test-GITHUB_TOKEN")
    expect(env.GH_TOKEN).toBe("test-GH_TOKEN")
    expect(env.OPENAI_API_KEY).toBeUndefined()
  })

  it("unknown agent strips all secrets (safe default)", () => {
    const env = buildAgentEnv("unknown-agent")
    for (const key of ALL_SECRETS) {
      expect(env[key]).toBeUndefined()
    }
  })

  it("preserves non-secret env vars", () => {
    const env = buildAgentEnv("claude-code")
    expect(env.HOME).toBe("/home/test")
    expect(env.HTTP_PROXY).toBe("http://proxy:8080")
    expect(env.PATH).toBeDefined()
  })
})

describe("buildCheckEnv", () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ALL_SECRETS) {
      saved[key] = process.env[key]
      process.env[key] = `test-${key}`
    }
  })

  afterEach(() => {
    for (const key of ALL_SECRETS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it("strips all secrets", () => {
    const env = buildCheckEnv("/tmp/sandbox")
    for (const key of ALL_SECRETS) {
      expect(env[key]).toBeUndefined()
    }
  })

  it("prepends node_modules/.bin to PATH", () => {
    const env = buildCheckEnv("/tmp/sandbox")
    expect(env.PATH).toMatch(/^\/tmp\/sandbox\/node_modules\/\.bin:/)
  })
})

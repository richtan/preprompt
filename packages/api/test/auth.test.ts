import { describe, it, expect } from "vitest"
import {
  createJwt,
  verifyJwt,
  generateRefreshToken,
  generateApiToken,
  hashIp,
  checkRateLimit,
  getMaxAgents,
} from "../src/auth.js"

describe("JWT", () => {
  it("creates and verifies a JWT", async () => {
    const jwt = await createJwt("user-123", "testuser")
    const payload = await verifyJwt(jwt)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe("user-123")
    expect(payload!.login).toBe("testuser")
  })

  it("rejects invalid JWT", async () => {
    const payload = await verifyJwt("garbage-token")
    expect(payload).toBeNull()
  })

  it("rejects tampered JWT", async () => {
    const jwt = await createJwt("user-123", "testuser")
    const tampered = jwt.slice(0, -5) + "XXXXX"
    const payload = await verifyJwt(tampered)
    expect(payload).toBeNull()
  })
})

describe("Token generation", () => {
  it("generates unique refresh tokens", () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()
    expect(a).not.toBe(b)
    expect(a.length).toBe(64)
  })

  it("generates API tokens with pp_ prefix", () => {
    const token = generateApiToken()
    expect(token.startsWith("pp_")).toBe(true)
    expect(token.length).toBe(51) // "pp_" + 48 hex chars
  })
})

describe("IP hashing", () => {
  it("hashes consistently", () => {
    expect(hashIp("192.168.1.1")).toBe(hashIp("192.168.1.1"))
  })

  it("different IPs produce different hashes", () => {
    expect(hashIp("192.168.1.1")).not.toBe(hashIp("10.0.0.1"))
  })
})

describe("Rate limiting", () => {
  it("allows anon with low run count", () => {
    const result = checkRateLimit({ type: "anon", token: "test" }, 0)
    expect(result).toBeNull()
  })

  it("blocks anon after 3 runs", () => {
    const result = checkRateLimit({ type: "anon", token: "test" }, 3)
    expect(result).toContain("Free runs exceeded")
  })

  it("allows free user with low run count", () => {
    const result = checkRateLimit(
      { type: "user", userId: "u1", githubLogin: "test", plan: "free" },
      5
    )
    expect(result).toBeNull()
  })

  it("blocks free user after 10 runs", () => {
    const result = checkRateLimit(
      { type: "user", userId: "u1", githubLogin: "test", plan: "free" },
      10
    )
    expect(result).toContain("Daily run limit")
  })

  it("rejects null auth", () => {
    const result = checkRateLimit(null, 0)
    expect(result).toContain("Authentication required")
  })
})

describe("Max agents per tier", () => {
  it("anon gets 2", () => {
    expect(getMaxAgents({ type: "anon", token: "test" })).toBe(2)
  })

  it("free gets 4", () => {
    expect(getMaxAgents({ type: "user", userId: "u1", githubLogin: "test", plan: "free" })).toBe(4)
  })

  it("pro gets 4", () => {
    expect(getMaxAgents({ type: "user", userId: "u1", githubLogin: "test", plan: "pro" })).toBe(4)
  })

  it("null gets 0", () => {
    expect(getMaxAgents(null)).toBe(0)
  })
})

import { SignJWT, jwtVerify } from "jose"
import { createHash, randomBytes } from "node:crypto"
import type { Context, Next } from "hono"

const JWT_SECRET_RAW = process.env.JWT_SECRET ?? "dev-secret-change-in-production"
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW)
const JWT_ISSUER = "preprompt"
const JWT_EXPIRY = "1h"
const REFRESH_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Rate limits per tier
const RATE_LIMITS = {
  anon: { runsTotal: 3, concurrent: 1, maxAgents: 2 },
  free: { runsPerDay: 10, concurrent: 2, maxAgents: 4 },
  pro: { runsPerDay: 100, concurrent: 4, maxAgents: 4 },
} as const

export interface AuthUser {
  type: "user"
  userId: string
  githubLogin: string
  plan: "free" | "pro"
}

export interface AuthAnon {
  type: "anon"
  token: string
}

export type AuthResult = AuthUser | AuthAnon

// --- JWT ---

export async function createJwt(userId: string, githubLogin: string): Promise<string> {
  return new SignJWT({ sub: userId, login: githubLogin })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setExpirationTime(JWT_EXPIRY)
    .setIssuedAt()
    .sign(JWT_SECRET)
}

export async function verifyJwt(token: string): Promise<{ sub: string; login: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: JWT_ISSUER })
    return { sub: payload.sub as string, login: (payload as any).login as string }
  } catch {
    return null
  }
}

// --- Refresh tokens ---

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex")
}

export function isRefreshTokenExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > REFRESH_EXPIRY_MS
}

// --- API tokens (machine auth for CI) ---

export function generateApiToken(): string {
  return `pp_${randomBytes(24).toString("hex")}`
}

// --- Anonymous ---

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16)
}

// --- Middleware ---

/**
 * Auth middleware: extracts identity from request headers.
 * Does NOT reject unauthenticated requests — routes decide policy.
 *
 *   Authorization: Bearer <jwt>          → AuthUser
 *   Authorization: Bearer pp_<token>     → AuthUser (API token lookup)
 *   X-Anon-Token: <uuid>                → AuthAnon
 *   (none)                               → null
 */
export async function extractAuth(c: Context): Promise<AuthResult | null> {
  const authHeader = c.req.header("Authorization")

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)

    // API token (pp_ prefix)
    if (token.startsWith("pp_")) {
      // TODO: look up in DB
      return null
    }

    // JWT
    const jwt = await verifyJwt(token)
    if (jwt) {
      return {
        type: "user",
        userId: jwt.sub,
        githubLogin: jwt.login,
        plan: "free", // TODO: look up plan from DB
      }
    }

    return null // Invalid token
  }

  const anonToken = c.req.header("X-Anon-Token")
  if (anonToken) {
    return { type: "anon", token: anonToken }
  }

  return null
}

/**
 * Rate limit check. Returns null if allowed, error message if blocked.
 */
export function checkRateLimit(
  auth: AuthResult | null,
  _runCount: number
): string | null {
  if (!auth) {
    return "Authentication required. Run `preprompt login` or set PREPROMPT_TOKEN."
  }

  if (auth.type === "anon") {
    if (_runCount >= RATE_LIMITS.anon.runsTotal) {
      return "Free runs exceeded (3 total). Run `preprompt login` to continue."
    }
    return null
  }

  const limits = auth.plan === "pro" ? RATE_LIMITS.pro : RATE_LIMITS.free
  if (_runCount >= limits.runsPerDay) {
    return `Daily run limit reached (${limits.runsPerDay}/day on ${auth.plan} plan).`
  }

  return null
}

export function getMaxAgents(auth: AuthResult | null): number {
  if (!auth) return 0
  if (auth.type === "anon") return RATE_LIMITS.anon.maxAgents
  return auth.plan === "pro" ? RATE_LIMITS.pro.maxAgents : RATE_LIMITS.free.maxAgents
}

export { RATE_LIMITS }

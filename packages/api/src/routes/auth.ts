import { Hono } from "hono"
import { createJwt, generateRefreshToken, generateApiToken, verifyJwt } from "../auth.js"

export const auth = new Hono()

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? ""
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? ""
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://preprompt.dev"

// Exchange GitHub OAuth code for JWT + refresh token
auth.post("/github", async (c) => {
  const { code } = await c.req.json<{ code: string }>()

  if (!code) {
    return c.json({ error: "code is required" }, 400)
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return c.json({ error: "GitHub OAuth not configured" }, 503)
  }

  // Exchange code for GitHub access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  const tokenBody = await tokenRes.json() as Record<string, unknown>
  if (tokenBody.error) {
    return c.json({ error: `GitHub OAuth failed: ${tokenBody.error_description ?? tokenBody.error}` }, 401)
  }

  const accessToken = tokenBody.access_token as string

  // Fetch GitHub user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!userRes.ok) {
    return c.json({ error: "Failed to fetch GitHub user" }, 502)
  }

  const ghUser = await userRes.json() as { id: number; login: string; email: string | null }

  // TODO: upsert user in DB
  const userId = crypto.randomUUID() // Placeholder until DB wired

  const jwt = await createJwt(userId, ghUser.login)
  const refreshToken = generateRefreshToken()

  // TODO: store refresh token in DB associated with userId

  return c.json({
    jwt,
    refreshToken,
    user: {
      id: userId,
      githubLogin: ghUser.login,
      email: ghUser.email,
    },
  })
})

// Refresh JWT using refresh token
auth.post("/refresh", async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>()

  if (!refreshToken) {
    return c.json({ error: "refreshToken is required" }, 400)
  }

  // TODO: look up refresh token in DB, validate, rotate
  return c.json({ error: "not implemented" }, 501)
})

// Generate machine API token (for CI)
auth.post("/token", async (c) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "authentication required" }, 401)
  }

  const jwt = await verifyJwt(authHeader.slice(7))
  if (!jwt) {
    return c.json({ error: "invalid token" }, 401)
  }

  const apiToken = generateApiToken()

  // TODO: store apiToken in DB associated with user

  return c.json({ token: apiToken })
})

// Get current user
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "not authenticated" }, 401)
  }

  const jwt = await verifyJwt(authHeader.slice(7))
  if (!jwt) {
    return c.json({ error: "invalid token" }, 401)
  }

  // TODO: fetch full user from DB
  return c.json({
    id: jwt.sub,
    githubLogin: jwt.login,
  })
})

// OAuth redirect URL (for CLI login flow)
auth.get("/github/url", (c) => {
  if (!GITHUB_CLIENT_ID) {
    return c.json({ error: "GitHub OAuth not configured" }, 503)
  }

  const redirectUri = `${FRONTEND_URL}/auth/callback`
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email`

  return c.json({ url })
})

import { Hono } from "hono"

export const auth = new Hono()

// GitHub OAuth callback
auth.post("/github", async (c) => {
  // TODO: exchange code for token, create/update user, return JWT
  return c.json({ error: "not implemented" }, 501)
})

// Refresh JWT
auth.post("/refresh", async (c) => {
  // TODO: validate refresh token, issue new JWT
  return c.json({ error: "not implemented" }, 501)
})

// Get current user
auth.get("/me", async (c) => {
  // TODO: validate JWT, return user info
  return c.json({ error: "not implemented" }, 501)
})

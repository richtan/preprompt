import { randomUUID } from "node:crypto"
import { loadConfig, saveConfig } from "./config.js"

/**
 * Get auth headers for API requests.
 *
 *   Priority:
 *   1. PREPROMPT_TOKEN env var (CI machine token)
 *   2. JWT from config (authenticated user)
 *   3. Anonymous token from config (auto-generated)
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  // CI machine token
  const envToken = process.env.PREPROMPT_TOKEN
  if (envToken) {
    return { Authorization: `Bearer ${envToken}` }
  }

  const config = await loadConfig()

  // Authenticated user
  if (config.jwt) {
    return { Authorization: `Bearer ${config.jwt}` }
  }

  // API token from config
  if (config.apiToken) {
    return { Authorization: `Bearer ${config.apiToken}` }
  }

  // Anonymous: generate and persist a token
  if (!config.anonToken) {
    config.anonToken = randomUUID()
    await saveConfig(config)
  }

  return { "X-Anon-Token": config.anonToken }
}

export async function isLoggedIn(): Promise<boolean> {
  const config = await loadConfig()
  return !!(config.jwt || config.apiToken || process.env.PREPROMPT_TOKEN)
}

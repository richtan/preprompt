import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".preprompt")
const CONFIG_FILE = join(CONFIG_DIR, "config.json")

export interface CloudConfig {
  apiUrl: string
  anonToken?: string
  jwt?: string
  refreshToken?: string
  apiToken?: string // PREPROMPT_TOKEN for CI
}

const DEFAULT_API_URL = "https://api.preprompt.dev"

export async function loadConfig(): Promise<CloudConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8")
    const parsed = JSON.parse(raw)
    return { apiUrl: DEFAULT_API_URL, ...parsed }
  } catch {
    return { apiUrl: DEFAULT_API_URL }
  }
}

export async function saveConfig(config: CloudConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n")
}

export async function getApiUrl(): Promise<string> {
  return process.env.PREPROMPT_API_URL ?? (await loadConfig()).apiUrl
}

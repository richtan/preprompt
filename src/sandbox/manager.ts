import { mkdtemp, rm, cp, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

export interface Sandbox {
  dir: string
  destroy(): Promise<void>
}

export async function createSandbox(): Promise<Sandbox> {
  const dir = await mkdtemp(join(tmpdir(), "preprompt-"))

  return {
    dir,
    async destroy() {
      await rm(dir, { recursive: true, force: true })
    },
  }
}

export async function seedSandbox(
  sandboxDir: string,
  promptFile: string | null
): Promise<void> {
  // If prompt references files relative to cwd, we could copy them here.
  // For Phase 1, we just ensure the sandbox dir exists and is clean.
  // The agent will create everything from the prompt instructions.

  if (promptFile) {
    // Copy the prompt file into the sandbox so the agent can reference it
    const destPath = join(sandboxDir, "PROMPT.md")
    await cp(promptFile, destPath)
  }
}

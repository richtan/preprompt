import { mkdtemp, rm } from "node:fs/promises"
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


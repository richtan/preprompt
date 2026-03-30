import { Sandbox } from "e2b"
import type { SandboxHandle, SandboxProvider } from "./provider.js"

class E2BSandboxHandle implements SandboxHandle {
  id: string
  private sandbox: Sandbox

  constructor(sandbox: Sandbox) {
    this.sandbox = sandbox
    this.id = sandbox.sandboxId
  }

  async exec(
    command: string,
    opts?: {
      timeout?: number
      env?: Record<string, string>
      onStdout?: (chunk: string) => void
      onStderr?: (chunk: string) => void
    }
  ) {
    const result = await this.sandbox.commands.run(command, {
      timeoutMs: opts?.timeout ?? 120_000,
      envs: opts?.env,
      onStdout: opts?.onStdout ? (data) => opts.onStdout!(data.line) : undefined,
      onStderr: opts?.onStderr ? (data) => opts.onStderr!(data.line) : undefined,
    })

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }

  async writeFile(path: string, content: string) {
    await this.sandbox.files.write(path, content)
  }

  async listFiles(path: string) {
    const entries = await this.sandbox.files.list(path)
    return entries.map((e) => ({
      path: e.name,
      type: (e.type === "dir" ? "directory" : "file") as "file" | "directory",
      size: 0, // E2B doesn't expose size in list
    }))
  }

  async destroy() {
    await this.sandbox.kill()
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  async create(opts: { template: string; env?: Record<string, string> }) {
    const apiKey = process.env.E2B_API_KEY
    if (!apiKey) {
      throw new Error("E2B_API_KEY is not set")
    }

    const sandbox = await Sandbox.create(opts.template, {
      apiKey,
      envs: opts.env,
      timeoutMs: 300_000, // 5 min max sandbox lifetime
    })

    return new E2BSandboxHandle(sandbox)
  }
}


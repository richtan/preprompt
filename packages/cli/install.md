# Install PrePrompt

PrePrompt tests AI prompts across every coding agent. One command, every agent, see what happened.

Install it globally:

```bash
npm install -g preprompt
```

Verify it works:

```bash
preprompt --version
```

If `preprompt` is not found, add npm's global bin to your PATH:

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

Then add that line to your shell profile (~/.zshrc or ~/.bashrc) so it persists.

Check which AI agents are available on this machine:

```bash
preprompt list
```

You need at least one agent showing "ready". If none are found, install one:

- Claude Code: `npm install -g @anthropic-ai/claude-code` then `claude login`
- Codex: `npm install -g @openai/codex` then `codex login`
- GitHub Copilot CLI: `gh extension install github/gh-copilot`

Run a quick test to confirm everything works:

```bash
preprompt "Create a file called hello.txt containing Hello World"
```

Done. Run `preprompt --help` to see all commands.

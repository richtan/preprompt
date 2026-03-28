#!/bin/bash
# Mock agent for testing pstack. Creates predictable files in $CWD.
# Simulates a real AI agent that follows setup instructions.

# Parse args — we look for the working directory
CWD="."
while [[ $# -gt 0 ]]; do
  case $1 in
    --cwd) CWD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

cd "$CWD" 2>/dev/null || exit 1

# Create some predictable files
mkdir -p src
echo '{"name": "test-project", "version": "1.0.0"}' > package.json
echo 'node_modules/' > .gitignore
echo 'DATABASE_URL=postgres://localhost/test' > .env.example
echo 'export default function App() { return <h1>Hello</h1> }' > src/app.tsx
echo 'console.log("setup complete")' > src/index.ts

echo "Mock agent: created 5 files in $CWD"
exit 0

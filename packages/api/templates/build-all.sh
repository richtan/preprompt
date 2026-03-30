#!/bin/bash
set -e

# Build all E2B sandbox templates for PrePrompt agents
# Run: ./templates/build-all.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

for agent_dir in "$SCRIPT_DIR"/*/; do
  agent=$(basename "$agent_dir")
  [ ! -f "$agent_dir/e2b.Dockerfile" ] && continue

  template_name="preprompt-$agent"
  echo "Building template: $template_name"
  e2b template build \
    -n "$template_name" \
    -d "$agent_dir/e2b.Dockerfile" \
    --cmd "echo ready"
  echo "✓ $template_name built"
  echo ""
done

echo "All templates built. List with: e2b template list"

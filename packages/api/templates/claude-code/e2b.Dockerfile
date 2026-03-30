FROM node:22-slim

# System deps
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Git config (agents often need this)
RUN git config --global user.name "preprompt" && \
    git config --global user.email "sandbox@preprompt.dev" && \
    git config --global init.defaultBranch main

# Working directory — must be writable by sandbox user (uid 1001)
WORKDIR /workspace
RUN git init && chmod -R 777 /workspace

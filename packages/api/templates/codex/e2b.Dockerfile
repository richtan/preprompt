FROM node:22-slim

# System deps
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# Install Codex CLI
RUN npm install -g @openai/codex

# Git config
RUN git config --global user.name "preprompt" && \
    git config --global user.email "sandbox@preprompt.dev" && \
    git config --global init.defaultBranch main

# Working directory
WORKDIR /workspace
RUN git init

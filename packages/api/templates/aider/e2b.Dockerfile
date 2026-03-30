FROM python:3.12-slim

# System deps
RUN apt-get update && apt-get install -y git curl nodejs npm && rm -rf /var/lib/apt/lists/*

# Install aider
RUN pip install --no-cache-dir aider-chat

# Git config
RUN git config --global user.name "preprompt" && \
    git config --global user.email "sandbox@preprompt.dev" && \
    git config --global init.defaultBranch main

# Working directory
WORKDIR /workspace
RUN git init && chmod -R 777 /workspace

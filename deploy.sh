#!/bin/bash

# deploy.sh - Quick git push script for Logis Master (Linux version)
# Usage: ./deploy.sh "commit message here"
# Or just: ./deploy.sh (will use auto-generated message)

MESSAGE=$1

# Auto-generate commit message if not provided
if [ -z "$MESSAGE" ]; then
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
    MESSAGE="update: deploy at $TIMESTAMP"
fi

echo ""
echo -e "\e[36m=== Logis Master - Git Deploy ===\e[0m"
echo ""

# Stage all changes
echo -e "\e[33m[1/3] Staging changes...\e[0m"
git add -A

# Show status
STATUS=$(git status --short)
if [ -z "$STATUS" ]; then
    echo -e "\e[37mNo changes to commit.\e[0m"
    exit 0
fi
echo -e "\e[90m$STATUS\e[0m"

# Commit
echo ""
echo -e "\e[33m[2/3] Committing: $MESSAGE\e[0m"
git commit -m "$MESSAGE"

# Push
echo ""
echo -e "\e[33m[3/3] Pushing to origin/main...\e[0m"
git push origin main

echo ""
echo -e "\e[32m=== Done! ===\e[0m"

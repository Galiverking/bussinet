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

# Commit if there are changes
STATUS=$(git status --short)
if [ -n "$STATUS" ]; then
    echo -e "\e[90m$STATUS\e[0m"
    echo ""
    echo -e "\e[33m[2/3] Committing: $MESSAGE\e[0m"
    git commit -m "$MESSAGE"
else
    echo -e "\e[37mNo new changes to commit.\e[0m"
    echo -e "\e[33m[2/3] Skipping commit (working tree clean).\e[0m"
fi

# Check for unpushed commits
UNPUSHED=$(git rev-list --count origin/main..main 2>/dev/null)

if [ "$UNPUSHED" -gt 0 ] 2>/dev/null || [ -z "$UNPUSHED" ]; then
    # Push
    echo ""
    echo -e "\e[33m[3/3] Pushing $UNPUSHED commit(s) to origin/main...\e[0m"
    git push origin main
else
    echo ""
    echo -e "\e[32mEverything is already up to date on GitHub.\e[0m"
fi

echo ""
echo -e "\e[32m=== Done! ===\e[0m"

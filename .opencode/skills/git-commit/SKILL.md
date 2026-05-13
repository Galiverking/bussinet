---
name: git-commit
description: Stage files and commit with descriptive messages
---

## What I do

1. **Show status** - Run `git status` to show changed files
2. **Show diff** - Run `git diff --stat` to show changes summary
3. **Ask user** - Ask which files to stage (or stage all if user says "all")
4. **Suggest format** - Use Conventional Commits format:
   ```
   <type>(<scope>): <description>

   [optional body]

   [optional footer]
   ```
   Types:
   - `feat:` new feature
   - `fix:` bug fix
   - `refactor:` code refactoring
   - `docs:` documentation
   - `style:` formatting only
   - `test:` adding tests
   - `chore:` maintenance (deps, configs)
   - `perf:` performance improvement
5. **Commit** - Run `git add <files>` then `git commit -m "message"`
6. **Push** - If user asks to push: confirm first, then run `git push`

## Rules

- NEVER update git config
- NEVER run destructive commands (force push, hard reset)
- NEVER skip hooks (--no-verify, --no-gpg-sign)
- Only commit files the user explicitly requests
- Verify with `git status` after commit
- Show the commit URL after successful push

## When to use me

- User wants to commit files
- User says "commit", "git commit", "บันทึก", "commit เลย"
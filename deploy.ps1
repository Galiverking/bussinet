# deploy.ps1 - Quick git push script for Logis Master
# Usage: .\deploy.ps1 "commit message here"
# Or just: .\deploy.ps1 (will use auto-generated message)

param(
    [string]$Message = ""
)

# Auto-generate commit message if not provided
if ([string]::IsNullOrWhiteSpace($Message)) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "update: deploy at $timestamp"
}

Write-Host ""
Write-Host "=== Logis Master - Git Deploy ===" -ForegroundColor Cyan
Write-Host ""

# Stage all changes
Write-Host "[1/3] Staging changes..." -ForegroundColor Yellow
git add -A

# Show status
$status = git status --short
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "No changes to commit." -ForegroundColor Gray
    exit 0
}
Write-Host $status -ForegroundColor DarkGray

# Commit
Write-Host ""
Write-Host "[2/3] Committing: $Message" -ForegroundColor Yellow
git commit -m $Message

# Push
Write-Host ""
Write-Host "[3/3] Pushing to origin/main..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green

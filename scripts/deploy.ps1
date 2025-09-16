param(
  [string]$Message
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Ensure we run from repo root
Set-Location -Path (Join-Path $PSScriptRoot '..')

if (-not $Message -or $Message.Trim() -eq '') {
  $timestamp = Get-Date -Format 'yyyy-MM-dd HHmmss'
  $Message = "chore: deploy $timestamp"
}

Write-Host 'Checking git status...'
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Error 'This does not appear to be a git repository.'
}

# Ensure main branch exists locally
git rev-parse --verify main *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Local branch 'main' not found. Creating from current HEAD."
  git branch -M main
}

# Ensure remote origin is set
$desiredRemote = 'https://github.com/Maomao-2004/Guardientry.git'
$currentRemote = ''
try {
  $currentRemote = (git remote get-url origin) 2>$null
} catch {}

if (-not $currentRemote) {
  Write-Host "Setting remote 'origin' to $desiredRemote"
  git remote add origin $desiredRemote
} elseif ($currentRemote.Trim().ToLower() -ne $desiredRemote.ToLower()) {
  Write-Host "Updating remote 'origin' URL to $desiredRemote"
  git remote set-url origin $desiredRemote
}

Write-Host 'Staging changes...'
git add -A

# Only commit if there are staged changes
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  Write-Host "Committing with message: $Message"
  git commit -m $Message
} else {
  Write-Host 'No staged changes to commit. Proceeding to push.'
}

Write-Host 'Pushing to origin/main...'
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  throw 'Push failed. Ensure you have access and are authenticated.'
}

Write-Host 'Deployment push complete.'



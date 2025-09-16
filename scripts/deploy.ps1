Param(
  [Parameter(Position=0, Mandatory=$false, ValueFromRemainingArguments=$true)]
  [string]$Message
)

Write-Output "Deploying changes from Cursor to GitHub..."

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
  Write-Error "Not a Git repository. Run this from the project root."; exit 1
}

try {
  git remote get-url origin *> $null
} catch {
  Write-Output "Setting remote origin to https://github.com/Maomao-2004/Guardientry.git"
  git remote add origin https://github.com/Maomao-2004/Guardientry.git
}

git checkout -B main *> $null

if (-not $Message -or $Message.Trim() -eq "") {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $Message = "chore: deploy from Cursor $now"
}

git add -A
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "$Message"
} else {
  Write-Output "No changes to commit; proceeding to push."
}

git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Error "Push failed. You may need to authenticate in your browser or configure credentials."; exit 1
}

Write-Output "Deploy complete."



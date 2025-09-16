@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Usage: scripts\deploy.cmd "feat: my change"

REM Ensure we run from repo root
cd /d %~dp0..

REM Determine commit message
set MESSAGE=%~1
if "%MESSAGE%"=="" (
  for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set TODAY=%%a-%%b-%%c
  for /f "tokens=1-3 delims=:." %%h in ("%time%") do set NOW=%%h%%i%%j
  set MESSAGE=chore: deploy %TODAY% %NOW%
)

echo Checking git status...
git rev-parse --is-inside-work-tree >NUL 2>&1
if errorlevel 1 (
  echo This does not appear to be a git repository.
  exit /b 1
)

REM Ensure main branch exists locally
git rev-parse --verify main >NUL 2>&1
if errorlevel 1 (
  echo Local branch 'main' not found. Creating from current HEAD.
  git branch -M main
)

REM Ensure remote origin is set
git remote get-url origin >NUL 2>&1
if errorlevel 1 (
  echo Setting remote 'origin' to https://github.com/Maomao-2004/Guardientry.git
  git remote add origin https://github.com/Maomao-2004/Guardientry.git
) else (
  for /f "usebackq tokens=*" %%r in (`git remote get-url origin`) do set CURRENT_REMOTE=%%r
  if /I not "%CURRENT_REMOTE%"=="https://github.com/Maomao-2004/Guardientry.git" (
    echo Updating remote 'origin' URL to https://github.com/Maomao-2004/Guardientry.git
    git remote set-url origin https://github.com/Maomao-2004/Guardientry.git
  )
)

echo Staging changes...
git add -A

REM Only commit if there are staged changes
git diff --cached --quiet
if errorlevel 1 (
  echo Committing with message: %MESSAGE%
  git commit -m "%MESSAGE%"
) else (
  echo No staged changes to commit. Proceeding to push.
)

echo Pushing to origin/main...
git push -u origin main
if errorlevel 1 (
  echo Push failed. Ensure you have access and are authenticated.
  exit /b 1
)

echo Deployment push complete.
exit /b 0



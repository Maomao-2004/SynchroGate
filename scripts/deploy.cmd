@echo off
setlocal enabledelayedexpansion

REM Deploy changes from Cursor to GitHub origin/main
REM Usage: scripts\deploy.cmd [optional commit message]

set MSG=%*
if "%MSG%"=="" (
  for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set TODAY=%%a-%%b-%%c
  set MSG=chore: deploy from Cursor !TODAY! %time%
)

REM Ensure we are in a Git repository
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Error: Not a Git repository. Run this script from the project root.
  exit /b 1
)

REM Ensure remote origin exists
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo Setting remote origin to https://github.com/Maomao-2004/Guardientry.git
  git remote add origin https://github.com/Maomao-2004/Guardientry.git
)

REM Ensure we are on main branch
git checkout -B main >nul 2>&1
if errorlevel 1 (
  echo Error: Failed to checkout/create branch main.
  exit /b 1
)

REM Stage and commit
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
) else (
  echo No changes to commit; proceeding to push.
)

REM Push to origin/main
git push -u origin main
if errorlevel 1 (
  echo Push failed. You may need to authenticate in your browser or set up credentials.
  exit /b 1
)

echo Deploy complete.
endlocal



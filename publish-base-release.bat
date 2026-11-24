@echo off
REM ============================================================
REM  LinkNest — Publish portable (base) App Updates release
REM  Double-click this file from the repo root.
REM
REM  What it does:
REM    1. Bumps patch version (2.3.8 -> 2.3.9) unless you pass -Version
REM    2. Commits package.json if needed and pushes the current branch
REM    3. Builds a portable ZIP (Vite base ./ ) and publishes GitHub Release
REM
REM  Auth (first matching wins):
REM    GITHUB_TOKEN / GH_TOKEN,  gh auth login,  or Git Credential Manager
REM
REM  Examples:
REM    publish-base-release.bat
REM    publish-base-release.bat -Yes
REM    publish-base-release.bat -Bump minor
REM    publish-base-release.bat -Version 2.4.0
REM    publish-base-release.bat -DryRun
REM
REM  Docs: docs\APP_UPDATES.md
REM ============================================================
echo.
echo  LinkNest portable App Updates release
echo  Current branch will be tagged and published (Vite base ./ ).
if not "%~1"=="" (
    echo  Extra options: %*
)
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish-base-release.ps1" %*
set "ERR=%ERRORLEVEL%"

if %ERR% NEQ 0 (
    echo.
    echo  *** Publish FAILED. See error messages above. ***
    echo  Need a GitHub token with repo scope if git login is not enough:
    echo    https://github.com/settings/tokens/new?scopes=repo^&description=LinkNest%%20Publish
    echo    set GITHUB_TOKEN=ghp_...
    echo.
    pause
    exit /b %ERR%
)

echo.
echo  Done. In the app: Admin -^> App Updates -^> Check for updates -^> select the new Release.
echo  Docs: docs\APP_UPDATES.md
echo.
pause
exit /b 0

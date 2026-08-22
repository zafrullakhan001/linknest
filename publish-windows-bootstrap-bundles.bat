@echo off
REM ============================================================
REM  LinkNest — Publish Windows bootstrap bundles to GitHub
REM  Double-click this file from the repo root.
REM
REM  What it does:
REM    1. Rebuilds Apache + PHP 8.5 runtime ZIP (D:\Apache + D:\php)
REM    2. Rebuilds full LinkNest deploy ZIP (fresh DB by default)
REM    3. Uploads both to GitHub Release tag apache-php85-runtime
REM       (does NOT become GitHub Latest; App Updates ignores this tag)
REM
REM  Auth (first matching wins):
REM    GITHUB_TOKEN / GH_TOKEN,  gh auth login,  or Git Credential Manager
REM
REM  Examples:
REM    publish-windows-bootstrap-bundles.bat
REM    publish-windows-bootstrap-bundles.bat -Yes
REM    publish-windows-bootstrap-bundles.bat -SkipUpload
REM    publish-windows-bootstrap-bundles.bat -IncludeDatabase -Yes
REM    publish-windows-bootstrap-bundles.bat -SkipRuntime
REM    publish-windows-bootstrap-bundles.bat -SkipApp
REM
REM  Docs: docs\WINDOWS_BOOTSTRAP_BUNDLES.md
REM ============================================================
echo.
echo  LinkNest Windows bootstrap bundles
echo  Rebuild Apache/PHP runtime + LinkNest deploy ZIP, upload to GitHub.
if not "%~1"=="" (
    echo  Extra options: %*
)
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish-windows-bootstrap-bundles.ps1" %*
set "ERR=%ERRORLEVEL%"

if %ERR% NEQ 0 (
    echo.
    echo  *** Publish FAILED. See error messages above. ***
    echo  Need a GitHub token with repo scope if git login is not enough:
    echo    https://github.com/settings/tokens/new?scopes=repo^&description=LinkNest%%20Publish
    echo    set GITHUB_TOKEN=ghp_...
    echo  Docs: docs\WINDOWS_BOOTSTRAP_BUNDLES.md
    echo.
    pause
    exit /b %ERR%
)

echo.
echo  Done. Download from GitHub Release tag apache-php85-runtime
echo  Docs: docs\WINDOWS_BOOTSTRAP_BUNDLES.md
echo.
pause
exit /b 0

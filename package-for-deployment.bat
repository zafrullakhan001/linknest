@echo off
REM ============================================================
REM  LinkNest — Deployment Packager Launcher (Windows / XAMPP)
REM  Double-click this file to clean-build and package the app.
REM
REM  Default: FRESH package (no live SQLite DB from this PC).
REM  On the target PC: extract ZIP -> deploy-xampp.bat
REM  Upgrading an existing install: update-xampp.bat (keeps data/)
REM
REM  Optional flags (edit the powershell line below if needed):
REM    -IncludeDatabase   ship this PC's data/linknest.db
REM    -ExcludeUploads    skip uploads/
REM    -SkipBuild         reuse existing dist/ (not recommended)
REM    -BasePath "/name"  bake a different subfolder base path
REM    -OutputDir "E:\"   write ZIP somewhere else
REM ============================================================
echo.
echo  Starting LinkNest Deployment Packager...
echo  This will wipe dist/, rebuild production assets, and create a ZIP.
echo  Default DB mode: FRESH (empty data/ on the other computer).
echo.

REM Run the PowerShell script — bypass execution policy for this session only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-for-deployment.ps1"
set "ERR=%ERRORLEVEL%"

if %ERR% NEQ 0 (
    echo.
    echo  *** Packaging FAILED. See error messages above. ***
    echo.
    pause
    exit /b %ERR%
)

echo.
echo  Packaging finished. Copy the newest linknest-deploy-*.zip to the other PC.
echo.
pause
exit /b 0

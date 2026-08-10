@echo off
REM ============================================================
REM  LinkNest — Deployment Packager Launcher (Windows / XAMPP)
REM  Double-click this file to clean-build and package the app.
REM
REM  Default: FRESH package (no live SQLite DB from this PC).
REM  On the target PC: extract ZIP -> deploy-xampp.bat
REM  Upgrading an existing install: update-xampp.bat (keeps data/)
REM
REM  Package includes: production dist/, vendor/, SQLite DLL runtime,
REM  bin/ (ttyd + websockify for SSH/VNC Easy), updater APIs, docs,
REM  and PHP upgrade scripts (upgrade-xampp-php.bat + scripts/upgrade-xampp-php*.ps1).
REM
REM  Pass any package-for-deployment.ps1 flags after this .bat name:
REM    package-for-deployment.bat
REM    package-for-deployment.bat -IncludeDatabase
REM    package-for-deployment.bat -ExcludeUploads
REM    package-for-deployment.bat -SkipBuild
REM    package-for-deployment.bat -SkipSqliteRuntime
REM    package-for-deployment.bat -SkipRemoteRuntime
REM    package-for-deployment.bat -BasePath "/myapp"
REM    package-for-deployment.bat -OutputDir "E:\"
REM    package-for-deployment.bat -IncludeDatabase -ExcludeUploads -OutputDir "D:\zips"
REM
REM  Or run PowerShell directly:
REM    powershell -ExecutionPolicy Bypass -File .\package-for-deployment.ps1 -IncludeDatabase
REM ============================================================
echo.
echo  Starting LinkNest Deployment Packager...
echo  This will wipe dist/, rebuild production assets, and create a ZIP.
echo  Default DB mode: FRESH (empty data/ on the other computer).
echo  Also packages bin/ttyd + websockify for remote widgets (SSH/VNC).
echo  Also packages PHP upgrade scripts for target XAMPP (8.5+ / LDAP-gated).
if not "%~1"=="" (
    echo  Extra options: %*
)
echo.

REM Forward all CLI args to PowerShell — bypass execution policy for this session only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-for-deployment.ps1" %*
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
echo  Target needs: XAMPP + (for remote widgets) Python 3 and OpenSSH Client.
echo  On target: deploy-xampp.bat / update-xampp.bat, then optional upgrade-xampp-php.bat
echo.
pause
exit /b 0

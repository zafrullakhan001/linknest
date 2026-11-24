@echo off
REM ============================================================
REM  LinkNest — Deployment Packager Launcher (Windows / XAMPP)
REM  Double-click this file to clean-build and package the app.
REM
REM  Default: FRESH FULL package (no live SQLite DB from this PC).
REM  On the target PC: extract ZIP -> deploy-xampp.bat
REM  Upgrading an existing install: update-xampp.bat (keeps data/)
REM
REM  FULL package includes: production dist/, vendor/, SQLite DLL runtime,
REM  bin/ (ttyd + websockify for SSH/VNC Easy), updater APIs, docs,
REM  PHP upgrade scripts, harden-xampp-target.ps1, and remote deploy helpers
REM  (deploy-remote-xampp.bat + scripts/deploy-remote-xampp.ps1).
REM
REM  APP-ONLY lean package (-AppOnly): just the application ZIP —
REM  dist/api/vendor + deploy/update/verify helpers. No SQLite DLL upgrade,
REM  no ttyd/websockify bin/, no PHP-upgrade or remote-push tooling.
REM  Use when the target XAMPP/PHP/SQLite is already ready.
REM  ZIP name: linknest-app-YYYYMMDD_HHMMSS.zip
REM
REM  deploy-xampp.bat / update-xampp.bat call harden-xampp-target.ps1 which:
REM    - creates %XAMPP%\tmp, ACLs, enables curl/sqlite, PHP 8.5 OPcache
REM    - saves SSH Gateway ttyd/ssh paths via direct SQLite (NO api/config.php
REM      bootstrap / migrations during deploy — avoids NativeCommandError noise)
REM
REM  Local package examples:
REM    package-for-deployment.bat
REM    package-for-deployment.bat -AppOnly
REM    package-for-deployment.bat -AppOnly -IncludeDatabase -BasePath "/link2"
REM    package-for-deployment.bat -IncludeDatabase
REM    package-for-deployment.bat -ExcludeUploads
REM    package-for-deployment.bat -SkipBuild
REM    package-for-deployment.bat -SkipSqliteRuntime
REM    package-for-deployment.bat -SkipRemoteRuntime
REM    package-for-deployment.bat -BasePath "/myapp"
REM    package-for-deployment.bat -OutputDir "E:\"
REM
REM  Package + push to a remote Windows host (SMB + elevated schtasks):
REM    package-for-deployment.bat -RemoteHost 192.168.0.197 -RemoteUser administrator
REM    package-for-deployment.bat -IncludeDatabase -RemoteHost 192.168.0.197 -RemoteMode Fresh
REM    package-for-deployment.bat -RemoteHost office-pc -RemoteMode Update -IncludeXamppRuntime
REM
REM  Or package first, then deploy later:
REM    deploy-remote-xampp.bat -ComputerName 192.168.0.197 -ZipPath .\linknest-deploy-....zip
REM
REM  Docs: docs\PACKAGE_FOR_DEPLOYMENT.md , docs\OFFICE_WIN2022_DEPLOY.md
REM  New vanilla Apache host (runtime ZIP + this ZIP + GitHub):
REM    publish-windows-bootstrap-bundles.bat
REM    Docs: docs\WINDOWS_BOOTSTRAP_BUNDLES.md
REM ============================================================
echo.
echo  Starting LinkNest Deployment Packager...
echo  This will wipe dist/, rebuild production assets, and create a ZIP.
echo  Default DB mode: FRESH (empty data/ on the other computer).
echo  Default package : FULL (SQLite DLL + ttyd + PHP-upgrade helpers).
echo  Lean app-only   : add -AppOnly  (no SQLite/ttyd/PHP-upgrade extras).
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
echo  Packaging finished.
echo  Local target : extract ZIP -^> deploy-xampp.bat / update-xampp.bat
echo  App-only tip : -AppOnly ZIPs skip SQLite/ttyd/PHP-upgrade; use when target is ready.
echo  Remote target: deploy-remote-xampp.bat -ComputerName HOST -ZipPath ^<zip^>
echo                 ^(or pass -RemoteHost during packaging to push automatically^)
echo  Then optional: upgrade-xampp-php.bat  ^(PHP 8.5+; full packages only^)
echo  Harden note  : deploy saves ttyd paths without running DB migrations.
echo  Docs: docs\PACKAGE_FOR_DEPLOYMENT.md
echo.
pause
exit /b 0

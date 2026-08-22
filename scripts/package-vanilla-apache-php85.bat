@echo off
REM Rebuild Apache Lounge + PHP 8.5 TS ZIP (extract to D:\). Gitignored output.
REM Also: publish-windows-bootstrap-bundles.bat  (runtime + app ZIP + GitHub upload)
REM Docs: docs\VANILLA_APACHE_PHP85_WINDOWS.md  docs\WINDOWS_BOOTSTRAP_BUNDLES.md
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-vanilla-apache-php85.ps1" %*
endlocal

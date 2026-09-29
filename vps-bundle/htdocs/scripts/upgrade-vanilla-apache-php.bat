@echo off
REM In-place patch of D:\Apache + D:\php (keeps httpd.conf, php.ini, htdocs).
REM Docs: docs\VANILLA_APACHE_PHP_UPGRADE.md
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upgrade-vanilla-apache-php.ps1" %*
set "ERR=%ERRORLEVEL%"
echo.
if %ERR% NEQ 0 (
  echo Patch FAILED. See messages above. Docs: docs\VANILLA_APACHE_PHP_UPGRADE.md
) else (
  echo Patch finished. Open http://localhost/linknest/health.php
)
pause
exit /b %ERR%

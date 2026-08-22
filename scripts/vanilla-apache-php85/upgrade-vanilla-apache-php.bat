@echo off
REM Payload copy: lives next to D:\php and D:\Apache after extracting the runtime ZIP.
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Run this file as Administrator.
  pause
  exit /b 1
)
if not exist "%~dp0upgrade-vanilla-apache-php.ps1" (
  echo upgrade-vanilla-apache-php.ps1 missing next to this file.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upgrade-vanilla-apache-php.ps1" %*
set "ERR=%ERRORLEVEL%"
echo.
if %ERR% NEQ 0 (
  echo Patch FAILED.
) else (
  echo Patch finished. Open http://localhost/linknest/health.php
)
pause
exit /b %ERR%

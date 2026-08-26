@echo off
REM Register LinkNest monitoring workers in Windows Task Scheduler.
REM Double-click or run from a Command Prompt / PowerShell as your normal user.
REM
REM Examples:
REM   schedule-monitor-workers.bat
REM   schedule-monitor-workers.bat status
REM   schedule-monitor-workers.bat uninstall
REM   schedule-monitor-workers.bat run-once
REM   schedule-monitor-workers.bat install 2

setlocal
cd /d "%~dp0.."

set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=install"

set "INTERVAL=%~2"
if "%INTERVAL%"=="" set "INTERVAL=1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule-monitor-workers.ps1" -Action %ACTION% -IntervalMinutes %INTERVAL%
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo Failed with exit code %ERR%.
  pause
  exit /b %ERR%
)
echo.
pause
endlocal

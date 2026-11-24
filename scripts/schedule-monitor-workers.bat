@echo off
REM =============================================================================
REM LinkNest — schedule monitoring workers in Windows Task Scheduler
REM =============================================================================
REM Double-click or run from Command Prompt / PowerShell as your normal user.
REM Administrator is NOT required for the default install.
REM
REM Usage:
REM   schedule-monitor-workers.bat
REM   schedule-monitor-workers.bat install [intervalMinutes]
REM   schedule-monitor-workers.bat verify
REM   schedule-monitor-workers.bat status
REM   schedule-monitor-workers.bat run-once
REM   schedule-monitor-workers.bat uninstall
REM
REM Examples:
REM   schedule-monitor-workers.bat install 2
REM   schedule-monitor-workers.bat verify
REM =============================================================================

setlocal EnableExtensions
cd /d "%~dp0.."

set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=install"

REM Help
if /I "%ACTION%"=="help" goto :help
if /I "%ACTION%"=="/?" goto :help
if /I "%ACTION%"=="-h" goto :help
if /I "%ACTION%"=="--help" goto :help

set "INTERVAL=%~2"
if "%INTERVAL%"=="" set "INTERVAL=1"

REM For non-install actions, interval arg is ignored (still must be valid 1-60 if passed)
if /I not "%ACTION%"=="install" if "%~2"=="" set "INTERVAL=1"

echo.
echo LinkNest monitor scheduler
echo   Action:   %ACTION%
echo   Interval: %INTERVAL% minute(s)  (install only)
echo   Root:     %CD%
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo [FAIL] powershell.exe not found on PATH.
  set "ERR=1"
  goto :done
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule-monitor-workers.ps1" -Action "%ACTION%" -IntervalMinutes %INTERVAL%
set "ERR=%ERRORLEVEL%"

:done
echo.
if not "%ERR%"=="0" (
  echo Failed with exit code %ERR%.
  echo Tip: run "schedule-monitor-workers.bat verify" after fixing issues.
) else (
  echo Completed successfully.
)
echo.
pause
endlocal & exit /b %ERR%

:help
echo.
echo LinkNest monitoring Task Scheduler helper
echo.
echo   schedule-monitor-workers.bat                 Install + verify + smoke test
echo   schedule-monitor-workers.bat install 2       Install repeating every 2 minutes
echo   schedule-monitor-workers.bat verify          Confirm both tasks are scheduled correctly
echo   schedule-monitor-workers.bat status          Short LastRun / NextRun / State report
echo   schedule-monitor-workers.bat run-once        Run monitor + email workers once now
echo   schedule-monitor-workers.bat uninstall       Remove both scheduled tasks
echo.
echo Creates:
echo   - "LinkNest - Monitor Runner"   (checks monitors, queues emails)
echo   - "LinkNest - Email Sender"     (sends queued emails via SMTP)
echo.
pause
endlocal & exit /b 0

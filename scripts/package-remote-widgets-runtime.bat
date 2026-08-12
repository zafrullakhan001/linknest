@echo off
REM Build offline ZIP of ttyd / OpenSSH / embeddable Python / websockify / VcXsrv.
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-remote-widgets-runtime.ps1" %*
if errorlevel 1 (
  echo.
  echo  Package failed.
  pause
  exit /b 1
)
echo.
pause

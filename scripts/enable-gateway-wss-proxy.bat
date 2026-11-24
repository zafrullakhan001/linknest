@echo off
REM Enable Apache WSS proxy for SSH/VNC gateways (fixes Mixed Content on HTTPS).
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0enable-gateway-wss-proxy.ps1" -RestartApache %*
if errorlevel 1 (
  echo.
  echo  Failed. Run as Administrator if Apache service restart was denied.
  pause
  exit /b 1
)
echo.
pause

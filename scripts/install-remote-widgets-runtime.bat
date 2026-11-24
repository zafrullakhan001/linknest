@echo off
REM Install offline SSH/VNC gateway binaries into LinkNest (air-gapped friendly).
setlocal
set "SCRIPT_DIR=%~dp0"
set "INSTALL_DIR=%~1"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=C:\xampp\htdocs\linknest"

echo.
echo  LinkNest remote-widgets runtime installer
echo  Package : %SCRIPT_DIR%
echo  Target  : %INSTALL_DIR%
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-remote-widgets-runtime.ps1" -InstallDir "%INSTALL_DIR%" -PackageRoot "%SCRIPT_DIR%"
set "EC=%ERRORLEVEL%"
echo.
if %EC% NEQ 0 (
  echo  [XX] Install failed ^(exit %EC%^). Try "Run as administrator" if VcXsrv copy failed.
  pause
  exit /b %EC%
)
echo  [OK] Done. Refresh Admin - Add-ons - SSH / VNC Gateway.
pause
exit /b 0

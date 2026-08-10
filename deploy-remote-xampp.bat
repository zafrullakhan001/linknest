@echo off
REM ============================================================
REM  LinkNest — Remote XAMPP Deploy Launcher (Windows)
REM  Pushes a linknest-deploy-*.zip to another Windows host over SMB
REM  and runs an elevated scheduled task (no WinRM TrustedHosts required).
REM
REM  Examples:
REM    deploy-remote-xampp.bat -ComputerName 192.168.0.197 -ZipPath .\linknest-deploy-....zip
REM    deploy-remote-xampp.bat -ComputerName 192.168.0.197 -Mode Update -IncludeDatabaseZip
REM    deploy-remote-xampp.bat -ComputerName office-pc -UserName administrator -IncludeXamppRuntime -Mode Fresh
REM
REM  Password is prompted if omitted. See docs\OFFICE_WIN2022_DEPLOY.md
REM ============================================================
set "PKG=%~dp0"
cd /d "%PKG%"

if exist "%PKG%scripts\deploy-remote-xampp.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PKG%scripts\deploy-remote-xampp.ps1" %*
) else (
    echo  [XX] Missing scripts\deploy-remote-xampp.ps1
    pause
    exit /b 1
)
set "ERR=%ERRORLEVEL%"
if %ERR% NEQ 0 (
    echo.
    echo  *** Remote deploy FAILED ***
    echo.
    pause
    exit /b %ERR%
)
exit /b 0

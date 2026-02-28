@echo off
REM ============================================================
REM  LinkNest — Deployment Packager Launcher
REM  Double-click this file to build and package the application.
REM ============================================================
echo.
echo  Starting LinkNest Deployment Packager...
echo  (This window will close when packaging is complete)
echo.

REM Run the PowerShell script — bypass execution policy for this session only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-for-deployment.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  *** Packaging FAILED. See error messages above. ***
    echo.
    pause
    exit /b 1
)

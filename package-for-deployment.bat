@echo off
REM ============================================================
REM  LinkNest — Deployment Packager Launcher
REM  Double-click this file to clean-build and package the app.
REM  On the target PC, prefer update-xampp.bat (keeps data/).
REM ============================================================
echo.
echo  Starting LinkNest Deployment Packager...
echo  This will wipe dist/, rebuild, and create a fresh ZIP.
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

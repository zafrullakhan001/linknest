@echo off
REM LinkNest Build Script for Windows
REM Run this script after copying the bundle to target machine

echo ==========================================
echo LinkNest Build Process
echo ==========================================
echo.
REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not installed.
    echo Please install npm (comes with Node.js)
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Building application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ==========================================
echo Build completed successfully
==========================================
echo.
echo The application has been built in the 'dist' folder.
echo You can now deploy the application using your web server.
echo.
echo For PHP built-in server, run:
echo     php -S localhost:8000 router.php
echo.
pause

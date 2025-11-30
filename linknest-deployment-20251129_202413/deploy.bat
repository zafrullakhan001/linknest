@echo off
REM Standalone Deployment Script for LinkNest (Windows)
REM This script can be run from the bundled deployment folder

echo ==========================================
echo LinkNest Standalone Deployment
echo ==========================================
echo.
REM Check if Docker is installed
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

REM Check if Docker Compose is installed
where docker-compose >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

cd /d "%~dp0docker"

echo Building Docker image...
docker-compose build
if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker build failed
    exit /b 1
)

echo.
echo Starting container...
docker-compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to start container
    exit /b 1
)

echo.
echo Deployment complete
echo.
echo Application URLs:
echo HTTP:  http://localhost:8090
echo HTTPS: https://localhost:8443
echo.
pause

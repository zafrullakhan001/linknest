@echo off
REM ============================================================================
REM LinkNest Self-Deploying Docker Container Script
REM ============================================================================
REM This script builds and deploys the LinkNest application in a Docker container
REM Everything needed is in this folder - just run this script!
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================================
echo   LinkNest Docker Deployment Script
echo ============================================================================
echo.

REM Check if Docker is installed and running
echo [1/6] Checking Docker installation...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running
    echo Please start Docker Desktop and try again
    pause
    exit /b 1
)
echo ✓ Docker is installed and running
echo.

REM Check if docker-compose is available
echo [2/6] Checking Docker Compose...
docker compose version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker Compose is not available
    echo Please ensure Docker Desktop is properly installed
    pause
    exit /b 1
)
echo ✓ Docker Compose is available
echo.

REM Stop and remove existing containers
echo [3/6] Cleaning up existing containers...
docker compose down 2>nul
echo ✓ Cleanup complete
echo.

REM Build the Docker image
echo [4/6] Building Docker image (this may take several minutes)...
echo This will:
echo   - Build the frontend React application
echo   - Configure PHP and Apache web server
echo   - Set up SQLite database
echo   - Copy your existing data and uploads
echo.
docker compose build --no-cache
if errorlevel 1 (
    echo ERROR: Docker build failed
    echo Please check the error messages above
    pause
    exit /b 1
)
echo ✓ Docker image built successfully
echo.

REM Start the containers
echo [5/6] Starting containers...
docker compose up -d
if errorlevel 1 (
    echo ERROR: Failed to start containers
    echo Please check the error messages above
    pause
    exit /b 1
)
echo ✓ Containers started successfully
echo.

REM Wait for containers to be healthy
echo [6/6] Waiting for application to be ready...
timeout /t 10 /nobreak >nul
echo.

REM Display status
echo ============================================================================
echo   Deployment Complete!
echo ============================================================================
echo.
echo Your LinkNest application is now running!
echo.
echo Access URLs:
echo   - Main Application (HTTP):  http://localhost:8090
echo   - Main Application (HTTPS): https://localhost:8443
echo   - Mailpit Web UI:           http://localhost:8025
echo   - OPcache Status:           http://localhost:8090/check_opcache.php
echo.
echo Container Management:
echo   - View logs:     docker compose logs -f
echo   - Stop:          docker compose stop
echo   - Start:         docker compose start
echo   - Restart:       docker compose restart
echo   - Remove:        docker compose down
echo.
echo Database Location (inside container):
echo   /var/www/html/data/linknest.db
echo.
echo To export data from container:
echo   docker cp linknest:/var/www/html/data/linknest.db ./exported-database.db
echo   docker cp linknest:/var/www/html/uploads ./exported-uploads
echo.
echo ============================================================================
echo.

REM Open browser to the application
echo Opening application in browser...
timeout /t 2 /nobreak >nul
start http://localhost:8090

echo.
echo Press any key to exit...
pause >nul

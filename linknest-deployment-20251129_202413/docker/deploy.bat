@echo off
REM Docker Deployment Script for LinkNest (Windows)
REM This script builds and deploys the LinkNest application in a Docker container

echo ==========================================
echo LinkNest Docker Deployment Script
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

REM Get the directory where the script is located
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%\..

echo Project root: %PROJECT_ROOT%
echo.

REM Create necessary directories if they don't exist
echo Creating necessary directories...
if not exist "%PROJECT_ROOT%\data" mkdir "%PROJECT_ROOT%\data"
if not exist "%PROJECT_ROOT%\uploads" mkdir "%PROJECT_ROOT%\uploads"

REM Check if database exists
if exist "%PROJECT_ROOT%\data\linknest.db" (
    echo ✓ Found existing database: %PROJECT_ROOT%\data\linknest.db
    echo   Database will be copied into container and used via volume mount
) else (
    echo ⚠ No existing database found - will be created on first run
)

echo ✓ Directories created
echo.

REM Navigate to docker directory
cd /d "%SCRIPT_DIR%"

REM Stop and remove existing container if it exists
echo Stopping existing containers (if any)...
docker-compose down 2>nul
echo ✓ Existing containers stopped
echo.

REM Build the Docker image
echo Building Docker image...
echo This may take a few minutes on first run...
docker-compose build --no-cache
if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker build failed
    exit /b 1
)
echo ✓ Docker image built successfully
echo.

REM Start the container
echo Starting Docker container...
docker-compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to start container
    exit /b 1
)
echo ✓ Container started
echo.

REM Wait for container to be ready
echo Waiting for container to be ready...
timeout /t 5 /nobreak >nul

REM Check container status
docker ps | findstr linknest >nul
if %ERRORLEVEL% EQU 0 (
    echo ✓ Container is running
) else (
    echo ✗ Container failed to start
    echo Checking logs...
    docker-compose logs
    exit /b 1
)

REM Display container information
echo.
echo ==========================================
echo Deployment Successful!
echo ==========================================
echo.
echo Application is now running at:
echo HTTP:  http://localhost:8090
echo HTTPS: https://localhost:8443
echo Note: Using self-signed certificate - browser will show security warning
echo.
echo Container information:
docker ps | findstr linknest
echo.
echo Useful commands:
echo   View logs:    docker-compose logs -f
echo   Stop:          docker-compose stop
echo   Start:         docker-compose start
echo   Restart:       docker-compose restart
echo   Remove:        docker-compose down
echo.
echo Database location: %PROJECT_ROOT%\data\linknest.db
echo Uploads location: %PROJECT_ROOT%\uploads
echo.

pause


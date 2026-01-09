@echo off
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo 🔄 LinkNest Docker Refresh Script
echo ==========================================
echo.

REM Get the script's directory (should be project root)
set PROJECT_ROOT=%~dp0
cd /d "%PROJECT_ROOT%"

REM Check if Docker is installed
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Docker is not installed or not in PATH.
    pause
    exit /b 1
)

REM Determine search for docker compose command
docker compose version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set COMPOSE_CMD=docker compose
) else (
    set COMPOSE_CMD=docker-compose
)

echo 🛠️  Current directory: %CD%
echo 📋 Using command: %COMPOSE_CMD%
echo.

REM 1. Stop the existing containers
echo 🛑 Step 1: Stopping current containers...
%COMPOSE_CMD% -f docker/docker-compose.yml down
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Note: No existing containers were running or down failed.
) else (
    echo ✅ Containers stopped.
)
echo.

REM 2. Rebuild the image (Multi-stage build handles frontend & backend)
echo 🔨 Step 2: Rebuilding images from source...
echo This will recompile the React frontend and update the PHP backend.
%COMPOSE_CMD% -f docker/docker-compose.yml build --no-cache
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Docker build failed.
    pause
    exit /b 1
)
echo ✅ Build successful.
echo.

REM 3. Start the containers
echo 🚀 Step 3: Starting refreshed containers...
%COMPOSE_CMD% -f docker/docker-compose.yml up -d
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Failed to start containers.
    pause
    exit /b 1
)
echo ✅ Refresh complete!
echo.

echo 📍 LinkNest is running at:
echo    HTTP:  http://localhost:8090
echo    HTTPS: https://localhost:8443
echo.
echo 📊 Container Status:
%COMPOSE_CMD% -f docker/docker-compose.yml ps
echo.

timeout /t 5
ENDLOCAL

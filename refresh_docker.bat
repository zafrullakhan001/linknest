@echo off
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo LinkNest Docker Refresh Script
echo ==========================================
echo.

REM Get the script's directory (should be project root)
set PROJECT_ROOT=%~dp0
cd /d "%PROJECT_ROOT%"

REM Cache ProgramFiles(x86) into a normal variable to avoid parentheses expansion issues inside ( ... ) blocks
set "PROGRAMFILES_X86=%ProgramFiles(x86)%"

REM Check if Docker is installed
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Docker is not installed or not in PATH.
    pause
    exit /b 1
)

REM Check if Docker is running
echo Checking if Docker Desktop is running...
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Docker daemon is not responding.
    
    REM Check if Docker Desktop process is already running
    tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>nul | find /I /N "Docker Desktop.exe">nul
    if %ERRORLEVEL% EQU 0 (
        echo    Docker Desktop process is running, but daemon is not ready yet.
        echo ⏳ Waiting for Docker daemon to become ready...
        
        REM Wait for Docker to be ready (max 2 minutes)
        set MAX_WAIT=120
        set WAIT_COUNT=0
        
        :wait_for_daemon
        timeout /t 2 /nobreak >nul
        set /a WAIT_COUNT+=2
        docker info >nul 2>&1
        if %ERRORLEVEL% EQU 0 (
        echo Docker Desktop is now ready!
            echo.
            goto docker_check_done
        )
        if !WAIT_COUNT! LSS !MAX_WAIT! (
            echo    Still waiting... (!WAIT_COUNT!s / !MAX_WAIT!s)
            goto wait_for_daemon
        )
        
        echo ❌ Error: Docker daemon did not become ready within the timeout period.
        echo Please check Docker Desktop and ensure it starts correctly.
        pause
        exit /b 1
    ) else (
        REM Docker Desktop is not running, start it
        echo Starting Docker Desktop...
        
        REM Try common Docker Desktop installation paths
        set DOCKER_DESKTOP_PATH=""
        
        if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
            set DOCKER_DESKTOP_PATH="C:\Program Files\Docker\Docker\Docker Desktop.exe"
        ) else if exist "!PROGRAMFILES_X86!\Docker\Docker\Docker Desktop.exe" (
            set DOCKER_DESKTOP_PATH="!PROGRAMFILES_X86!\Docker\Docker\Docker Desktop.exe"
        ) else if exist "%LOCALAPPDATA%\Docker\Docker Desktop.exe" (
            set DOCKER_DESKTOP_PATH="%LOCALAPPDATA%\Docker\Docker Desktop.exe"
        )
        
        if "!DOCKER_DESKTOP_PATH!"=="" (
            echo ❌ Error: Could not find Docker Desktop executable.
            echo Please start Docker Desktop manually and try again.
            pause
            exit /b 1
        )
        
        echo    Found Docker Desktop at: !DOCKER_DESKTOP_PATH!
        start "" !DOCKER_DESKTOP_PATH!
        
        echo Waiting for Docker Desktop to start...
        echo    This may take 30-60 seconds...
        
        REM Wait for Docker to be ready (max 2 minutes)
        set MAX_WAIT=120
        set WAIT_COUNT=0
        
        :wait_loop
        timeout /t 2 /nobreak >nul
        set /a WAIT_COUNT+=2
        docker info >nul 2>&1
        if %ERRORLEVEL% EQU 0 (
            goto docker_started
        )
        if !WAIT_COUNT! LSS !MAX_WAIT! (
            echo    Still waiting... (!WAIT_COUNT!s / !MAX_WAIT!s)
            goto wait_loop
        )
        
        echo ❌ Error: Docker Desktop did not start within the timeout period.
        echo Please ensure Docker Desktop starts correctly and try again.
        pause
        exit /b 1
        
        :docker_started
        echo Docker Desktop is now running!
        echo.
        goto docker_check_done
    )
    :docker_check_done
) else (
    echo Docker Desktop is already running.
    echo.
)

REM Determine search for docker compose command
docker compose version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set COMPOSE_CMD=docker compose
) else (
    set COMPOSE_CMD=docker-compose
)

echo Current directory: %CD%
echo Using command: %COMPOSE_CMD%
echo.

REM 1. Stop the existing containers
echo Step 1: Stopping current containers...
%COMPOSE_CMD% -f docker/docker-compose.yml down
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Note: No existing containers were running or down failed.
) else (
    echo Containers stopped.
)
echo.

REM 2. Rebuild the image (Multi-stage build handles frontend & backend)
echo Step 2: Rebuilding images from source...
echo This will recompile the React frontend and update the PHP backend.
%COMPOSE_CMD% -f docker/docker-compose.yml build --no-cache
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Docker build failed.
    pause
    exit /b 1
)
echo Build successful.
echo.

REM 3. Start the containers
echo Step 3: Starting refreshed containers...
%COMPOSE_CMD% -f docker/docker-compose.yml up -d
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Failed to start containers.
    pause
    exit /b 1
)
echo Refresh complete!
echo.

REM 3b. Verify Python is available inside the container (needed for worker scripts)
echo Step 3b: Verifying Python workers inside container...
echo    Checking python3 version...
%COMPOSE_CMD% -f docker/docker-compose.yml exec -T linknest python3 --version
if errorlevel 1 goto python_missing
echo    Checking email sender script starts...
%COMPOSE_CMD% -f docker/docker-compose.yml exec -T linknest python3 /var/www/html/scripts/email_sender.py --db /var/www/html/data/linknest.db --limit 1
if errorlevel 1 goto email_sender_failed
echo Python worker scripts are available.
goto python_check_done

:python_missing
echo Error: python3 not available in container.
echo    Ensure docker/Dockerfile installs python3, then rebuild.
pause
exit /b 1

:email_sender_failed
echo Warning: email_sender.py check failed (script may still run depending on DB permissions).
echo    You can inspect logs by running:
echo      %COMPOSE_CMD% -f docker/docker-compose.yml logs --tail=200 linknest

:python_check_done
echo.

REM 3c. Monitoring/email workers run INSIDE the container (see docker/linknest-entrypoint.sh)
echo Step 3c: Python monitoring workers are started inside the container.
echo    Configure via docker/docker-compose.yml environment variables (LINKNEST_WORKERS_*).
echo.

REM 4. Cleanup
echo Step 4: Cleaning up intermediate build artifacts...
echo    Removing dangling images...
docker image prune -f
echo    Removing unused build cache (frees space from --no-cache builds)...
docker builder prune -f
echo Cleanup complete.
echo.

echo LinkNest is running at:
echo    HTTP:  http://localhost:8090
echo    HTTPS: https://localhost:8443
echo.
echo Docker Landing Page (Quick Access):
echo    HTTP:  http://localhost:8090/docker-landing.php
echo    HTTPS: https://localhost:8443/docker-landing.php
echo.
echo Mail Server (Pilot):
echo    Mailpit Web UI: http://localhost:8025
echo    SMTP: localhost:1025 (no auth, no TLS)
echo.
echo Container Status:
%COMPOSE_CMD% -f docker/docker-compose.yml ps
echo.

timeout /t 5
ENDLOCAL

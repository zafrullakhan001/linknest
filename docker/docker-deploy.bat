@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM LinkNest Docker Deployment Script for Windows
REM Run from docker\ or via ..\redeploy-docker.bat (preferred — includes preflight)

echo [deploy] Starting LinkNest Docker Deployment...
echo.

REM Get the project root directory (parent of docker/)
cd /d "%~dp0\.."
set "ROOT=%CD%"
set "COMPOSE_FILE=%ROOT%\docker\docker-compose.yml"

REM Check if Docker is installed
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [error] Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

REM Daemon must be running (redeploy-docker.bat starts it; this is a safety check)
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [error] Docker daemon is not running. Start Docker Desktop or run redeploy-docker.bat.
    exit /b 1
)

REM Check if Docker Compose is available
docker compose version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    docker-compose version >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [error] Docker Compose is not available. Please install Docker Desktop.
        exit /b 1
    )
    set "COMPOSE_CMD=docker-compose"
) else (
    set "COMPOSE_CMD=docker compose"
)

if not exist "%COMPOSE_FILE%" (
    echo [error] Missing %COMPOSE_FILE%
    exit /b 1
)

REM Create necessary directories
echo [deploy] Creating necessary directories...
if not exist "data" mkdir "data"
if not exist "uploads" mkdir "uploads"
if not exist "bin" mkdir "bin"

REM Create .htaccess for uploads if it doesn't exist
if not exist "uploads\.htaccess" (
    echo [deploy] Creating uploads\.htaccess...
    (
        echo # Prevent PHP execution in uploads directory
        echo ^<FilesMatch "\.php$"^>
        echo     Order Allow,Deny
        echo     Deny from all
        echo ^</FilesMatch^>
        echo.
        echo # Allow only image files
        echo ^<FilesMatch "\.(jpg^|jpeg^|png^|gif^|svg^|webp)$"^>
        echo     Order Allow,Deny
        echo     Allow from all
        echo ^</FilesMatch^>
    ) > "uploads\.htaccess"
)

REM Soft check: Linux ttyd for SSH widget (required COPY in Dockerfile)
if not exist "bin\ttyd.x86_64" (
    echo [warn] bin\ttyd.x86_64 missing — Docker build may fail behind SSL inspection.
    echo        Prefer: run redeploy-docker.bat ^(auto-downloads ttyd^) or place the binary manually.
)

if not exist "novnc.d.ts" (
    echo [error] novnc.d.ts missing — required for VNC widget frontend build.
    exit /b 1
)

REM Stop existing container if running
echo [deploy] Stopping existing containers (if any)...
%COMPOSE_CMD% -f "%COMPOSE_FILE%" down 2>nul

REM Build and start the container
echo [deploy] Building Docker image...
%COMPOSE_CMD% -f "%COMPOSE_FILE%" build
if %ERRORLEVEL% NEQ 0 (
    echo [error] Docker image build failed.
    echo [hint]  If ttyd download failed inside the build, ensure bin\ttyd.x86_64 exists
    echo         ^(redeploy-docker.bat downloads it^). If Vite failed on @novnc/novnc,
    echo         confirm vite.docker.config.ts has build.target = 'esnext'.
    exit /b 1
)

echo [deploy] Starting containers [HTTP 8090, HTTPS 8443, Mailpit 8025, ttyd 18681-18780, websockify 18881-18980]...
%COMPOSE_CMD% -f "%COMPOSE_FILE%" up -d
if %ERRORLEVEL% NEQ 0 (
    echo [error] Failed to start containers.
    echo [hint]  Port conflict? Host XAMPP may use 17681+/17881+; Docker uses 18681-18780 ^(ttyd^) and 18881-18980 ^(websockify^).
    echo         Check: %COMPOSE_CMD% -f docker\docker-compose.yml logs
    exit /b 1
)

REM Wait for container to be ready (ping works in non-interactive shells; timeout does not)
echo [deploy] Waiting for container to be ready...
ping -n 6 127.0.0.1 >nul

REM Check if container is running
%COMPOSE_CMD% -f "%COMPOSE_FILE%" ps | findstr "Up" >nul
if errorlevel 1 goto deploy_failed

echo.
echo [ok] LinkNest is now running!
echo.
echo Access the application at:
echo    HTTP:  http://localhost:8090
echo    HTTPS: https://localhost:8443
echo    Mailpit UI: http://localhost:8025
echo.
echo SSH Terminal gateway [Docker]:
echo    ttyd ports: 18681-18780
echo    X11: host.docker.internal:0.0  [VcXsrv + Disable access control]
echo.
echo VNC Viewer gateway [Docker]:
echo    websockify ports: 18881-18980
    echo    [avoids host XAMPP 17681-18680 / 19000-19999]
echo.
echo Default credentials:
echo    Username: admin
echo    Password: admin123
echo.
echo IMPORTANT: Change the admin password after first login!
echo.
echo Clone Instance:
echo    Admin folder clone is host-only ^(XAMPP sibling folders^).
echo    In Docker/WSL it is disabled — rebuild this container instead,
echo    or clone on the host: scripts\clone-linknest.bat myspaces --preset empty
echo.
echo Useful commands:
echo    View logs:        %COMPOSE_CMD% -f docker\docker-compose.yml logs -f
echo    Stop container:   %COMPOSE_CMD% -f docker\docker-compose.yml down
echo    Restart:          %COMPOSE_CMD% -f docker\docker-compose.yml restart
echo    View status:      %COMPOSE_CMD% -f docker\docker-compose.yml ps
echo    Full redeploy:    redeploy-docker.bat
echo.
exit /b 0

:deploy_failed
echo [error] Container failed to start. Check logs with: %COMPOSE_CMD% -f docker\docker-compose.yml logs
exit /b 1

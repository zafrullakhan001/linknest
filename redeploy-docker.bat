@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM =============================================================================
REM LinkNest Docker Redeploy (Windows)
REM Usage: double-click, or from project root: redeploy-docker.bat
REM
REM Handles common shortcomings from prior deploys:
REM   - Starts Docker Desktop if the daemon is down (with timeout)
REM   - Ensures data/uploads + uploads\.htaccess exist
REM   - Vendors Linux ttyd (bin\ttyd.x86_64) so image builds work behind SSL MITM
REM   - Verifies novnc.d.ts exists (VNC widget Docker build)
REM   - Warns on host port conflicts (8090/8443/8025/1025 + SSH/VNC gateway ranges)
REM   - Rebuilds and starts via docker\docker-deploy.bat
REM   - Waits for container healthy + verifies ttyd/ssh/websockify inside the image
REM =============================================================================

cd /d "%~dp0"
set "ROOT=%CD%"
set "COMPOSE_FILE=%ROOT%\docker\docker-compose.yml"
set "TTYD_VERSION=1.7.7"
set "TTYD_URL=https://github.com/tsl0922/ttyd/releases/download/%TTYD_VERSION%/ttyd.x86_64"
set "DOCKER_WAIT_MAX=60"
set "HEALTH_WAIT_MAX=40"

echo.
echo [redeploy] LinkNest Docker redeploy
echo [redeploy] Project: %ROOT%
echo.

REM ----- Docker CLI -----
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [error] Docker is not installed or not on PATH. Install Docker Desktop first.
    exit /b 1
)

REM Prefer "docker compose" (v2); fall back to docker-compose
set "COMPOSE_CMD=docker compose"
docker compose version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    docker-compose version >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [error] Docker Compose is not available. Update Docker Desktop.
        exit /b 1
    )
    set "COMPOSE_CMD=docker-compose"
)

REM ----- Docker Desktop / daemon -----
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 goto docker_is_up

echo [redeploy] Docker Desktop is not running. Starting it...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else if exist "%LocalAppData%\Docker\Docker Desktop.exe" (
    start "" "%LocalAppData%\Docker\Docker Desktop.exe"
) else (
    echo [error] Could not find Docker Desktop. Start it manually, then re-run.
    exit /b 1
)

echo [redeploy] Waiting for Docker daemon [up to ~3 min]...
set /a _tries=0
:wait_docker
timeout /t 3 /nobreak >nul 2>&1
if errorlevel 1 ping -n 4 127.0.0.1 >nul
set /a _tries+=1
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 goto docker_is_up
if !_tries! GEQ %DOCKER_WAIT_MAX% (
    echo [error] Docker did not become ready in time. Open Docker Desktop and retry.
    exit /b 1
)
echo [redeploy]   still waiting... [!_tries!/%DOCKER_WAIT_MAX%]
goto wait_docker

:docker_is_up
echo [redeploy] Docker is ready.

if not exist "%COMPOSE_FILE%" (
    echo [error] Missing compose file: %COMPOSE_FILE%
    exit /b 1
)

REM ----- Directories -----
echo [redeploy] Ensuring data/ and uploads/...
if not exist "%ROOT%\data" mkdir "%ROOT%\data"
if not exist "%ROOT%\uploads" mkdir "%ROOT%\uploads"
if not exist "%ROOT%\bin" mkdir "%ROOT%\bin"

if not exist "%ROOT%\uploads\.htaccess" (
    echo [redeploy] Creating uploads\.htaccess...
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
    ) > "%ROOT%\uploads\.htaccess"
)

REM ----- VNC type declarations -----
if not exist "%ROOT%\novnc.d.ts" (
    echo [error] Missing novnc.d.ts ^(required for VNC Viewer widget Docker build^).
    exit /b 1
)

REM ----- Vendor Linux ttyd for SSH Terminal widget -----
REM Docker builds often fail downloading from GitHub behind SSL inspection.
REM Keep a local Linux binary so COPY bin/ always succeeds.
if not exist "%ROOT%\bin\ttyd.x86_64" (
    echo [redeploy] Downloading Linux ttyd %TTYD_VERSION% into bin\ttyd.x86_64...
    where curl >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [error] curl.exe not found. Download ttyd manually:
        echo         %TTYD_URL%
        echo         Save as: %ROOT%\bin\ttyd.x86_64
        exit /b 1
    )
    curl.exe -L --ssl-no-revoke --fail --retry 3 --retry-delay 2 -o "%ROOT%\bin\ttyd.x86_64" "%TTYD_URL%"
    if %ERRORLEVEL% NEQ 0 (
        echo [error] Failed to download ttyd. Check network/SSL, or place the binary at:
        echo         %ROOT%\bin\ttyd.x86_64
        echo         %TTYD_URL%
        exit /b 1
    )
    for %%A in ("%ROOT%\bin\ttyd.x86_64") do if %%~zA LSS 100000 (
        echo [error] Downloaded ttyd looks too small ^(%%~zA bytes^). Delete it and retry.
        del /f /q "%ROOT%\bin\ttyd.x86_64" >nul 2>&1
        exit /b 1
    )
    echo [redeploy] ttyd binary ready.
) else (
    echo [redeploy] Found vendored ttyd: bin\ttyd.x86_64
)

REM ----- Port conflict warnings (host) -----
echo [redeploy] Checking common host ports...
call :warn_port 8090 "HTTP LinkNest"
call :warn_port 8443 "HTTPS LinkNest"
call :warn_port 8025 "Mailpit UI"
call :warn_port 1025 "Mailpit SMTP"
call :warn_port 18681 "SSH gateway ttyd start"
call :warn_port 18881 "VNC gateway websockify start"
goto after_helpers

REM ----- helpers -----
:warn_port
set "PORT=%~1"
set "LABEL=%~2"
netstat -ano 2>nul | findstr /R /C:":%PORT% .*LISTENING" >nul
if errorlevel 1 exit /b 0
rem Ignore if our own linknest/mailpit containers already own it
docker ps --format "{{.Names}} {{.Ports}}" 2>nul | findstr /C:":%PORT%-" >nul
if not errorlevel 1 exit /b 0
echo [warn] Port %PORT% [%LABEL%] is already in use on this host.
echo        If compose fails to bind, stop the other process or change docker-compose.yml.
exit /b 0

:after_helpers

REM ----- Redeploy -----
echo.
echo [redeploy] Stopping / rebuilding / starting containers...
call "%ROOT%\docker\docker-deploy.bat"
set "DEPLOY_RC=%ERRORLEVEL%"
if not "%DEPLOY_RC%"=="0" (
    echo [error] docker-deploy.bat failed with exit code %DEPLOY_RC%.
    echo [hint]  Logs: %COMPOSE_CMD% -f docker\docker-compose.yml logs --tail=80
    exit /b %DEPLOY_RC%
)

REM ----- Health wait -----
echo [redeploy] Waiting for linknest healthcheck...
set /a _h=0
:wait_health
timeout /t 3 /nobreak >nul 2>&1
if errorlevel 1 ping -n 4 127.0.0.1 >nul
set /a _h+=1
docker inspect -f "{{.State.Health.Status}}" linknest 2>nul | findstr /i "healthy" >nul
if %ERRORLEVEL% EQU 0 goto health_ok
docker inspect -f "{{.State.Status}}" linknest 2>nul | findstr /i "running" >nul
if %ERRORLEVEL% NEQ 0 (
    if !_h! GEQ 5 (
        echo [error] Container linknest is not running.
        %COMPOSE_CMD% -f "%COMPOSE_FILE%" logs --tail=60 linknest
        exit /b 1
    )
)
if !_h! GEQ %HEALTH_WAIT_MAX% (
    echo [warn] Timed out waiting for healthy status. Container may still be starting.
    docker inspect -f "{{.State.Status}}" linknest 2>nul
    docker inspect -f "{{.State.Health.Status}}" linknest 2>nul
    goto post_checks
)
goto wait_health

:health_ok
echo [redeploy] Container is healthy.

:post_checks
echo [redeploy] Verifying SSH/VNC gateway binaries in container...
docker exec linknest sh -c "command -v ttyd >/dev/null && ttyd --version; command -v ssh >/dev/null && echo ssh_ok; python3 -c 'import websockify' && echo websockify_ok; printenv SSH_GATEWAY_PORT_MIN; printenv VNC_GATEWAY_PORT_MIN; printenv SSH_GATEWAY_X11_DISPLAY" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [warn] Could not exec into linknest for gateway checks yet.
)

echo.
echo [ok] Redeploy finished.
echo.
echo Access:
echo    HTTP:      http://localhost:8090
echo    HTTPS:     https://localhost:8443
echo    Mailpit:   http://localhost:8025
echo.
echo SSH Terminal [Docker]:
echo    ttyd ports: 18681-18780  [avoids host XAMPP 17681-17780]
echo    X11 DISPLAY: host.docker.internal:0.0
echo    GUI tip: start VcXsrv with Disable access control before Terminal+GUI
echo.
echo VNC Viewer [Docker]:
echo    websockify ports: 18881-18980  [avoids host XAMPP 17881-17980]
echo.
echo Default login: admin / admin123
echo.
exit /b 0

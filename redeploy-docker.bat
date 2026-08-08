@echo off
REM Simple LinkNest Docker redeploy wrapper
REM Usage: double-click, or run from project root: redeploy-docker.bat

cd /d "%~dp0"

where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Docker is not installed or not on PATH. Install Docker Desktop first.
    exit /b 1
)

docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Docker Desktop is not running. Starting it...
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo Could not find Docker Desktop. Start it manually, then re-run this script.
        exit /b 1
    )
    echo Waiting for Docker to become ready...
    :wait_docker
    timeout /t 3 /nobreak >nul 2>&1
    if errorlevel 1 ping -n 4 127.0.0.1 >nul
    docker info >nul 2>&1
    if %ERRORLEVEL% NEQ 0 goto wait_docker
    echo Docker is ready.
)

call "%~dp0docker\docker-deploy.bat"
exit /b %ERRORLEVEL%

@echo off
REM Standalone Deployment Script for LinkNest (Windows)
cd /d "%~dp0docker"
echo Building Docker image...
docker-compose build
if %ERRORLEVEL% NEQ 0 exit /b 1
echo Starting container...
docker-compose up -d
if %ERRORLEVEL% NEQ 0 exit /b 1
echo.
echo Deployment complete
echo HTTP:  http://localhost:8090
echo HTTPS: https://localhost:8443
pause

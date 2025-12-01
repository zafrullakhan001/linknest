@echo off
REM LinkNest Docker Deployment Script for Windows
REM This script installs Docker Desktop, builds and runs the LinkNest application

setlocal enabledelayedexpansion

echo ==========================================
echo LinkNest Docker Deployment Script
echo ==========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Some operations may require administrator privileges.
    echo If you encounter permission errors, please run as administrator.
    echo.
)

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorLevel% neq 0 (
    echo Docker is not installed or not in PATH.
    echo.
    echo Please install Docker Desktop for Windows:
    echo https://www.docker.com/products/docker-desktop
    echo.
    echo After installation, make sure Docker Desktop is running and try again.
    echo.
    pause
    exit /b 1
)

echo Docker is installed.
docker --version
echo.

REM Check if Docker is running
docker ps >nul 2>&1
if %errorLevel% neq 0 (
    echo Docker is not running!
    echo.
    echo Please start Docker Desktop and wait for it to fully start.
    echo Then run this script again.
    echo.
    pause
    exit /b 1
)

echo Docker is running.
echo.

REM Check if Docker Compose is available
docker compose version >nul 2>&1
if %errorLevel% neq 0 (
    echo Docker Compose is not available.
    echo Please ensure Docker Desktop includes Docker Compose.
    echo.
    pause
    exit /b 1
)

echo Docker Compose is available.
docker compose version
echo.

REM Create necessary directories
echo Creating necessary directories...
if not exist "data" mkdir "data"
if not exist "uploads" mkdir "uploads"

REM Create uploads .htaccess if it doesn't exist
if not exist "uploads\.htaccess" (
    echo # Prevent PHP execution in uploads directory > "uploads\.htaccess"
    echo ^<FilesMatch "\.php$"^> >> "uploads\.htaccess"
    echo     Order Allow,Deny >> "uploads\.htaccess"
    echo     Deny from all >> "uploads\.htaccess"
    echo ^</FilesMatch^> >> "uploads\.htaccess"
    echo. >> "uploads\.htaccess"
    echo # Allow only image files >> "uploads\.htaccess"
    echo ^<FilesMatch "\.(jpg^|jpeg^|png^|gif^|svg^|webp)$"^> >> "uploads\.htaccess"
    echo     Order Allow,Deny >> "uploads\.htaccess"
    echo     Allow from all >> "uploads\.htaccess"
    echo ^</FilesMatch^> >> "uploads\.htaccess"
)

echo Directories created.
echo.

REM Check if .env file exists, if not create a template
if not exist ".env" (
    echo Creating .env file template...
    (
        echo # LinkNest Environment Variables
        echo # Add your Gemini API key here if needed
        echo # GEMINI_API_KEY=your_api_key_here
    ) > .env
    echo .env file created.
    echo.
)

REM Stop and remove existing containers if they exist
echo Stopping existing containers (if any)...
docker compose down >nul 2>&1

REM Build and start the application
echo.
echo Building Docker image...
echo This may take several minutes on first run...
echo.
docker compose build --no-cache

if %errorLevel% neq 0 (
    echo.
    echo ERROR: Failed to build Docker image.
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo Starting LinkNest application...
docker compose up -d

if %errorLevel% neq 0 (
    echo.
    echo ERROR: Failed to start container.
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)

REM Wait for container to be ready
echo.
echo Waiting for application to start...
timeout /t 5 /nobreak >nul

REM Check if container is running
docker ps | findstr /C:"linknest" >nul
if %errorLevel% equ 0 (
    echo.
    echo ==========================================
    echo Deployment Successful!
    echo ==========================================
    echo.
    echo Application is running at: http://localhost:8000
    echo.
    echo Default admin credentials:
    echo   Username: admin
    echo   Password: admin123
    echo.
    echo IMPORTANT: Change the admin password after first login!
    echo.
    echo Useful commands:
    echo   View logs: docker compose logs -f
    echo   Stop: docker compose down
    echo   Restart: docker compose restart
    echo   View status: docker compose ps
    echo.
    echo Press any key to open the application in your browser...
    pause >nul
    start http://localhost:8000
) else (
    echo.
    echo ERROR: Container failed to start.
    echo.
    echo Check logs with: docker compose logs
    echo.
    pause
    exit /b 1
)

















































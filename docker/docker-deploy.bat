@echo off
REM LinkNest Docker Deployment Script for Windows
REM This script builds and deploys LinkNest as a Docker container on port 8000
REM Run this script from the docker/ directory

echo 🚀 Starting LinkNest Docker Deployment...
echo.

REM Get the project root directory (parent of docker/)
cd /d "%~dp0\.."

REM Check if Docker is installed
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

REM Check if Docker Compose is available
docker compose version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    docker-compose version >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Docker Compose is not available. Please install Docker Desktop.
        exit /b 1
    )
    set COMPOSE_CMD=docker-compose
) else (
    set COMPOSE_CMD=docker compose
)

REM Create necessary directories
echo 📁 Creating necessary directories...
if not exist "data" mkdir "data"
if not exist "uploads" mkdir "uploads"

REM Create .htaccess for uploads if it doesn't exist
if not exist "uploads\.htaccess" (
    echo 📝 Creating uploads\.htaccess...
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

REM Stop existing container if running
echo 🛑 Stopping existing containers (if any)...
%COMPOSE_CMD% -f docker\docker-compose.yml down 2>nul

REM Build and start the container
echo 🔨 Building Docker image...
%COMPOSE_CMD% -f docker\docker-compose.yml build

echo 🚀 Starting container on port 8000...
%COMPOSE_CMD% -f docker\docker-compose.yml up -d

REM Wait for container to be ready
echo ⏳ Waiting for container to be ready...
timeout /t 5 /nobreak >nul

REM Check if container is running
%COMPOSE_CMD% -f docker\docker-compose.yml ps | findstr "Up" >nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ LinkNest is now running!
    echo.
    echo 📍 Access the application at: http://localhost:8000
    echo.
    echo 📋 Default credentials:
    echo    Username: admin
    echo    Password: admin123
    echo.
    echo ⚠️  IMPORTANT: Change the admin password after first login!
    echo.
    echo 📊 Useful commands:
    echo    View logs:        %COMPOSE_CMD% -f docker\docker-compose.yml logs -f
    echo    Stop container:   %COMPOSE_CMD% -f docker\docker-compose.yml down
    echo    Restart:          %COMPOSE_CMD% -f docker\docker-compose.yml restart
    echo    View status:      %COMPOSE_CMD% -f docker\docker-compose.yml ps
    echo.
) else (
    echo ❌ Container failed to start. Check logs with: %COMPOSE_CMD% -f docker\docker-compose.yml logs
    exit /b 1
)


























































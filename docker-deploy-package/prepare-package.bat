@echo off
REM ============================================================================
REM LinkNest Docker Deployment Package Builder
REM ============================================================================
REM This script prepares a self-contained Docker deployment package
REM that can be zipped and shared for easy deployment
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================================
echo   LinkNest Docker Deployment Package Builder
echo ============================================================================
echo.

set "SOURCE_DIR=%~dp0.."
set "PACKAGE_DIR=%~dp0"

echo Source Directory: %SOURCE_DIR%
echo Package Directory: %PACKAGE_DIR%
echo.

REM Create necessary directories
echo [1/10] Creating directory structure...
if not exist "%PACKAGE_DIR%\api" mkdir "%PACKAGE_DIR%\api"
if not exist "%PACKAGE_DIR%\scripts" mkdir "%PACKAGE_DIR%\scripts"
if not exist "%PACKAGE_DIR%\components" mkdir "%PACKAGE_DIR%\components"
if not exist "%PACKAGE_DIR%\contexts" mkdir "%PACKAGE_DIR%\contexts"
if not exist "%PACKAGE_DIR%\services" mkdir "%PACKAGE_DIR%\services"
if not exist "%PACKAGE_DIR%\land" mkdir "%PACKAGE_DIR%\land"
if not exist "%PACKAGE_DIR%\data" mkdir "%PACKAGE_DIR%\data"
if not exist "%PACKAGE_DIR%\uploads" mkdir "%PACKAGE_DIR%\uploads"
if not exist "%PACKAGE_DIR%\docker-config" mkdir "%PACKAGE_DIR%\docker-config"
echo ✓ Directory structure created
echo.

REM Copy API files
echo [2/10] Copying API files...
xcopy /E /I /Y /Q "%SOURCE_DIR%\api" "%PACKAGE_DIR%\api" >nul
echo ✓ API files copied
echo.

REM Copy scripts
echo [3/10] Copying scripts...
xcopy /E /I /Y /Q "%SOURCE_DIR%\scripts" "%PACKAGE_DIR%\scripts" >nul
echo ✓ Scripts copied
echo.

REM Copy frontend source files
echo [4/10] Copying frontend source files...
xcopy /E /I /Y /Q "%SOURCE_DIR%\components" "%PACKAGE_DIR%\components" >nul
xcopy /E /I /Y /Q "%SOURCE_DIR%\contexts" "%PACKAGE_DIR%\contexts" >nul
xcopy /E /I /Y /Q "%SOURCE_DIR%\services" "%PACKAGE_DIR%\services" >nul
xcopy /E /I /Y /Q "%SOURCE_DIR%\land" "%PACKAGE_DIR%\land" >nul
echo ✓ Frontend source files copied
echo.

REM Copy root files
echo [5/10] Copying root configuration files...
copy /Y "%SOURCE_DIR%\package.json" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\package-lock.json" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\vite.config.ts" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\vite.docker.config.ts" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\tsconfig.json" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\tailwind.config.js" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\postcss.config.js" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\index.html" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\index.tsx" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\index.css" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\App.tsx" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\types.ts" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\.htaccess" "%PACKAGE_DIR%\" >nul
copy /Y "%SOURCE_DIR%\check_opcache.php" "%PACKAGE_DIR%\" >nul 2>nul
echo ✓ Root configuration files copied
echo.

REM Copy database files
echo [6/10] Copying database files...
if exist "%SOURCE_DIR%\data\linknest.db" (
    copy /Y "%SOURCE_DIR%\data\linknest.db" "%PACKAGE_DIR%\data\" >nul
    echo ✓ Database file copied
) else (
    echo ! No database file found - will be created on first run
)
echo.

REM Copy uploads folder
echo [7/10] Copying uploads folder...
if exist "%SOURCE_DIR%\uploads\*.*" (
    xcopy /E /I /Y /Q "%SOURCE_DIR%\uploads" "%PACKAGE_DIR%\uploads" >nul
    echo ✓ Uploads folder copied
) else (
    echo ! No uploads found - folder will be empty
)
echo.

REM Copy Docker configuration files
echo [8/10] Copying Docker configuration files...
copy /Y "%SOURCE_DIR%\docker\apache-config.conf" "%PACKAGE_DIR%\docker-config\" >nul
copy /Y "%SOURCE_DIR%\docker\apache-ssl-config.conf" "%PACKAGE_DIR%\docker-config\" >nul
copy /Y "%SOURCE_DIR%\docker\php-config.ini" "%PACKAGE_DIR%\docker-config\" >nul
copy /Y "%SOURCE_DIR%\docker\linknest-entrypoint.sh" "%PACKAGE_DIR%\docker-config\" >nul
copy /Y "%SOURCE_DIR%\docker\verify-php.sh" "%PACKAGE_DIR%\docker-config\" >nul
copy /Y "%SOURCE_DIR%\docker\generate-ssl-cert.sh" "%PACKAGE_DIR%\docker-config\" >nul
copy /Y "%SOURCE_DIR%\docker\.htaccess" "%PACKAGE_DIR%\docker-config\" >nul
echo ✓ Docker configuration files copied
echo.

REM Create README
echo [9/10] Creating README...
(
echo # LinkNest Docker Deployment Package
echo.
echo This is a self-contained Docker deployment package for LinkNest.
echo.
echo ## Quick Start
echo.
echo 1. Ensure Docker Desktop is installed and running
echo 2. Run `deploy.bat` to build and start the container
echo 3. Access the application at http://localhost:8090
echo.
echo ## What's Included
echo.
echo - Complete LinkNest application source code
echo - Docker configuration files
echo - Database file ^(if available^)
echo - Uploads folder with assets
echo - Automated deployment script
echo.
echo ## Requirements
echo.
echo - Docker Desktop for Windows
echo - At least 2GB of free disk space
echo - Ports 8090 ^(HTTP^), 8443 ^(HTTPS^), 1025 ^(SMTP^), 8025 ^(Mailpit UI^) available
echo.
echo ## Deployment
echo.
echo Simply run:
echo ```
echo deploy.bat
echo ```
echo.
echo The script will:
echo 1. Check Docker installation
echo 2. Build the Docker image
echo 3. Start the containers
echo 4. Open the application in your browser
echo.
echo ## Container Management
echo.
echo - View logs: `docker compose logs -f`
echo - Stop: `docker compose stop`
echo - Start: `docker compose start`
echo - Restart: `docker compose restart`
echo - Remove: `docker compose down`
echo.
echo ## Data Export
echo.
echo To export data from the container:
echo ```
echo docker cp linknest:/var/www/html/data/linknest.db ./exported-database.db
echo docker cp linknest:/var/www/html/uploads ./exported-uploads
echo ```
echo.
echo ## Support
echo.
echo For issues or questions, please refer to the LinkNest documentation.
) > "%PACKAGE_DIR%\README.md"
echo ✓ README created
echo.

REM Create .dockerignore
echo [10/10] Creating .dockerignore...
(
echo # Node modules
echo node_modules/
echo npm-debug.log
echo.
echo # Build output
echo dist/
echo.
echo # Git
echo .git/
echo .gitignore
echo .gitattributes
echo.
echo # IDE
echo .vscode/
echo .idea/
echo *.swp
echo *.swo
echo.
echo # OS
echo .DS_Store
echo Thumbs.db
echo.
echo # Logs
echo *.log
echo.
echo # Temporary files
echo *.tmp
echo *.temp
echo.
echo # Documentation
echo docs/
echo .docs/
echo.
echo # Test files
echo test-bundle/
echo *.test.*
echo test_*.php
) > "%PACKAGE_DIR%\.dockerignore"
echo ✓ .dockerignore created
echo.

echo ============================================================================
echo   Package Preparation Complete!
echo ============================================================================
echo.
echo The deployment package is ready in:
echo %PACKAGE_DIR%
echo.
echo Next steps:
echo 1. Test the deployment by running deploy.bat
echo 2. If successful, zip the entire folder for distribution
echo 3. Share the zip file - recipients just need to extract and run deploy.bat
echo.
echo To create a zip file:
echo - Right-click the folder
echo - Select "Send to" ^> "Compressed (zipped) folder"
echo.
echo ============================================================================
echo.
pause

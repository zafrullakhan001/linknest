@echo off
REM Bundle LinkNest Application for Standalone Deployment (Windows)
REM This script creates a complete deployment package that can be deployed
REM from any location without requiring access to the full repository

setlocal enabledelayedexpansion

echo ==========================================
echo LinkNest Deployment Bundle Creator
echo ==========================================
echo.

REM Get the project root directory
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "PROJECT_ROOT=%%~fI"
set "TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "BUNDLE_NAME=linknest-deployment-%TIMESTAMP%"
set "BUNDLE_DIR=%PROJECT_ROOT%\%BUNDLE_NAME%"

echo Project root: %PROJECT_ROOT%
echo Bundle directory: %BUNDLE_DIR%
echo.

REM Create bundle directory structure
echo Creating bundle directory structure...
if not exist "%BUNDLE_DIR%" mkdir "%BUNDLE_DIR%"
if not exist "%BUNDLE_DIR%\docker" mkdir "%BUNDLE_DIR%\docker"
if not exist "%BUNDLE_DIR%\api" mkdir "%BUNDLE_DIR%\api"
if not exist "%BUNDLE_DIR%\components" mkdir "%BUNDLE_DIR%\components"
if not exist "%BUNDLE_DIR%\contexts" mkdir "%BUNDLE_DIR%\contexts"
if not exist "%BUNDLE_DIR%\services" mkdir "%BUNDLE_DIR%\services"
if not exist "%BUNDLE_DIR%\data" mkdir "%BUNDLE_DIR%\data"
if not exist "%BUNDLE_DIR%\uploads" mkdir "%BUNDLE_DIR%\uploads"
if not exist "%BUNDLE_DIR%\scripts" mkdir "%BUNDLE_DIR%\scripts"
echo ✓ Directory structure created
echo.

REM Copy Docker files
echo Copying Docker configuration files...
copy "%PROJECT_ROOT%\docker\Dockerfile" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\docker-compose.yml" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\apache-config.conf" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\apache-ssl-config.conf" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\php-config.ini" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\.htaccess" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\generate-ssl-cert.sh" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\verify-php.sh" "%BUNDLE_DIR%\docker\" >nul
echo ✓ Docker files copied
echo.

REM Copy API files
echo Copying API files...
xcopy "%PROJECT_ROOT%\api\*" "%BUNDLE_DIR%\api\" /E /I /Y >nul
echo ✓ API files copied
echo.

REM Copy frontend source files
echo Copying frontend source files...
if exist "%PROJECT_ROOT%\index.html" copy "%PROJECT_ROOT%\index.html" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\index.tsx" copy "%PROJECT_ROOT%\index.tsx" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\index.css" copy "%PROJECT_ROOT%\index.css" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\App.tsx" copy "%PROJECT_ROOT%\App.tsx" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\types.ts" copy "%PROJECT_ROOT%\types.ts" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\components" xcopy "%PROJECT_ROOT%\components\*" "%BUNDLE_DIR%\components\" /E /I /Y >nul
if exist "%PROJECT_ROOT%\contexts" xcopy "%PROJECT_ROOT%\contexts\*" "%BUNDLE_DIR%\contexts\" /E /I /Y >nul
if exist "%PROJECT_ROOT%\services" xcopy "%PROJECT_ROOT%\services\*" "%BUNDLE_DIR%\services\" /E /I /Y >nul
echo ✓ Frontend source files copied
echo.

REM Copy build configuration files
echo Copying build configuration files...
if exist "%PROJECT_ROOT%\package.json" copy "%PROJECT_ROOT%\package.json" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\package-lock.json" copy "%PROJECT_ROOT%\package-lock.json" "%BUNDLE_DIR\" >nul 2>&1
if exist "%PROJECT_ROOT%\vite.config.ts" copy "%PROJECT_ROOT%\vite.config.ts" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\vite.docker.config.ts" copy "%PROJECT_ROOT%\vite.docker.config.ts" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\tsconfig.json" copy "%PROJECT_ROOT%\tsconfig.json" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\tailwind.config.js" copy "%PROJECT_ROOT%\tailwind.config.js" "%BUNDLE_DIR\" >nul
if exist "%PROJECT_ROOT%\postcss.config.js" copy "%PROJECT_ROOT%\postcss.config.js" "%BUNDLE_DIR\" >nul
echo ✓ Build configuration files copied
echo.

REM Copy utility files
echo Copying utility files...
copy "%PROJECT_ROOT%\check_opcache.php" "%BUNDLE_DIR\" >nul 2>&1
echo ✓ Utility files copied
echo.

REM Verify OPcache and LDAP are in Dockerfile
echo Verifying OPcache and LDAP configuration...
findstr /C:"opcache" /C:"ldap" "%BUNDLE_DIR%\docker\Dockerfile" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✓ OPcache and LDAP extensions confirmed in Dockerfile
) else (
    echo ⚠ Warning: OPcache or LDAP may not be properly configured
)
findstr /C:"opcache.enable" "%BUNDLE_DIR%\docker\php-config.ini" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✓ OPcache configuration confirmed in php-config.ini
) else (
    echo ⚠ Warning: OPcache configuration may be missing
)
echo.

REM Copy deployment scripts
echo Copying deployment scripts...
copy "%PROJECT_ROOT%\docker\deploy.sh" "%BUNDLE_DIR%\docker\" >nul
copy "%PROJECT_ROOT%\docker\deploy.bat" "%BUNDLE_DIR%\docker\" >nul
echo ✓ Deployment scripts copied
echo.

REM Copy database if it exists
if exist "%PROJECT_ROOT%\data\linknest.db" (
    echo Copying existing database...
    copy "%PROJECT_ROOT%\data\linknest.db" "%BUNDLE_DIR%\data\" >nul 2>&1
    echo ✓ Database copied
) else (
    echo ⚠ No existing database found - will be created on first run
)
echo.

REM Create standalone deployment script for Windows
echo Creating standalone deployment script...
(
echo @echo off
echo REM Standalone Deployment Script for LinkNest ^(Windows^)
echo REM This script can be run from the bundled deployment folder
echo.
echo echo ==========================================
echo echo LinkNest Standalone Deployment
echo echo ==========================================
echo echo.
echo REM Check if Docker is installed
echo where docker ^>nul 2^>^&1
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo Error: Docker is not installed. Please install Docker Desktop first.
echo     exit /b 1
echo ^)
echo.
echo REM Check if Docker Compose is installed
echo where docker-compose ^>nul 2^>^&1
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo Error: Docker Compose is not installed. Please install Docker Compose first.
echo     exit /b 1
echo ^)
echo.
echo cd /d "%%~dp0docker"
echo.
echo echo Building Docker image...
echo docker-compose build
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo Error: Docker build failed
echo     exit /b 1
echo ^)
echo.
echo echo.
echo echo Starting container...
echo docker-compose up -d
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo Error: Failed to start container
echo     exit /b 1
echo ^)
echo.
echo echo.
echo echo Deployment complete!
echo echo.
echo echo Application URLs:
echo echo HTTP:  http://localhost:8090
echo echo HTTPS: https://localhost:8443
echo echo.
echo pause
) > "%BUNDLE_DIR%\deploy.bat"

REM Create README
echo Creating README...
(
echo # LinkNest Standalone Deployment Package
echo.
echo This is a complete, standalone deployment package for LinkNest.
echo.
echo ## Quick Start
echo.
echo ### Windows
echo ```batch
echo deploy.bat
echo ```
echo.
echo ## Default Login
echo - Username: `admin`
echo - Password: `admin123`
echo.
echo See README_DEPLOYMENT.md for full documentation.
) > "%BUNDLE_DIR%\README.md"

echo ✓ Deployment scripts and documentation created
echo.

REM Create bundle info
(
echo LinkNest Deployment Bundle
echo Created: %date% %time%
echo Version: Standalone Deployment Package
echo.
echo To deploy: Run deploy.bat
) > "%BUNDLE_DIR%\BUNDLE_INFO.txt"

echo ✓ Bundle information file created
echo.

echo ==========================================
echo Bundle Created Successfully!
echo ==========================================
echo.
echo Bundle Location: %BUNDLE_DIR%
echo.
echo Next steps:
echo 1. Copy the bundle folder to your deployment location
echo 2. Navigate to the bundle folder
echo 3. Run: deploy.bat
echo.
echo The bundle is ready for standalone deployment!
echo.

pause


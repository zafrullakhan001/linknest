@echo off
setlocal enabledelayedexpansion
REM Bundle LinkNest Application for Standalone Deployment (Windows)
REM Fixed version with proper error handling

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

REM Verify project root
if not exist "%PROJECT_ROOT%\index.html" (
    echo ERROR: Cannot find project files. Is this the correct directory?
    echo Expected: %PROJECT_ROOT%\index.html
    pause
    exit /b 1
)

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

REM Copy frontend source files - check each one
echo Copying frontend source files...
set "FILE_ERROR=0"

REM Use PowerShell for reliable copying
powershell -Command "if (Test-Path '%PROJECT_ROOT%\index.html') { Copy-Item '%PROJECT_ROOT%\index.html' -Destination '%BUNDLE_DIR%' -Force; exit 0 } else { exit 1 }" >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] index.html not found or failed to copy!
    set "FILE_ERROR=1"
)

if not exist "%PROJECT_ROOT%\index.tsx" (
    echo [ERROR] index.tsx not found!
    set "FILE_ERROR=1"
) else (
    copy /Y "%PROJECT_ROOT%\index.tsx" "%BUNDLE_DIR%\index.tsx" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy index.tsx
        set "FILE_ERROR=1"
    )
)

if not exist "%PROJECT_ROOT%\index.css" (
    echo [ERROR] index.css not found!
    set "FILE_ERROR=1"
) else (
    copy /Y "%PROJECT_ROOT%\index.css" "%BUNDLE_DIR%\index.css" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy index.css
        set "FILE_ERROR=1"
    )
)

if not exist "%PROJECT_ROOT%\App.tsx" (
    echo [ERROR] App.tsx not found!
    set "FILE_ERROR=1"
) else (
    copy /Y "%PROJECT_ROOT%\App.tsx" "%BUNDLE_DIR%\App.tsx" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy App.tsx
        set "FILE_ERROR=1"
    )
)

if not exist "%PROJECT_ROOT%\types.ts" (
    echo [ERROR] types.ts not found!
    set "FILE_ERROR=1"
) else (
    copy /Y "%PROJECT_ROOT%\types.ts" "%BUNDLE_DIR%\types.ts" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy types.ts
        set "FILE_ERROR=1"
    )
)

if not exist "%PROJECT_ROOT%\components" (
    echo [ERROR] components directory not found!
    set "FILE_ERROR=1"
) else (
    xcopy "%PROJECT_ROOT%\components\*" "%BUNDLE_DIR%\components\" /E /I /Y >nul
)

if not exist "%PROJECT_ROOT%\contexts" (
    echo [ERROR] contexts directory not found!
    set "FILE_ERROR=1"
) else (
    xcopy "%PROJECT_ROOT%\contexts\*" "%BUNDLE_DIR%\contexts\" /E /I /Y >nul
)

if not exist "%PROJECT_ROOT%\services" (
    echo [ERROR] services directory not found!
    set "FILE_ERROR=1"
) else (
    xcopy "%PROJECT_ROOT%\services\*" "%BUNDLE_DIR%\services\" /E /I /Y >nul
)

REM hooks / utils (Vite source imports — required for rebuild + App Updates UI)
if exist "%PROJECT_ROOT%\hooks" (
    xcopy "%PROJECT_ROOT%\hooks\*" "%BUNDLE_DIR%\hooks\" /E /I /Y >nul
    echo ✓ hooks/ copied
)
if not exist "%PROJECT_ROOT%\utils" (
    echo [ERROR] utils directory not found!
    set "FILE_ERROR=1"
) else (
    xcopy "%PROJECT_ROOT%\utils\*" "%BUNDLE_DIR%\utils\" /E /I /Y >nul
    echo ✓ utils/ copied
)
if exist "%PROJECT_ROOT%\docs" (
    xcopy "%PROJECT_ROOT%\docs\*" "%BUNDLE_DIR%\docs\" /E /I /Y >nul
    echo ✓ docs/ copied
)
if exist "%PROJECT_ROOT%\AGENTS.md" (
    copy /Y "%PROJECT_ROOT%\AGENTS.md" "%BUNDLE_DIR%\AGENTS.md" >nul
)

if !FILE_ERROR! EQU 1 (
    echo.
    echo ERROR: Required source files are missing! Bundle creation failed.
    pause
    exit /b 1
)

echo ✓ Frontend source files copied
echo.

REM Copy build configuration files
echo Copying build configuration files...
set "BUILD_ERR=0"

if not exist "%PROJECT_ROOT%\package.json" (
    echo [ERROR] package.json not found!
    set "BUILD_ERR=1"
) else (
    copy /Y "%PROJECT_ROOT%\package.json" "%BUNDLE_DIR%\package.json" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy package.json
        set "BUILD_ERR=1"
    )
)

if exist "%PROJECT_ROOT%\package-lock.json" (
    copy /Y "%PROJECT_ROOT%\package-lock.json" "%BUNDLE_DIR%\package-lock.json" >nul
    if !ERRORLEVEL! EQU 0 echo ✓ package-lock.json copied
) else (
    echo ⚠ Warning: package-lock.json not found - npm install will be used instead of npm ci
)

if not exist "%PROJECT_ROOT%\vite.config.ts" (
    echo [ERROR] vite.config.ts not found!
    set "BUILD_ERR=1"
) else (
    copy /Y "%PROJECT_ROOT%\vite.config.ts" "%BUNDLE_DIR%\vite.config.ts" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy vite.config.ts
        set "BUILD_ERR=1"
    )
)

if not exist "%PROJECT_ROOT%\vite.docker.config.ts" (
    echo [ERROR] vite.docker.config.ts not found!
    set "BUILD_ERR=1"
) else (
    copy /Y "%PROJECT_ROOT%\vite.docker.config.ts" "%BUNDLE_DIR%\vite.docker.config.ts" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy vite.docker.config.ts
        set "BUILD_ERR=1"
    )
)

if not exist "%PROJECT_ROOT%\tsconfig.json" (
    echo [ERROR] tsconfig.json not found!
    set "BUILD_ERR=1"
) else (
    copy /Y "%PROJECT_ROOT%\tsconfig.json" "%BUNDLE_DIR%\tsconfig.json" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy tsconfig.json
        set "BUILD_ERR=1"
    )
)

if not exist "%PROJECT_ROOT%\tailwind.config.js" (
    echo [ERROR] tailwind.config.js not found!
    set "BUILD_ERR=1"
) else (
    copy /Y "%PROJECT_ROOT%\tailwind.config.js" "%BUNDLE_DIR%\tailwind.config.js" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy tailwind.config.js
        set "BUILD_ERR=1"
    )
)

if not exist "%PROJECT_ROOT%\postcss.config.js" (
    echo [ERROR] postcss.config.js not found!
    set "BUILD_ERR=1"
) else (
    copy /Y "%PROJECT_ROOT%\postcss.config.js" "%BUNDLE_DIR%\postcss.config.js" >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to copy postcss.config.js
        set "BUILD_ERR=1"
    )
)

if !BUILD_ERR! EQU 1 (
    echo.
    echo ERROR: Required build files are missing! Bundle creation failed.
    pause
    exit /b 1
)

echo ✓ Build configuration files copied
echo.

REM Copy utility files
echo Copying utility files...
if exist "%PROJECT_ROOT%\check_opcache.php" (
    copy /Y "%PROJECT_ROOT%\check_opcache.php" "%BUNDLE_DIR%\check_opcache.php" >nul
) else (
    echo Note: check_opcache.php not found, skipping ^(optional^)
)
echo ✓ Utility files copied
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

REM Copy uploads directory (logos, favicons, etc.)
echo Copying uploads directory (logos, favicons, etc.)...
if exist "%PROJECT_ROOT%\uploads" (
    xcopy "%PROJECT_ROOT%\uploads\*" "%BUNDLE_DIR%\uploads\" /E /I /Y >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo ✓ Uploads directory copied ^(logos, favicons, etc.^)
    ) else (
        echo ⚠ Warning: Failed to copy uploads directory
    )
) else (
    echo ⚠ No uploads directory found - will be created on first run
)
echo.

REM Verify OPcache and LDAP
echo Verifying OPcache and LDAP configuration...
findstr /C:"opcache" /C:"ldap" "%BUNDLE_DIR%\docker\Dockerfile" >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✓ OPcache and LDAP extensions confirmed in Dockerfile
) else (
    echo ⚠ Warning: OPcache or LDAP may not be properly configured
)
findstr /C:"opcache.enable" "%BUNDLE_DIR%\docker\php-config.ini" >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✓ OPcache configuration confirmed in php-config.ini
) else (
    echo ⚠ Warning: OPcache configuration may be missing
)
echo.

REM Create standalone deployment script
(
echo @echo off
echo REM Standalone Deployment Script for LinkNest ^(Windows^)
echo cd /d "%%~dp0docker"
echo echo Building Docker image...
echo docker-compose build
echo if %%ERRORLEVEL%% NEQ 0 exit /b 1
echo echo Starting container...
echo docker-compose up -d
echo if %%ERRORLEVEL%% NEQ 0 exit /b 1
echo echo.
echo echo Deployment complete!
echo echo HTTP:  http://localhost:8090
echo echo HTTPS: https://localhost:8443
echo pause
) > "%BUNDLE_DIR%\deploy.bat"

REM Create README
(
echo # LinkNest Standalone Deployment Package
echo.
echo Run deploy.bat to deploy.
) > "%BUNDLE_DIR%\README.md"

(
echo LinkNest Deployment Bundle
echo Created: %date% %time%
) > "%BUNDLE_DIR%\BUNDLE_INFO.txt"

echo ==========================================
echo Bundle Created Successfully!
echo ==========================================
echo.
echo Bundle Location: %BUNDLE_DIR%
echo.
echo Next steps:
echo 1. Navigate to the bundle folder
echo 2. Run: deploy.bat
echo.

pause


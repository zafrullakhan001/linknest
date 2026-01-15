@echo off
REM LinkNest Runtime Bundle Creator for Windows
REM Creates a bundle with source files for building on target machine

setlocal enabledelayedexpansion

echo ==========================================
echo LinkNest Runtime Bundle Creator
echo ==========================================
echo.

REM Get the project root directory (parent of scripts folder)
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%"

REM Generate bundle name with timestamp
set "TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "TIMESTAMP=%TIMESTAMP:/=-%"
set "TIMESTAMP=%TIMESTAMP::=-%"
set "BUNDLE_NAME=linknest-runtime-%TIMESTAMP%"
set "BUNDLE_DIR=%PROJECT_ROOT%\%BUNDLE_NAME%"

echo Project root: %PROJECT_ROOT%
echo Bundle directory: %BUNDLE_DIR%
echo.

REM Remove existing bundle directory if it exists
if exist "%BUNDLE_DIR%" (
    echo Removing existing bundle directory...
    rmdir /s /q "%BUNDLE_DIR%"
)

REM Create bundle directory structure
echo Creating bundle directory structure...
mkdir "%BUNDLE_DIR%"
mkdir "%BUNDLE_DIR%\api"
mkdir "%BUNDLE_DIR%\components"
mkdir "%BUNDLE_DIR%\contexts"
mkdir "%BUNDLE_DIR%\services"
mkdir "%BUNDLE_DIR%\data"
mkdir "%BUNDLE_DIR%\uploads"
mkdir "%BUNDLE_DIR%\dist"
echo ✓ Directory structure created
echo.

REM Create .htaccess for dist folder to allow access
(
    echo # Allow access to dist directory
    echo Options -Indexes +FollowSymLinks
    echo.
    echo # Set MIME types for JavaScript files
    echo ^<IfModule mod_mime.c^>
    echo     AddType application/javascript .js
    echo     AddType application/javascript .mjs
    echo     AddType text/css .css
    echo ^</IfModule^>
) > "%BUNDLE_DIR%\dist\.htaccess"
echo ✓ Created .htaccess for dist folder
echo.

REM Copy API files
echo Copying API files...
if exist "api" (
    xcopy /Y /E /I /Q "api\*" "%BUNDLE_DIR%\api\" >nul 2>&1
)
echo ✓ API files copied
echo.

REM Copy frontend source files
echo Copying frontend source files...
if exist "index.html" (
    REM Fix the index.tsx path to be relative instead of absolute
    powershell -Command "(Get-Content 'index.html') -replace 'src=\"/index.tsx\"', 'src=\"./index.tsx\"' | Set-Content '%BUNDLE_DIR%\index.html'"
    echo ✓ index.html copied and fixed ^(relative path^)
) else (
    echo ⚠ Warning: index.html not found
)
if exist "index.tsx" copy /Y "index.tsx" "%BUNDLE_DIR%\index.tsx" >nul 2>&1
if exist "index.css" copy /Y "index.css" "%BUNDLE_DIR%\index.css" >nul 2>&1
if exist "App.tsx" copy /Y "App.tsx" "%BUNDLE_DIR%\App.tsx" >nul 2>&1
if exist "types.ts" copy /Y "types.ts" "%BUNDLE_DIR%\types.ts" >nul 2>&1
if exist "components" xcopy /Y /E /I /Q "components\*" "%BUNDLE_DIR%\components\" >nul 2>&1
if exist "contexts" xcopy /Y /E /I /Q "contexts\*" "%BUNDLE_DIR%\contexts\" >nul 2>&1
if exist "services" xcopy /Y /E /I /Q "services\*" "%BUNDLE_DIR%\services\" >nul 2>&1
echo ✓ Frontend source files copied
echo.

REM Copy build configuration files
echo Copying build configuration files...
if exist "package.json" copy /Y "package.json" "%BUNDLE_DIR%\package.json" >nul 2>&1
if exist "package-lock.json" (
    copy /Y "package-lock.json" "%BUNDLE_DIR%\package-lock.json" >nul 2>&1
)
if exist "vite.config.ts" copy /Y "vite.config.ts" "%BUNDLE_DIR%\vite.config.ts" >nul 2>&1
if exist "vite.docker.config.ts" copy /Y "vite.docker.config.ts" "%BUNDLE_DIR%\vite.docker.config.ts" >nul 2>&1
if exist "vite.runtime.config.ts" copy /Y "vite.runtime.config.ts" "%BUNDLE_DIR%\vite.runtime.config.ts" >nul 2>&1
if exist "tsconfig.json" copy /Y "tsconfig.json" "%BUNDLE_DIR%\tsconfig.json" >nul 2>&1
if exist "tailwind.config.js" copy /Y "tailwind.config.js" "%BUNDLE_DIR%\tailwind.config.js" >nul 2>&1
if exist "postcss.config.js" copy /Y "postcss.config.js" "%BUNDLE_DIR%\postcss.config.js" >nul 2>&1
echo ✓ Build configuration files copied
echo.

REM Copy PHP router if it exists
if exist "router.php" (
    copy /Y "router.php" "%BUNDLE_DIR%\router.php" >nul 2>&1
    echo ✓ Router file copied
)

REM Copy .htaccess file (for Apache web server)
REM Prefer docker/.htaccess as it's more generic (no base path requirement)
if exist "docker\.htaccess" (
    copy /Y "docker\.htaccess" "%BUNDLE_DIR%\.htaccess" >nul 2>&1
    echo ✓ .htaccess file copied from docker folder
) else if exist ".htaccess" (
    copy /Y ".htaccess" "%BUNDLE_DIR%\.htaccess" >nul 2>&1
    echo ✓ .htaccess file copied
) else (
    echo ⚠ Warning: No .htaccess file found. Apache configuration may be needed.
)

REM Copy utility files
if exist "check_opcache.php" (
    copy /Y "check_opcache.php" "%BUNDLE_DIR%\check_opcache.php" >nul 2>&1
)

REM Copy database files
echo Copying database files...
if exist "data" (
    xcopy /Y "data\*.db" "%BUNDLE_DIR%\data\" >nul 2>&1
    if exist "%BUNDLE_DIR%\data\*.db" (
        echo ✓ Database files copied
    ) else (
        echo ⚠ No database files found in data directory
    )
) else (
    echo ⚠ Warning: data directory not found
)
echo.

REM Copy uploads directory (logos, favicons, etc.)
echo Copying uploads directory...
if exist "uploads" (
    xcopy /Y /E /I /Q "uploads\*" "%BUNDLE_DIR%\uploads\" >nul 2>&1
    echo ✓ Uploads directory copied ^(includes logos and favicons^)
) else (
    echo ⚠ Warning: uploads directory not found
)
echo.

REM Copy uploads .htaccess if it exists
if exist "uploads\.htaccess" (
    copy /Y "uploads\.htaccess" "%BUNDLE_DIR%\uploads\.htaccess" >nul 2>&1
) else (
    REM Create uploads .htaccess for security
    (
        echo # Prevent PHP execution in uploads directory
        echo ^<FilesMatch "\.php$"^>
        echo     Order Allow,Deny
        echo     Deny from all
        echo ^</FilesMatch^>
        echo.
        echo # Allow only image files
        echo ^<FilesMatch "\.(jpg^|jpeg^|png^|gif^|svg^|webp^|ico)$"^>
        echo     Order Allow,Deny
        echo     Allow from all
        echo ^</FilesMatch^>
    ) > "%BUNDLE_DIR%\uploads\.htaccess"
)
echo ✓ Utility files copied
echo.

REM Create build script for target machine
echo Creating build script...
(
echo @echo off
echo REM LinkNest Build Script for Windows
echo REM Run this script after copying the bundle to target machine
echo.
echo echo ==========================================
echo echo LinkNest Build Process
echo echo ==========================================
echo echo.
echo REM Check if Node.js is installed
echo where node ^>nul 2^>^&1
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo ERROR: Node.js is not installed.
echo     echo Please install Node.js from https://nodejs.org/
echo     pause
echo     exit /b 1
echo ^)
echo.
echo REM Check if npm is installed
echo where npm ^>nul 2^>^&1
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo ERROR: npm is not installed.
echo     echo Please install npm ^(comes with Node.js^)
echo     pause
echo     exit /b 1
echo ^)
echo.
echo echo Installing dependencies...
echo call npm install
echo if %%ERRORLEVEL%% NEQ 0 ^(
echo     echo ERROR: Failed to install dependencies
echo     pause
echo     exit /b 1
echo ^)
echo.
echo echo.
echo echo Building application...
echo echo Using vite.runtime.config.ts for relative path deployment...
echo call npm run build -- --config vite.runtime.config.ts
echo if %%ERRORLEVEL%% NEQ 0 (
echo     echo ERROR: Build failed
echo     pause
echo     exit /b 1
echo ^)
echo.
echo echo Verifying build output...
echo if not exist "dist\index.html" (
echo     echo ERROR: Build completed but dist\index.html was not created!
echo     echo Please check the build output for errors.
echo     pause
echo     exit /b 1
echo ^)
echo echo ✓ dist\index.html found
echo if not exist "dist\assets" (
echo     echo WARNING: dist\assets folder not found. Build may be incomplete.
echo ^) else (
echo     echo ✓ dist\assets folder found
echo ^)
echo.
echo echo ==========================================
echo echo Build completed successfully!
echo ==========================================
echo echo.
echo echo The application has been built in the 'dist' folder.
echo echo Production mode is now enabled.
echo echo.
echo echo For PHP built-in server, run:
echo echo     php -S localhost:8000 router.php
echo echo.
echo echo The router will automatically serve from the 'dist' folder.
echo echo.
echo pause
) > "%BUNDLE_DIR%\build.bat"

REM Create build script for Linux/Mac
(
echo #!/bin/bash
echo # LinkNest Build Script for Linux/Mac
echo # Run this script after copying the bundle to target machine
echo.
echo set -e
echo.
echo echo "=========================================="
echo echo "LinkNest Build Process"
echo echo "=========================================="
echo echo ""
echo.
echo # Check if Node.js is installed
echo if ! command -v node ^&^> /dev/null; then
echo     echo "ERROR: Node.js is not installed."
echo     echo "Please install Node.js from https://nodejs.org/"
echo     exit 1
echo fi
echo.
echo # Check if npm is installed
echo if ! command -v npm ^&^> /dev/null; then
echo     echo "ERROR: npm is not installed."
echo     echo "Please install npm ^(comes with Node.js^)"
echo     exit 1
echo fi
echo.
echo echo "Installing dependencies..."
echo npm install
echo.
echo echo ""
echo echo "Building application..."
echo npm run build
echo.
echo echo ""
echo echo "=========================================="
echo echo "Build completed successfully!"
echo echo "=========================================="
echo echo ""
echo echo "The application has been built in the 'dist' folder."
echo echo "You can now deploy the application using your web server."
echo echo ""
echo echo "For PHP built-in server, run:"
echo echo "    php -S localhost:8000 router.php"
echo echo ""
) > "%BUNDLE_DIR%\build.sh"

REM Make build.sh executable (if on Windows with Git Bash or WSL)
where bash >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    bash -c "chmod +x '%BUNDLE_DIR%\build.sh'" 2>nul
)

REM Create README
echo Creating README...
(
echo # LinkNest Runtime Bundle
echo.
echo This is a runtime bundle of the LinkNest application. It contains all source files
echo needed to build and run the application on the target machine.
echo.
echo ## Prerequisites
echo.
echo Before building, ensure you have the following installed:
echo.
echo - **Node.js** ^(version 16 or higher^) - https://nodejs.org/
echo - **npm** ^(comes with Node.js^)
echo - **PHP 8.0 or higher** - https://www.php.net/downloads.php
echo - **Web Server** ^(Apache, Nginx, or PHP built-in server^)
echo.
echo ## Building the Application
echo.
echo ### Windows
echo.
echo 1. Open Command Prompt or PowerShell in the bundle directory
echo 2. Run: `build.bat`
echo.
echo ### Linux/Mac
echo.
echo 1. Open Terminal in the bundle directory
echo 2. Run: `chmod +x build.sh`
echo 3. Run: `./build.sh`
echo.
echo ## Running the Application
echo.
echo After building, the application will be in the `dist` folder. You can run it using:
echo.
echo ### Option 1: PHP Built-in Server
echo.
echo ```bash
echo php -S localhost:8000 router.php
echo ```
echo.
echo Then open http://localhost:8000 in your browser.
echo.
echo ### Option 2: Apache/Nginx
echo.
echo Configure your web server to:
echo - Serve static files from the `dist` folder
echo - Route API requests to `api/index.php`
echo - Route all other requests to `dist/index.html` ^(for SPA routing^)
echo.
echo ## Directory Structure
echo.
echo - `api/` - PHP backend API files
echo - `components/` - React components
echo - `contexts/` - React contexts
echo - `services/` - TypeScript service files
echo - `data/` - Database files ^(SQLite^)
echo - `uploads/` - User uploaded files
echo - `dist/` - Built application ^(created after build^)
echo.
echo ## Configuration
echo.
echo The application uses environment variables for configuration. Create a `.env` file
echo in the root directory if needed:
echo.
echo ```env
echo GEMINI_API_KEY=your_api_key_here
echo ```
echo.
echo ## Default Login
echo.
echo - Username: `admin`
echo - Password: `admin123`
echo.
echo **Important:** Change the default password after first login!
echo.
echo ## Support
echo.
echo For more information, see the documentation in the `docs/` folder.
) > "%BUNDLE_DIR%\README.md"

REM Create .gitignore for the bundle
(
echo # Dependencies
echo node_modules/
echo.
echo # Build output
echo dist/
echo.
echo # Environment files
echo .env
echo .env.local
echo.
echo # Logs
echo *.log
echo.
echo # OS files
echo .DS_Store
echo Thumbs.db
) > "%BUNDLE_DIR%\.gitignore"

echo ✓ Documentation created
echo.

REM Create bundle info file
(
echo LinkNest Runtime Bundle
echo Created: %date% %time%
echo Version: Runtime Build Package
echo.
echo This bundle contains all source files needed to build the application.
echo Run build.bat ^(Windows^) or build.sh ^(Linux/Mac^) to build the application.
echo.
echo After building, deploy the 'dist' folder and 'api' folder to your web server.
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
echo 1. Copy the bundle folder to your target machine
echo 2. Navigate to the bundle folder
echo 3. Run: build.bat ^(Windows^) or ./build.sh ^(Linux/Mac^)
echo 4. Deploy the built application from the 'dist' folder
echo.
echo The bundle is ready for runtime deployment!
echo.

pause


@echo off
REM Clone LinkNest to a new folder with all necessary files
REM Usage: clone-linknest.bat <new-folder-name> [--assets] [--database]
REM Example: clone-linknest.bat myspaces --assets --database

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo.
    echo Usage: clone-linknest.bat ^<new-folder-name^> [--assets] [--database]
    echo.
    echo Parameters:
    echo   new-folder-name  Name of the new folder to create
    echo   --assets         Copy logos and favicon from uploads folder
    echo   --database       Copy database file from data folder
    echo.
    echo Examples:
    echo   clone-linknest.bat myspaces
    echo   clone-linknest.bat myspaces --assets
    echo   clone-linknest.bat myspaces --database
    echo   clone-linknest.bat myspaces --assets --database
    echo.
    exit /b 1
)

set "NEW_FOLDER=%~1"
set "COPY_ASSETS=0"
set "COPY_DATABASE=0"

REM Parse optional parameters
shift
:parse_params
if "%~1"=="" goto params_done
if /i "%~1"=="--assets" set "COPY_ASSETS=1"
if /i "%~1"=="--database" set "COPY_DATABASE=1"
shift
goto parse_params
:params_done
set "CURRENT_DIR=%~dp0.."
set "PARENT_DIR=%~dp0..\.."
set "TARGET_DIR=%PARENT_DIR%\%NEW_FOLDER%"

echo.
echo ========================================
echo LinkNest Clone Script
echo ========================================
echo.
echo Source: %CURRENT_DIR%
echo Target: %TARGET_DIR%
echo.

REM Check if target folder already exists
if exist "%TARGET_DIR%" (
    echo ERROR: Folder "%TARGET_DIR%" already exists!
    echo Please choose a different name or delete the existing folder.
    exit /b 1
)

REM Create target directory
echo [1/6] Creating target directory...
mkdir "%TARGET_DIR%" 2>nul
if errorlevel 1 (
    echo ERROR: Failed to create target directory!
    exit /b 1
)

REM Copy necessary files and directories
echo [2/6] Copying files...
echo.

REM Copy root files
echo   - Copying root files...
copy "%CURRENT_DIR%\package.json" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\package-lock.json" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\tsconfig.json" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\vite.config.ts" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\vite.docker.config.ts" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\vite.runtime.config.ts" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\tailwind.config.js" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\postcss.config.js" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\index.html" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\index.tsx" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\index.css" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\App.tsx" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\types.ts" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\router.php" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\.htaccess" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\README.md" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\bulk-import-template.csv" "%TARGET_DIR%\" >nul 2>&1
copy "%CURRENT_DIR%\section-links-import-template.csv" "%TARGET_DIR%\" >nul 2>&1

REM Copy directories
echo   - Copying api directory...
xcopy "%CURRENT_DIR%\api" "%TARGET_DIR%\api" /E /I /Y /Q >nul 2>&1

echo   - Copying components directory...
xcopy "%CURRENT_DIR%\components" "%TARGET_DIR%\components" /E /I /Y /Q >nul 2>&1

echo   - Copying contexts directory...
xcopy "%CURRENT_DIR%\contexts" "%TARGET_DIR%\contexts" /E /I /Y /Q >nul 2>&1

echo   - Copying services directory...
xcopy "%CURRENT_DIR%\services" "%TARGET_DIR%\services" /E /I /Y /Q >nul 2>&1

echo   - Copying src directory...
xcopy "%CURRENT_DIR%\src" "%TARGET_DIR%\src" /E /I /Y /Q >nul 2>&1

echo   - Creating data directory...
mkdir "%TARGET_DIR%\data" 2>nul

echo   - Creating uploads directory...
mkdir "%TARGET_DIR%\uploads" 2>nul

REM Copy assets if requested
if "%COPY_ASSETS%"=="1" (
    echo   - Copying logos and favicon...
    if exist "%CURRENT_DIR%\uploads\logo_*.*" (
        copy "%CURRENT_DIR%\uploads\logo_*.*" "%TARGET_DIR%\uploads\" >nul 2>&1
        echo     Copied logo files
    )
    if exist "%CURRENT_DIR%\uploads\favicon_*.*" (
        copy "%CURRENT_DIR%\uploads\favicon_*.*" "%TARGET_DIR%\uploads\" >nul 2>&1
        echo     Copied favicon files
    )
    if not exist "%CURRENT_DIR%\uploads\logo_*.*" if not exist "%CURRENT_DIR%\uploads\favicon_*.*" (
        echo     No logos or favicons found to copy
    )
)

REM Copy database if requested
if "%COPY_DATABASE%"=="1" (
    echo   - Copying database...
    if exist "%CURRENT_DIR%\data\linknest.db" (
        copy "%CURRENT_DIR%\data\linknest.db" "%TARGET_DIR%\data\linknest.db" >nul 2>&1
        if errorlevel 1 (
            echo     ERROR: Failed to copy database file
        ) else (
            echo     Copied database: data/linknest.db
        )
    ) else (
        echo     No database file found to copy
    )
)

REM Create .env file with new base path
echo [3/6] Creating .env file...
(
echo # LinkNest Environment Variables
echo # Base path for the application
echo VITE_BASE_PATH=/%NEW_FOLDER%
echo.
echo # Optional: HTTPS Configuration
echo # VITE_PROTOCOL=https
echo # VITE_HOST=your-domain.com
echo # VITE_PORT=443
echo.
echo # Optional: Gemini API Key
echo # GEMINI_API_KEY=your-api-key-here
) > "%TARGET_DIR%\.env"

echo   Created .env with VITE_BASE_PATH=/%NEW_FOLDER%

REM Install dependencies
echo [4/6] Installing npm dependencies...
echo   This may take a few minutes...
cd /d "%TARGET_DIR%"
call npm install
if errorlevel 1 (
    echo.
    echo ERROR: npm install failed!
    echo Please check the error messages above.
    exit /b 1
)

REM Build the application
echo [5/6] Building the application...
echo   This may take a few minutes...
call npm run build
if errorlevel 1 (
    echo.
    echo ERROR: npm run build failed!
    echo Please check the error messages above.
    exit /b 1
)

REM Remove node_modules after build (not needed for production, saves space)
echo   Build complete! Removing node_modules folder (not needed for production)...
if exist "%TARGET_DIR%\node_modules" (
    rd /s /q "%TARGET_DIR%\node_modules" 2>nul
    echo   Deleted node_modules folder to save space
) else (
    echo   node_modules folder not found
)

REM Create a README for the cloned instance
echo [6/6] Creating deployment README...
(
echo # %NEW_FOLDER% - LinkNest Instance
echo.
echo This is a cloned instance of LinkNest deployed to /%NEW_FOLDER%/
echo.
echo ## Quick Start
echo.
echo 1. The application has been built and is ready to use
echo 2. Access it at: http://localhost/%NEW_FOLDER%/
echo 3. Default admin credentials: admin / admin123
echo.
echo ## Database
echo.
echo The database file will be created at: data/linknest.db
echo.
echo ## Configuration
echo.
echo Edit .env to change settings:
echo - VITE_BASE_PATH: Current value is /%NEW_FOLDER%
echo - VITE_PROTOCOL: HTTP/HTTPS protocol
echo - VITE_HOST: Server hostname
echo - GEMINI_API_KEY: Optional API key for AI features
echo.
echo ## Rebuilding
echo.
echo To rebuild after making changes:
echo   cd %NEW_FOLDER%
echo   npm run build
echo.
) > "%TARGET_DIR%\DEPLOYMENT.md"

echo.
echo ========================================
echo Clone Complete!
echo ========================================
echo.
echo New instance created at: %TARGET_DIR%
echo.
echo Next steps:
echo 1. Access the application at: http://localhost/%NEW_FOLDER%/
echo 2. Login with default credentials: admin / admin123
echo 3. Change the admin password in the Admin Panel
echo.
if "%COPY_DATABASE%"=="1" (
    echo Database file: %TARGET_DIR%\data\linknest.db
    echo (Copied from source)
) else (
    echo Database file: %TARGET_DIR%\data\linknest.db
    echo (Will be created on first use)
)
echo.
pause


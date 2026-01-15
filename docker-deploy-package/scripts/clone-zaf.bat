@echo off
REM Clone LinkNest to a new folder with all necessary files
REM Usage: clone-linknest.bat <new-folder-name> [--source <path>] [--target <path>] [--assets] [--database]
REM Example: clone-linknest.bat myspaces --source C:\xampp\htdocs\linknest --target C:\projects --assets --database

setlocal enabledelayedexpansion

:main

if "%~1"=="" (
    echo.
    echo Usage: clone-linknest.bat ^<new-folder-name^> [--source ^<path^>] [--target ^<path^>] [--assets] [--database]
    echo.
    echo Parameters:
    echo   new-folder-name  Name of the new folder to create
    echo   --source ^<path^>   Source directory to clone from ^(optional, default: current directory^)
    echo   --target ^<path^>   Target directory where folder will be created ^(optional^)
    echo   --assets         Copy logos and favicon from uploads folder
    echo   --database       Copy database file from data folder
    echo.
    echo Examples:
    echo   clone-linknest.bat myspaces
    echo   clone-linknest.bat myspaces --target C:\projects
    echo   clone-linknest.bat myspaces --source C:\xampp\htdocs\linknest
    echo   clone-linknest.bat myspaces --assets --database
    echo   clone-linknest.bat myspaces --source C:\other\linknest --target C:\projects --assets
    echo.
    exit /b 1
)

set "NEW_FOLDER=%~1"
set "COPY_ASSETS=0"
set "COPY_DATABASE=0"
set "TARGET_PATH="
set "SOURCE_PATH="

REM Parse optional parameters
shift
:parse_params
if "%~1"=="" goto params_done
if /i "%~1"=="--source" (
    set "SOURCE_PATH=%~2"
    shift
    shift
    goto parse_params
)
if /i "%~1"=="--target" (
    set "TARGET_PATH=%~2"
    shift
    shift
    goto parse_params
)
if /i "%~1"=="--assets" set "COPY_ASSETS=1"
if /i "%~1"=="--database" set "COPY_DATABASE=1"
if /i "%~1"=="--databases" set "COPY_DATABASE=1"
shift
goto parse_params
:params_done

REM Get absolute paths
set "SCRIPT_DIR=%~dp0"

REM Determine source directory
if defined SOURCE_PATH (
    REM User specified a custom source path - resolve to absolute path
    pushd "%SOURCE_PATH%" 2>nul
    if errorlevel 1 (
        echo ERROR: Could not resolve custom source directory path!
        echo Specified path: %SOURCE_PATH%
        exit /b 1
    )
    set "CURRENT_DIR=%CD%"
    popd
) else (
    REM Default: use parent directory of script location
    pushd "%SCRIPT_DIR%.." 2>nul
    if errorlevel 1 (
        echo ERROR: Could not resolve source directory path!
        echo Attempted path: %SCRIPT_DIR%..
        exit /b 1
    )
    set "CURRENT_DIR=%CD%"
    popd
)

if defined TARGET_PATH (
    set "TARGET_DIR=%TARGET_PATH%\%NEW_FOLDER%"
) else (
    set "GRANDPARENT_PATH=%SCRIPT_DIR%..\.."
    call :resolve_path "%GRANDPARENT_PATH%"
    if errorlevel 1 (
        echo ERROR: Could not resolve parent directory path!
        exit /b 1
    )
    set "PARENT_DIR=%RESOLVE_RESULT%"
    set "TARGET_DIR=%PARENT_DIR%\%NEW_FOLDER%"
)

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
    echo WARNING: Folder "%TARGET_DIR%" already exists!
    echo.
    set /p "REPLACE=Do you want to replace it? (y/N): "
    if /i "!REPLACE!"=="y" (
        echo Removing existing folder...
        rd /s /q "%TARGET_DIR%" 2>nul
        if errorlevel 1 (
            echo ERROR: Failed to remove existing folder!
            echo Please delete it manually and try again.
            exit /b 1
        )
        echo Existing folder removed successfully.
    ) else (
        echo Operation cancelled by user.
        exit /b 0
    )
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

REM Verify source directory exists
if not exist "%CURRENT_DIR%\package.json" (
    echo ERROR: Source directory not found or invalid!
    echo Expected: %CURRENT_DIR%
    echo Please run this script from the scripts folder.
    exit /b 1
)

REM Copy root files
echo   - Copying root files...
set "COPY_ERROR=0"
copy "%CURRENT_DIR%\package.json" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 (
    echo     ERROR: Failed to copy package.json
    set "COPY_ERROR=1"
)
copy "%CURRENT_DIR%\package-lock.json" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\tsconfig.json" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\vite.config.ts" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\vite.docker.config.ts" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\vite.runtime.config.ts" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\tailwind.config.js" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\postcss.config.js" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\index.html" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\index.tsx" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\index.css" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\App.tsx" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\types.ts" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
copy "%CURRENT_DIR%\router.php" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
if exist "%CURRENT_DIR%\.htaccess" (
    copy "%CURRENT_DIR%\.htaccess" "%TARGET_DIR%\" >nul 2>&1
    if errorlevel 1 set "COPY_ERROR=1"
)
if exist "%CURRENT_DIR%\.gitignore" (
    copy "%CURRENT_DIR%\.gitignore" "%TARGET_DIR%\" >nul 2>&1
    if errorlevel 1 set "COPY_ERROR=1"
)
copy "%CURRENT_DIR%\README.md" "%TARGET_DIR%\" >nul 2>&1
if errorlevel 1 set "COPY_ERROR=1"
if exist "%CURRENT_DIR%\bulk-import-template.csv" (
    copy "%CURRENT_DIR%\bulk-import-template.csv" "%TARGET_DIR%\" >nul 2>&1
    if errorlevel 1 set "COPY_ERROR=1"
)
if exist "%CURRENT_DIR%\section-links-import-template.csv" (
    copy "%CURRENT_DIR%\section-links-import-template.csv" "%TARGET_DIR%\" >nul 2>&1
    if errorlevel 1 set "COPY_ERROR=1"
)
if "%COPY_ERROR%"=="1" (
    echo     WARNING: Some files may not have been copied successfully
    echo     Please verify all required files are present before continuing
)

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

echo   - Creating scripts directory...
mkdir "%TARGET_DIR%\scripts" 2>nul

echo   - Copying scripts...
set "SCRIPT_COUNT=0"
pushd "%SCRIPT_DIR%"
REM Copy .bat files
for %%f in (*.bat) do (
    if exist "%%f" (
        copy "%%f" "%TARGET_DIR%\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
REM Copy .sh files
for %%f in (*.sh) do (
    if exist "%%f" (
        copy "%%f" "%TARGET_DIR%\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
REM Copy .php files
for %%f in (*.php) do (
    if exist "%%f" (
        copy "%%f" "%TARGET_DIR%\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
REM Copy .md files
for %%f in (*.md) do (
    if exist "%%f" (
        copy "%%f" "%TARGET_DIR%\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
popd
echo     Total: !SCRIPT_COUNT! script files copied to target folder

REM Copy assets if requested
if not "%COPY_ASSETS%"=="1" goto skip_assets
echo   - Copying logos and favicon...
if exist "%CURRENT_DIR%\uploads\logo_*.*" (
    copy "%CURRENT_DIR%\uploads\logo_*.*" "%TARGET_DIR%\uploads\" >nul 2>&1
    echo     Copied logo files
)
if exist "%CURRENT_DIR%\uploads\favicon_*.*" (
    copy "%CURRENT_DIR%\uploads\favicon_*.*" "%TARGET_DIR%\uploads\" >nul 2>&1
    echo     Copied favicon files
)
:skip_assets

REM Copy database if requested
if not "%COPY_DATABASE%"=="1" goto skip_database
    echo   - Copying database...
    if exist "%CURRENT_DIR%\data\linknest.db" (
        copy "%CURRENT_DIR%\data\linknest.db" "%TARGET_DIR%\data\linknest.db" >nul 2>&1
        if errorlevel 1 (
            echo     ERROR: Failed to copy database file
        ) else (
            echo     Copied database: data/linknest.db
            echo   - Encrypting LDAP passwords in copied database...
            if exist "%TARGET_DIR%\scripts\encrypt_ldap_passwords.php" (
                cd /d "%TARGET_DIR%"
                php "%TARGET_DIR%\scripts\encrypt_ldap_passwords.php" 2>nul
                if errorlevel 1 (
                    echo     WARNING: Failed to encrypt LDAP passwords in copied database
                    echo     Please run: php scripts\encrypt_ldap_passwords.php manually
                ) else (
                    echo     Successfully encrypted LDAP passwords ^(if any were found^)
                )
                cd /d "%CURRENT_DIR%"
            ) else (
                echo     NOTE: encrypt_ldap_passwords.php not found, skipping encryption
            )
        )
    ) else (
        echo     No database file found to copy
    )
:skip_database

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

REM FIX: Update vite.config.ts with proper base path configuration
echo   - Updating vite.config.ts for proper base path...
cd /d "%TARGET_DIR%"
if exist "vite.config.ts" (
    REM Create a temporary file with the fix
    (
    echo import { defineConfig } from 'vite';
    echo import react from '@vitejs/plugin-react';
    echo import { resolve } from 'path';
    echo.
    echo export default defineConfig(({ mode }) => ({
    echo   base: mode === 'production' ? '/%NEW_FOLDER%/' : '/',
    echo   plugins: [react()],
    echo   resolve: {
    echo     alias: {
    echo       '@': resolve(__dirname, './src'),
    echo     },
    echo   },
    echo   server: {
    echo     host: '0.0.0.0',
    echo     port: 5173,
    echo   },
    echo   build: {
    echo     outDir: 'dist',
    echo     emptyOutDir: true,
    echo     rollupOptions: {
    echo       input: {
    echo         main: resolve(__dirname, 'index.html'),
    echo       },
    echo     },
    echo   },
    echo }));
    ) > "vite.config.ts.fixed"
    
    REM Check if the original file is different from our fix
    fc "vite.config.ts" "vite.config.ts.fixed" >nul 2>&1
    if errorlevel 1 (
        echo     Updated vite.config.ts with proper base path configuration
        move /y "vite.config.ts.fixed" "vite.config.ts" >nul 2>&1
    ) else (
        echo     vite.config.ts already has correct configuration
        del "vite.config.ts.fixed" >nul 2>&1
    )
)

REM FIX: Update index.html to remove problematic CSS references
echo   - Verifying index.html structure...
cd /d "%TARGET_DIR%"
if exist "index.html" (
    REM Check if index.html has problematic CSS references
    findstr /c:"?html-proxy" "index.html" >nul
    if not errorlevel 1 (
        echo     WARNING: index.html contains HTML proxy references
        echo     Creating clean index.html...
        (
        echo ^<!DOCTYPE html^>
        echo ^<html lang="en"^>
        echo ^<head^>
        echo   ^<meta charset="UTF-8" /^>
        echo   ^<link rel="icon" type="image/svg+xml" href="/%NEW_FOLDER%/favicon.svg" /^>
        echo   ^<meta name="viewport" content="width=device-width, initial-scale=1.0" /^>
        echo   ^<title^>LinkNest^</title^>
        echo ^</head^>
        echo ^<body^>
        echo   ^<div id="root"^>^</div^>
        echo   ^<script type="module" src="/%NEW_FOLDER%/src/main.tsx"^>^</script^>
        echo ^</body^>
        echo ^</html^>
        ) > "index.html"
        echo     Created clean index.html
    )
)

REM Install dependencies
echo [4/6] Installing npm dependencies...
echo   This may take a few minutes...
cd /d "%TARGET_DIR%"
if not exist "package.json" (
    echo.
    echo ERROR: package.json not found in target directory!
    echo The file copy operation may have failed.
    echo Please check that the source directory is correct and try again.
    exit /b 1
)

echo   - Cleaning npm cache (to avoid proxy issues)...
call npm cache clean --force >nul 2>&1

echo   - Running npm install...
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

REM Clean dist folder if it exists from a previous failed build
if exist "%TARGET_DIR%\dist" (
    rd /s /q "%TARGET_DIR%\dist" 2>nul
)

cd /d "%TARGET_DIR%"

REM Wait a moment for file system to sync
timeout /t 1 /nobreak >nul 2>&1

REM Build the application
echo   - Running npm run build...
call npm run build
if errorlevel 1 (
    echo.
    echo ERROR: npm run build failed!
    echo.
    echo Attempting alternative build method...
    
    REM Try building with Vite directly
    echo   - Trying direct Vite build...
    npx vite build --base=/%NEW_FOLDER%/ --mode=production
    if errorlevel 1 (
        echo.
        echo ERROR: Alternative build also failed!
        echo.
        echo The clone has completed, but the production build was not generated.
        echo.
        echo Please try these steps manually:
        echo   1. cd %TARGET_DIR%
        echo   2. Check vite.config.ts configuration
        echo   3. Run: npm run build
        echo.
        echo If you continue to have issues, you may need to:
        echo   1. Check the Vite configuration
        echo   2. Ensure all dependencies are installed
        echo   3. Verify the index.html file structure
    ) else (
        echo.
        echo Alternative build completed successfully!
    )
) else (
    echo.
    echo Build completed successfully.
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
if "%COPY_DATABASE%"=="1" (
echo The database file was copied from the source and is at: data/linknest.db
) else (
echo A new database file will be created at: data/linknest.db
echo on first use.
)
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
echo ## Troubleshooting
echo.
echo If you encounter build issues:
echo 1. Check vite.config.ts for proper base path configuration
echo 2. Ensure index.html doesn't have proxy CSS references
echo 3. Clean npm cache: npm cache clean --force
echo 4. Reinstall dependencies: npm install
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
echo For build issues, see: %TARGET_DIR%\DEPLOYMENT.md
echo.
pause

exit /b 0

:resolve_path
set "RESOLVE_RESULT="
pushd "%~1" 2>nul
if errorlevel 1 (
    popd
    exit /b 1
)
set "RESOLVE_RESULT=%CD%"
popd
exit /b 0
@echo off
REM Clone LinkNest to a sibling folder on the host (not Docker or WSL).
REM Usage: clone-linknest.bat <new-folder-name> [--source <path>] [--target <path>] [--preset empty|structure|full|demo]
REM Example: clone-linknest.bat myspaces --preset full

setlocal enabledelayedexpansion

REM Get absolute path of the script immediately
set "SCRIPT_DIR=%~dp0"

:main

if defined WSL_DISTRO_NAME goto refuse_not_host
if defined WSL_INTEROP goto refuse_not_host
if exist "/.dockerenv" goto refuse_not_host
if "%LINKNEST_DOCKER%"=="1" goto refuse_not_host

if "%~1"=="" (
    echo.
    echo Usage: clone-linknest.bat ^<new-folder-name^> [--source ^<path^>] [--target ^<path^>] [--preset empty^|structure^|full^|demo]
    echo.
    echo Host filesystem only. In Docker, rebuild with redeploy-docker.bat instead.
    echo.
    echo Parameters:
    echo   new-folder-name  Name of the new folder to create
    echo   --source ^<path^>   Source directory to clone from ^(optional^)
    echo   --target ^<path^>   Target directory where folder will be created ^(optional^)
    echo   --preset empty^|structure^|full^|demo   Clone content preset ^(default: empty^)
    echo   --assets / --database  Legacy flags ^(both = full, database = structure^)
    echo.
    echo Examples:
    echo   clone-linknest.bat myspaces
    echo   clone-linknest.bat myspaces --preset full
    echo   clone-linknest.bat myspaces --source C:\xampp\htdocs\linknest --preset structure
    echo.
    exit /b 1
)

set "NEW_FOLDER=%~1"
set "PRESET="
set "COPY_ASSETS=0"
set "COPY_DATABASE=0"
set "COPY_ALL_UPLOADS=0"
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
if /i "%~1"=="--preset" (
    set "PRESET=%~2"
    shift
    shift
    goto parse_params
)
if /i "%~1"=="--empty" set "PRESET=empty"
if /i "%~1"=="--structure" set "PRESET=structure"
if /i "%~1"=="--full" set "PRESET=full"
if /i "%~1"=="--demo" set "PRESET=demo"
if /i "%~1"=="--assets" set "COPY_ASSETS=1"
if /i "%~1"=="--database" set "COPY_DATABASE=1"
if /i "%~1"=="--databases" set "COPY_DATABASE=1"
shift
goto parse_params
:params_done
if not defined PRESET (
    if "%COPY_DATABASE%"=="1" if "%COPY_ASSETS%"=="1" set "PRESET=full"
)
if not defined PRESET (
    if "%COPY_DATABASE%"=="1" set "PRESET=structure"
)
if not defined PRESET set "PRESET=empty"
if /i not "%PRESET%"=="empty" if /i not "%PRESET%"=="structure" if /i not "%PRESET%"=="full" if /i not "%PRESET%"=="demo" (
    echo ERROR: Unknown preset "%PRESET%" ^(use empty, structure, full, or demo^)
    exit /b 1
)
set "COPY_DATABASE=0"
set "COPY_ALL_UPLOADS=0"
if /i "%PRESET%"=="full" (
    set "COPY_DATABASE=1"
    set "COPY_ALL_UPLOADS=1"
)
if /i "%PRESET%"=="structure" (
    set "COPY_DATABASE=1"
    set "COPY_ALL_UPLOADS=1"
)
REM Get absolute paths
REM SCRIPT_DIR is already set at the start
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
    call :resolve_path "%TARGET_PATH%"
    set "TARGET_DIR=!RESOLVE_RESULT!\%NEW_FOLDER%"
) else (
    set "GRANDPARENT_PATH=%SCRIPT_DIR%..\.."
    call :resolve_path "!GRANDPARENT_PATH!"
    if errorlevel 1 (
        echo ERROR: Could not resolve parent directory path!
        exit /b 1
    )
    set "PARENT_DIR=!RESOLVE_RESULT!"
    set "TARGET_DIR=!PARENT_DIR!\%NEW_FOLDER%"
)

echo.
echo ========================================
echo LinkNest Clone Script
echo ========================================
echo.
echo Source: %CURRENT_DIR%
echo Target: %TARGET_DIR%
echo Preset: %PRESET%
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
if exist "%CURRENT_DIR%\AGENTS.md" copy "%CURRENT_DIR%\AGENTS.md" "%TARGET_DIR%\" >nul 2>&1
if exist "%CURRENT_DIR%\composer.json" copy "%CURRENT_DIR%\composer.json" "%TARGET_DIR%\" >nul 2>&1
if exist "%CURRENT_DIR%\novnc.d.ts" copy "%CURRENT_DIR%\novnc.d.ts" "%TARGET_DIR%\" >nul 2>&1
if exist "%CURRENT_DIR%\package-for-deployment.bat" copy "%CURRENT_DIR%\package-for-deployment.bat" "%TARGET_DIR%\" >nul 2>&1
if exist "%CURRENT_DIR%\redeploy-docker.bat" copy "%CURRENT_DIR%\redeploy-docker.bat" "%TARGET_DIR%\" >nul 2>&1
if exist "%CURRENT_DIR%\redeploy-docker.sh" copy "%CURRENT_DIR%\redeploy-docker.sh" "%TARGET_DIR%\" >nul 2>&1
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
if exist "%CURRENT_DIR%\analytics" (
    echo   - Copying analytics directory...
    xcopy "%CURRENT_DIR%\analytics" "%TARGET_DIR%\analytics" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\bin" (
    echo   - Copying bin directory...
    xcopy "%CURRENT_DIR%\bin" "%TARGET_DIR%\bin" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\config" (
    echo   - Copying config directory...
    xcopy "%CURRENT_DIR%\config" "%TARGET_DIR%\config" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\hooks" (
    echo   - Copying hooks directory...
    xcopy "%CURRENT_DIR%\hooks" "%TARGET_DIR%\hooks" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\migrations" (
    echo   - Copying migrations directory...
    xcopy "%CURRENT_DIR%\migrations" "%TARGET_DIR%\migrations" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\utils" (
    echo   - Copying utils directory...
    xcopy "%CURRENT_DIR%\utils" "%TARGET_DIR%\utils" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\public" (
    echo   - Copying public directory...
    xcopy "%CURRENT_DIR%\public" "%TARGET_DIR%\public" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\docker" (
    echo   - Copying docker directory...
    xcopy "%CURRENT_DIR%\docker" "%TARGET_DIR%\docker" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\docs" (
    echo   - Copying docs directory...
    xcopy "%CURRENT_DIR%\docs" "%TARGET_DIR%\docs" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\land" (
    echo   - Copying land directory...
    xcopy "%CURRENT_DIR%\land" "%TARGET_DIR%\land" /E /I /Y /Q >nul 2>&1
)
if exist "%CURRENT_DIR%\extensions" (
    echo   - Copying extensions directory...
    xcopy "%CURRENT_DIR%\extensions" "%TARGET_DIR%\extensions" /E /I /Y /Q >nul 2>&1
)

echo   - Creating data directory...
mkdir "%TARGET_DIR%\data" 2>nul

echo   - Creating uploads directory...
mkdir "%TARGET_DIR%\uploads" 2>nul


echo   - Creating scripts directory...
mkdir "!TARGET_DIR!\scripts" 2>nul

echo   - Copying scripts...
REM Copy all script files by iterating through source directory
set "SCRIPT_COUNT=0"
pushd "%SCRIPT_DIR%"
REM Copy .bat files
for %%f in (*.bat) do (
    if exist "%%f" (
        copy "%%f" "!TARGET_DIR!\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
            echo     Copied: %%f
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
REM Copy .sh files
for %%f in (*.sh) do (
    if exist "%%f" (
        copy "%%f" "!TARGET_DIR!\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
            echo     Copied: %%f
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
REM Copy .php files
for %%f in (*.php) do (
    if exist "%%f" (
        copy "%%f" "!TARGET_DIR!\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
            echo     Copied: %%f
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
REM Copy .md files
for %%f in (*.md) do (
    if exist "%%f" (
        copy "%%f" "!TARGET_DIR!\scripts\" >nul 2>&1
        if not errorlevel 1 (
            set /a SCRIPT_COUNT+=1
            echo     Copied: %%f
        ) else (
            set "COPY_ERROR=1"
        )
    )
)
popd
echo     Total: !SCRIPT_COUNT! script files copied to target folder


REM Copy uploads for full / structure presets
if not "%COPY_ALL_UPLOADS%"=="1" goto skip_assets
echo   - Copying all uploads...
if exist "%CURRENT_DIR%\uploads" (
    xcopy "%CURRENT_DIR%\uploads" "%TARGET_DIR%\uploads" /E /I /Y /Q >nul 2>&1
    echo     Copied uploads folder
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
            if /i "%PRESET%"=="full" (
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
        )
    ) else (
        echo     No database file found to copy
    )
:skip_database

REM Create .env file with new base path
echo [3/7] Creating .env file...
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

echo [3b/7] Applying preset and install identity...
php "%TARGET_DIR%\scripts\apply-clone-preset.php" "%TARGET_DIR%" "%NEW_FOLDER%" "%PRESET%" "http://localhost/%NEW_FOLDER%/"
if errorlevel 1 (
    echo ERROR: Failed to apply clone preset / install identity
    exit /b 1
)

REM Install dependencies
echo [4/7] Installing npm dependencies...
echo   This may take a few minutes...
cd /d "%TARGET_DIR%"
if not exist "package.json" (
    echo.
    echo ERROR: package.json not found in target directory!
    echo The file copy operation may have failed.
    echo Please check that the source directory is correct and try again.
    exit /b 1
)
call npm install
if errorlevel 1 (
    echo.
    echo ERROR: npm install failed!
    echo Please check the error messages above.
    exit /b 1
)

REM Build the application
echo [5/7] Building the application...
echo   This may take a few minutes...
REM Clean dist folder if it exists from a previous failed build
if exist "%TARGET_DIR%\dist" (
    rd /s /q "%TARGET_DIR%\dist" 2>nul
)
cd /d "%TARGET_DIR%"
REM Verify vite.config.ts exists and has correct configuration
if not exist "vite.config.ts" (
    echo ERROR: vite.config.ts not found in target directory!
    exit /b 1
)
REM Wait a moment for file system to sync
timeout /t 2 /nobreak >nul 2>&1
REM Verify we're in the right directory and config is correct
if not exist "vite.config.ts" (
    echo ERROR: vite.config.ts not found!
    exit /b 1
)
REM Build the application
call npm run build
if errorlevel 1 (
    echo.
    echo ERROR: npm run build failed!
    echo.
    echo This may be related to a known issue with the Vite 6.x HTML proxy plugin when using base paths.
    echo The clone has completed, but the production build was not generated by this script.
    echo.
    echo Please run the build manually from the cloned folder:
    echo   cd %TARGET_DIR%
    echo   npm install
    echo   npm run build
    echo.
    echo After a successful manual build, the application will be ready under the /%NEW_FOLDER%/ path.
    rem Do not exit with error here so the rest of the clone steps can complete
) else (
    echo.
    echo npm run build completed successfully.
    
    echo.
    echo Cleaning up node_modules to save space...
    rd /s /q "node_modules" 2>nul
    if not exist "node_modules" (
        echo   - node_modules deleted successfully
    ) else (
        echo   - WARNING: Failed to delete node_modules
    )
)

REM Create a README for the cloned instance
echo [6/7] Creating deployment README...
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
echo ## Cloning This Instance
echo.
echo You can clone this instance using the scripts in the scripts folder:
echo   scripts\clone-linknest.bat new-instance-name --preset empty
echo Docker/WSL: use redeploy-docker.bat instead of Admin folder clone.
echo.
echo Preset: %PRESET%
echo Isolated login cookie: data\install_identity.php
echo.
) > "%TARGET_DIR%\DEPLOYMENT.md"

echo [7/7] Finalizing...
echo   Clone scripts are available in: %TARGET_DIR%\scripts

echo.
echo ========================================
echo Clone Complete!
echo ========================================
echo.
echo New instance created at: %TARGET_DIR%
echo Preset: %PRESET%
echo.
echo Next steps:
echo 1. Access the application at: http://localhost/%NEW_FOLDER%/
if /i "%PRESET%"=="full" (
    echo 2. Login with the same credentials as the source instance
) else if /i "%PRESET%"=="demo" (
    echo 2. Login as admin / admin123 or demo1-demo10 / password
) else (
    echo 2. Login with default credentials: admin / admin123
)
echo 3. Change the admin password in the Admin Panel
echo.
if "%COPY_DATABASE%"=="1" (
    echo Database file: %TARGET_DIR%\data\linknest.db
    echo (Copied from source, then preset applied)
) else (
    echo Database file: %TARGET_DIR%\data\linknest.db
    echo (Initialized for this clone)
)
echo.
pause
exit /b 0

:refuse_not_host
echo Clone is not available in Docker or WSL mode. Please go with Docker clone or redeploy via Docker container.
exit /b 1

:resolve_path
set "RESOLVE_RESULT=%~f1"
exit /b


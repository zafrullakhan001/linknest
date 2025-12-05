@echo off
REM LinkNest Bundle Creator for Windows
REM Creates a zip file with all necessary files for deployment

setlocal enabledelayedexpansion

echo ==========================================
echo LinkNest Bundle Creator
echo ==========================================
echo.

set BUNDLE_NAME=linknest-deploy-%date:~-4,4%%date:~-7,2%%date:~-10,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set BUNDLE_NAME=%BUNDLE_NAME: =0%
set BUNDLE_NAME=%BUNDLE_NAME:/=-%
set BUNDLE_NAME=%BUNDLE_NAME::=-%

echo Creating bundle: %BUNDLE_NAME%.zip
echo.

REM Create temporary directory
set TEMP_DIR=%TEMP%\linknest-bundle
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

echo Copying files...

REM Copy essential files
copy "package.json" "%TEMP_DIR%\" >nul
copy "package-lock.json" "%TEMP_DIR%\" >nul
copy "vite.config.ts" "%TEMP_DIR%\" >nul
copy "vite.docker.config.ts" "%TEMP_DIR%\" >nul
copy "tsconfig.json" "%TEMP_DIR%\" >nul
copy "tailwind.config.js" "%TEMP_DIR%\" >nul
copy "postcss.config.js" "%TEMP_DIR%\" >nul
copy "index.html" "%TEMP_DIR%\" >nul
copy "index.tsx" "%TEMP_DIR%\" >nul
copy "index.css" "%TEMP_DIR%\" >nul
copy "App.tsx" "%TEMP_DIR%\" >nul
copy "types.ts" "%TEMP_DIR%\" >nul
copy "Dockerfile" "%TEMP_DIR%\" >nul
copy "docker-compose.yml" "%TEMP_DIR%\" >nul
copy "docker-compose.prod.yml" "%TEMP_DIR%\" >nul
copy ".dockerignore" "%TEMP_DIR%\" >nul
copy "deploy.bat" "%TEMP_DIR%\" >nul
copy "deploy.sh" "%TEMP_DIR%\" >nul
copy "README_DOCKER.md" "%TEMP_DIR%\" >nul
copy "DEPLOYMENT_INSTRUCTIONS.md" "%TEMP_DIR%\" >nul

REM Copy directories
echo Copying directories...
xcopy "api" "%TEMP_DIR%\api\" /E /I /Q /Y >nul
xcopy "components" "%TEMP_DIR%\components\" /E /I /Q /Y >nul
xcopy "contexts" "%TEMP_DIR%\contexts\" /E /I /Q /Y >nul
xcopy "services" "%TEMP_DIR%\services\" /E /I /Q /Y >nul
xcopy "docker" "%TEMP_DIR%\docker\" /E /I /Q /Y >nul

REM Create empty directories that will be needed
mkdir "%TEMP_DIR%\data" 2>nul
mkdir "%TEMP_DIR%\uploads" 2>nul

REM Copy uploads .htaccess if it exists
if exist "uploads\.htaccess" (
    copy "uploads\.htaccess" "%TEMP_DIR%\uploads\" >nul
) else (
    REM Create uploads .htaccess if it doesn't exist
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
    ) > "%TEMP_DIR%\uploads\.htaccess"
)

echo.
echo Creating zip file...

REM Use PowerShell to create zip (available on Windows 10+)
powershell -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%BUNDLE_NAME%.zip' -Force"

if exist "%BUNDLE_NAME%.zip" (
    echo.
    echo ==========================================
    echo Bundle created successfully!
    echo ==========================================
    echo.
    echo File: %BUNDLE_NAME%.zip
    echo Location: %CD%\%BUNDLE_NAME%.zip
    echo.
    echo The bundle contains all files needed for deployment.
    echo Users can extract and run deploy.bat to deploy.
    echo.
) else (
    echo.
    echo ERROR: Failed to create zip file.
    echo Please ensure PowerShell is available.
    echo.
    exit /b 1
)

REM Cleanup
rmdir /s /q "%TEMP_DIR%"

echo Done!
pause



















































































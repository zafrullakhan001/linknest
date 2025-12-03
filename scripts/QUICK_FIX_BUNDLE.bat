@echo off
REM Quick Fix Script for Incomplete Bundle
REM This script helps fix a bundle that's missing required files

echo ==========================================
echo LinkNest Bundle Quick Fix
echo ==========================================
echo.
echo This script will help you fix a bundle that's missing files.
echo.
echo Option 1: Recreate the bundle (Recommended)
echo   - Go back to the source repository
echo   - Run: scripts\bundle-for-deployment.bat
echo   - This will create a new, complete bundle
echo.
echo Option 2: Manually copy missing files
echo   - Copy required files from source to bundle root
echo   - Required files: index.html, index.tsx, App.tsx, package.json, etc.
echo.
echo Option 3: Use this script to copy from source
echo.
set /p FIX_OPTION="Enter option (1/2/3) or press Enter to exit: "

if "%FIX_OPTION%"=="3" (
    echo.
    set /p SOURCE_PATH="Enter path to source repository: "
    
    if not exist "%SOURCE_PATH%" (
        echo Error: Source path does not exist!
        pause
        exit /b 1
    )
    
    echo.
    echo Copying required files...
    
    if exist "%SOURCE_PATH%\index.html" copy "%SOURCE_PATH%\index.html" . >nul && echo ✓ index.html
    if exist "%SOURCE_PATH%\index.tsx" copy "%SOURCE_PATH%\index.tsx" . >nul && echo ✓ index.tsx
    if exist "%SOURCE_PATH%\index.css" copy "%SOURCE_PATH%\index.css" . >nul && echo ✓ index.css
    if exist "%SOURCE_PATH%\App.tsx" copy "%SOURCE_PATH%\App.tsx" . >nul && echo ✓ App.tsx
    if exist "%SOURCE_PATH%\types.ts" copy "%SOURCE_PATH%\types.ts" . >nul && echo ✓ types.ts
    if exist "%SOURCE_PATH%\package.json" copy "%SOURCE_PATH%\package.json" . >nul && echo ✓ package.json
    if exist "%SOURCE_PATH%\vite.config.ts" copy "%SOURCE_PATH%\vite.config.ts" . >nul && echo ✓ vite.config.ts
    if exist "%SOURCE_PATH%\vite.docker.config.ts" copy "%SOURCE_PATH%\vite.docker.config.ts" . >nul && echo ✓ vite.docker.config.ts
    if exist "%SOURCE_PATH%\tsconfig.json" copy "%SOURCE_PATH%\tsconfig.json" . >nul && echo ✓ tsconfig.json
    if exist "%SOURCE_PATH%\tailwind.config.js" copy "%SOURCE_PATH%\tailwind.config.js" . >nul && echo ✓ tailwind.config.js
    if exist "%SOURCE_PATH%\postcss.config.js" copy "%SOURCE_PATH%\postcss.config.js" . >nul && echo ✓ postcss.config.js
    
    if exist "%SOURCE_PATH%\components" (
        xcopy "%SOURCE_PATH%\components\*" "components\" /E /I /Y >nul
        echo ✓ components/
    )
    if exist "%SOURCE_PATH%\contexts" (
        xcopy "%SOURCE_PATH%\contexts\*" "contexts\" /E /I /Y >nul
        echo ✓ contexts/
    )
    if exist "%SOURCE_PATH%\services" (
        xcopy "%SOURCE_PATH%\services\*" "services\" /E /I /Y >nul
        echo ✓ services/
    )
    
    echo.
    echo Files copied! Try deploying again with: deploy.bat
)

if "%FIX_OPTION%"=="1" (
    echo.
    echo To recreate the bundle:
    echo 1. Navigate to the source repository
    echo 2. Run: cd scripts
    echo 3. Run: bundle-for-deployment.bat
    echo 4. Use the new bundle folder
)

echo.
pause




































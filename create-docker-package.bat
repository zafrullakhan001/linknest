@echo off
REM ============================================================================
REM LinkNest Docker Package - Complete Workflow
REM ============================================================================
REM This script runs the complete workflow:
REM 1. Prepare the package
REM 2. Optionally test it
REM 3. Create the zip file
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================================
echo   LinkNest Docker Package - Complete Workflow
echo ============================================================================
echo.

set "PACKAGE_DIR=%~dp0docker-deploy-package"

REM Check if package directory exists
if not exist "%PACKAGE_DIR%" (
    echo ERROR: docker-deploy-package directory not found
    echo Expected location: %PACKAGE_DIR%
    pause
    exit /b 1
)

echo Package Directory: %PACKAGE_DIR%
echo.

REM Step 1: Prepare the package
echo ============================================================================
echo   Step 1: Preparing Package
echo ============================================================================
echo.
echo This will copy all necessary files to the deployment package...
echo.
pause

cd "%PACKAGE_DIR%"
call prepare-package.bat

if errorlevel 1 (
    echo.
    echo ERROR: Package preparation failed
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo   Step 2: Test Package (Optional)
echo ============================================================================
echo.
echo Would you like to test the package before creating the zip file?
echo This will build and run the Docker container locally.
echo.
set /p TEST="Test the package? (Y/N): "

if /i "%TEST%"=="Y" (
    echo.
    echo Starting deployment test...
    echo This may take 5-10 minutes for the first build.
    echo.
    pause
    
    call deploy.bat
    
    echo.
    echo ============================================================================
    echo   Test Complete
    echo ============================================================================
    echo.
    echo The application should now be running at http://localhost:8090
    echo.
    echo Please verify:
    echo - Application loads correctly
    echo - Database data is present
    echo - Uploads/assets are accessible
    echo - All features work as expected
    echo.
    echo When you're done testing, press any key to stop the containers...
    pause
    
    echo.
    echo Stopping containers...
    docker compose down
    
    echo.
    echo Containers stopped.
    echo.
)

echo.
echo ============================================================================
echo   Step 3: Create Zip File
echo ============================================================================
echo.
echo This will create a distributable zip file of the package.
echo.
set /p ZIP="Create zip file? (Y/N): "

if /i "%ZIP%"=="Y" (
    echo.
    call create-zip.bat
    
    echo.
    echo ============================================================================
    echo   Workflow Complete!
    echo ============================================================================
    echo.
    echo Your deployment package is ready to distribute!
    echo.
    echo The zip file has been created in:
    echo %~dp0
    echo.
    echo Recipients can:
    echo 1. Extract the zip file
    echo 2. Run deploy.bat
    echo 3. Access LinkNest at http://localhost:8090
    echo.
) else (
    echo.
    echo Skipping zip creation.
    echo You can create it later by running:
    echo   cd docker-deploy-package
    echo   create-zip.bat
    echo.
)

echo ============================================================================
echo.
pause

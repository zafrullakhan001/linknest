@echo off
REM ============================================================================
REM LinkNest Docker Package Zipper
REM ============================================================================
REM This script creates a distributable zip file of the deployment package
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================================
echo   LinkNest Docker Package Zipper
echo ============================================================================
echo.

set "PACKAGE_DIR=%~dp0"
set "PARENT_DIR=%~dp0.."
set "TIMESTAMP=%date:~-4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "ZIP_NAME=linknest-docker-deploy-%TIMESTAMP%.zip"

echo Package Directory: %PACKAGE_DIR%
echo Output: %PARENT_DIR%\%ZIP_NAME%
echo.

REM Check if PowerShell is available
powershell -Command "Get-Command Compress-Archive" >nul 2>&1
if errorlevel 1 (
    echo ERROR: PowerShell Compress-Archive not available
    echo Please create the zip file manually:
    echo 1. Right-click the docker-deploy-package folder
    echo 2. Select "Send to" ^> "Compressed (zipped) folder"
    pause
    exit /b 1
)

echo Creating zip file...
echo This may take a few minutes depending on the size of your database and uploads...
echo.

REM Create the zip file using PowerShell
powershell -Command "Compress-Archive -Path '%PACKAGE_DIR%*' -DestinationPath '%PARENT_DIR%\%ZIP_NAME%' -Force"

if errorlevel 1 (
    echo ERROR: Failed to create zip file
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo   Zip File Created Successfully!
echo ============================================================================
echo.
echo File: %ZIP_NAME%
echo Location: %PARENT_DIR%
echo.

REM Get file size
for %%A in ("%PARENT_DIR%\%ZIP_NAME%") do (
    set "SIZE=%%~zA"
)

REM Convert bytes to MB
set /a SIZE_MB=!SIZE! / 1048576

echo Size: !SIZE_MB! MB
echo.
echo This file can now be shared with others for easy deployment.
echo Recipients just need to:
echo 1. Extract the zip file
echo 2. Run deploy.bat
echo.
echo ============================================================================
echo.

REM Ask if user wants to open the folder
set /p OPEN="Open the folder containing the zip file? (Y/N): "
if /i "%OPEN%"=="Y" (
    explorer "%PARENT_DIR%"
)

pause

@echo off
REM Start Performance Analytics Workers (XAMPP Version)
REM Uses full path to XAMPP PHP

set XAMPP_PHP=C:\xampp\php\php.exe
set PROJECT_ROOT=C:\xampp\htdocs\linknest
set ANALYTICS_DIR=%PROJECT_ROOT%\analytics

echo Starting Performance Analytics Workers (XAMPP)...
echo.

REM Check if XAMPP PHP exists
if not exist "%XAMPP_PHP%" (
    echo ERROR: XAMPP PHP not found at: %XAMPP_PHP%
    echo Please update XAMPP_PHP path in this script.
    pause
    exit /b 1
)

REM Check if worker files exist
if not exist "%ANALYTICS_DIR%\process-metrics-queue.php" (
    echo ERROR: process-metrics-queue.php not found at: %ANALYTICS_DIR%\process-metrics-queue.php
    pause
    exit /b 1
)

if not exist "%ANALYTICS_DIR%\server-checker-worker.php" (
    echo ERROR: server-checker-worker.php not found at: %ANALYTICS_DIR%\server-checker-worker.php
    pause
    exit /b 1
)

REM Check if offline reverse geocoding is set up
echo Checking offline reverse geocoding setup...
if not exist "%ANALYTICS_DIR%\geoip\reverse-geocode-offline.php" (
    echo WARNING: Offline reverse geocoding not found. Location data may be incomplete.
    echo To enable offline reverse geocoding:
    echo   1. Run: php %ANALYTICS_DIR%\geoip\setup-location-lookup-table.php
    echo   2. Import world cities data (optional but recommended)
) else (
    echo ✓ Offline reverse geocoding available
    echo   Note: Run setup-location-lookup-table.php to populate location database
)
echo.

REM Change to project root
cd /d %PROJECT_ROOT%

REM Check if command-line parameter provided (for Task Scheduler)
if not "%1"=="" (
    set WORKER_CHOICE=%1
    echo Running in non-interactive mode with parameter: %1
    echo.
    goto VALIDATE_CHOICE
)

REM Interactive mode - Ask user which workers to start
echo.
echo ========================================
echo Select Workers to Start
echo ========================================
echo.
echo IMPORTANT: Running both workers simultaneously can cause conflicts
echo when the server checker generates metrics while the processor is running.
echo.
echo Options:
echo   1 - Metrics Queue Processor ONLY (Recommended for processing client metrics)
echo   2 - Server Link Checker ONLY (Recommended for server-side monitoring)
echo   3 - BOTH (with 10-second staggered start to reduce conflicts)
echo.
echo For Task Scheduler: Use command-line parameter (1, 2, or 3)
echo Example: start-workers-xampp.bat 1
echo.
set /p WORKER_CHOICE="Enter your choice (1, 2, or 3): "

:VALIDATE_CHOICE
if "%WORKER_CHOICE%"=="1" goto START_PROCESSOR
if "%WORKER_CHOICE%"=="2" goto START_CHECKER
if "%WORKER_CHOICE%"=="3" goto START_BOTH
echo Invalid choice: %WORKER_CHOICE%
if "%1"=="" pause
exit /b 1

:START_PROCESSOR
echo.
echo Starting Metrics Queue Processor ONLY...
start "Analytics Metrics Processor" cmd /k "cd /d %PROJECT_ROOT% && %XAMPP_PHP% %ANALYTICS_DIR%\process-metrics-queue.php"
echo.
echo Metrics Queue Processor started.
echo To stop, close the command window.
goto END

:START_CHECKER
echo.
echo Starting Server Link Checker ONLY...
start "Analytics Server Checker" cmd /k "cd /d %PROJECT_ROOT% && %XAMPP_PHP% %ANALYTICS_DIR%\server-checker-worker.php"
echo.
echo Server Link Checker started.
echo To stop, close the command window.
goto END

:START_BOTH
echo.
echo Starting BOTH workers with staggered start...
echo.
echo Starting Metrics Queue Processor first...
start "Analytics Metrics Processor" cmd /k "cd /d %PROJECT_ROOT% && %XAMPP_PHP% %ANALYTICS_DIR%\process-metrics-queue.php"

echo Waiting 10 seconds before starting Server Link Checker...
timeout /t 10 /nobreak > nul

echo Starting Server Link Checker...
start "Analytics Server Checker" cmd /k "cd /d %PROJECT_ROOT% && %XAMPP_PHP% %ANALYTICS_DIR%\server-checker-worker.php"

echo.
echo Both workers started with staggered timing.
echo NOTE: If you experience conflicts, restart and run them separately.
echo To stop workers, close their command windows.
goto END

:END
echo.
if "%1"=="" (
    echo ========================================
    echo Offline Reverse Geocoding Setup
    echo ========================================
    echo The worker now uses offline reverse geocoding to populate location data
    echo from latitude/longitude coordinates when location fields are "Unknown".
    echo.
    echo To set up the location lookup database (recommended):
    echo   1. Run: php %ANALYTICS_DIR%\geoip\setup-location-lookup-table.php
    echo   2. Import world cities CSV (optional):
    echo      php %ANALYTICS_DIR%\geoip\import-world-cities.php path\to\worldcities.csv
    echo.
    echo This enables fully offline location resolution using PostgreSQL.
    echo.
    echo ========================================
    echo Task Scheduler Usage
    echo ========================================
    echo To schedule workers with Windows Task Scheduler:
    echo   Command: %~f0
    echo   Arguments: 1   (for Metrics Processor)
    echo   Arguments: 2   (for Server Checker)
    echo   Arguments: 3   (for BOTH workers)
    echo.
    pause
) else (
    echo Worker started in non-interactive mode. Check the worker window for status.
)

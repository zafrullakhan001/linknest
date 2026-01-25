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

REM Start metrics processor
echo Starting Metrics Queue Processor...
start "Analytics Metrics Processor" cmd /k "cd /d %PROJECT_ROOT% && %XAMPP_PHP% %ANALYTICS_DIR%\process-metrics-queue.php"

REM Wait a moment
timeout /t 2 /nobreak > nul

REM Start server link checker worker
echo Starting Server Checker Worker...
start "Analytics Server Checker" cmd /k "cd /d %PROJECT_ROOT% && %XAMPP_PHP% %ANALYTICS_DIR%\server-checker-worker.php"

echo.
echo Workers started in separate windows.
echo.
echo To stop workers, close their command windows.
echo.
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
pause

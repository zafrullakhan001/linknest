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
pause

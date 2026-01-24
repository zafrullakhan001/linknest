@echo off
REM Start Performance Analytics Workers
REM This script opens two command windows to run the workers

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

echo Starting Performance Analytics Workers...
echo.
echo Project Root: %PROJECT_ROOT%
echo.

REM Change to project root directory
cd /d %PROJECT_ROOT%

REM Check if PHP is available
where php >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PHP is not in your PATH!
    echo Please add PHP to your PATH or use full path to php.exe
    echo Example: C:\xampp\php\php.exe
    pause
    exit /b 1
)

REM Check if worker files exist
if not exist "%SCRIPT_DIR%process-metrics-queue.php" (
    echo ERROR: process-metrics-queue.php not found at: %SCRIPT_DIR%process-metrics-queue.php
    pause
    exit /b 1
)

if not exist "%SCRIPT_DIR%server-checker-worker.php" (
    echo ERROR: server-checker-worker.php not found at: %SCRIPT_DIR%server-checker-worker.php
    pause
    exit /b 1
)

REM Start metrics processor
echo Starting Metrics Queue Processor...
start "Analytics Metrics Processor" cmd /k "cd /d %PROJECT_ROOT% && php %SCRIPT_DIR%process-metrics-queue.php"

REM Wait a moment
timeout /t 2 /nobreak > nul

REM Start server link checker worker
echo Starting Server Checker Worker...
start "Analytics Server Checker" cmd /k "cd /d %PROJECT_ROOT% && php %SCRIPT_DIR%server-checker-worker.php"

echo.
echo Workers started in separate windows.
echo.
echo To stop workers, close their command windows.
echo.
pause

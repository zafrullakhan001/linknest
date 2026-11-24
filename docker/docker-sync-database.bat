@echo off
setlocal EnableExtensions
REM Copy SQLite + uploads between the Windows host and the running LinkNest container.
REM Usage (from project root or docker\):
REM   docker-sync-database.bat
REM   docker-sync-database.bat -Direction Out
REM   docker-sync-database.bat -DatabaseOnly
REM   docker-sync-database.bat -UploadsOnly
REM   docker-sync-database.bat -HostBasePath /ArchLinks
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-sync-database.ps1" %*
exit /b %ERRORLEVEL%

@echo off
REM ============================================================
REM  LinkNest — Patch vanilla Apache + PHP in place (D:\Apache + D:\php)
REM  Double-click this file (UAC). Keeps httpd.conf, php.ini, and htdocs.
REM
REM  Examples:
REM    upgrade-vanilla-apache-php.bat
REM    upgrade-vanilla-apache-php.bat -SkipApache
REM    upgrade-vanilla-apache-php.bat -SkipPhp
REM    upgrade-vanilla-apache-php.bat -LatestMinor
REM    upgrade-vanilla-apache-php.bat -WhatIf
REM
REM  Docs: docs\VANILLA_APACHE_PHP_UPGRADE.md
REM ============================================================
echo.
echo  Patch D:\Apache + D:\php to the latest published Windows builds.
echo  httpd.conf, php.ini, and htdocs\linknest are kept.
if not "%~1"=="" (
    echo  Extra options: %*
)
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo  Requesting Administrator rights...
    powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -ArgumentList '%*'"
    exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\upgrade-vanilla-apache-php.ps1" %*
set "ERR=%ERRORLEVEL%"
if %ERR% NEQ 0 (
    echo.
    echo  *** Patch FAILED. See messages above. ***
    echo  Docs: docs\VANILLA_APACHE_PHP_UPGRADE.md
    echo.
    pause
    exit /b %ERR%
)
echo.
echo  Done. Check http://localhost/linknest/health.php
echo  Docs: docs\VANILLA_APACHE_PHP_UPGRADE.md
echo.
pause
exit /b 0

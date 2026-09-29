@echo off
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-windows-bootstrap-bundles.ps1" %*
endlocal

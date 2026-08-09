@echo off
REM LinkNest VNC gateway launcher — runs vendored websockify via system Python.
setlocal
set "ROOT=%~dp0.."
set "PACKAGES=%~dp0python-packages"
set "PYTHONPATH=%PACKAGES%;%PYTHONPATH%"

if defined VNC_GATEWAY_PYTHON (
  "%VNC_GATEWAY_PYTHON%" -m websockify %*
  exit /b %ERRORLEVEL%
)

if exist "C:\Program Files\Python312\python.exe" (
  "C:\Program Files\Python312\python.exe" -m websockify %*
  exit /b %ERRORLEVEL%
)
if exist "C:\Program Files\Python311\python.exe" (
  "C:\Program Files\Python311\python.exe" -m websockify %*
  exit /b %ERRORLEVEL%
)
where python >nul 2>&1 && (
  python -m websockify %*
  exit /b %ERRORLEVEL%
)
where py >nul 2>&1 && (
  py -3 -m websockify %*
  exit /b %ERRORLEVEL%
)

echo websockify launcher: Python not found. Install Python 3 and run: python -m pip install --target="%PACKAGES%" websockify 1>&2
exit /b 1

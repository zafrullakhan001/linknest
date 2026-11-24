@echo off
REM LinkNest VNC gateway launcher — runs vendored websockify via bundled or system Python.
setlocal
set "ROOT=%~dp0.."
set "PACKAGES=%~dp0python-packages"
set "BUNDLED_PYTHON=%~dp0python\python.exe"
set "PYTHONPATH=%PACKAGES%;%PYTHONPATH%"

if defined VNC_GATEWAY_PYTHON (
  "%VNC_GATEWAY_PYTHON%" -m websockify %*
  exit /b %ERRORLEVEL%
)

if exist "%BUNDLED_PYTHON%" (
  "%BUNDLED_PYTHON%" -m websockify %*
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

echo websockify launcher: Python not found. Install Python 3, or deploy bin\python from the remote-widgets runtime package. 1>&2
exit /b 1

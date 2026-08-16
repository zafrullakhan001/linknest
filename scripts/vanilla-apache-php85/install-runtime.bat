@echo off
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Run this file as Administrator.
  pause
  exit /b 1
)
if not exist "D:\Apache\bin\httpd.exe" (
  echo Extract this ZIP to D:\ first so that D:\Apache and D:\php exist.
  echo Example: right-click the ZIP - Extract All - destination D:\
  pause
  exit /b 1
)
if not exist "D:\php\php8apache2_4.dll" (
  echo D:\php\php8apache2_4.dll is missing. Extract the php folder to D:\php
  pause
  exit /b 1
)
mkdir D:\Apache\tmp 2>nul
mkdir D:\Apache\logs 2>nul
mkdir D:\Apache\htdocs\linknest\data 2>nul
mkdir D:\Apache\htdocs\linknest\uploads 2>nul
icacls D:\Apache\tmp /grant Users:(OI)(CI)M >nul
icacls D:\Apache\htdocs\linknest\data /grant Users:(OI)(CI)M /T >nul
icacls D:\Apache\htdocs\linknest\uploads /grant Users:(OI)(CI)M /T >nul
icacls D:\Apache\tmp /grant SYSTEM:(OI)(CI)M >nul
icacls D:\Apache\htdocs\linknest\data /grant SYSTEM:(OI)(CI)M /T >nul
icacls D:\Apache\htdocs\linknest\uploads /grant SYSTEM:(OI)(CI)M /T >nul

echo Adding D:\php to machine PATH if missing...
echo %PATH% | find /I "D:\php" >nul
if errorlevel 1 (
  setx /M PATH "%PATH%;D:\php" >nul
)

echo Testing httpd.conf...
D:\Apache\bin\httpd.exe -t
if errorlevel 1 (
  echo httpd -t failed. If port 80 is in use, stop XAMPP Apache or edit Listen in D:\Apache\conf\httpd.conf
  pause
  exit /b 1
)

sc query Apache24-LinkNest >nul 2>&1
if errorlevel 1 (
  echo Installing Windows service Apache24-LinkNest ...
  D:\Apache\bin\httpd.exe -k install -n Apache24-LinkNest
)
net start Apache24-LinkNest
echo.
echo Done. Put LinkNest in D:\Apache\htdocs\linknest then open http://localhost/linknest/
echo Service name: Apache24-LinkNest (does not replace XAMPP Apache2.4)
pause

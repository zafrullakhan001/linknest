@echo off
REM Clone command with all parameters
cd /d "C:\xampp\htdocs\linknest"
"C:\xampp\htdocs\linknest\scripts\clone-linknest.bat" "ZAF3" "--source" "C:\xampp\htdocs\linknest" "--target" "C:\xampp\htdocs" "--assets" "--database" > "C:\xampp\htdocs\linknest\clone_output.log" 2>&1
if errorlevel 1 (
    echo Clone process failed with error code: %ERRORLEVEL% >> "C:\xampp\htdocs\linknest\clone_output.log"
)
del "%~f0"

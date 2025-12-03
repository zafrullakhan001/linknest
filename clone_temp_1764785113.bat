@echo off
cd /d "C:\xampp\htdocs\linknest\scripts"
"C:\xampp\htdocs\linknest\scripts\clone-linknest.bat" "myZAF2" "--source" "C:\xampp\htdocs\linknest" "--target" "C:\xampp\htdocs" "--assets" "--database" > "C:\xampp\htdocs\linknest\clone_output.log" 2>&1
del "%~f0"

@echo off
winrm set winrm/config/client @{TrustedHosts="192.168.127.130"} > C:\xampp\htdocs\linknest\scripts\remote-winrm-setup.log 2>&1
winrm set winrm/config/client @{AllowUnencrypted="true"} >> C:\xampp\htdocs\linknest\scripts\remote-winrm-setup.log 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File C:\xampp\htdocs\linknest\scripts\_remote-winrm-probe.ps1 >> C:\xampp\htdocs\linknest\scripts\remote-winrm-setup.log 2>&1

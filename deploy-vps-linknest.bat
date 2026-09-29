@echo off
REM ============================================================
REM  LinkNest - deploy to a Linux VPS (nginx + PHP-FPM + OpenLDAP)
REM
REM  Put the server right next to the script:
REM    deploy-vps-linknest.bat root@198.251.72.41
REM
REM  More examples:
REM    deploy-vps-linknest.bat root@198.251.72.41 -Mode Update
REM    deploy-vps-linknest.bat root@198.251.72.41 -Domain links.example.com
REM    deploy-vps-linknest.bat root@198.251.72.41 -SkipOpenLdap -LeEmail me@example.com
REM    deploy-vps-linknest.bat root@198.251.72.41 -SkipBuild -Yes
REM    deploy-vps-linknest.bat root@198.251.72.41 -DryRun
REM
REM  Options (forwarded to scripts\deploy-vps-linknest.ps1):
REM    -Domain -AppUser -AppRoot -Mode Auto|Fresh|Update -Force
REM    -SkipOpenLdap -LdapBaseDn -LdapDomain -LdapOrg
REM    -LdapServicePassword -LdapAdminPassword -LeEmail
REM    -ExcludeDatabase -SkipBuild -SkipUpload -SkipVerify
REM    -MaxChildren -MemoryLimit -DryRun -Yes
REM
REM  Full guide: docs\DEPLOY_VPS.md
REM ============================================================
set "PKG=%~dp0"
cd /d "%PKG%"

if exist "%PKG%scripts\deploy-vps-linknest.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PKG%scripts\deploy-vps-linknest.ps1" %*
) else (
    echo  [XX] Missing scripts\deploy-vps-linknest.ps1
    pause
    exit /b 1
)

set "ERR=%ERRORLEVEL%"
if %ERR% NEQ 0 (
    echo.
    echo  *** VPS deployment FAILED ^(exit %ERR%^) ***
    echo.
    pause
    exit /b %ERR%
)
exit /b 0

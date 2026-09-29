# Sync PHP dependency DLLs into Apache's bin so php_curl.dll can load under apache2handler.
# Required after upgrading XAMPP PHP (8.5+): Apache\bin ships older OpenSSL/nghttp2/libssh2
# that shadow PHP's matching DLLs ("The specified procedure could not be found").
#
# Run elevated (or via fix-apache-php-curl-run-elevated.ps1).
param(
    [string]$XamppRoot = 'C:\xampp',
    [switch]$RestartApache
)

$ErrorActionPreference = 'Stop'
$php = Join-Path $XamppRoot 'php'
$apacheBin = Join-Path $XamppRoot 'apache\bin'
$dlls = @(
    'libcrypto-3-x64.dll',
    'libssl-3-x64.dll',
    'nghttp2.dll',
    'libssh2.dll',
    'brotlicommon.dll',
    'brotlidec.dll'
)

function Stop-Apache {
    $svc = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        Write-Host 'Stopping Apache2.4 service...'
        Stop-Service -Name 'Apache2.4' -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
        return
    }
    $httpd = Get-Process -Name 'httpd' -ErrorAction SilentlyContinue
    if ($httpd) {
        Write-Host 'Stopping httpd processes...'
        Stop-Process -Name 'httpd' -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

function Start-Apache {
    $svc = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
    if ($svc) {
        Start-Service -Name 'Apache2.4' -ErrorAction Stop
        Write-Host 'Apache2.4 started'
        return
    }
    $httpd = Join-Path $XamppRoot 'apache\bin\httpd.exe'
    if (Test-Path $httpd) {
        Start-Process -FilePath $httpd -WorkingDirectory (Join-Path $XamppRoot 'apache\bin')
        Write-Host 'httpd launched'
    }
}

if (-not (Test-Path (Join-Path $php 'ext\php_curl.dll'))) {
    throw "php_curl.dll not found under $php\ext"
}

Write-Host 'Stopping Apache so DLLs can be replaced...'
Stop-Apache

$backupDir = Join-Path $apacheBin ('dll-backup-before-php-sync-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Write-Host "Backup: $backupDir"

foreach ($name in $dlls) {
    $src = Join-Path $php $name
    $dst = Join-Path $apacheBin $name
    if (-not (Test-Path $src)) {
        Write-Warning "Skip missing PHP DLL: $name"
        continue
    }
    if (Test-Path $dst) {
        Copy-Item $dst (Join-Path $backupDir $name) -Force
    }
    Copy-Item $src $dst -Force
    Write-Host "Synced $name"
}

if ($RestartApache) {
    Write-Host 'Starting Apache...'
    Start-Apache
    Start-Sleep -Seconds 2
}

Write-Host 'Done. Verify with: curl extension loaded under Apache (link health check).'

# Update SQLite to 3.54.0 for LinkNest (XAMPP / PHP on Windows).
#
# Apache (Apache2.4 service) keeps php\libsqlite3.dll open while mod_php is
# loaded, so this must run elevated. It stops Apache, backs up + replaces the
# DLL in every PHP runtime it finds under the XAMPP root (XAMPP can have both
# php\ and php-8.5.x\ side by side, and httpd.conf decides which one is live),
# then starts Apache again.
#
# Usage (elevated):
#   .\scripts\update-sqlite-3.54.0.ps1
#   .\scripts\update-sqlite-3.54.0.ps1 -SkipStopApache   # Apache already stopped

[CmdletBinding()]
param(
    [string]$XamppRoot = 'C:\xampp',
    [string]$SourceDll = '',
    [switch]$SkipStopApache,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$TargetVersion = '3.54.0'
$DllZipUrl     = 'https://www.sqlite.org/2026/sqlite-dll-win-x64-3540000.zip'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message)   { Write-Host " [OK] $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message){ Write-Host " [!!] $Message" -ForegroundColor Yellow }

# --- 1) Locate the official DLL -------------------------------------------
if (-not $SourceDll) {
    $tmp = Join-Path $env:TEMP ('ln-sqlite-' + ($TargetVersion -replace '\.', ''))
    $out = Join-Path $tmp 'out'
    $dll = Join-Path $out 'sqlite3.dll'
    if (-not (Test-Path $dll)) {
        Write-Step "Downloading SQLite $TargetVersion Windows x64 DLL"
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        $zip = Join-Path $tmp (Split-Path $DllZipUrl -Leaf)
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $DllZipUrl -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $out -Force
    }
    $SourceDll = $dll
}
if (-not (Test-Path $SourceDll)) { throw "SQLite DLL not found: $SourceDll" }

$fileVer = (Get-Item $SourceDll).VersionInfo.FileVersion
if ($fileVer -ne $TargetVersion) { Write-Warn2 "DLL FileVersion is '$fileVer' (expected $TargetVersion)" }
Write-Ok "Source DLL: $SourceDll ($fileVer, $('{0:N0}' -f (Get-Item $SourceDll).Length) bytes)"

# Every PHP layout under the XAMPP root (php\, php-8.5.x\, windowsXamppPhp\).
$phpDirs = @(
    Get-ChildItem -Path $XamppRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'php*' -or $_.Name -eq 'windowsXamppPhp' } |
        Where-Object { Test-Path (Join-Path $_.FullName 'php.exe') } |
        Select-Object -ExpandProperty FullName
)
if ($phpDirs.Count -eq 0) { throw "No PHP runtime found under $XamppRoot" }
Write-Ok ("PHP runtimes: {0}" -f ($phpDirs -join ', '))

# --- 2) Stop Apache --------------------------------------------------------
if (-not $SkipStopApache) {
    Write-Step 'Stopping Apache (needs elevation - the DLL is locked while loaded)'
    if (-not $WhatIf) {
        $svc = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
        if ($svc) { & sc.exe stop Apache2.4 | Out-Null }
        Get-Process -Name httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt 15; $i++) {
            if (-not (Get-Process -Name httpd -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Seconds 1
        }
        if (Get-Process -Name httpd -ErrorAction SilentlyContinue) {
            throw 'httpd.exe is still running - stop it from the XAMPP Control Panel, then re-run.'
        }
        Write-Ok 'Apache stopped'
    }
}

# --- 3) Replace the DLL in every runtime ----------------------------------
$stamp = Get-Date -Format 'yyyyMMdd'
foreach ($phpDir in $phpDirs) {
    $dest = Join-Path $phpDir 'libsqlite3.dll'
    if (-not (Test-Path $dest)) { continue }
    $backup = Join-Path $phpDir "libsqlite3.dll.bak-before-$TargetVersion-$stamp"
    if ($WhatIf) {
        Write-Host " [WhatIf] Would install $SourceDll -> $dest (backup $backup)"
        continue
    }
    if (-not (Test-Path $backup)) {
        Copy-Item $dest $backup -Force
        Write-Ok "Backup: $backup"
    }
    try {
        Copy-Item $SourceDll $dest -Force
        Copy-Item $SourceDll (Join-Path $phpDir 'sqlite3.dll') -Force -ErrorAction SilentlyContinue
        Write-Ok "Installed $dest ($('{0:N0}' -f (Get-Item $dest).Length) bytes)"
    } catch {
        Write-Warn2 "Could not write $dest : $($_.Exception.Message)"
    }
}

# httpd loads the same library when it is the process that pulls SQLite in.
$apacheBin = Join-Path $XamppRoot 'apache\bin'
if ((Test-Path $apacheBin) -and -not $WhatIf) {
    Copy-Item $SourceDll (Join-Path $apacheBin 'libsqlite3.dll') -Force -ErrorAction SilentlyContinue
    Write-Ok "Also updated $apacheBin\libsqlite3.dll"
}

# --- 4) Start Apache + verify ---------------------------------------------
if (-not $SkipStopApache -and -not $WhatIf) {
    Write-Step 'Starting Apache'
    & sc.exe start Apache2.4 | Out-Null
    Start-Sleep -Seconds 2
    if (Get-Process -Name httpd -ErrorAction SilentlyContinue) { Write-Ok 'Apache started' }
    else { Write-Warn2 'Start Apache from the XAMPP Control Panel' }
}

if (-not $WhatIf) {
    foreach ($phpDir in $phpDirs) {
        $ver = & (Join-Path $phpDir 'php.exe') -r "echo SQLite3::version()['versionString'];"
        Write-Ok "$phpDir -> SQLite $ver"
        if ($ver -ne $TargetVersion) {
            Write-Warn2 "Expected $TargetVersion - a still-running Apache may be holding the old module."
        }
    }
}

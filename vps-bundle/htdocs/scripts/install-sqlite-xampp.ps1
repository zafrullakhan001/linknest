# Install / repair SQLite for LinkNest on Windows XAMPP.
#
# Does two things many XAMPP hosts need:
#   1. Enable extension=sqlite3 and extension=pdo_sqlite in php.ini
#      (and de-dupe openssl so PHP stops warning "Module openssl is already loaded")
#   2. Replace php\libsqlite3.dll with the bundled 3.53.x DLL from the deploy ZIP
#
# Usage:
#   .\scripts\install-sqlite-xampp.ps1 -XamppRoot D:\xampp
#   .\scripts\install-sqlite-xampp.ps1 -XamppRoot D:\xampp -SourceDll .\runtime\sqlite\libsqlite3.dll -Quiet
#   .\scripts\install-sqlite-xampp.ps1 -XamppRoot D:\xampp -SkipDll   # php.ini only
#
# Prefer install-sqlite-xampp.bat from the deploy ZIP (handles UAC elevation).

[CmdletBinding()]
param(
    [string]$XamppRoot = 'C:\xampp',
    [string]$SourceDll = '',
    [string]$PackageDir = '',
    [switch]$SkipDll,
    [switch]$Quiet,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$RequiredExts = @('sqlite3', 'pdo_sqlite')
$DedupExts = @('openssl', 'sqlite3', 'pdo_sqlite')

function Write-Info([string]$Message) {
    if (-not $Quiet) { Write-Host $Message }
}

function Write-Ok([string]$Message) {
    Write-Host " [OK] $Message" -ForegroundColor Green
}

function Write-Fail([string]$Message) {
    Write-Host " [XX] $Message" -ForegroundColor Red
}

function Enable-IniExtension([string]$Content, [string]$Name, [bool]$IsZend = $false) {
    $prefix = if ($IsZend) { 'zend_extension' } else { 'extension' }
    $strip = "(?m)^\s*;?\s*$prefix\s*=\s*(?:php_)?$([regex]::Escape($Name))(?:\.dll)?\s*(;.*)?\r?\n?"
    $Content = [regex]::Replace($Content, $strip, '')
    return $Content.TrimEnd() + "`r`n$prefix=$Name`r`n"
}

function Test-PhpExtension([string]$PhpExe, [string]$ExtName) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & $PhpExe -r "echo extension_loaded('$ExtName') ? '1' : '0';" 2>&1
    $ErrorActionPreference = $prev
    $text = ($out | Out-String)
    return ($text -match '(?m)^1\s*$')
}

function Stop-XamppApacheSoft([string]$Root) {
    # XAMPP often runs httpd from the Control Panel (no Apache2.4 Windows service).
    # Never treat a missing service as a fatal error.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $svc = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') {
            Stop-Service -Name 'Apache2.4' -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
        $httpd = Join-Path $Root 'apache\bin\httpd.exe'
        if ((Test-Path $httpd) -and (Get-Process -Name httpd -ErrorAction SilentlyContinue)) {
            & $httpd -k stop 2>&1 | Out-Null
            Start-Sleep -Seconds 1
        }
        Get-Process -Name httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Start-XamppApacheSoft([string]$Root) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $svc = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -ne 'Running') {
            Start-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            if (Get-Process -Name httpd -ErrorAction SilentlyContinue) { return $true }
        }
        $httpd = Join-Path $Root 'apache\bin\httpd.exe'
        if (Test-Path $httpd) {
            & $httpd -k start 2>&1 | Out-Null
            Start-Sleep -Seconds 2
            if (Get-Process -Name httpd -ErrorAction SilentlyContinue) { return $true }
        }
        $startBat = Join-Path $Root 'apache_start.bat'
        if (Test-Path $startBat) {
            & cmd.exe /c "`"$startBat`"" 2>&1 | Out-Null
            Start-Sleep -Seconds 2
            if (Get-Process -Name httpd -ErrorAction SilentlyContinue) { return $true }
        }
    } finally {
        $ErrorActionPreference = $prev
    }
    return $false
}

function Get-SqliteVersionString([string]$PhpExe) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & $PhpExe -r "if (!class_exists('SQLite3')) { fwrite(STDERR, 'NO_SQLITE3'); exit(2); } echo SQLite3::version()['versionString'];" 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    $text = (($out | ForEach-Object { "$_" }) -join "`n") -replace '\r', ''
    if ($code -ne 0 -or $text -match 'NO_SQLITE3' -or $text -match 'Fatal error') {
        return $null
    }
    # Prefer last non-warning line (force array — a single string is char-indexable)
    $lines = @(
        $text -split "`n" |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and $_ -notmatch 'Warning:' -and $_ -notmatch 'already loaded' }
    )
    if ($lines.Count -gt 0) { return [string]$lines[-1] }
    return $null
}

# Resolve package dir (deploy ZIP root) when SourceDll not given
if (-not $PackageDir) {
    $here = $PSScriptRoot
    if ($here -and (Split-Path -Leaf $here) -eq 'scripts') {
        $PackageDir = Split-Path -Parent $here
    } else {
        $PackageDir = (Get-Location).Path
    }
}

$XamppRoot = $XamppRoot.TrimEnd('\', '/')
$phpDir = Join-Path $XamppRoot 'php'
$phpExe = Join-Path $phpDir 'php.exe'
$phpIni = Join-Path $phpDir 'php.ini'
$extDir = Join-Path $phpDir 'ext'

if (-not (Test-Path $phpExe)) {
    Write-Fail "Cannot find $phpExe"
    exit 1
}
if (-not (Test-Path $phpIni)) {
    Write-Fail "Cannot find $phpIni"
    exit 1
}

Write-Info ""
Write-Info " ============================================="
Write-Info "    LinkNest - SQLite XAMPP Install / Repair"
Write-Info " ============================================="
Write-Info ""
Write-Info " XAMPP PHP : $phpDir"
Write-Info " php.ini   : $phpIni"

# --- 1) Ensure PHP extension DLLs exist ------------------------------------
$missingDlls = @()
foreach ($name in $RequiredExts) {
    $dll = Join-Path $extDir "php_$name.dll"
    if (-not (Test-Path $dll)) {
        $missingDlls += $dll
    }
}
if ($missingDlls.Count -gt 0) {
    Write-Fail "Required PHP extension DLL(s) missing:"
    foreach ($d in $missingDlls) { Write-Host "       $d" }
    Write-Host ""
    Write-Host " This XAMPP PHP build does not ship SQLite modules."
    Write-Host " Fix: run upgrade-xampp-php.bat (elevated) from the deploy ZIP,"
    Write-Host "      or install a full Thread-Safe PHP that includes php_sqlite3.dll."
    Write-Host " See docs\XAMPP_PHP_UPGRADE.md"
    exit 1
}

# --- 2) Enable extensions + de-dupe openssl in php.ini ----------------------
Write-Info ""
Write-Info " Enabling sqlite3 / pdo_sqlite in php.ini (and de-duping openssl)..."
$ini = Get-Content -Raw -Path $phpIni
$original = $ini
foreach ($name in $DedupExts) {
    $ini = Enable-IniExtension $ini $name $false
}

if ($ini -ne $original) {
    $backup = Join-Path $phpDir 'php.ini.bak-before-linknest-sqlite'
    if (-not $WhatIf) {
        if (-not (Test-Path $backup)) {
            Copy-Item $phpIni $backup
            Write-Ok "Backup: $backup"
        }
        Set-Content -Path $phpIni -Value $ini -NoNewline -Encoding Ascii
        Write-Ok "php.ini updated (extension=sqlite3, extension=pdo_sqlite; openssl de-duped)"
    } else {
        Write-Info " [WhatIf] Would update php.ini"
    }
} else {
    Write-Ok "php.ini already has a single sqlite3 / pdo_sqlite / openssl line"
}

# --- 3) Install bundled libsqlite3.dll -------------------------------------
if (-not $SkipDll) {
    if (-not $SourceDll) {
        $cand1 = Join-Path $PackageDir 'runtime\sqlite\libsqlite3.dll'
        $cand2 = Join-Path $PackageDir 'runtime\sqlite\sqlite3.dll'
        if (Test-Path $cand1) { $SourceDll = $cand1 }
        elseif (Test-Path $cand2) { $SourceDll = $cand2 }
    }
    if (-not $SourceDll -or -not (Test-Path $SourceDll)) {
        Write-Fail "runtime\sqlite\libsqlite3.dll not found. Re-package without -SkipSqliteRuntime, or pass -SourceDll."
        exit 1
    }

    Write-Info ""
    Write-Info " Source DLL: $SourceDll"
    Write-Info " Stopping Apache so the DLL can be replaced..."
    if (-not $WhatIf) {
        Stop-XamppApacheSoft $XamppRoot
    }

    $dest = Join-Path $phpDir 'libsqlite3.dll'
    $dest2 = Join-Path $phpDir 'windowsXamppPhp\libsqlite3.dll'
    $dllBackup = Join-Path $phpDir 'libsqlite3.dll.bak-before-linknest'

    if (-not $WhatIf) {
        if ((Test-Path $dest) -and -not (Test-Path $dllBackup)) {
            Copy-Item $dest $dllBackup -Force
            Write-Ok "Backup: $dllBackup"
        }
        try {
            Copy-Item $SourceDll $dest -Force
        } catch {
            Write-Fail "Could not write $dest (is Apache still locking it?)"
            Write-Host " Stop Apache in XAMPP Control Panel, then re-run install-sqlite-xampp.bat"
            Write-Host " Details: $($_.Exception.Message)"
            exit 1
        }
        Write-Ok "Installed $dest"
        if (Test-Path (Join-Path $phpDir 'windowsXamppPhp')) {
            Copy-Item $SourceDll $dest2 -Force -ErrorAction SilentlyContinue
        }
        Copy-Item $SourceDll (Join-Path $phpDir 'sqlite3.dll') -Force -ErrorAction SilentlyContinue
        Write-Ok "Also updated windowsXamppPhp copy / sqlite3.dll"

        Write-Info " Starting Apache..."
        if (Start-XamppApacheSoft $XamppRoot) {
            Write-Ok "Apache started"
        } else {
            Write-Host " [!!] Could not start Apache automatically - start it from XAMPP Control Panel" -ForegroundColor Yellow
        }
    } else {
        Write-Info " [WhatIf] Would install $SourceDll -> $dest"
    }
}

# --- 4) Verify -------------------------------------------------------------
Write-Info ""
Write-Info " Verifying PHP SQLite..."
$sqliteOk = Test-PhpExtension $phpExe 'sqlite3'
$pdoOk = Test-PhpExtension $phpExe 'pdo_sqlite'
$ver = Get-SqliteVersionString $phpExe

if (-not $sqliteOk) {
    Write-Fail "extension=sqlite3 is still NOT loaded"
    Write-Host " Check: $phpIni"
    Write-Host " Confirm: extension_dir points at $extDir"
    Write-Host " Confirm: php_sqlite3.dll exists and matches this PHP version/arch"
    Write-Host " Tip: run upgrade-xampp-php.bat if this is a broken/minimal XAMPP PHP."
    exit 1
}
if (-not $pdoOk) {
    Write-Fail "extension=pdo_sqlite is still NOT loaded (LinkNest needs PDO SQLite)"
    exit 1
}

if ($ver) {
    Write-Ok "PHP SQLite3: $ver"
} else {
    Write-Fail "SQLite3 class still missing after enabling the extension"
    exit 1
}

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$pdoVer = & $phpExe -r "`$p=new PDO('sqlite::memory:'); echo `$p->query('select sqlite_version()')->fetchColumn();" 2>&1
$ErrorActionPreference = $prev
$pdoText = (($pdoVer | ForEach-Object { "$_" }) -join "`n") -replace '\r', ''
$pdoLines = @(
    $pdoText -split "`n" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and $_ -notmatch 'Warning:' -and $_ -notmatch 'already loaded' -and $_ -notmatch 'Fatal' }
)
if ($pdoLines.Count -gt 0) {
    Write-Ok "PDO SQLite: $([string]$pdoLines[-1])"
}

Write-Info ""
Write-Info " LinkNest performance pragmas (WAL / mmap / cache / threads) apply on next API request."
Write-Info ""
exit 0

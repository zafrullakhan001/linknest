#Requires -Version 5.1
<#
.SYNOPSIS
    Install offline SSH/VNC gateway binaries into a LinkNest XAMPP install.

.DESCRIPTION
    Copies packaged bin/ (ttyd, OpenSSH, python, websockify) into InstallDir,
    optionally installs VcXsrv to Program Files, and writes Admin gateway paths
    into SQLite (without loading api/config.php migrations).

.PARAMETER InstallDir
    LinkNest root (default C:\xampp\htdocs\linknest)

.PARAMETER XamppRoot
    XAMPP root for php.exe (default C:\xampp)

.PARAMETER PackageRoot
    Folder containing bin/ from the offline package (default: this script's directory)

.PARAMETER SkipVcXsrv
    Do not copy VcXsrv into Program Files

.EXAMPLE
    .\install-remote-widgets-runtime.ps1
    .\install-remote-widgets-runtime.ps1 -InstallDir D:\xampp\htdocs\linknest
#>
param(
    [string]$InstallDir = "C:\xampp\htdocs\linknest",
    [string]$XamppRoot = "C:\xampp",
    [string]$PackageRoot = "",
    [switch]$SkipVcXsrv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-OK([string]$m) { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "  [!!]  $m" -ForegroundColor Yellow }
function Write-Step([string]$m) { Write-Host "   ->   $m" -ForegroundColor White }
function Write-Err([string]$m) { Write-Host "  [XX]  $m" -ForegroundColor Red }

if ([string]::IsNullOrWhiteSpace($PackageRoot)) {
    $PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$srcBin = Join-Path $PackageRoot "bin"
if (-not (Test-Path (Join-Path $srcBin "ttyd.exe"))) {
    # Allow running from repo scripts/ against a nearby package folder, or parent
    $alt = Join-Path (Split-Path -Parent $PackageRoot) "bin"
    if (Test-Path (Join-Path $alt "ttyd.exe")) {
        $PackageRoot = Split-Path -Parent $PackageRoot
        $srcBin = Join-Path $PackageRoot "bin"
    }
}
if (-not (Test-Path (Join-Path $srcBin "ttyd.exe"))) {
    throw "Package bin/ttyd.exe not found under $PackageRoot. Unzip the runtime package and run this script from that folder."
}
if (-not (Test-Path $InstallDir)) {
    throw "InstallDir not found: $InstallDir"
}

Write-Host ""
Write-Host "==== Install remote-widgets runtime ====" -ForegroundColor Cyan
Write-Host "  Package : $PackageRoot" -ForegroundColor Gray
Write-Host "  Target  : $InstallDir" -ForegroundColor Gray

$dstBin = Join-Path $InstallDir "bin"
New-Item -ItemType Directory -Force -Path $dstBin | Out-Null

# --- Copy bin tree (ttyd, OpenSSH, python, python-packages, launchers) ------
Write-Step "Copying bin/ into $dstBin"
robocopy $srcBin $dstBin /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy bin failed with code $LASTEXITCODE" }
Write-OK "bin/ synchronized"

# Fix embeddable Python ._pth so PYTHONPATH / relative packages work
$pth = Get-ChildItem (Join-Path $dstBin "python") -Filter "python*._pth" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pth) {
    $zipName = Get-ChildItem (Join-Path $dstBin "python") -Filter "python*.zip" | Select-Object -First 1
    $lines = @()
    if ($zipName) { $lines += $zipName.Name } else { $lines += "python312.zip" }
    $lines += "."
    $lines += "..\python-packages"
    $lines += "import site"
    Set-Content -Path $pth.FullName -Value ($lines -join "`r`n") -Encoding ASCII
    Write-OK ("Updated {0}" -f $pth.Name)
}

# --- VcXsrv → Program Files (where Admin status probe looks) ---------------
$vcSrc = Join-Path $PackageRoot "VcXsrv"
$vcDst = Join-Path ${env:ProgramFiles} "VcXsrv"
if ($SkipVcXsrv) {
    Write-Warn "Skipping VcXsrv install"
}
elseif (Test-Path (Join-Path $vcSrc "vcxsrv.exe")) {
    Write-Step "Installing VcXsrv to $vcDst (may need elevation)..."
    try {
        if (-not (Test-Path $vcDst)) { New-Item -ItemType Directory -Force -Path $vcDst | Out-Null }
        robocopy $vcSrc $vcDst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy VcXsrv exit $LASTEXITCODE" }
        Write-OK "VcXsrv installed at $vcDst"
    }
    catch {
        Write-Warn ("VcXsrv copy failed (run elevated?): {0}" -f $_.Exception.Message)
        $alt = Join-Path $dstBin "VcXsrv"
        Write-Step "Falling back to $alt"
        New-Item -ItemType Directory -Force -Path $alt | Out-Null
        robocopy $vcSrc $alt /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        Write-Warn "Copied to bin\VcXsrv - start xlaunch.exe from there for GUI mode (Admin status may still say Not found until under Program Files)."
    }
}
else {
    Write-Warn "No VcXsrv/ in package - SSH Terminal+GUI needs a separate X server"
}

# --- Persist Admin gateway paths via SQLite (no migrations) ----------------
$phpExe = Join-Path $XamppRoot "php\php.exe"
$dbPath = Join-Path $InstallDir "data\linknest.db"
$dataDir = Join-Path $InstallDir "data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }

$ttyd = Join-Path $dstBin "ttyd.exe"
$sshSys = "C:\Windows\System32\OpenSSH\ssh.exe"
$sshBundled = Join-Path $dstBin "OpenSSH\ssh.exe"
$ssh = if (Test-Path $sshSys) { $sshSys } elseif (Test-Path $sshBundled) { $sshBundled } else { "" }
$pythonBundled = Join-Path $dstBin "python\python.exe"
$python = ""
if (Test-Path $pythonBundled) {
    $python = $pythonBundled
}
else {
    foreach ($cand in @(
            "C:\Program Files\Python312\python.exe",
            "C:\Program Files\Python311\python.exe",
            "C:\Program Files\Python310\python.exe"
        )) {
        if (Test-Path $cand) { $python = $cand; break }
    }
    if (-not $python) {
        $cmd = Get-Command python.exe -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) { $python = $cmd.Source }
    }
}
$launcher = Join-Path $dstBin "run-websockify.cmd"

if (Test-Path $phpExe) {
    Write-Step "Writing Admin SSH/VNC gateway paths into SQLite..."
    $setPhp = Join-Path $env:TEMP ("linknest-set-rw-" + [guid]::NewGuid().ToString("N") + ".php")
    $dbPhp = ($dbPath -replace '\\', '/')
    $ttydPhp = ($ttyd -replace '\\', '/')
    $sshPhp = ($ssh -replace '\\', '/')
    $pyPhp = ($python -replace '\\', '/')
    $launchPhp = ($launcher -replace '\\', '/')
    $phpCode = @"
<?php
declare(strict_types=1);
`$dbFile = str_replace('/', DIRECTORY_SEPARATOR, '$dbPhp');
`$pairs = [
    'ssh_gateway_ttyd_path' => str_replace('/', DIRECTORY_SEPARATOR, '$ttydPhp'),
    'ssh_gateway_ssh_path' => str_replace('/', DIRECTORY_SEPARATOR, '$sshPhp'),
    'vnc_gateway_python_path' => str_replace('/', DIRECTORY_SEPARATOR, '$pyPhp'),
    'vnc_gateway_websockify_path' => str_replace('/', DIRECTORY_SEPARATOR, '$launchPhp'),
];
try {
    `$pdo = new PDO('sqlite:' . `$dbFile);
    `$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    `$pdo->exec('CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
    )');
    `$now = time();
    `$upsert = `$pdo->prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
    foreach (`$pairs as `$k => `$v) {
        if (`$v === '' || !is_file(`$v)) {
            continue;
        }
        `$upsert->execute([`$k, `$v, `$now]);
    }
    echo 'ok';
} catch (Throwable `$e) {
    fwrite(STDERR, 'set-gateway-paths: ' . `$e->getMessage());
    exit(1);
}
"@
    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($setPhp, $phpCode, $utf8NoBom)
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $out = & $phpExe $setPhp 2>&1
        $ErrorActionPreference = $prev
        if ($LASTEXITCODE -eq 0) { Write-OK "Gateway paths saved to settings" }
        else { Write-Warn ("SQLite path write: {0}" -f ($out | Out-String)) }
    }
    catch {
        Write-Warn ("Could not write settings: {0}" -f $_.Exception.Message)
    }
    finally {
        Remove-Item $setPhp -Force -ErrorAction SilentlyContinue
    }
}
else {
    Write-Warn "php.exe not found at $phpExe - set paths manually in Admin → Add-ons"
}

# --- Summary ---------------------------------------------------------------
Write-Host ""
Write-Host "==== Verify ====" -ForegroundColor Cyan
$checks = @(
    @{ Name = "ttyd"; Path = $ttyd },
    @{ Name = "OpenSSH"; Path = $(if ($ssh) { $ssh } else { $sshBundled }) },
    @{ Name = "Python"; Path = $(if ($python) { $python } else { "(install system Python 3)" }) },
    @{ Name = "websockify pkg"; Path = (Join-Path $dstBin "python-packages\websockify") },
    @{ Name = "run-websockify"; Path = $launcher },
    @{ Name = "VcXsrv"; Path = (Join-Path $vcDst "vcxsrv.exe") }
)
foreach ($c in $checks) {
    if ($c.Path -like "(install*" ) { Write-Warn ("{0}: {1}" -f $c.Name, $c.Path) }
    elseif (Test-Path $c.Path) { Write-OK ("{0}: {1}" -f $c.Name, $c.Path) }
    else { Write-Warn ("{0}: missing ({1})" -f $c.Name, $c.Path) }
}

Write-Host ""
Write-Host "Next: open LinkNest Admin → Add-ons → SSH Gateway / VNC Gateway and confirm Ready." -ForegroundColor Green
Write-Host "For SSH GUI: start VcXsrv (XLaunch → Multiple windows → Start no client)." -ForegroundColor Green

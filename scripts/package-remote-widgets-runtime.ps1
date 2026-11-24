#Requires -Version 5.1
<#
.SYNOPSIS
    Build an offline ZIP of SSH/VNC gateway binaries for air-gapped LinkNest hosts.

.DESCRIPTION
    Packages SSH/VNC gateway binaries (embeddable Python included by default):
      - ttyd (Windows + Linux)
      - OpenSSH client (portable under bin/OpenSSH)
      - VcXsrv (X11 for SSH GUI mode)
      - Embeddable CPython under bin/python
      - Vendored websockify (bin/python-packages)
      - run-websockify launchers

    Run this on a machine WITH internet (or with tools already installed).
    Copy the ZIP to the restricted host and run install-remote-widgets-runtime.bat.

.PARAMETER ProjectRoot
    LinkNest root. Default: parent of scripts/

.PARAMETER OutputDir
    Where to write the ZIP (default: project root)

.PARAMETER PythonVersion
    Embeddable CPython version (default 3.12.4)

.PARAMETER IncludePython
    Deprecated: Python is bundled by default. Kept so older commands still work.

.PARAMETER SkipPython
    Do not bundle embeddable Python (target would need system Python 3)

.PARAMETER SkipVcXsrv
    Do not include VcXsrv (SSH Terminal+GUI will need a separate install)

.EXAMPLE
    .\scripts\package-remote-widgets-runtime.ps1
    .\scripts\package-remote-widgets-runtime.ps1 -OutputDir D:\usb
    .\scripts\package-remote-widgets-runtime.ps1 -SkipPython
#>
param(
    [string]$ProjectRoot = "",
    [string]$OutputDir = "",
    [string]$PythonVersion = "3.12.4",
    [switch]$IncludePython,
    [switch]$SkipPython,
    [switch]$SkipVcXsrv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-OK([string]$m) { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "  [!!]  $m" -ForegroundColor Yellow }
function Write-Step([string]$m) { Write-Host "   ->   $m" -ForegroundColor White }
function Write-Err([string]$m) { Write-Host "  [XX]  $m" -ForegroundColor Red }
function Write-Header([string]$m) {
    Write-Host ""
    Write-Host ("==== {0} ====" -f $m) -ForegroundColor Cyan
}

function Get-HttpFile([string]$Url, [string]$Dest, [string]$Label, [int]$MinBytes = 100000) {
    Write-Step ("Downloading {0}" -f $Label)
    Write-Step $Url
    $tmp = Join-Path $env:TEMP ("linknest-rw-" + [guid]::NewGuid().ToString("N"))
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
        if ($curl) {
            & curl.exe -L --ssl-no-revoke --fail --retry 3 --retry-delay 2 -o $tmp $Url
            if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" }
        }
        else {
            Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing
        }
        $len = (Get-Item $tmp).Length
        if ($len -lt $MinBytes) { throw ("Downloaded file too small ({0} bytes)" -f $len) }
        $destDir = Split-Path -Parent $Dest
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Move-Item $tmp $Dest -Force
        Write-OK ("{0} ({1:N0} bytes)" -f $Label, $len)
        return $true
    }
    catch {
        Write-Warn ("{0} failed: {1}" -f $Label, $_.Exception.Message)
        if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
        return $false
    }
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = $ProjectRoot
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$PackageName = "linknest-remote-widgets-runtime-$Timestamp"
$Staging = Join-Path $env:TEMP $PackageName
$ZipPath = Join-Path $OutputDir "$PackageName.zip"

if ($IncludePython -and $SkipPython) {
    Write-Warn "-IncludePython and -SkipPython both set; SkipPython wins."
}
Write-Host "  Project : $ProjectRoot" -ForegroundColor Gray
Write-Host "  Staging : $Staging" -ForegroundColor Gray
Write-Host "  Output  : $ZipPath" -ForegroundColor Gray

if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Staging | Out-Null
$stageBin = Join-Path $Staging "bin"
New-Item -ItemType Directory -Force -Path $stageBin | Out-Null

# ---------------------------------------------------------------------------
# 1. ttyd
# ---------------------------------------------------------------------------
Write-Header "1 / ttyd"
$ensureTtyd = Join-Path $ProjectRoot "scripts\ensure-ttyd-runtime.ps1"
if (Test-Path $ensureTtyd) {
    & $ensureTtyd -ProjectRoot $ProjectRoot
}
$ttydSrc = Join-Path $ProjectRoot "bin\ttyd.exe"
$ttydLinux = Join-Path $ProjectRoot "bin\ttyd.x86_64"
if (-not (Test-Path $ttydSrc)) {
    throw "bin/ttyd.exe missing. Connect to the internet and re-run, or place ttyd.win32.exe as bin/ttyd.exe."
}
Copy-Item $ttydSrc (Join-Path $stageBin "ttyd.exe") -Force
Write-OK "bin/ttyd.exe"
if (Test-Path $ttydLinux) {
    Copy-Item $ttydLinux (Join-Path $stageBin "ttyd.x86_64") -Force
    Write-OK "bin/ttyd.x86_64"
}
$verNote = Join-Path $ProjectRoot "bin\TTYD_VERSION.txt"
if (Test-Path $verNote) { Copy-Item $verNote $stageBin -Force }

# ---------------------------------------------------------------------------
# 2. OpenSSH (portable copy for Admin path / auto-detect)
# ---------------------------------------------------------------------------
Write-Header "2 / OpenSSH client"
$ensureOpenSsh = Join-Path $ProjectRoot "scripts\ensure-openssh-runtime.ps1"
if (Test-Path $ensureOpenSsh) {
    & $ensureOpenSsh -ProjectRoot $ProjectRoot -FailIfMissing
}
$sshSrc = Join-Path $ProjectRoot "bin\OpenSSH\ssh.exe"
if (-not (Test-Path $sshSrc)) {
    throw "bin/OpenSSH/ssh.exe missing after ensure-openssh-runtime."
}
$sshStage = Join-Path $stageBin "OpenSSH"
New-Item -ItemType Directory -Force -Path $sshStage | Out-Null
Copy-Item (Join-Path $ProjectRoot "bin\OpenSSH\*") $sshStage -Recurse -Force
if (-not (Test-Path (Join-Path $sshStage "ssh.exe"))) {
    throw "bin/OpenSSH/ssh.exe missing after copy"
}
Write-OK "OpenSSH copied to package bin/OpenSSH"

# ---------------------------------------------------------------------------
# 3. Vendored websockify (lean reinstall when Python available)
# ---------------------------------------------------------------------------
Write-Header "3 / websockify (vendored)"
$pkgStage = Join-Path $stageBin "python-packages"
New-Item -ItemType Directory -Force -Path $pkgStage | Out-Null
$pyCmd = Get-Command python.exe -ErrorAction SilentlyContinue
if ($pyCmd) {
    Write-Step "pip install --target python-packages websockify (lean)"
    & python.exe -m pip install --upgrade --disable-pip-version-check --no-warn-script-location `
        --target=$pkgStage websockify 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "pip install failed; copying existing bin/python-packages if present"
    }
}
if (-not (Test-Path (Join-Path $pkgStage "websockify"))) {
    $existing = Join-Path $ProjectRoot "bin\python-packages"
    if (Test-Path (Join-Path $existing "websockify")) {
        Write-Step "Copying existing bin/python-packages..."
        Copy-Item $existing\* $pkgStage -Recurse -Force
        Write-OK "Copied existing websockify packages"
    }
    else {
        throw "websockify packages missing. Run scripts/install-websockify.ps1 on a networked host first."
    }
}
else {
    Write-OK "websockify vendored into bin/python-packages"
}

# ---------------------------------------------------------------------------
# 4. Embeddable Python (default — VNC Easy without system Python)
# ---------------------------------------------------------------------------
Write-Header "4 / Python"
$pyStage = Join-Path $stageBin "python"
$PythonBundled = $false
if ($SkipPython) {
    Write-Warn "Skipping embeddable Python (-SkipPython). Install Python 3 on the target for VNC Easy."
}
else {
    $ensurePython = Join-Path $ProjectRoot "scripts\ensure-python-runtime.ps1"
    if (Test-Path $ensurePython) {
        & $ensurePython -ProjectRoot $ProjectRoot -Version $PythonVersion -FailIfMissing
    }
    $existingPy = Join-Path $ProjectRoot "bin\python\python.exe"
    if (-not (Test-Path $existingPy)) {
        throw "bin/python/python.exe missing after ensure-python-runtime."
    }
    New-Item -ItemType Directory -Force -Path $pyStage | Out-Null
    Copy-Item (Join-Path $ProjectRoot "bin\python\*") $pyStage -Recurse -Force
    if (-not (Test-Path (Join-Path $pyStage "python.exe"))) {
        throw "bin/python/python.exe missing after copy"
    }
    $PythonBundled = $true
    Write-OK "Python embeddable copied to package bin/python"
}

# ---------------------------------------------------------------------------
# 5. VcXsrv
# ---------------------------------------------------------------------------
Write-Header "5 / VcXsrv"
$vcStage = Join-Path $Staging "VcXsrv"
if ($SkipVcXsrv) {
    Write-Warn "Skipping VcXsrv (-SkipVcXsrv)"
}
else {
    $vcSrc = $null
    foreach ($p in @("C:\Program Files\VcXsrv", "C:\Program Files (x86)\VcXsrv")) {
        if (Test-Path (Join-Path $p "vcxsrv.exe")) { $vcSrc = $p; break }
    }
    if ($vcSrc) {
        Write-Step "Copying $vcSrc ..."
        New-Item -ItemType Directory -Force -Path $vcStage | Out-Null
        robocopy $vcSrc $vcStage /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        # robocopy exit 0-7 = success
        if ($LASTEXITCODE -ge 8) { throw "robocopy VcXsrv failed with code $LASTEXITCODE" }
        Write-OK ("VcXsrv copied ({0:N1} MB)" -f ((Get-ChildItem $vcStage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))
    }
    else {
        Write-Warn "VcXsrv not installed on this PC - SSH Terminal+GUI will need a separate install on the target."
        Write-Warn "Install here with: winget install marha.VcXsrv   then re-run this packager."
    }
}

# ---------------------------------------------------------------------------
# 6. Launchers + install scripts + README
# ---------------------------------------------------------------------------
Write-Header "6 / Launchers, installers, README"

$runCmd = Join-Path $ProjectRoot "bin\run-websockify.cmd"
$runSh = Join-Path $ProjectRoot "bin\run-websockify"
if (Test-Path $runCmd) { Copy-Item $runCmd $stageBin -Force } else {
    $fallbackCmd = @'
@echo off
setlocal
set "PACKAGES=%~dp0python-packages"
set "BUNDLED_PYTHON=%~dp0python\python.exe"
set "PYTHONPATH=%PACKAGES%;%PYTHONPATH%"
if defined VNC_GATEWAY_PYTHON ("%VNC_GATEWAY_PYTHON%" -m websockify %* & exit /b %ERRORLEVEL%)
if exist "%BUNDLED_PYTHON%" ("%BUNDLED_PYTHON%" -m websockify %* & exit /b %ERRORLEVEL%)
where python >nul 2>&1 && (python -m websockify %* & exit /b %ERRORLEVEL%)
echo Python not found 1>&2
exit /b 1
'@
    Set-Content -Path (Join-Path $stageBin "run-websockify.cmd") -Value $fallbackCmd -Encoding ASCII
}
if (Test-Path $runSh) { Copy-Item $runSh $stageBin -Force }
Write-OK "run-websockify launchers"

$installPs1Src = Join-Path $ProjectRoot "scripts\install-remote-widgets-runtime.ps1"
$installBatSrc = Join-Path $ProjectRoot "scripts\install-remote-widgets-runtime.bat"
if (-not (Test-Path $installPs1Src)) {
    throw "Missing scripts/install-remote-widgets-runtime.ps1 - create it before packaging."
}
Copy-Item $installPs1Src (Join-Path $Staging "install-remote-widgets-runtime.ps1") -Force
if (Test-Path $installBatSrc) {
    Copy-Item $installBatSrc (Join-Path $Staging "install-remote-widgets-runtime.bat") -Force
}
Write-OK "install-remote-widgets-runtime.*"

$pyNote = if ($PythonBundled) {
    "bin/python/python.exe     Embeddable CPython $PythonVersion"
} else {
    "(Python NOT included - install Python 3 on the target for VNC Easy, or omit -SkipPython)"
}
$readme = @"
LinkNest remote-widgets offline runtime
=======================================
Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Host:  $env:COMPUTERNAME

Contents
--------
bin/ttyd.exe              SSH Easy gateway (Windows)
bin/ttyd.x86_64           SSH Easy gateway (Linux/Docker)
bin/OpenSSH/ssh.exe       OpenSSH client (portable)
$pyNote
bin/python-packages/      Vendored websockify (+ deps; used by bundled or system Python)
bin/run-websockify.cmd    VNC Easy launcher
VcXsrv/                   X server for SSH Terminal + GUI (if included)

Install on target
-----------------
1. Copy this folder (or unzip the ZIP) onto the LinkNest server.
2. Open an elevated PowerShell (recommended for VcXsrv -> Program Files):
     cd <this-folder>
     .\install-remote-widgets-runtime.bat
   Or:
     powershell -ExecutionPolicy Bypass -File .\install-remote-widgets-runtime.ps1 -InstallDir C:\xampp\htdocs\linknest
3. Refresh Admin -> Add-ons -> SSH Gateway / VNC Gateway - statuses should show Ready/found.
4. For SSH GUI mode: start VcXsrv (XLaunch -> Multiple windows -> Start no client -> Disable access control).

Optional flags
--------------
  -InstallDir PATH     LinkNest root (default C:\xampp\htdocs\linknest)
  -SkipVcXsrv          Do not install VcXsrv into Program Files
  -XamppRoot PATH      Used when writing gateway paths into SQLite (default C:\xampp)

Notes
-----
- SSH Easy uses bundled bin\ttyd.exe + bin\OpenSSH\ssh.exe. Set Admin -> SSH Gateway paths if needed.
- VNC Easy uses bundled bin\python + bin\python-packages (websockify). Set Admin -> VNC Gateway python path if needed.
- Prefer LAN/VPN; do not expose unauthenticated ttyd/websockify to the public internet.
"@
Set-Content -Path (Join-Path $Staging "README.txt") -Value $readme -Encoding ASCII
Write-OK "README.txt"

$manifest = [ordered]@{
    package = $PackageName
    builtAt = (Get-Date).ToString("o")
    pythonVersion = $(if ($PythonBundled) { $PythonVersion } else { $null })
    pythonBundled = [bool]$PythonBundled
    components = [ordered]@{
        ttyd = (Test-Path (Join-Path $stageBin "ttyd.exe"))
        ttydLinux = (Test-Path (Join-Path $stageBin "ttyd.x86_64"))
        openssh = (Test-Path (Join-Path $sshStage "ssh.exe"))
        python = [bool]$PythonBundled
        websockify = (Test-Path (Join-Path $pkgStage "websockify"))
        vcxsrv = (Test-Path (Join-Path $vcStage "vcxsrv.exe"))
    }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Staging "MANIFEST.json") -Encoding UTF8

# ---------------------------------------------------------------------------
# 7. ZIP
# ---------------------------------------------------------------------------
Write-Header "7 / Compress"
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $Staging "*") -DestinationPath $ZipPath -CompressionLevel Optimal
$sizeMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-OK ("ZIP created: {0} ({1} MB)" -f $ZipPath, $sizeMB)

Write-Header "Done"
Write-Host "  Transfer $ZipPath to the remote host, unzip, then run install-remote-widgets-runtime.bat" -ForegroundColor Green
Write-Host "  Staging left at: $Staging (safe to delete after copy)" -ForegroundColor Gray

# Also keep a stable folder next to the ZIP for USB copy without unzip
$stableDir = Join-Path $OutputDir $PackageName
if (Test-Path $stableDir) { Remove-Item $stableDir -Recurse -Force }
Copy-Item $Staging $stableDir -Recurse -Force
Write-OK ("Folder copy: {0}" -f $stableDir)

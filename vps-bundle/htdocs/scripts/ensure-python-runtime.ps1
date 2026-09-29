#Requires -Version 5.1
<#
.SYNOPSIS
    Ensure LinkNest bin/python contains embeddable CPython for VNC Easy.

.DESCRIPTION
    Downloads the official Windows embeddable CPython zip when missing and
    points python*._pth at bin/python-packages so vendored websockify imports.

    Also used by Monitoring scheduler workers (monitor_runner / email_sender)
    so Task Scheduler can run without a system-wide Python install.

.PARAMETER ProjectRoot
    LinkNest root (parent of bin/). Default: parent of scripts/

.PARAMETER Version
    Embeddable CPython version (default 3.12.4)

.PARAMETER FailIfMissing
    Throw if python.exe is still missing after download attempts

.EXAMPLE
    .\ensure-python-runtime.ps1
    .\ensure-python-runtime.ps1 -FailIfMissing
#>
param(
    [string]$ProjectRoot = "",
    [string]$Version = "3.12.4",
    [switch]$FailIfMissing
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-OK([string]$m) { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "  [!!]  $m" -ForegroundColor Yellow }
function Write-Step([string]$m) { Write-Host "   ->   $m" -ForegroundColor White }

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$binDir = Join-Path $ProjectRoot "bin"
$pyDir = Join-Path $binDir "python"
$pyExe = Join-Path $pyDir "python.exe"
New-Item -ItemType Directory -Force -Path $pyDir | Out-Null

function Set-PythonPth {
    param([string]$Dir, [string]$PyVersion)
    $pth = Get-ChildItem $Dir -Filter "python*._pth" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $pth) {
        Write-Warn "No python*._pth found under bin/python"
        return
    }
    $parts = $PyVersion.Split('.')
    $zipFallback = "python$($parts[0] + $parts[1]).zip"
    $zipName = Get-ChildItem $Dir -Filter "python*.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
    $lines = @(
        $(if ($zipName) { $zipName.Name } else { $zipFallback }),
        ".",
        "..\python-packages",
        "..\..\scripts",
        "import site"
    )
    Set-Content -Path $pth.FullName -Value ($lines -join "`r`n") -Encoding ASCII
    Write-OK ("Updated {0} for vendored python-packages" -f $pth.Name)
}

if ((Test-Path $pyExe) -and ((Get-Item $pyExe).Length -ge 50000)) {
    Set-PythonPth -Dir $pyDir -PyVersion $Version
    Write-OK ("bin/python/python.exe already present ({0:N0} bytes)" -f (Get-Item $pyExe).Length)
    Set-Content -Path (Join-Path $pyDir "PYTHON_VERSION.txt") -Value $Version -Encoding ASCII
    return
}

Write-Step ("Downloading embeddable CPython {0}" -f $Version)
$pyUrl = "https://www.python.org/ftp/python/$Version/python-$Version-embed-amd64.zip"
$tmp = Join-Path $env:TEMP ("linknest-python-embed-" + [guid]::NewGuid().ToString("N") + ".zip")
$ok = $false
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & curl.exe -L --ssl-no-revoke --fail --retry 3 --retry-delay 2 -o $tmp $pyUrl
        if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" }
    }
    else {
        Invoke-WebRequest -Uri $pyUrl -OutFile $tmp -UseBasicParsing
    }
    $len = (Get-Item $tmp).Length
    if ($len -lt 5000000) {
        throw ("Downloaded file too small ({0} bytes)" -f $len)
    }
    Expand-Archive -Path $tmp -DestinationPath $pyDir -Force
    $ok = Test-Path $pyExe
    if ($ok) {
        Set-PythonPth -Dir $pyDir -PyVersion $Version
        Set-Content -Path (Join-Path $pyDir "PYTHON_VERSION.txt") -Value $Version -Encoding ASCII
        Write-OK ("Embeddable CPython {0} extracted ({1:N0} bytes zip)" -f $Version, $len)
    }
}
catch {
    Write-Warn ("Python embeddable download failed: {0}" -f $_.Exception.Message)
}
finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

if (-not $ok) {
    $msg = "bin/python/python.exe missing. Connect to the internet and re-run, or place embeddable CPython under bin/python."
    if ($FailIfMissing) { throw $msg }
    Write-Warn $msg
}

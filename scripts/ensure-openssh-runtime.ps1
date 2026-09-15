#Requires -Version 5.1
<#
.SYNOPSIS
    Ensure LinkNest bin/OpenSSH contains a portable OpenSSH client for SSH Easy.

.DESCRIPTION
    Downloads official Win32-OpenSSH (OpenSSH-Win64.zip) when missing and extracts
    ssh.exe under bin/OpenSSH. Falls back to copying the Windows Optional Feature
    client from System32 when the download is unavailable.

.PARAMETER ProjectRoot
    LinkNest root (parent of bin/). Default: parent of scripts/

.PARAMETER Version
    Win32-OpenSSH GitHub release tag (default v9.8.3.0p2-Preview)

.PARAMETER FailIfMissing
    Throw if ssh.exe is still missing after download / copy attempts

.EXAMPLE
    .\ensure-openssh-runtime.ps1
    .\ensure-openssh-runtime.ps1 -FailIfMissing
#>
param(
    [string]$ProjectRoot = "",
    [string]$Version = "v9.8.3.0p2-Preview",
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
$sshDir = Join-Path $binDir "OpenSSH"
$sshExe = Join-Path $sshDir "ssh.exe"
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null

function Write-OpenSshVersionNote {
    param([string]$Source)
    $note = @(
        "LinkNest OpenSSH runtime"
        "Version: $Version"
        "Windows: bin/OpenSSH/ssh.exe"
        "Source:  $Source"
        "Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    ) -join [Environment]::NewLine
    Set-Content -Path (Join-Path $sshDir "OPENSSH_VERSION.txt") -Value $note -Encoding ASCII
}

if ((Test-Path $sshExe) -and ((Get-Item $sshExe).Length -ge 200000)) {
    Write-OK ("bin/OpenSSH/ssh.exe already present ({0:N0} bytes)" -f (Get-Item $sshExe).Length)
    if (-not (Test-Path (Join-Path $sshDir "OPENSSH_VERSION.txt"))) {
        Write-OpenSshVersionNote -Source "existing bin/OpenSSH"
    }
    return
}

$ok = $false
$sshUrl = "https://github.com/PowerShell/Win32-OpenSSH/releases/download/$Version/OpenSSH-Win64.zip"
Write-Step ("Downloading portable OpenSSH {0}" -f $Version)
$tmpZip = Join-Path $env:TEMP ("linknest-openssh-" + [guid]::NewGuid().ToString("N") + ".zip")
$tmpExtract = Join-Path $env:TEMP ("linknest-openssh-extract-" + [guid]::NewGuid().ToString("N"))
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & curl.exe -L --ssl-no-revoke --fail --retry 3 --retry-delay 2 -o $tmpZip $sshUrl
        if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" }
    }
    else {
        Invoke-WebRequest -Uri $pyUrl -OutFile $tmpZip -UseBasicParsing
    }
    $len = (Get-Item $tmpZip).Length
    if ($len -lt 1000000) {
        throw ("Downloaded file too small ({0} bytes)" -f $len)
    }
    New-Item -ItemType Directory -Force -Path $tmpExtract | Out-Null
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
    $inner = Get-ChildItem $tmpExtract -Directory | Select-Object -First 1
    $from = if ($inner) { $inner.FullName } else { $tmpExtract }
    Copy-Item (Join-Path $from "*") $sshDir -Recurse -Force
    $ok = Test-Path $sshExe
    if ($ok) {
        Write-OpenSshVersionNote -Source "https://github.com/PowerShell/Win32-OpenSSH/releases/tag/$Version"
        Write-OK ("Portable OpenSSH extracted ({0:N0} bytes zip)" -f $len)
    }
}
catch {
    Write-Warn ("OpenSSH download failed: {0}" -f $_.Exception.Message)
}
finally {
    if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue }
}

if (-not $ok) {
    $sysSsh = "C:\Windows\System32\OpenSSH\ssh.exe"
    if (Test-Path $sysSsh) {
        Write-Step "Copying system OpenSSH from C:\Windows\System32\OpenSSH"
        Copy-Item "C:\Windows\System32\OpenSSH\*" $sshDir -Force
        $ok = Test-Path $sshExe
        if ($ok) {
            Write-OpenSshVersionNote -Source "C:\Windows\System32\OpenSSH (fallback)"
            Write-OK ("Copied system OpenSSH ({0} files)" -f @(Get-ChildItem $sshDir -File).Count)
        }
    }
}

if (-not $ok) {
    $msg = "bin/OpenSSH/ssh.exe missing. Connect to the internet and re-run, or install Windows OpenSSH Client and re-run."
    if ($FailIfMissing) { throw $msg }
    Write-Warn $msg
}

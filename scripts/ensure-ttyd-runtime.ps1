#Requires -Version 5.1
<#
.SYNOPSIS
    Ensure LinkNest bin/ contains ttyd Windows + Linux binaries for SSH Easy.

.DESCRIPTION
    Downloads official GitHub release assets when missing:
      - ttyd.win32.exe  -> bin/ttyd.exe
      - ttyd.x86_64     -> bin/ttyd.x86_64

.PARAMETER ProjectRoot
    LinkNest root (parent of bin/). Default: parent of scripts/

.PARAMETER Version
    ttyd release tag (default 1.7.7)

.PARAMETER FailIfMissing
    Throw if binaries still missing after download attempts

.EXAMPLE
    .\ensure-ttyd-runtime.ps1
    .\ensure-ttyd-runtime.ps1 -FailIfMissing
#>
param(
    [string]$ProjectRoot = "",
    [string]$Version = "1.7.7",
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
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$winDst = Join-Path $binDir "ttyd.exe"
$linuxDst = Join-Path $binDir "ttyd.x86_64"
$baseUrl = "https://github.com/tsl0922/ttyd/releases/download/$Version"

function Get-TtydAsset([string]$Url, [string]$Dest, [string]$Label, [int]$MinBytes = 100000) {
    if ((Test-Path $Dest) -and ((Get-Item $Dest).Length -ge $MinBytes)) {
        Write-OK ("{0} already present ({1:N0} bytes)" -f $Label, (Get-Item $Dest).Length)
        return $true
    }
    Write-Step ("Downloading {0} from {1}" -f $Label, $Url)
    $tmp = Join-Path $env:TEMP ("linknest-ttyd-" + [guid]::NewGuid().ToString("N"))
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
        if ($len -lt $MinBytes) {
            throw ("Downloaded file too small ({0} bytes)" -f $len)
        }
        Copy-Item $tmp $Dest -Force
        Write-OK ("{0} saved ({1:N0} bytes)" -f $Label, $len)
        return $true
    }
    catch {
        Write-Warn ("{0} download failed: {1}" -f $Label, $_.Exception.Message)
        return $false
    }
    finally {
        if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    }
}

# Prefer local winget install as a source for Windows binary when present
if (-not (Test-Path $winDst) -or ((Get-Item $winDst).Length -lt 100000)) {
    $winget = Get-Command ttyd.exe -ErrorAction SilentlyContinue
    if ($winget -and $winget.Source -and (Test-Path $winget.Source)) {
        Copy-Item $winget.Source $winDst -Force
        Write-OK ("Copied ttyd.exe from WinGet: {0}" -f $winget.Source)
    }
}

$winOk = Get-TtydAsset -Url "$baseUrl/ttyd.win32.exe" -Dest $winDst -Label "bin/ttyd.exe (Windows)"
$linuxOk = Get-TtydAsset -Url "$baseUrl/ttyd.x86_64" -Dest $linuxDst -Label "bin/ttyd.x86_64 (Linux/Docker)"

# Stamp version note
$note = @(
    "LinkNest ttyd runtime"
    "Version: $Version"
    "Windows: bin/ttyd.exe (from ttyd.win32.exe)"
    "Linux:   bin/ttyd.x86_64"
    "Source:  https://github.com/tsl0922/ttyd/releases/tag/$Version"
    "Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
) -join [Environment]::NewLine
Set-Content -Path (Join-Path $binDir "TTYD_VERSION.txt") -Value $note -Encoding ASCII

if ($FailIfMissing -and -not $winOk) {
    throw "bin/ttyd.exe is required for Windows SSH Easy. Download failed; place ttyd.win32.exe as bin/ttyd.exe manually."
}

if (-not $winOk) {
    Write-Warn "Windows ttyd missing - SSH Easy on XAMPP will not work until bin/ttyd.exe is present"
}
if (-not $linuxOk) {
    Write-Warn "Linux ttyd missing - Docker SSH Easy needs bin/ttyd.x86_64"
}

exit 0

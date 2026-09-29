#Requires -Version 5.1
<#
.SYNOPSIS
    Diagnose SSH/VNC WSS proxy on an office XAMPP / Apache host.

.EXAMPLE
    .\diagnose-gateway-wss.ps1 -InstallDir D:\Apache\htdocs\ArchLinks
    .\diagnose-gateway-wss.ps1 -XamppRoot D:\Apache -InstallDir D:\Apache\htdocs\ArchLinks -Port 17681
#>
param(
    [string]$XamppRoot = "",
    [string]$InstallDir = "",
    [int]$Port = 17681
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-OK([string]$m) { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Bad([string]$m) { Write-Host "  [XX]  $m" -ForegroundColor Red }
function Write-Info([string]$m) { Write-Host "   ->   $m" -ForegroundColor Cyan }

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    # scripts/ is under InstallDir when run from the app
    $here = Split-Path -Parent $MyInvocation.MyCommand.Path
    $parent = Split-Path -Parent $here
    if (Test-Path (Join-Path $parent "api")) {
        $InstallDir = $parent
    }
    else {
        $InstallDir = "C:\xampp\htdocs\linknest"
    }
}

$InstallDir = [IO.Path]::GetFullPath($InstallDir)

# Infer Apache/XAMPP root from ...\htdocs\<app>
if ([string]::IsNullOrWhiteSpace($XamppRoot)) {
    $htdocs = Split-Path -Parent $InstallDir
    if ((Split-Path -Leaf $htdocs) -ieq "htdocs") {
        $XamppRoot = Split-Path -Parent $htdocs
    }
    else {
        $XamppRoot = "C:\xampp"
    }
}
$XamppRoot = [IO.Path]::GetFullPath($XamppRoot)

function Find-HttpdConf([string]$root) {
    $candidates = @(
        (Join-Path $root "apache\conf\httpd.conf"),
        (Join-Path $root "conf\httpd.conf"),
        (Join-Path $root "Apache24\conf\httpd.conf")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

Write-Host ""
Write-Host "==== LinkNest gateway WSS diagnose ====" -ForegroundColor Cyan
Write-Host "  XamppRoot  : $XamppRoot"
Write-Host "  InstallDir : $InstallDir"
Write-Host "  Port       : $Port"

# Modules
$httpd = Find-HttpdConf $XamppRoot
if ($httpd) {
    Write-OK "httpd.conf: $httpd"
    $txt = Get-Content -Raw $httpd
    foreach ($m in @("rewrite_module", "proxy_module", "proxy_http_module", "proxy_wstunnel_module")) {
        if ($txt -match ("(?m)^\s*LoadModule\s+" + [regex]::Escape($m) + "\b")) {
            Write-OK "LoadModule $m"
        }
        else {
            Write-Bad "Missing LoadModule $m - run scripts\enable-gateway-wss-proxy.ps1 -XamppRoot `"$XamppRoot`""
        }
    }
    if ($txt -match "linknest-gateway-proxy\.conf") {
        Write-OK "Includes linknest-gateway-proxy.conf"
    }
    else {
        Write-Bad "Missing Include for linknest-gateway-proxy.conf"
    }
}
else {
    Write-Bad "httpd.conf not found under $XamppRoot (tried apache\conf and conf)"
}

$extraCandidates = @(
    (Join-Path $XamppRoot "apache\conf\extra\linknest-gateway-proxy.conf"),
    (Join-Path $XamppRoot "conf\extra\linknest-gateway-proxy.conf")
)
$extra = $extraCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($extra) {
    Write-OK "Found $extra"
}
else {
    Write-Bad "Missing linknest-gateway-proxy.conf - copy from app apache\ folder"
}

$ht = Join-Path $InstallDir ".htaccess"
if ((Test-Path $ht) -and (Select-String -Path $ht -Pattern "_ln_sshgw" -Quiet)) {
    Write-OK ".htaccess has _ln_sshgw proxy rules"
}
else {
    Write-Bad ".htaccess missing _ln_sshgw rules - deploy updated .htaccess"
}

# ttyd listen
$listening = $false
try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in @("127.0.0.1", "::1", "0.0.0.0") }
    if ($c) {
        $listening = $true
        $addrs = @($c | Select-Object -ExpandProperty LocalAddress -Unique) -join ","
        Write-OK ("Port {0} LISTEN on {1}" -f $Port, $addrs)
    }
}
catch {
    # Get-NetTCPConnection may be unavailable
}
if (-not $listening) {
    $ns = @(netstat -ano -p tcp 2>$null | Select-String (":$Port\s+"))
    if ($ns.Count -gt 0) {
        Write-OK "netstat shows :$Port"
        $ns | ForEach-Object { Write-Info $_.ToString().Trim() }
        $listening = $true
    }
    else {
        Write-Bad "Nothing listening on port $Port - open SSH Easy Connect once, then re-run diagnose"
    }
}

# Local HTTP probe (should NOT be SPA HTML)
$folder = Split-Path -Leaf $InstallDir.TrimEnd('\', '/')
$paths = @(
    "/_ln_sshgw/$Port/ws",
    "/$folder/_ln_sshgw/$Port/ws"
)
foreach ($p in $paths) {
    $url = "http://127.0.0.1$p"
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -Headers @{ Host = "localhost" } -ErrorAction Stop
        $spa = $r.Content -match '<!DOCTYPE html|<div id="root"'
        if ($spa) {
            Write-Bad "$url returned SPA HTML (proxy NOT active)"
        }
        else {
            Write-OK ("{0} -> HTTP {1} (not SPA)" -f $url, [int]$r.StatusCode)
        }
    }
    catch {
        $msg = $_.Exception.Message
        if ($msg -match "502|503|connection|refused|Unable to connect") {
            Write-Info ("{0} -> {1}" -f $url, $msg)
        }
        else {
            Write-Bad ("{0} -> {1}" -f $url, $msg)
        }
    }
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Yellow
Write-Host "  1. powershell -File .\enable-gateway-wss-proxy.ps1 -XamppRoot `"$XamppRoot`" -InstallDir `"$InstallDir`" -RestartApache"
Write-Host "  2. Deploy updated .htaccess + api\ssh_gateway.php"
Write-Host "  3. As admin in browser: GET .../api/ssh-gateway/proxy-check"
Write-Host "  4. If local probe OK but browser fails: LB must allow WebSocket on /<folder>/_ln_sshgw/"
Write-Host ""

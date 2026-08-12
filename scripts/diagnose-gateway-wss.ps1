#Requires -Version 5.1
<#
.SYNOPSIS
    Diagnose SSH/VNC WSS proxy on an office XAMPP host.

.EXAMPLE
    .\scripts\diagnose-gateway-wss.ps1 -InstallDir C:\xampp\htdocs\ArchLinks
#>
param(
    [string]$XamppRoot = "C:\xampp",
    [string]$InstallDir = "",
    [int]$Port = 17681
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Join-Path $XamppRoot "htdocs\linknest"
}

function Write-OK([string]$m) { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Bad([string]$m) { Write-Host "  [XX]  $m" -ForegroundColor Red }
function Write-Info([string]$m) { Write-Host "   ->   $m" -ForegroundColor Cyan }

Write-Host ""
Write-Host "==== LinkNest gateway WSS diagnose ====" -ForegroundColor Cyan
Write-Host "  InstallDir : $InstallDir"
Write-Host "  Port       : $Port"

# Modules
$httpd = Join-Path $XamppRoot "apache\conf\httpd.conf"
if (Test-Path $httpd) {
    $txt = Get-Content -Raw $httpd
    foreach ($m in @("rewrite_module", "proxy_module", "proxy_http_module", "proxy_wstunnel_module")) {
        if ($txt -match ("(?m)^\s*LoadModule\s+" + [regex]::Escape($m) + "\b")) {
            Write-OK "httpd.conf LoadModule $m"
        }
        else {
            Write-Bad "Missing LoadModule $m — run scripts\enable-gateway-wss-proxy.ps1"
        }
    }
    if ($txt -match "linknest-gateway-proxy\.conf") {
        Write-OK "httpd.conf Includes linknest-gateway-proxy.conf"
    }
    else {
        Write-Bad "httpd.conf missing Include for linknest-gateway-proxy.conf"
    }
}

$extra = Join-Path $XamppRoot "apache\conf\extra\linknest-gateway-proxy.conf"
if (Test-Path $extra) { Write-OK "Found $extra" } else { Write-Bad "Missing $extra — copy apache\linknest-gateway-proxy.conf" }

$ht = Join-Path $InstallDir ".htaccess"
if ((Test-Path $ht) -and (Select-String -Path $ht -Pattern "_ln_sshgw" -Quiet)) {
    Write-OK ".htaccess has _ln_sshgw proxy rules"
}
else {
    Write-Bad ".htaccess missing _ln_sshgw rules — deploy updated .htaccess"
}

# ttyd listen
$listening = $false
try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in @("127.0.0.1", "::1", "0.0.0.0") }
    if ($c) {
        $listening = $true
        Write-OK ("Port {0} LISTEN on {1}" -f $Port, (($c | Select-Object -ExpandProperty LocalAddress) -join ","))
    }
}
catch { }
if (-not $listening) {
    $ns = netstat -ano -p tcp | Select-String (":$Port\s+")
    if ($ns) {
        Write-OK "netstat shows :$Port"
        $ns | ForEach-Object { Write-Info $_.ToString().Trim() }
        $listening = $true
    }
    else {
        Write-Bad "Nothing listening on port $Port — open SSH Easy Connect once, then re-run diagnose"
    }
}

# Local HTTP probe (should NOT be SPA HTML)
$folder = Split-Path -Leaf $InstallDir.TrimEnd('\')
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
        # Connection refused / 502 can still mean proxy tried ttyd
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
Write-Host "  1. powershell -File scripts\enable-gateway-wss-proxy.ps1 -InstallDir `"$InstallDir`" -RestartApache"
Write-Host "  2. Deploy updated .htaccess + api/ssh_gateway.php"
Write-Host "  3. As admin in browser: GET .../api/ssh-gateway/proxy-check"
Write-Host "  4. If local probe OK but browser fails: open firewall/LB for WebSocket on /<folder>/_ln_sshgw/"
Write-Host ""

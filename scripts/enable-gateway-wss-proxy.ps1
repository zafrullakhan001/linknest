#Requires -Version 5.1
<#
.SYNOPSIS
    Enable Apache same-origin WSS proxy for SSH/VNC gateways (fixes Mixed Content on HTTPS).

.DESCRIPTION
    Browsers block ws://host:17681 from https:// pages. This installs
    apache/linknest-gateway-proxy.conf into XAMPP so WebSockets use:
      wss://your-host/_ln_sshgw/<port>/ws
      wss://your-host/_ln_vncgw/<port>/websockify
    on port 443 (no firewall hole for 17681+).

.PARAMETER XamppRoot
    XAMPP root (default C:\xampp)

.PARAMETER InstallDir
    LinkNest install (default %XamppRoot%\htdocs\linknest)

.PARAMETER RestartApache
    Restart Apache2.4 after changes

.EXAMPLE
    .\scripts\enable-gateway-wss-proxy.ps1 -RestartApache
#>
param(
    [string]$XamppRoot = "C:\xampp",
    [string]$InstallDir = "",
    [switch]$RestartApache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-OK([string]$m) { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "  [!!]  $m" -ForegroundColor Yellow }
function Write-Step([string]$m) { Write-Host "   ->   $m" -ForegroundColor White }
function Write-Err([string]$m) { Write-Host "  [XX]  $m" -ForegroundColor Red }

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Join-Path $XamppRoot "htdocs\linknest"
}

$httpd = Join-Path $XamppRoot "apache\conf\httpd.conf"
$sslConf = Join-Path $XamppRoot "apache\conf\extra\httpd-ssl.conf"
$extraDir = Join-Path $XamppRoot "apache\conf\extra"
$destConf = Join-Path $extraDir "linknest-gateway-proxy.conf"

$srcCandidates = @(
    (Join-Path $InstallDir "apache\linknest-gateway-proxy.conf"),
    (Join-Path (Split-Path -Parent $PSScriptRoot) "apache\linknest-gateway-proxy.conf"),
    (Join-Path $PSScriptRoot "..\apache\linknest-gateway-proxy.conf")
)
$srcConf = $srcCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $srcConf) {
    throw "apache/linknest-gateway-proxy.conf not found near InstallDir=$InstallDir"
}

Write-Host ""
Write-Host "==== Enable LinkNest gateway WSS proxy (HTTPS Mixed Content fix) ====" -ForegroundColor Cyan
Write-Host "  XAMPP  : $XamppRoot" -ForegroundColor Gray
Write-Host "  Source : $srcConf" -ForegroundColor Gray

if (-not (Test-Path $httpd)) { throw "httpd.conf not found: $httpd" }
New-Item -ItemType Directory -Force -Path $extraDir | Out-Null
Copy-Item $srcConf $destConf -Force
Write-OK "Installed $destConf"

# Enable required modules in httpd.conf
$httpdText = Get-Content -Raw $httpd
$modules = @(
    @{ Name = "rewrite_module"; Line = "LoadModule rewrite_module modules/mod_rewrite.so" },
    @{ Name = "proxy_module"; Line = "LoadModule proxy_module modules/mod_proxy.so" },
    @{ Name = "proxy_http_module"; Line = "LoadModule proxy_http_module modules/mod_proxy_http.so" },
    @{ Name = "proxy_wstunnel_module"; Line = "LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so" }
)
$changed = $false
foreach ($m in $modules) {
    if ($httpdText -match ("(?m)^\s*LoadModule\s+" + [regex]::Escape($m.Name) + "\b")) {
        Write-OK ("Module already enabled: {0}" -f $m.Name)
        continue
    }
    # Uncomment if present as comment
    $commentPat = "(?m)^\s*#\s*LoadModule\s+" + [regex]::Escape($m.Name) + "\s+modules/\S+"
    if ($httpdText -match $commentPat) {
        $httpdText = [regex]::Replace($httpdText, $commentPat, $m.Line, 1)
        Write-OK ("Uncommented {0}" -f $m.Name)
        $changed = $true
        continue
    }
    # Append near other LoadModule lines
    if ($httpdText -match "(?m)^LoadModule\s+\S+\s+modules/\S+") {
        $httpdText = [regex]::Replace($httpdText, "(?m)^(LoadModule\s+\S+\s+modules/\S+\s*)$", "`$1`r`n" + $m.Line, 1)
    }
    else {
        $httpdText += "`r`n" + $m.Line + "`r`n"
    }
    Write-OK ("Added LoadModule {0}" -f $m.Name)
    $changed = $true
}

$includeLine = "Include conf/extra/linknest-gateway-proxy.conf"
$includeMarker = "linknest-gateway-proxy.conf"
if ($httpdText -notmatch [regex]::Escape($includeMarker)) {
    $httpdText = $httpdText.TrimEnd() + "`r`n`r`n# LinkNest SSH/VNC same-origin WSS proxy (HTTPS Mixed Content fix)`r`n" + $includeLine + "`r`n"
    Write-OK "Added Include to httpd.conf"
    $changed = $true
}
else {
    Write-OK "Include already present in httpd.conf"
}

# Also ensure SSL vhost can see it (some setups only enable rewrite in SSL). Prefer dual include.
if (Test-Path $sslConf) {
    $sslText = Get-Content -Raw $sslConf
    if ($sslText -notmatch [regex]::Escape($includeMarker)) {
        # Insert before closing </VirtualHost> if present
        if ($sslText -match "</VirtualHost>") {
            $sslText = [regex]::Replace(
                $sslText,
                "</VirtualHost>",
                "    # LinkNest SSH/VNC WSS proxy`r`n    Include conf/extra/linknest-gateway-proxy.conf`r`n</VirtualHost>",
                1
            )
            Set-Content -Path $sslConf -Value $sslText -Encoding ASCII -NoNewline
            # Preserve final newline
            Add-Content -Path $sslConf -Value ""
            Write-OK "Added Include inside httpd-ssl.conf VirtualHost"
        }
        else {
            Write-Warn "httpd-ssl.conf has no </VirtualHost>; relying on httpd.conf Include"
        }
    }
    else {
        Write-OK "Include already present in httpd-ssl.conf"
    }
}
else {
    Write-Warn "httpd-ssl.conf not found - ensure your HTTPS vhost Includes linknest-gateway-proxy.conf"
}

if ($changed) {
    $bak = $httpd + ".bak-gateway-wss-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item $httpd $bak -Force
    Write-OK "Backup: $bak"
    Set-Content -Path $httpd -Value $httpdText -Encoding ASCII -NoNewline
    Add-Content -Path $httpd -Value ""
}

# Persist setting so API prefers proxy URLs even behind odd proxies
$db = Join-Path $InstallDir "data\linknest.db"
$phpExe = Join-Path $XamppRoot "php\php.exe"
if ((Test-Path $phpExe) -and (Test-Path (Split-Path $db -Parent))) {
    Write-Step "Setting gateway_http_proxy=on in SQLite..."
    $tmp = Join-Path $env:TEMP ("ln-gw-proxy-" + [guid]::NewGuid().ToString("N") + ".php")
    $dbPhp = ($db -replace '\\', '/')
    $code = @"
<?php
`$db = str_replace('/', DIRECTORY_SEPARATOR, '$dbPhp');
try {
  `$pdo = new PDO('sqlite:' . `$db);
  `$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  `$pdo->exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
  `$u = `$pdo->prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
  `$u->execute(['gateway_http_proxy', 'on', time()]);
  echo 'ok';
} catch (Throwable `$e) { fwrite(STDERR, `$e->getMessage()); exit(1); }
"@
    try {
        [IO.File]::WriteAllText($tmp, $code, (New-Object System.Text.UTF8Encoding $false))
        & $phpExe $tmp | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-OK "gateway_http_proxy=on" }
        else { Write-Warn "Could not write setting (API will still auto-proxy on HTTPS)" }
    }
    finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

# Config test
$httpdExe = Join-Path $XamppRoot "apache\bin\httpd.exe"
if (Test-Path $httpdExe) {
    Write-Step "httpd -t ..."
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $test = & $httpdExe -t 2>&1
    $ErrorActionPreference = $prev
    $testStr = ($test | Out-String)
    if ($testStr -match "Syntax OK") { Write-OK "httpd -t Syntax OK" }
    else {
        Write-Warn $testStr.Trim()
        Write-Warn "Fix Apache config before restarting"
    }
}

if ($RestartApache) {
    Write-Step "Restarting Apache2.4..."
    try {
        Restart-Service Apache2.4 -ErrorAction Stop
        Write-OK "Apache2.4 restarted"
    }
    catch {
        Write-Warn ("Service restart failed: {0}" -f $_.Exception.Message)
        Write-Warn "Restart Apache from XAMPP Control Panel"
    }
}

Write-Host ""
Write-Host "Done. SSH Easy / VNC Easy over HTTPS should now use:" -ForegroundColor Green
Write-Host "  wss://<host>/_ln_sshgw/<port>/ws" -ForegroundColor Green
Write-Host "  wss://<host>/_ln_vncgw/<port>/websockify" -ForegroundColor Green
Write-Host "Hard-refresh the browser, then Connect again." -ForegroundColor Green

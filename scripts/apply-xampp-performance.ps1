# Apply LinkNest XAMPP performance settings (OPcache + Apache mpm_winnt workers)
#
# Usage (PowerShell as Administrator recommended for Apache restart):
#   .\scripts\apply-xampp-performance.ps1
#   .\scripts\apply-xampp-performance.ps1 -RestartApache
#
# Idempotent: updates known keys in php.ini and the mpm_winnt block in httpd-mpm.conf.

param(
    [string]$XamppRoot = 'C:\xampp',
    [switch]$RestartApache,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$phpIni = Join-Path $XamppRoot 'php\php.ini'
$mpmConf = Join-Path $XamppRoot 'apache\conf\extra\httpd-mpm.conf'
$opcacheDll = Join-Path $XamppRoot 'php\ext\php_opcache.dll'

if (-not (Test-Path $phpIni)) { throw "php.ini not found: $phpIni" }
if (-not (Test-Path $mpmConf)) { throw "httpd-mpm.conf not found: $mpmConf" }
if (-not (Test-Path $opcacheDll)) { throw "php_opcache.dll not found: $opcacheDll" }

function Set-IniValue([string]$content, [string]$key, [string]$value) {
    $pattern = "(?m)^\s*;?\s*$([regex]::Escape($key))\s*=\s*.*$"
    $replacement = "$key=$value"
    if ($content -match $pattern) {
        return [regex]::Replace($content, $pattern, $replacement, 1)
    }
    if ($content -match '(?m)^\[opcache\]\s*$') {
        return [regex]::Replace($content, '(?m)^(\[opcache\]\s*)$', "`$1`r`n$replacement", 1)
    }
    return $content + "`r`n$replacement`r`n"
}

Write-Host "Updating OPcache settings in $phpIni"
$php = Get-Content -Raw -Path $phpIni

if ($php -match '(?m)^\s*;?\s*zend_extension\s*=\s*.*opcache.*$') {
    $php = [regex]::Replace($php, '(?m)^\s*;?\s*zend_extension\s*=\s*.*opcache.*$', 'zend_extension=opcache', 1)
} else {
    $php = $php + "`r`nzend_extension=opcache`r`n"
}

$opcacheSettings = @{
    'opcache.enable' = '1'
    'opcache.enable_cli' = '0'
    'opcache.memory_consumption' = '256'
    'opcache.interned_strings_buffer' = '16'
    'opcache.max_accelerated_files' = '20000'
    'opcache.validate_timestamps' = '1'
    'opcache.revalidate_freq' = '2'
    'opcache.enable_file_override' = '1'
}

foreach ($k in $opcacheSettings.Keys) {
    $php = Set-IniValue $php $k $opcacheSettings[$k]
}

$phpBackup = "$phpIni.linknest.bak"
if (-not $WhatIf) {
    if (-not (Test-Path $phpBackup)) {
        Copy-Item $phpIni $phpBackup
        Write-Host "Backed up php.ini to $phpBackup"
    }
    Set-Content -Path $phpIni -Value $php -NoNewline
    Write-Host "Wrote php.ini OPcache tuning (revalidate_freq=2, memory=256M)"
} else {
    Write-Host "[WhatIf] Would update php.ini"
}

Write-Host "Updating mpm_winnt in $mpmConf"
$mpm = Get-Content -Raw -Path $mpmConf
$winntBlock = @"
<IfModule mpm_winnt_module>
    ThreadsPerChild        256
    MaxConnectionsPerChild 10000
</IfModule>
"@

if ($mpm -match '(?s)<IfModule\s+mpm_winnt_module>.*?</IfModule>') {
    $mpm = [regex]::Replace($mpm, '(?s)<IfModule\s+mpm_winnt_module>.*?</IfModule>', $winntBlock.Trim(), 1)
} else {
    $mpm = $mpm.TrimEnd() + "`r`n`r`n" + $winntBlock + "`r`n"
}

$mpmBackup = "$mpmConf.linknest.bak"
if (-not $WhatIf) {
    if (-not (Test-Path $mpmBackup)) {
        Copy-Item $mpmConf $mpmBackup
        Write-Host "Backed up httpd-mpm.conf to $mpmBackup"
    }
    Set-Content -Path $mpmConf -Value $mpm -NoNewline
    Write-Host "Wrote mpm_winnt ThreadsPerChild=256"
} else {
    Write-Host "[WhatIf] Would update httpd-mpm.conf"
}

if ($RestartApache -and -not $WhatIf) {
    $httpd = Join-Path $XamppRoot 'apache\bin\httpd.exe'
    if (-not (Test-Path $httpd)) { throw "httpd.exe not found: $httpd" }
    Write-Host "Restarting Apache..."
    & $httpd -k restart
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "httpd -k restart returned $LASTEXITCODE - try XAMPP Control Panel restart"
    } else {
        Write-Host "Apache restarted"
    }
} elseif (-not $RestartApache) {
    Write-Host ""
    Write-Host "Restart Apache (XAMPP Control Panel) for worker/OPcache changes to take effect."
    Write-Host "Verify OPcache: http://localhost/linknest/check_opcache.php"
}

Write-Host "Done."

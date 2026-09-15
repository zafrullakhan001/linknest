# Upgrade PHP inside an existing Windows XAMPP install (Thread-Safe Apache module).
#
# Discovers builds from the official Windows releases index (works for 8.5 today
# and future minors such as 8.6 when published):
#   https://downloads.php.net/~windows/releases/releases.json
#
# IMPORTANT: If Apache runs as the Windows service "Apache2.4", run this script
# in an elevated PowerShell (Run as administrator), or use:
#   .\scripts\upgrade-xampp-php-run-elevated.ps1 -Version 8.5 -RestartApache
#
# Usage:
#   .\scripts\upgrade-xampp-php.ps1 -Version 8.5 -RestartApache
#   .\scripts\upgrade-xampp-php.ps1 -Version 8.5 -Patch 8.5.9 -RestartApache
#   .\scripts\upgrade-xampp-php.ps1 -RestartApache          # newest minor with TS x64
#   .\scripts\upgrade-xampp-php.ps1 -ZipPath D:\php.zip -RestartApache
#   .\scripts\upgrade-xampp-php.ps1 -WhatIf
#
# Rollback: stop Apache, rename php back from php-backup-yyyyMMdd-HHmmss, start Apache.
#
# Remote system: copy this script (and optionally the elevated launcher), open
# elevated PowerShell on the target host, then run with -Version 8.5 (or omit
# -Version to install the newest published TS x64 minor).

[CmdletBinding()]
param(
    [string]$XamppRoot = 'C:\xampp',
    [string]$Version = '',
    [string]$Patch = '',
    [string]$ZipPath = '',
    [switch]$RestartApache,
    [switch]$WhatIf,
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'
$ReleasesUrl = 'https://downloads.php.net/~windows/releases/releases.json'
$ReleasesBase = 'https://downloads.php.net/~windows/releases/'

$RequiredExtensions = @(
    'ldap', 'pdo_sqlite', 'sqlite3', 'curl', 'mbstring', 'openssl', 'zip', 'opcache'
)

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Get-Sha256Hex([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            $bytes = $sha.ComputeHash($stream)
        } finally {
            $stream.Dispose()
        }
        return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Get-EnabledExtensionsFromIni([string]$IniPath) {
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($line in Get-Content -Path $IniPath) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^(;|#)') { continue }
        if ($trimmed -match '^(?:zend_)?extension\s*=\s*(.+)$') {
            $raw = $Matches[1].Trim().Trim('"').Trim("'")
            $raw = ($raw -split '\s+;')[0].Trim()
            $base = [System.IO.Path]::GetFileNameWithoutExtension($raw)
            if ($base -like 'php_*') { $base = $base.Substring(4) }
            if ($base -and -not $names.Contains($base)) {
                [void]$names.Add($base)
            }
        }
    }
    return $names
}

function Get-IniScalar([string]$IniPath, [string]$Key) {
    $pattern = "(?m)^\s*$([regex]::Escape($Key))\s*=\s*(.*)$"
    $content = Get-Content -Raw -Path $IniPath
    $m = [regex]::Match($content, $pattern)
    if (-not $m.Success) { return $null }
    $val = $m.Groups[1].Value.Trim()
    $val = ($val -split '\s+;')[0].Trim().Trim('"').Trim("'")
    return $val
}

function Set-IniLine([string]$Content, [string]$Key, [string]$Value) {
    $pattern = "(?m)^\s*;?\s*$([regex]::Escape($Key))\s*=\s*.*\r?\n?"
    $replacement = "$Key=$Value`r`n"
    if ([regex]::IsMatch($Content, $pattern)) {
        $Content = [regex]::Replace($Content, $pattern, '')
    }
    return $Content.TrimEnd() + "`r`n$replacement"
}

function Enable-IniExtension([string]$Content, [string]$Name, [bool]$IsZend = $false) {
    $prefix = if ($IsZend) { 'zend_extension' } else { 'extension' }
    # Remove every existing assignment for this module (commented or not) to avoid "already loaded".
    $strip = "(?m)^\s*;?\s*$prefix\s*=\s*(?:php_)?$([regex]::Escape($Name))(?:\.dll)?\s*(;.*)?\r?\n?"
    $Content = [regex]::Replace($Content, $strip, '')
    return $Content.TrimEnd() + "`r`n$prefix=$Name`r`n"
}

function Resolve-PhpRelease {
    param(
        [string]$WantMinor,
        [string]$WantPatch
    )

    Write-Step "Fetching release index"
    Write-Host "GET $ReleasesUrl"
    $json = Invoke-RestMethod -Uri $ReleasesUrl -TimeoutSec 60

    $minors = @($json.PSObject.Properties.Name | Where-Object {
        $_ -match '^\d+\.\d+$' -and (
            ($json.$_.PSObject.Properties.Name | Where-Object { $_ -like 'ts-*-x64' })
        )
    } | Sort-Object { [version]$_ })

    if (-not $minors) {
        throw "No Thread-Safe x64 builds found in releases.json"
    }

    if ([string]::IsNullOrWhiteSpace($WantMinor)) {
        $WantMinor = $minors[-1]
        Write-Host "Selected newest minor with TS x64: $WantMinor"
    } elseif ($minors -notcontains $WantMinor) {
        throw "Minor $WantMinor not in releases.json. Available: $($minors -join ', ')"
    }

    $entry = $json.$WantMinor
    $version = $entry.version
    if (-not [string]::IsNullOrWhiteSpace($WantPatch)) {
        if ($WantPatch -ne $version) {
            throw "Exact patch $WantPatch is not the current published build for $WantMinor (index has $version). Download archives manually if you need an older patch."
        }
    }

    $tsKey = @($entry.PSObject.Properties.Name | Where-Object { $_ -like 'ts-*-x64' } | Sort-Object) | Select-Object -Last 1
    if (-not $tsKey) {
        throw "No ts-*-x64 key for PHP $WantMinor"
    }

    $zipMeta = $entry.$tsKey.zip
    if (-not $zipMeta -or -not $zipMeta.path) {
        throw "Missing zip metadata for $WantMinor / $tsKey"
    }

    return [pscustomobject]@{
        Minor   = $WantMinor
        Version = $version
        TsKey   = $tsKey
        Path    = $zipMeta.path
        Sha256  = $zipMeta.sha256
        Url     = ($ReleasesBase + $zipMeta.path)
    }
}

function Stop-XamppApache([string]$Root) {
    Write-Step "Stopping Apache (if running)"
    $httpd = Join-Path $Root 'apache\bin\httpd.exe'
    $stopBat = Join-Path $Root 'apache_stop.bat'
    $svc = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue

    if (-not $svc -and -not (Get-Process -Name httpd -ErrorAction SilentlyContinue)) {
        Write-Host "Apache was not running"
        return
    }

    if ($svc -and $svc.Status -eq 'Running') {
        Write-Host "Apache2.4 Windows service is Running (elevated stop required)"
        try {
            Stop-Service -Name 'Apache2.4' -Force -ErrorAction Stop
            Start-Sleep -Seconds 2
        } catch {
            $job = Start-Job -ScriptBlock { cmd.exe /c 'net stop Apache2.4' 2>&1 | Out-Null }
            if (-not (Wait-Job $job -Timeout 10)) {
                Stop-Job $job -ErrorAction SilentlyContinue
            }
            Remove-Job $job -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    }

    if (Get-Process -Name httpd -ErrorAction SilentlyContinue) {
        if (Test-Path $httpd) {
            $job = Start-Job -ArgumentList $httpd -ScriptBlock {
                param($exe)
                & $exe -k stop 2>&1 | Out-Null
            }
            if (-not (Wait-Job $job -Timeout 8)) {
                Stop-Job $job -ErrorAction SilentlyContinue
            }
            Remove-Job $job -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }

    if (Get-Process -Name httpd -ErrorAction SilentlyContinue) {
        if (Test-Path $stopBat) {
            $job = Start-Job -ArgumentList $stopBat -ScriptBlock {
                param($bat)
                & cmd.exe /c "`"$bat`"" 2>&1 | Out-Null
            }
            if (-not (Wait-Job $job -Timeout 8)) {
                Stop-Job $job -ErrorAction SilentlyContinue
            }
            Remove-Job $job -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }

    if (Get-Process -Name httpd -ErrorAction SilentlyContinue) {
        Write-Host "Force-stopping remaining httpd processes..."
        Get-Process -Name httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    $svc = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
    if (($svc -and $svc.Status -eq 'Running') -or (Get-Process -Name httpd -ErrorAction SilentlyContinue)) {
        throw @"
Cannot stop Apache2.4 (service ACL / permissions).

Fix: open an elevated PowerShell (Run as administrator), then either:
  1) Stop-Service Apache2.4
  2) Or re-run this script elevated:
     powershell -ExecutionPolicy Bypass -File .\scripts\upgrade-xampp-php.ps1 -Version 8.5 -RestartApache
"@
    }
    Write-Host "Apache stopped"
}

function Sync-ApachePhpCurlDeps {
    param(
        [string]$XamppRootPath,
        [string]$PhpDir
    )

    # Apache loads DLLs from apache\bin first (httpd.exe directory). Older XAMPP
    # OpenSSL/nghttp2/libssh2 there shadow PHP 8.5+ deps and break php_curl.dll
    # under apache2handler ("The specified procedure could not be found") while
    # CLI curl still works. Official PHP 8.5 Windows zips statically link libcurl
    # into php_curl.dll — no separate libcurl.dll is shipped.
    $apacheBin = Join-Path $XamppRootPath 'apache\bin'
    if (-not (Test-Path $apacheBin)) {
        Write-Warning "apache\bin not found - skip curl dependency sync"
        return
    }

    $dlls = @(
        'libcrypto-3-x64.dll',
        'libssl-3-x64.dll',
        'nghttp2.dll',
        'libssh2.dll',
        'brotlicommon.dll',
        'brotlidec.dll'
    )

    $backupDir = Join-Path $apacheBin ('dll-backup-before-php-sync-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    $copied = 0
    foreach ($name in $dlls) {
        $src = Join-Path $PhpDir $name
        $dst = Join-Path $apacheBin $name
        if (-not (Test-Path $src)) { continue }
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        if (Test-Path $dst) {
            Copy-Item $dst (Join-Path $backupDir $name) -Force
        }
        Copy-Item $src $dst -Force
        $copied++
        Write-Host "Synced Apache dependency: $name"
    }

    if ($copied -gt 0) {
        Write-Host "Apache curl deps synced ($copied files). Backup: $backupDir"
    } else {
        Write-Warning 'No PHP dependency DLLs found to sync into apache\bin'
    }
}

function Test-PhpLdapGate {
    param(
        [string]$PhpDir,
        [string]$PhpIniPath
    )

    $phpExe = Join-Path $PhpDir 'php.exe'
    $ldapDll = Join-Path $PhpDir 'ext\php_ldap.dll'
    $sasl = Join-Path $PhpDir 'libsasl.dll'
    $apacheMod = Join-Path $PhpDir 'php8apache2_4.dll'
    $phpTs = Join-Path $PhpDir 'php8ts.dll'

    if (-not (Test-Path $phpExe)) { throw "php.exe missing in staging: $PhpDir" }
    if (-not (Test-Path $apacheMod)) { throw "php8apache2_4.dll missing - wrong build (need Thread Safe for Apache)" }
    if (-not (Test-Path $phpTs)) { throw "php8ts.dll missing - wrong build (need Thread Safe)" }
    if (-not (Test-Path $ldapDll)) { throw "LDAP hard gate failed: ext\php_ldap.dll not found" }
    if (-not (Test-Path $sasl)) { throw "LDAP hard gate failed: libsasl.dll not found next to php.exe" }

    $probe = Join-Path $PhpDir '_linknest_ldap_probe.php'
    Set-Content -Path $probe -Value '<?php echo extension_loaded("ldap") ? "LDAP_OK" : "LDAP_FAIL";' -Encoding ASCII
    $prevEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & $phpExe -c $PhpIniPath -d display_errors=0 -d error_reporting=0 $probe 2>&1 | Out-String
    $ErrorActionPreference = $prevEa
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    if ($out -notmatch 'LDAP_OK') {
        throw "LDAP hard gate failed: extension did not load.`n$out"
    }
    Write-Host "LDAP hard gate passed (php_ldap.dll + libsasl.dll + extension_loaded)"
}

function Build-MergedPhpIni {
    param(
        [string]$StagingDir,
        [string]$OldIniPath,
        [string]$XamppRootPath
    )

    $prod = Join-Path $StagingDir 'php.ini-production'
    $dev = Join-Path $StagingDir 'php.ini-development'
    $sourceIni = if (Test-Path $prod) { $prod } elseif (Test-Path $dev) { $dev } else {
        throw "No php.ini-production/development in staging"
    }

    $content = Get-Content -Raw -Path $sourceIni

    $preserveKeys = @(
        'memory_limit', 'max_execution_time', 'post_max_size', 'upload_max_filesize',
        'date.timezone', 'error_reporting', 'display_errors', 'session.save_handler'
    )
    foreach ($key in $preserveKeys) {
        $oldVal = Get-IniScalar $OldIniPath $key
        if ($null -ne $oldVal -and $oldVal -ne '') {
            $content = Set-IniLine $content $key $oldVal
        }
    }

    $oldCurl = Get-IniScalar $OldIniPath 'curl.cainfo'
    $enabled = Get-EnabledExtensionsFromIni $OldIniPath
    if ($enabled.Count -eq 0) {
        $enabled = [System.Collections.Generic.List[string]]@(
            'bz2', 'ldap', 'curl', 'fileinfo', 'gd', 'gettext', 'intl', 'mbstring', 'exif',
            'mysqli', 'openssl', 'pdo_mysql', 'pdo_pgsql', 'pdo_sqlite', 'pgsql', 'sockets',
            'sqlite3', 'zip', 'opcache', 'ftp'
        )
    }

    foreach ($must in $RequiredExtensions) {
        if ($enabled -notcontains $must) { [void]$enabled.Add($must) }
    }

    $ordered = New-Object System.Collections.Generic.List[string]
    if ($enabled -contains 'mbstring') { [void]$ordered.Add('mbstring') }
    foreach ($name in $enabled) {
        if ($name -eq 'mbstring') { continue }
        if (-not $ordered.Contains($name)) { [void]$ordered.Add($name) }
    }

    foreach ($name in $ordered) {
        $isZend = ($name -eq 'opcache')
        $dllName = if ($isZend) { 'php_opcache.dll' } else { "php_$name.dll" }
        $dllPath = Join-Path (Join-Path $StagingDir 'ext') $dllName
        if ($isZend -and -not (Test-Path $dllPath)) {
            # PHP 8.5+ Windows builds ship Zend OPcache built-in (no php_opcache.dll).
            Write-Host "OPcache is built-in for this build (no $dllName) - skipping zend_extension line"
            continue
        }
        if (-not (Test-Path $dllPath)) {
            Write-Warning "Skipping extension=$name (DLL not in this build: $dllName)"
            continue
        }
        $content = Enable-IniExtension $content $name $isZend
    }

    $liveExt = ((Join-Path $XamppRootPath 'php\ext') -replace '\\', '/')
    $content = Set-IniLine $content 'extension_dir' "`"$liveExt`""
    $liveTmp = ((Join-Path $XamppRootPath 'tmp') -replace '\\', '/')
    $content = Set-IniLine $content 'session.save_path' "`"$liveTmp`""

    $cacertLiveSlash = ((Join-Path $XamppRootPath 'php\cacert.pem') -replace '\\', '/')
    if ((Test-Path (Join-Path $StagingDir 'cacert.pem')) -or $oldCurl) {
        $content = Set-IniLine $content 'curl.cainfo' "`"$cacertLiveSlash`""
        $content = Set-IniLine $content 'openssl.cafile' "`"$cacertLiveSlash`""
    }

    $gateIni = $content
    $gateExt = ((Join-Path $StagingDir 'ext') -replace '\\', '/')
    $gateIni = Set-IniLine $gateIni 'extension_dir' "`"$gateExt`""
    if (Test-Path (Join-Path $StagingDir 'cacert.pem')) {
        $gateCa = ((Join-Path $StagingDir 'cacert.pem') -replace '\\', '/')
        $gateIni = Set-IniLine $gateIni 'curl.cainfo' "`"$gateCa`""
        $gateIni = Set-IniLine $gateIni 'openssl.cafile' "`"$gateCa`""
    }

    return [pscustomobject]@{
        LiveIni = $content
        GateIni = $gateIni
    }
}

function Assert-RequiredModules([string]$PhpExe, [string]$IniPath) {
    $missing = @()
    $probeDir = Split-Path -Parent $IniPath
    if (-not $probeDir) { $probeDir = $env:TEMP }
    $probe = Join-Path $probeDir '_linknest_ext_probe.php'
    $prevEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    foreach ($ext in $RequiredExtensions) {
        if ($ext -eq 'opcache') {
            Set-Content -Path $probe -Value '<?php echo (extension_loaded("Zend OPcache") || extension_loaded("opcache")) ? "1" : "0";' -Encoding ASCII
        } else {
            Set-Content -Path $probe -Value ("<?php echo extension_loaded(`"$ext`") ? `"1`" : `"0`";") -Encoding ASCII
        }
        $result = (& $PhpExe -c $IniPath -d display_errors=0 -d error_reporting=0 $probe 2>&1 | Out-String).Trim()
        # Native stderr warnings become ErrorRecords; keep only text lines
        if ($result -match '(?m)^([01])\s*$') {
            $result = $Matches[1]
        } elseif ($result -match '([01])\s*$') {
            $result = $Matches[1]
        }
        if ($result -ne '1') {
            $missing += $ext
        }
    }
    $ErrorActionPreference = $prevEa
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    if ($missing.Count -gt 0) {
        throw "Required extensions missing after upgrade: $($missing -join ', ')"
    }
    Write-Host "Required extensions OK: $($RequiredExtensions -join ', ')"
}

# ---- main ----

$XamppRoot = [System.IO.Path]::GetFullPath($XamppRoot)
$phpLive = Join-Path $XamppRoot 'php'
$oldIni = Join-Path $phpLive 'php.ini'

if (-not (Test-Path $phpLive)) { throw "XAMPP php folder not found: $phpLive" }
if (-not (Test-Path $oldIni)) { throw "php.ini not found: $oldIni" }

Write-Host "XAMPP root: $XamppRoot"
$currentVer = & (Join-Path $phpLive 'php.exe') -r 'echo PHP_VERSION;' 2>$null
Write-Host "Current PHP: $currentVer"

$release = $null
$zipFile = $ZipPath

if ([string]::IsNullOrWhiteSpace($zipFile)) {
    $release = Resolve-PhpRelease -WantMinor $Version -WantPatch $Patch
    Write-Host "Target: PHP $($release.Version) ($($release.TsKey))"
    Write-Host "URL: $($release.Url)"
    $zipFile = Join-Path $env:TEMP $release.Path
} else {
    if (-not (Test-Path $zipFile)) { throw "ZipPath not found: $zipFile" }
    Write-Host "Using provided zip: $zipFile"
}

if ($WhatIf) {
    Write-Host "[WhatIf] Would download/verify zip, backup $phpLive, merge php.ini, LDAP-gate, swap, verify."
    if ($release) {
        Write-Host "[WhatIf] Target version $($release.Version)"
    }
    exit 0
}

if ($release) {
    $needDownload = $true
    if (Test-Path $zipFile) {
        Write-Step "Checking existing zip SHA256"
        $hash = Get-Sha256Hex $zipFile
        $expected = $release.Sha256.ToLowerInvariant()
        if ($hash -eq $expected) {
            Write-Host "Reusing cached zip (SHA256 OK): $zipFile"
            $needDownload = $false
        }
    }
    if ($needDownload) {
        Write-Step "Downloading $($release.Path)"
        Invoke-WebRequest -Uri $release.Url -OutFile $zipFile -UseBasicParsing
        Write-Step "Verifying SHA256"
        $hash = Get-Sha256Hex $zipFile
        $expected = $release.Sha256.ToLowerInvariant()
        if ($hash -ne $expected) {
            throw "SHA256 mismatch for $($release.Path). Expected $expected got $hash"
        }
        Write-Host "SHA256 OK"
    }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $XamppRoot "php-backup-$stamp"
$stagingParent = Join-Path $env:TEMP "xampp-php-upgrade-$stamp"
$stagingDir = Join-Path $stagingParent 'php'

Stop-XamppApache -Root $XamppRoot

Write-Step "Extracting to staging"
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
Expand-Archive -Path $zipFile -DestinationPath $stagingDir -Force

$nestedPhp = Get-ChildItem -Path $stagingDir -Filter 'php.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nestedPhp -and $nestedPhp.DirectoryName -ne $stagingDir) {
    $nestedRoot = $nestedPhp.DirectoryName
    Write-Host "Flattening nested extract from $nestedRoot"
    Get-ChildItem -Path $nestedRoot -Force | ForEach-Object {
        Move-Item -Path $_.FullName -Destination $stagingDir -Force
    }
}

$oldCacert = Join-Path $phpLive 'cacert.pem'
if (Test-Path $oldCacert) {
    Copy-Item $oldCacert (Join-Path $stagingDir 'cacert.pem') -Force
    Write-Host "Copied cacert.pem into staging"
}

Write-Step "Building merged php.ini (preserving XAMPP settings + enabled extensions)"
$iniBundle = Build-MergedPhpIni -StagingDir $stagingDir -OldIniPath $oldIni -XamppRootPath $XamppRoot
$gateIniPath = Join-Path $stagingParent 'php-gate.ini'
$liveIniPath = Join-Path $stagingDir 'php.ini'
Set-Content -Path $gateIniPath -Value $iniBundle.GateIni -Encoding ASCII
Set-Content -Path $liveIniPath -Value $iniBundle.LiveIni -Encoding ASCII

Write-Step "LDAP / Apache hard gate (pre-swap)"
Test-PhpLdapGate -PhpDir $stagingDir -PhpIniPath $gateIniPath
Assert-RequiredModules -PhpExe (Join-Path $stagingDir 'php.exe') -IniPath $gateIniPath

$stagedVer = & (Join-Path $stagingDir 'php.exe') -c $gateIniPath -r 'echo PHP_VERSION;'
Write-Host "Staged PHP version: $stagedVer"

Write-Step "Backing up live PHP to $backupDir"
Move-Item -Path $phpLive -Destination $backupDir
try {
    Write-Step "Activating staged PHP"
    Move-Item -Path $stagingDir -Destination $phpLive
} catch {
    Write-Warning "Swap failed - restoring backup"
    if (Test-Path $phpLive) { Remove-Item $phpLive -Recurse -Force -ErrorAction SilentlyContinue }
    Move-Item -Path $backupDir -Destination $phpLive
    throw
}

try {
    Write-Step "Post-swap verification"
    $livePhp = Join-Path $phpLive 'php.exe'
    $liveIni = Join-Path $phpLive 'php.ini'
    $newVer = & $livePhp -r 'echo PHP_VERSION;'
    Write-Host "Live PHP version: $newVer"
    Assert-RequiredModules -PhpExe $livePhp -IniPath $liveIni

    $probe = Join-Path $phpLive '_linknest_ldap_probe.php'
    Set-Content -Path $probe -Value '<?php echo extension_loaded("ldap") && function_exists("ldap_connect") ? "LDAP_OK" : "LDAP_FAIL";' -Encoding ASCII
    $prevEa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $ldapCheck = (& $livePhp -d display_errors=0 -d error_reporting=0 $probe 2>&1 | Out-String)
    $ErrorActionPreference = $prevEa
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    if ($ldapCheck -notmatch 'LDAP_OK') {
        throw "Post-swap LDAP verification failed: $ldapCheck"
    }
    Write-Host "Post-swap LDAP OK"
} catch {
    Write-Warning "Verification failed - rolling back to $backupDir"
    if (Get-Process -Name httpd -ErrorAction SilentlyContinue) {
        & (Join-Path $XamppRoot 'apache\bin\httpd.exe') -k stop 2>$null | Out-Null
    }
    Remove-Item $phpLive -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -Path $backupDir -Destination $phpLive
    throw
}

Write-Step "Syncing PHP curl/OpenSSL DLLs into apache\bin (Apache must be stopped)"
Sync-ApachePhpCurlDeps -XamppRootPath $XamppRoot -PhpDir $phpLive

if ($RestartApache) {
    Write-Step "Starting Apache"
    $httpd = Join-Path $XamppRoot 'apache\bin\httpd.exe'
    $startBat = Join-Path $XamppRoot 'apache_start.bat'
    $started = $false
    try {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $httpd -k start 2>&1 | Out-Null
        $ErrorActionPreference = $prev
        if (-not (Get-Process -Name httpd -ErrorAction SilentlyContinue) -and (Test-Path $startBat)) {
            & cmd.exe /c "`"$startBat`"" 2>&1 | Out-Null
        }
        Start-Sleep -Seconds 2
        if (Get-Process -Name httpd -ErrorAction SilentlyContinue) {
            $started = $true
        }
    } catch {
        $started = $false
    }
    if (-not $started) {
        Write-Warning "Could not start Apache automatically - start it from XAMPP Control Panel"
    } else {
        Write-Host "Apache started"
    }
} else {
    Write-Host ""
    Write-Host "Start/restart Apache from XAMPP Control Panel to serve the new PHP."
}

if (-not $KeepStaging) {
    Remove-Item $stagingParent -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Upgrade complete: $currentVer -> $newVer"
Write-Host "Backup kept at: $backupDir"
Write-Host "Rollback: stop Apache, remove '$phpLive', rename backup folder to 'php', start Apache."
Write-Host "Done."

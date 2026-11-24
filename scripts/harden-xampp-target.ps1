#Requires -Version 5.1
<#
.SYNOPSIS
    Harden a LinkNest XAMPP target after deploy/update (PHP 8.5+ ready).

.DESCRIPTION
    Applies lessons from Windows Server 2022 remote deploys:
      - Ensure C:\xampp\tmp exists (PHP sessions)
      - ACL data/, uploads/, logs/, tmp for Users modify
      - Enable curl / sqlite3 / pdo_sqlite / openssl / mbstring / ldap / intl in php.ini
      - Apply OPcache + JIT + realpath_cache performance defaults for PHP 8.5
      - Copy ICU DLLs from php\ into apache\bin when needed for intl
      - Soft-disable httpd-vhosts DocumentRoots that point at missing paths
      - Optional Apache restart

.PARAMETER XamppRoot
    XAMPP root (default C:\xampp)

.PARAMETER InstallDir
    LinkNest install directory (default %XamppRoot%\htdocs\linknest)

.PARAMETER RestartApache
    Restart Apache2.4 service when present

.PARAMETER SkipIniTweaks
    Do not modify php.ini performance / extension lines

.EXAMPLE
    .\harden-xampp-target.ps1 -XamppRoot C:\xampp -RestartApache
#>
param(
    [string]$XamppRoot = "C:\xampp",
    [string]$InstallDir = "",
    [switch]$RestartApache,
    [switch]$SkipIniTweaks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-H([string]$m) { Write-Host "  [harden] $m" }

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Join-Path $XamppRoot "htdocs\linknest"
}

$phpIni = Join-Path $XamppRoot "php\php.ini"
$phpExe = Join-Path $XamppRoot "php\php.exe"
$httpdConf = Join-Path $XamppRoot "apache\conf\httpd.conf"
$vhosts = Join-Path $XamppRoot "apache\conf\extra\httpd-vhosts.conf"

Write-H "XAMPP=$XamppRoot"
Write-H "App=$InstallDir"

# --- ttyd for SSH Easy ------------------------------------------------------
$binDir = Join-Path $InstallDir "bin"
$ttydExe = Join-Path $binDir "ttyd.exe"
$ensureTtyd = Join-Path $InstallDir "scripts\ensure-ttyd-runtime.ps1"
if (-not (Test-Path $ensureTtyd)) {
    $ensureTtyd = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\ensure-ttyd-runtime.ps1"
}
if (-not (Test-Path $ttydExe) -or ((Get-Item $ttydExe -ErrorAction SilentlyContinue).Length -lt 100000)) {
    if (Test-Path $ensureTtyd) {
        Write-H "ensuring bin/ttyd.exe via ensure-ttyd-runtime.ps1"
        try {
            & $ensureTtyd -ProjectRoot $InstallDir
        } catch {
            Write-H ("ensure-ttyd failed: " + $_.Exception.Message)
        }
    }
}
if (Test-Path $ttydExe) {
    Write-H ("ttyd OK: " + $ttydExe)
    # Persist Admin → SSH Gateway paths WITHOUT loading api/config.php
    # (config bootstrap runs migrations and floods stderr during first deploy).
    $phpExeForSet = Join-Path $XamppRoot "php\php.exe"
    $dbPath = Join-Path $InstallDir "data\linknest.db"
    $dataDir = Join-Path $InstallDir "data"
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    }
    $setPhp = Join-Path $env:TEMP ("linknest-set-ttyd-" + [guid]::NewGuid().ToString("N") + ".php")
    $dbPhp = ($dbPath -replace '\\', '/')
    $ttydPhp = ($ttydExe -replace '\\', '/')
    $sshCandidate = 'C:\Windows\System32\OpenSSH\ssh.exe'
    $sshPhp = if (Test-Path $sshCandidate) { ($sshCandidate -replace '\\', '/') } else { '' }
    $phpCode = @"
<?php
declare(strict_types=1);
`$dbFile = str_replace('/', DIRECTORY_SEPARATOR, '$dbPhp');
`$ttyd = str_replace('/', DIRECTORY_SEPARATOR, '$ttydPhp');
`$ssh = '$sshPhp' !== '' ? str_replace('/', DIRECTORY_SEPARATOR, '$sshPhp') : '';
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
    `$upsert->execute(['ssh_gateway_ttyd_path', `$ttyd, `$now]);
    if (`$ssh !== '' && is_file(`$ssh)) {
        `$upsert->execute(['ssh_gateway_ssh_path', `$ssh, `$now]);
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
        if (Test-Path $phpExeForSet) {
            $prevEap = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            $outLines = & $phpExeForSet $setPhp 2>&1
            $ErrorActionPreference = $prevEap
            $text = ($outLines | ForEach-Object { "$_" }) -join "`n"
            if ($LASTEXITCODE -eq 0 -and $text -match '(?m)^ok\s*$') {
                Write-H "ssh gateway paths saved (direct SQLite, no migrations)"
            }
            else {
                Write-H ("ssh gateway path save warning: " + $text.Trim())
            }
        }
    } catch {
        Write-H ("could not persist ttyd path setting: " + $_.Exception.Message)
    } finally {
        Remove-Item $setPhp -Force -ErrorAction SilentlyContinue
    }
}
else {
    Write-H "NOTE: bin/ttyd.exe missing (optional; only needed for SSH Easy)"
}

# --- folders + ACLs ---------------------------------------------------------
$dirs = @(
    (Join-Path $XamppRoot "tmp"),
    (Join-Path $InstallDir "data"),
    (Join-Path $InstallDir "uploads"),
    (Join-Path $InstallDir "logs")
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
        Write-H "created $d"
    }
    try {
        & icacls $d /grant "Users:(OI)(CI)M" /T 2>$null | Out-Null
    } catch { }
}
Write-H "folders/ACLs ready"

# --- ICU for intl (PHP 8.5 ships icu*77) ------------------------------------
$phpDir = Join-Path $XamppRoot "php"
$apacheBin = Join-Path $XamppRoot "apache\bin"
if ((Test-Path $phpDir) -and (Test-Path $apacheBin)) {
    $icu = @(Get-ChildItem (Join-Path $phpDir "icu*.dll") -ErrorAction SilentlyContinue)
    foreach ($f in $icu) {
        $dest = Join-Path $apacheBin $f.Name
        if (-not (Test-Path $dest) -or ((Get-Item $dest).Length -ne $f.Length)) {
            Copy-Item $f.FullName $dest -Force -ErrorAction SilentlyContinue
            Write-H "copied $($f.Name) -> apache\bin"
        }
    }
}

# --- php.ini extensions + PHP 8.5 performance -------------------------------
function Set-IniValue([string]$text, [string]$key, [string]$value) {
    if ($text -match ("(?m)^\s*;?\s*" + [regex]::Escape($key) + "\s*=")) {
        return [regex]::Replace($text, ("(?m)^\s*;?\s*" + [regex]::Escape($key) + "\s*=.*$"), ($key + "=" + $value))
    }
    return ($text + "`r`n" + $key + "=" + $value + "`r`n")
}

function Enable-IniExtension([string]$text, [string]$ext) {
    if ($text -match ("(?m)^\s*extension\s*=\s*" + [regex]::Escape($ext) + "\b")) {
        return $text
    }
    if ($text -match ("(?m)^\s*;\s*extension\s*=\s*" + [regex]::Escape($ext) + "\b")) {
        return [regex]::Replace($text, ("(?m)^\s*;\s*extension\s*=\s*" + [regex]::Escape($ext) + "\b.*$"), ("extension=" + $ext))
    }
    return ($text + "`r`nextension=" + $ext + "`r`n")
}

if (-not $SkipIniTweaks -and (Test-Path $phpIni)) {
    $c = Get-Content $phpIni -Raw -ErrorAction SilentlyContinue
    if ($null -ne $c) {
        foreach ($ext in @("curl", "openssl", "mbstring", "sqlite3", "pdo_sqlite", "ldap", "intl", "zip")) {
            $dll = Join-Path $XamppRoot ("php\ext\php_" + $ext + ".dll")
            if (($ext -eq "intl" -or $ext -eq "ldap" -or $ext -eq "zip") -and -not (Test-Path $dll)) {
                continue
            }
            $c = Enable-IniExtension $c $ext
        }
        $c = Set-IniValue $c "opcache.enable" "1"
        $c = Set-IniValue $c "opcache.enable_cli" "0"
        $c = Set-IniValue $c "opcache.memory_consumption" "256"
        $c = Set-IniValue $c "opcache.interned_strings_buffer" "32"
        $c = Set-IniValue $c "opcache.max_accelerated_files" "20000"
        $c = Set-IniValue $c "opcache.validate_timestamps" "1"
        $c = Set-IniValue $c "opcache.revalidate_freq" "60"
        $c = Set-IniValue $c "opcache.jit" "1255"
        $c = Set-IniValue $c "opcache.jit_buffer_size" "128M"
        $c = Set-IniValue $c "realpath_cache_size" "4096K"
        $c = Set-IniValue $c "realpath_cache_ttl" "600"
        $c = Set-IniValue $c "memory_limit" "512M"
        $c = Set-IniValue $c "max_execution_time" "120"
        # Prefer not to elevate deprecations (PHP 8.5 curl_close etc. if any remain)
        if ($c -match '(?m)^\s*;?\s*error_reporting\s*=') {
            $c = Set-IniValue $c "error_reporting" "E_ALL & ~E_DEPRECATED & ~E_STRICT"
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        try {
            [System.IO.File]::WriteAllText($phpIni, $c, $utf8NoBom)
            Write-H "php.ini extensions + OPcache/JIT tuned"
        } catch {
            Write-H ("php.ini write skipped (access denied - run elevated to apply): " + $_.Exception.Message)
        }
    }
}
else {
    Write-H "php.ini tweaks skipped"
}

# --- soft-fix broken vhosts (missing DocumentRoot = Apache won't start) ----
if (Test-Path $vhosts) {
    $vh = Get-Content $vhosts -Raw
    $docRootPattern = '(?im)^\s*DocumentRoot\s+"([^"]+)"'
    $hasMissingDocRoot = $false
    foreach ($m in [regex]::Matches($vh, $docRootPattern)) {
        $doc = ($m.Groups[1].Value -replace '/', '\')
        if ($doc -and -not (Test-Path -LiteralPath $doc)) {
            Write-H ("missing DocumentRoot: " + $m.Groups[1].Value)
            $hasMissingDocRoot = $true
        }
    }
    if ($hasMissingDocRoot) {
        $bak = "$vhosts.pre-linknest.bak"
        if (-not (Test-Path $bak)) {
            Copy-Item $vhosts $bak -Force
        }
        $vh2 = [regex]::Replace($vh, '(?m)^(\s*Listen\s+9333\s*)$', '# $1  # disabled by harden-xampp-target.ps1')
        $vh2 = [regex]::Replace($vh2, '(?im)^(\s*DocumentRoot\s+"C:/xampp/htdocs/linknest/analytics"\s*)$', '# $1')
        if ($vh2 -ne $vh) {
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($vhosts, $vh2, $utf8NoBom)
            Write-H "soft-disabled broken analytics vhost Listen/DocumentRoot"
        }
    }
}

# Configtest hint
if (Test-Path (Join-Path $XamppRoot "apache\bin\httpd.exe")) {
    try {
        Push-Location (Join-Path $XamppRoot "apache\bin")
        $t = & .\httpd.exe -t 2>&1 | Out-String
        Pop-Location
        if ($t -match 'Syntax OK') {
            Write-H "httpd -t: Syntax OK"
        }
        else {
            Write-H ("httpd -t warnings/errors:`n" + $t.Trim())
        }
    } catch {
        Write-H ("httpd -t failed: " + $_.Exception.Message)
    }
}

if ($RestartApache) {
    $svc = Get-Service -Name "Apache2.4" -ErrorAction SilentlyContinue
    if ($svc) {
        try {
            Restart-Service Apache2.4 -Force -ErrorAction Stop
            Write-H "Apache2.4 restarted"
        } catch {
            Write-H ("Apache restart failed: " + $_.Exception.Message)
            try {
                & (Join-Path $XamppRoot "apache\bin\httpd.exe") -k restart -n Apache2.4 2>&1 | Out-Null
            } catch { }
        }
    }
    else {
        Write-H "Apache2.4 service not installed (start Apache from XAMPP Control Panel)"
    }
}

if (Test-Path $phpExe) {
    try {
        $ver = & $phpExe -v 2>&1 | Select-Object -First 1
        Write-H "php: $ver"
        $mods = & $phpExe -m 2>&1 | Out-String
        foreach ($need in @("curl", "sqlite3", "pdo_sqlite", "openssl", "mbstring", "Zend OPcache")) {
            if ($mods -match [regex]::Escape($need)) {
                Write-H "module OK: $need"
            }
            else {
                if ($need -eq "Zend OPcache") {
                    Write-H "module optional missing: Zend OPcache (app still runs; enable if you want opcode cache)"
                }
                else {
                    Write-H "module MISSING: $need"
                }
            }
        }
    } catch {
        Write-H ("php check failed: " + $_.Exception.Message)
    }
}

Write-H "done"
exit 0

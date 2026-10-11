#Requires -Version 5.1
<#
.SYNOPSIS
    In-place patch of vanilla Apache (D:\Apache) + PHP Thread Safe (D:\php)
    to the latest published Windows builds, keeping httpd.conf / php.ini / htdocs.

.DESCRIPTION
    Use this on a machine that already extracted the LinkNest Apache+PHP runtime
    ZIP (or followed docs/VANILLA_APACHE_PHP85_WINDOWS.md). It does NOT replace
    LinkNest application files under htdocs\linknest.

    Default: newest PHP 8.5.x TS x64 + newest Apache Lounge httpd Win64 VS17.
    Your php.ini and httpd.conf are kept. PHP dependency DLLs are re-copied
    into Apache\bin. Service Apache24-LinkNest is stopped/started.

    Run elevated (Run as administrator), or double-click
    upgrade-vanilla-apache-php.bat

    .\scripts\upgrade-vanilla-apache-php.ps1
    .\scripts\upgrade-vanilla-apache-php.ps1 -SkipApache
    .\scripts\upgrade-vanilla-apache-php.ps1 -SkipPhp
    .\scripts\upgrade-vanilla-apache-php.ps1 -Version 8.5 -Patch 8.5.9
    .\scripts\upgrade-vanilla-apache-php.ps1 -LatestMinor
    .\scripts\upgrade-vanilla-apache-php.ps1 -WhatIf

.PARAMETER PhpDir
    Live PHP folder (default D:\php).
.PARAMETER ApacheDir
    Live Apache folder (default D:\Apache).
.PARAMETER ServiceName
    Windows service (default Apache24-LinkNest).
.PARAMETER Version
    PHP minor to stay on (default 8.5). Ignored when -LatestMinor is set.
.PARAMETER Patch
    Exact PHP patch that must match the current published build for that minor.
.PARAMETER LatestMinor
    Take the newest Thread-Safe x64 minor in releases.json (may be 8.6+ later).
.PARAMETER PhpZipPath
    Use a local PHP TS zip instead of downloading.
.PARAMETER ApacheZipUrl
    Override Apache Lounge zip URL (otherwise the VS17 page is scraped).
.PARAMETER SkipPhp
    Do not replace D:\php (Apache-only patch).
.PARAMETER SkipApache
    Do not replace Apache bin/modules (PHP-only patch).
.PARAMETER NoRestart
    Leave Apache stopped after replacing files (default is to start Apache24-LinkNest).
.PARAMETER RefreshCacert
    Re-download curl.se CA bundle into D:\php\cacert.pem (otherwise the existing file is kept).
.PARAMETER WhatIf
    Print target versions; make no changes.
#>
[CmdletBinding()]
param(
    [string]$PhpDir = 'D:\php',
    [string]$ApacheDir = 'D:\Apache',
    [string]$ServiceName = 'Apache24-LinkNest',
    [string]$Version = '8.5',
    [string]$Patch = '',
    [switch]$LatestMinor,
    [string]$PhpZipPath = '',
    [string]$ApacheZipUrl = '',
    [switch]$SkipPhp,
    [switch]$SkipApache,
    [switch]$NoRestart,
    [switch]$RefreshCacert,
    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ReleasesUrl = 'https://downloads.php.net/~windows/releases/releases.json'
$ReleasesBase = 'https://downloads.php.net/~windows/releases/'
$CacertUrl = 'https://curl.se/ca/cacert.pem'
$ApachePageUrl = 'https://www.apachelounge.com/download/VS17/'
$SqliteTargetVersion = '3.54.0'
$SqliteDllZipUrl = 'https://www.sqlite.org/2026/sqlite-dll-win-x64-3540000.zip'
$SqliteMinVersion = '3.53.0'
$RequiredExtensions = @(
    'ldap', 'pdo_sqlite', 'sqlite3', 'curl', 'mbstring', 'openssl', 'zip', 'fileinfo'
)

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
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

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Download-File([string]$Url, [string]$OutFile, [string]$UserAgent) {
    $dir = Split-Path -Parent $OutFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Write-Host "GET $Url"
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -Headers @{ 'User-Agent' = $UserAgent } -TimeoutSec 300
    if (-not (Test-Path $OutFile) -or ((Get-Item $OutFile).Length -lt 10000)) {
        throw "Download failed or too small: $OutFile"
    }
}

function Resolve-PhpRelease {
    param([string]$WantMinor, [string]$WantPatch)

    Write-Step 'Fetching PHP release index'
    $json = Invoke-RestMethod -Uri $ReleasesUrl -TimeoutSec 60
    $minors = @($json.PSObject.Properties.Name | Where-Object {
        $_ -match '^\d+\.\d+$' -and (
            ($json.$_.PSObject.Properties.Name | Where-Object { $_ -like 'ts-*-x64' })
        )
    } | Sort-Object { [version]$_ })

    if (-not $minors) { throw 'No Thread-Safe x64 builds found in releases.json' }
    if ([string]::IsNullOrWhiteSpace($WantMinor)) {
        $WantMinor = $minors[-1]
        Write-Host "Selected newest minor with TS x64: $WantMinor"
    } elseif ($minors -notcontains $WantMinor) {
        throw "Minor $WantMinor not in releases.json. Available: $($minors -join ', ')"
    }

    $entry = $json.$WantMinor
    $version = $entry.version
    if (-not [string]::IsNullOrWhiteSpace($WantPatch) -and $WantPatch -ne $version) {
        throw "Exact patch $WantPatch is not the current published build for $WantMinor (index has $version)."
    }

    $tsKey = @($entry.PSObject.Properties.Name | Where-Object { $_ -like 'ts-*-x64' } | Sort-Object) | Select-Object -Last 1
    $zipMeta = $entry.$tsKey.zip
    if (-not $zipMeta -or -not $zipMeta.path) { throw "Missing zip metadata for $WantMinor / $tsKey" }

    return [pscustomobject]@{
        Version = $version
        TsKey   = $tsKey
        Path    = $zipMeta.path
        Sha256  = $zipMeta.sha256
        Url     = ($ReleasesBase + $zipMeta.path)
    }
}

function Resolve-ApacheLoungeZip {
    param([string]$PreferredUrl)
    if (-not [string]::IsNullOrWhiteSpace($PreferredUrl)) {
        return @($PreferredUrl)
    }
    Write-Step 'Finding Apache Lounge Win64 VS17 zip (matches PHP VS17)'
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinkNest-vanilla-upgrader'
    $html = (Invoke-WebRequest -Uri $ApachePageUrl -UseBasicParsing -Headers @{ 'User-Agent' = $ua } -TimeoutSec 60).Content
    $m = [regex]::Match($html, 'httpd-2\.4\.\d+-\d+-win64-VS17\.zip', 'IgnoreCase')
    if (-not $m.Success) {
        throw "Could not find httpd-*-win64-VS17.zip on $ApachePageUrl"
    }
    Write-Host "Apache zip: $($m.Value)"
    return @(
        "https://www.apachelounge.com/download/VS17/binaries/$($m.Value)",
        "https://fossies.org/windows/www/$($m.Value)"
    )
}

function Flatten-ApacheExtract([string]$Staging) {
    $httpd = Get-ChildItem -Path $Staging -Filter 'httpd.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $httpd) { throw "httpd.exe not found after extracting Apache zip in $Staging" }
    $root = $httpd.Directory.Parent.FullName
    if ($root -eq $Staging) { return $Staging }

    Write-Host "Flattening Apache from $root"
    $dest = Join-Path $Staging '_apache_flat'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory -Path $dest | Out-Null
    Get-ChildItem -Path $root -Force | ForEach-Object {
        Move-Item $_.FullName (Join-Path $dest $_.Name) -Force
    }
    Get-ChildItem -Path $Staging -Force | Where-Object { $_.FullName -ne $dest } | ForEach-Object {
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    Get-ChildItem -Path $dest -Force | ForEach-Object {
        Move-Item $_.FullName (Join-Path $Staging $_.Name) -Force
    }
    Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
    return $Staging
}

function Copy-PhpDllsToApache([string]$PhpFolder, [string]$ApacheBin) {
    $names = @(
        'libsasl.dll', 'libsqlite3.dll', 'sqlite3.dll',
        'libcrypto-3-x64.dll', 'libssl-3-x64.dll',
        'nghttp2.dll', 'libssh2.dll',
        'brotlicommon.dll', 'brotlidec.dll',
        'libcurl.dll', 'libcurl-x64.dll'
    )
    $copied = 0
    foreach ($name in $names) {
        $src = Join-Path $PhpFolder $name
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $ApacheBin $name) -Force
            $copied++
        }
    }
    Get-ChildItem (Join-Path $PhpFolder 'icu*.dll') -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $ApacheBin $_.Name) -Force
        $copied++
    }
    Write-Host "Copied $copied PHP dependency DLLs into Apache\bin"
}

function Install-OfficialSqliteDll {
    param(
        [string]$PhpFolder,
        [string]$WorkDir,
        [string]$UserAgent
    )
    Write-Step "Installing official SQLite $SqliteTargetVersion into $PhpFolder"
    $tmp = Join-Path $WorkDir 'sqlite-dll'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $zip = Join-Path $tmp 'sqlite-dll-win-x64.zip'
    Download-File $SqliteDllZipUrl $zip $UserAgent
    Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'out') -Force
    $dll = Get-ChildItem (Join-Path $tmp 'out') -Filter 'sqlite3.dll' -Recurse | Select-Object -First 1
    if (-not $dll) { throw 'sqlite3.dll missing from official sqlite.org zip' }
    Copy-Item $dll.FullName (Join-Path $PhpFolder 'libsqlite3.dll') -Force
    Copy-Item $dll.FullName (Join-Path $PhpFolder 'sqlite3.dll') -Force
    Write-Host ("libsqlite3.dll updated ({0:N0} bytes)" -f (Get-Item (Join-Path $PhpFolder 'libsqlite3.dll')).Length)
}

function Assert-PhpModules([string]$PhpExe, [string]$IniPath, [string]$Folder) {
    $missing = @()
    $probe = Join-Path $Folder '_ln_ext_probe.php'
    $extDir = ((Join-Path $Folder 'ext') -replace '\\', '/')
    foreach ($ext in $RequiredExtensions) {
        Set-Content -Path $probe -Value "<?php echo extension_loaded('$ext') ? '1' : '0';" -Encoding ASCII
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $out = & $PhpExe -c $IniPath -d "extension_dir=$extDir" -d display_errors=0 $probe 2>&1 | Out-String
        $ErrorActionPreference = $prev
        if ($out -notmatch '1') { $missing += $ext }
    }
    if ($missing.Count -gt 0) {
        Remove-Item $probe -Force -ErrorAction SilentlyContinue
        throw "Required PHP extensions did not load: $($missing -join ', ')"
    }

    Set-Content -Path $probe -Value "<?php `$m=new PDO('sqlite::memory:'); echo `$m->query('SELECT sqlite_version()')->fetchColumn();" -Encoding ASCII
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $verOut = & $PhpExe -c $IniPath -d "extension_dir=$extDir" -d display_errors=0 $probe 2>&1 | Out-String
    $ErrorActionPreference = $prev
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    $ver = ($verOut -replace '\s', '')
    if ($ver -notmatch '^\d+\.\d+') {
        throw "Could not read SQLite version via PDO (got: $verOut)"
    }
    if ([version]$ver -lt [version]$SqliteMinVersion) {
        throw "SQLite $ver is below LinkNest minimum $SqliteMinVersion"
    }
    Write-Host "PHP extensions OK (SQLite $ver)"
}

function Stop-LinkNestApache([string]$Name, [string]$HttpdExe) {
    Write-Step "Stopping Apache ($Name)"
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        Stop-Service -Name $Name -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
    }
    if ((Test-Path $HttpdExe) -and (Get-Process -Name httpd -ErrorAction SilentlyContinue)) {
        & $HttpdExe -k stop 2>$null | Out-Null
        Start-Sleep -Seconds 1
    }
    if (Get-Process -Name httpd -ErrorAction SilentlyContinue) {
        Get-Process -Name httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (($svc -and $svc.Status -eq 'Running') -or (Get-Process -Name httpd -ErrorAction SilentlyContinue)) {
        throw "Could not stop Apache. Run this script as Administrator (upgrade-vanilla-apache-php.bat)."
    }
    Write-Host 'Apache stopped'
}

function Start-LinkNestApache([string]$Name, [string]$HttpdExe) {
    Write-Step 'Testing httpd.conf'
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $HttpdExe -t 2>&1 | ForEach-Object { Write-Host $_ }
    $tExit = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($tExit -ne 0) {
        throw 'httpd -t failed. Fix D:\Apache\conf\httpd.conf before starting Apache. PHP/Apache binaries may already be updated.'
    }
    Write-Step "Starting Apache ($Name)"
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($svc) {
        Start-Service -Name $Name -ErrorAction Stop
    } else {
        & $HttpdExe -k start 2>$null | Out-Null
    }
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Name httpd -ErrorAction SilentlyContinue)) {
        Write-Warning 'Apache did not start automatically. Start the Apache24-LinkNest service from services.msc.'
    } else {
        Write-Host 'Apache started'
    }
}

function Invoke-RobocopyReplace([string]$Source, [string]$Dest) {
    if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest -Force | Out-Null }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & robocopy.exe $Source $Dest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    $code = [int]$LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ge 8) {
        throw "robocopy failed $Source -> $Dest (exit $code)"
    }
}

# ---- main ----
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinkNest-vanilla-upgrader'
$PhpDir = [IO.Path]::GetFullPath($PhpDir)
$ApacheDir = [IO.Path]::GetFullPath($ApacheDir)
$httpdExe = Join-Path $ApacheDir 'bin\httpd.exe'
$phpExe = Join-Path $PhpDir 'php.exe'

if ($SkipPhp -and $SkipApache) { throw 'Nothing to do: both -SkipPhp and -SkipApache were set.' }
if (-not (Test-Path $phpExe)) { throw "PHP not found: $phpExe (extract the runtime ZIP to D:\ first)" }
if (-not (Test-Path $httpdExe)) { throw "Apache not found: $httpdExe (extract the runtime ZIP to D:\ first)" }
if (-not (Test-Path (Join-Path $PhpDir 'php8apache2_4.dll'))) {
    throw 'php8apache2_4.dll missing - this upgrader is for Thread Safe PHP with Apache, not NTS.'
}

if (-not $WhatIf -and -not (Test-IsAdmin)) {
    throw 'Run as Administrator (needed to stop/start Apache24-LinkNest and replace files under D:\). Double-click upgrade-vanilla-apache-php.bat'
}

$currentPhp = & $phpExe -n -r 'echo PHP_VERSION;' 2>$null
Write-Host ""
Write-Host '  LinkNest vanilla Apache + PHP in-place patch' -ForegroundColor Cyan
Write-Host "  PHP dir     : $PhpDir  (now $currentPhp)" -ForegroundColor Gray
Write-Host "  Apache dir  : $ApacheDir" -ForegroundColor Gray
Write-Host "  Service     : $ServiceName" -ForegroundColor Gray
Write-Host "  PHP patch   : $(if ($SkipPhp) { 'skip' } elseif ($LatestMinor) { 'newest TS x64 minor' } else { "stay on $Version" })" -ForegroundColor Gray
Write-Host "  Apache patch: $(if ($SkipApache) { 'skip' } else { 'newest VS17 Lounge zip' })" -ForegroundColor Gray
Write-Host ""

$wantMinor = $Version
if ($LatestMinor) { $wantMinor = '' }

$phpRelease = $null
if (-not $SkipPhp -and [string]::IsNullOrWhiteSpace($PhpZipPath)) {
    $phpRelease = Resolve-PhpRelease -WantMinor $wantMinor -WantPatch $Patch
    Write-Host "Target PHP $($phpRelease.Version) ($($phpRelease.TsKey))"
}

$apacheUrls = @()
if (-not $SkipApache) {
    $apacheUrls = @(Resolve-ApacheLoungeZip -PreferredUrl $ApacheZipUrl)
}

if ($WhatIf) {
    if ($phpRelease) { Write-Host "[WhatIf] Would install PHP $($phpRelease.Version) from $($phpRelease.Url)" }
    if ($apacheUrls.Count -gt 0) { Write-Host "[WhatIf] Would install Apache from $($apacheUrls[0])" }
    Write-Host '[WhatIf] Would keep php.ini, httpd.conf, and htdocs. No files changed.'
    exit 0
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $env:TEMP "linknest-vanilla-upgrade-$stamp"
New-Item -ItemType Directory -Path $work -Force | Out-Null
$phpBackup = Join-Path (Split-Path $PhpDir -Parent) ("php-backup-$stamp")
$apacheBackup = Join-Path (Split-Path $ApacheDir -Parent) ("Apache-bin-backup-$stamp")

try {
    Stop-LinkNestApache -Name $ServiceName -HttpdExe $httpdExe

    if (-not $SkipPhp) {
        $phpZip = $PhpZipPath
        if ([string]::IsNullOrWhiteSpace($phpZip)) {
            $phpZip = Join-Path $env:TEMP $phpRelease.Path
            $need = $true
            if (Test-Path $phpZip) {
                $hash = Get-Sha256Hex $phpZip
                if ($hash -eq $phpRelease.Sha256.ToLowerInvariant()) {
                    Write-Host 'Reusing cached PHP zip (SHA256 OK)'
                    $need = $false
                }
            }
            if ($need) {
                Write-Step "Downloading PHP $($phpRelease.Version)"
                Download-File $phpRelease.Url $phpZip $ua
                $hash = Get-Sha256Hex $phpZip
                if ($hash -ne $phpRelease.Sha256.ToLowerInvariant()) {
                    throw "PHP SHA256 mismatch. Expected $($phpRelease.Sha256) got $hash"
                }
            }
        } elseif (-not (Test-Path $phpZip)) {
            throw "PhpZipPath not found: $phpZip"
        }

        Write-Step 'Extracting PHP to staging'
        $phpStage = Join-Path $work 'php'
        New-Item -ItemType Directory -Path $phpStage -Force | Out-Null
        Expand-Archive -Path $phpZip -DestinationPath $phpStage -Force
        $nestedPhp = Get-ChildItem -Path $phpStage -Filter 'php.exe' -Recurse | Select-Object -First 1
        if (-not $nestedPhp) { throw 'php.exe missing after extract' }
        if ($nestedPhp.DirectoryName -ne $phpStage) {
            Get-ChildItem $nestedPhp.DirectoryName -Force | ForEach-Object {
                Move-Item $_.FullName (Join-Path $phpStage $_.Name) -Force
            }
        }
        if (-not (Test-Path (Join-Path $phpStage 'php8apache2_4.dll'))) {
            throw 'Staged PHP is not Thread Safe (php8apache2_4.dll missing)'
        }

        $oldIni = Join-Path $PhpDir 'php.ini'
        if (Test-Path $oldIni) {
            Copy-Item $oldIni (Join-Path $phpStage 'php.ini') -Force
            Write-Host 'Kept existing php.ini'
        } else {
            $prod = Join-Path $phpStage 'php.ini-production'
            if (Test-Path $prod) { Copy-Item $prod (Join-Path $phpStage 'php.ini') -Force }
            Write-Warning 'No live php.ini - copied php.ini-production (review paths)'
        }

        $oldCa = Join-Path $PhpDir 'cacert.pem'
        $newCa = Join-Path $phpStage 'cacert.pem'
        if ($RefreshCacert -or -not (Test-Path $oldCa)) {
            try { Download-File $CacertUrl $newCa $ua } catch {
                if (Test-Path $oldCa) { Copy-Item $oldCa $newCa -Force }
                else { Write-Warning "cacert.pem download failed: $($_.Exception.Message)" }
            }
        } elseif (Test-Path $oldCa) {
            Copy-Item $oldCa $newCa -Force
        }

        Install-OfficialSqliteDll -PhpFolder $phpStage -WorkDir $work -UserAgent $ua
        $stageIni = Join-Path $phpStage 'php.ini'
        Assert-PhpModules -PhpExe (Join-Path $phpStage 'php.exe') -IniPath $stageIni -Folder $phpStage
        $stagedVer = & (Join-Path $phpStage 'php.exe') -n -r 'echo PHP_VERSION;'
        Write-Host "Staged PHP $stagedVer"

        Write-Step "Backing up live PHP to $phpBackup"
        Move-Item -Path $PhpDir -Destination $phpBackup
        try {
            Move-Item -Path $phpStage -Destination $PhpDir
        } catch {
            Write-Warning 'PHP swap failed - restoring backup'
            if (Test-Path $PhpDir) { Remove-Item $PhpDir -Recurse -Force -ErrorAction SilentlyContinue }
            Move-Item -Path $phpBackup -Destination $PhpDir
            throw
        }
        Write-Host "PHP $currentPhp -> $stagedVer  (backup: $phpBackup)"
    }

    if (-not $SkipApache) {
        $apacheZip = Join-Path $work 'httpd.zip'
        $ok = $false
        foreach ($url in $apacheUrls) {
            try {
                Write-Step "Downloading Apache: $url"
                Download-File $url $apacheZip $ua
                $ok = $true
                break
            } catch {
                Write-Warning "Apache download failed from $url : $($_.Exception.Message)"
            }
        }
        if (-not $ok) { throw 'Could not download Apache Lounge Win64 VS17 zip' }

        Write-Step 'Extracting Apache to staging'
        $apacheStage = Join-Path $work 'apache'
        New-Item -ItemType Directory -Path $apacheStage -Force | Out-Null
        Expand-Archive -Path $apacheZip -DestinationPath $apacheStage -Force
        Flatten-ApacheExtract $apacheStage | Out-Null
        $stageHttpd = Join-Path $apacheStage 'bin\httpd.exe'
        if (-not (Test-Path $stageHttpd)) { throw 'Staged Apache is missing bin\httpd.exe' }

        Write-Step "Backing up Apache bin + modules to $apacheBackup"
        New-Item -ItemType Directory -Path $apacheBackup -Force | Out-Null
        foreach ($leaf in @('bin', 'modules')) {
            $src = Join-Path $ApacheDir $leaf
            if (Test-Path $src) {
                Copy-Item $src (Join-Path $apacheBackup $leaf) -Recurse -Force
            }
        }

        Write-Step 'Replacing Apache bin/ and modules/ (conf, htdocs, logs, tmp kept)'
        foreach ($leaf in @('bin', 'modules')) {
            $from = Join-Path $apacheStage $leaf
            $to = Join-Path $ApacheDir $leaf
            if (Test-Path $from) { Invoke-RobocopyReplace $from $to }
        }
        Write-Host 'Apache binaries updated (httpd.conf unchanged)'
    }

    $apacheBin = Join-Path $ApacheDir 'bin'
    if ($SkipPhp) {
        Install-OfficialSqliteDll -PhpFolder $PhpDir -WorkDir $work -UserAgent $ua
    }
    Copy-PhpDllsToApache -PhpFolder $PhpDir -ApacheBin $apacheBin
    Assert-PhpModules -PhpExe (Join-Path $PhpDir 'php.exe') -IniPath (Join-Path $PhpDir 'php.ini') -Folder $PhpDir
    $newPhp = & (Join-Path $PhpDir 'php.exe') -n -r 'echo PHP_VERSION;'
    Write-Host "Live PHP: $newPhp"

    if (-not $NoRestart) {
        Start-LinkNestApache -Name $ServiceName -HttpdExe $httpdExe
    } else {
        Write-Host 'Apache left stopped (-NoRestart). Start the Apache24-LinkNest service when ready.'
    }

    Write-Host ""
    Write-Host 'Patch complete.' -ForegroundColor Green
    if (Test-Path $phpBackup) { Write-Host "PHP backup   : $phpBackup" }
    if (Test-Path $apacheBackup) { Write-Host "Apache backup: $apacheBackup" }
    Write-Host 'Rollback PHP : stop Apache, delete D:\php, rename php-backup-* to php, start Apache.'
    Write-Host 'Rollback Apache bin: stop Apache, copy Apache-bin-backup-*\bin and modules back, start Apache.'
    Write-Host 'Docs: docs\VANILLA_APACHE_PHP_UPGRADE.md'
}
finally {
    if (Test-Path $work) {
        Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

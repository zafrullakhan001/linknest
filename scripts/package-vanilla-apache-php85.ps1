#Requires -Version 5.1
<#
.SYNOPSIS
    Build a drop-in ZIP of vanilla Apache 2.4 (VS17) + PHP 8.5 Thread Safe
    already configured for LinkNest at D:\Apache + D:\php.

.DESCRIPTION
    Downloads official PHP 8.5 TS x64 and Apache Lounge httpd Win64 VS17,
    writes php.ini / httpd.conf for LinkNest, copies PHP DLLs into Apache\bin,
    and emits:

      linknest-apache-php85-runtime-YYYYMMDD_HHMMSS.zip

    Extract the ZIP to D:\ then run install-runtime.bat as Administrator.

.EXAMPLE
    .\scripts\package-vanilla-apache-php85.ps1
    .\scripts\package-vanilla-apache-php85.ps1 -OutputDir E:\
#>
[CmdletBinding()]
param(
    [string]$Version = '8.5',
    [string]$Patch = '',
    [string]$OutputDir = '',
    [string]$ApacheZipUrl = '',
    [string]$PhpZipPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ReleasesUrl = 'https://downloads.php.net/~windows/releases/releases.json'
$ReleasesBase = 'https://downloads.php.net/~windows/releases/'
$CacertUrl = 'https://curl.se/ca/cacert.pem'
$ApachePageUrl = 'https://www.apachelounge.com/download/VS17/'

$RequiredExtensions = @(
    'ldap', 'pdo_sqlite', 'sqlite3', 'curl', 'mbstring', 'openssl', 'zip', 'fileinfo', 'gd', 'intl'
)

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
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
    $strip = "(?m)^\s*;?\s*$prefix\s*=\s*(?:php_)?$([regex]::Escape($Name))(?:\.dll)?\s*(;.*)?\r?\n?"
    $Content = [regex]::Replace($Content, $strip, '')
    return $Content.TrimEnd() + "`r`n$prefix=$Name`r`n"
}

function Enable-HttpdLoadModule([string]$Text, [string]$ModuleName) {
    $pat = "(?m)^\s*#\s*(LoadModule\s+$([regex]::Escape($ModuleName))\s+\S+)\s*$"
    if ([regex]::IsMatch($Text, $pat)) {
        return [regex]::Replace($Text, $pat, '$1')
    }
    return $Text
}

function Resolve-PhpRelease {
    param([string]$WantMinor, [string]$WantPatch)

    Write-Step "Fetching PHP release index"
    $json = Invoke-RestMethod -Uri $ReleasesUrl -TimeoutSec 60
    $minors = @($json.PSObject.Properties.Name | Where-Object {
        $_ -match '^\d+\.\d+$' -and (
            ($json.$_.PSObject.Properties.Name | Where-Object { $_ -like 'ts-*-x64' })
        )
    } | Sort-Object { [version]$_ })

    if (-not $minors) { throw "No Thread-Safe x64 builds found in releases.json" }
    if ([string]::IsNullOrWhiteSpace($WantMinor)) {
        $WantMinor = $minors[-1]
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

function Download-File([string]$Url, [string]$OutFile, [string]$UserAgent) {
    $dir = Split-Path -Parent $OutFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Write-Host "GET $Url"
    $headers = @{ 'User-Agent' = $UserAgent }
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -Headers $headers -TimeoutSec 300
    if (-not (Test-Path $OutFile) -or ((Get-Item $OutFile).Length -lt 10000)) {
        throw "Download failed or too small: $OutFile"
    }
}

function Resolve-ApacheLoungeZip {
    param([string]$PreferredUrl)

    if (-not [string]::IsNullOrWhiteSpace($PreferredUrl)) {
        return $PreferredUrl
    }

    Write-Step "Finding Apache Lounge Win64 VS17 zip (matches PHP VS17)"
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinkNest-runtime-packager'
    $html = (Invoke-WebRequest -Uri $ApachePageUrl -UseBasicParsing -Headers @{ 'User-Agent' = $ua } -TimeoutSec 60).Content
    $m = [regex]::Match($html, 'httpd-2\.4\.\d+-\d+-win64-VS17\.zip', 'IgnoreCase')
    if (-not $m.Success) {
        throw "Could not find httpd-*-win64-VS17.zip on $ApachePageUrl"
    }
    $name = $m.Value
    Write-Host "Apache zip: $name"
    return @(
        "https://www.apachelounge.com/download/VS17/binaries/$name",
        "https://fossies.org/windows/www/$name"
    )
}

function Find-HttpdConf([string]$ApacheRoot) {
    $candidates = @(
        (Join-Path $ApacheRoot 'conf\httpd.conf'),
        (Join-Path $ApacheRoot 'Apache24\conf\httpd.conf')
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    $found = Get-ChildItem -Path $ApacheRoot -Filter 'httpd.conf' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.FullName }
    throw "httpd.conf not found under $ApacheRoot"
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

function Patch-HttpdConf([string]$ConfPath) {
    $text = Get-Content -Raw -Path $ConfPath

    if ($text -notmatch '(?im)^Define\s+SRVROOT\s+') {
        $text = "Define SRVROOT `"D:/Apache`"`r`n" + $text
    } else {
        $text = [regex]::Replace($text, '(?im)^(Define\s+SRVROOT\s+)"[^"]+"', '$1"D:/Apache"')
    }

    foreach ($oldRoot in @('C:/Apache24-64', 'c:/Apache24-64', 'C:/Apache24', 'c:/Apache24', 'C:\Apache24-64', 'C:\Apache24')) {
        $text = $text.Replace($oldRoot, '${SRVROOT}')
    }

    $text = [regex]::Replace($text, '(?im)^ServerRoot\s+"[^"]+"', 'ServerRoot "${SRVROOT}"')
    $text = [regex]::Replace($text, '(?im)^DocumentRoot\s+"[^"]*htdocs"', 'DocumentRoot "${SRVROOT}/htdocs"')

    foreach ($mod in @('rewrite_module', 'headers_module', 'deflate_module', 'mime_module', 'dir_module', 'authz_core_module')) {
        $text = Enable-HttpdLoadModule $text $mod
    }

    $text = [regex]::Replace($text, '(?s)\r?\n# --- LinkNest PHP 8.5 \(Thread Safe\) ---.*?# --- end LinkNest PHP ---', '')

    $htdocsDirPat = '(?is)(<Directory\s+"[^"]*htdocs">)(.*?)(</Directory>)'
    $text = [regex]::Replace($text, $htdocsDirPat, {
        param($m)
        $body = [regex]::Replace($m.Groups[2].Value, '(?im)^\s*AllowOverride\s+\S+', '    AllowOverride All')
        if ($body -notmatch '(?im)^\s*AllowOverride\s+') {
            $body = "`r`n    Options Indexes FollowSymLinks`r`n    AllowOverride All`r`n    Require all granted`r`n"
        }
        return $m.Groups[1].Value + $body + $m.Groups[3].Value
    })

    if ($text -match '(?m)^\s*DirectoryIndex\s+') {
        $text = [regex]::Replace($text, '(?m)^\s*DirectoryIndex\s+.+$', 'DirectoryIndex dist/index.html index.php index.html')
    } else {
        $text = $text.TrimEnd() + "`r`nDirectoryIndex dist/index.html index.php index.html`r`n"
    }

    $phpBlock = @"

# --- LinkNest PHP 8.5 (Thread Safe) ---
LoadFile "D:/php/php8ts.dll"
LoadModule php_module "D:/php/php8apache2_4.dll"
PHPIniDir "D:/php"
<FilesMatch \.php$>
    SetHandler application/x-httpd-php
</FilesMatch>
# --- end LinkNest PHP ---
"@
    if ($text -notmatch 'php8apache2_4\.dll') {
        $marker = '# LoadModule foo_module modules/mod_foo.so'
        $idx = $text.IndexOf($marker)
        if ($idx -ge 0) {
            $text = $text.Insert($idx + $marker.Length, "`r`n" + $phpBlock)
        } else {
            $text = $phpBlock + "`r`n" + $text
        }
    }

    Set-Content -Path $ConfPath -Value $text -Encoding ASCII
}

function Build-PhpIni([string]$PhpDir) {
    $prod = Join-Path $PhpDir 'php.ini-production'
    if (-not (Test-Path $prod)) { throw "php.ini-production missing in $PhpDir" }
    $content = Get-Content -Raw -Path $prod

    $content = Set-IniLine $content 'extension_dir' '"D:/php/ext"'
    $content = Set-IniLine $content 'session.save_path' '"D:/Apache/tmp"'
    $content = Set-IniLine $content 'curl.cainfo' '"D:/php/cacert.pem"'
    $content = Set-IniLine $content 'openssl.cafile' '"D:/php/cacert.pem"'
    $content = Set-IniLine $content 'memory_limit' '512M'
    $content = Set-IniLine $content 'max_execution_time' '120'
    $content = Set-IniLine $content 'max_input_time' '120'
    $content = Set-IniLine $content 'upload_max_filesize' '50M'
    $content = Set-IniLine $content 'post_max_size' '50M'
    $content = Set-IniLine $content 'date.timezone' 'America/New_York'
    $content = Set-IniLine $content 'display_errors' 'Off'
    $content = Set-IniLine $content 'log_errors' 'On'
    $content = Set-IniLine $content 'error_log' '"D:/Apache/logs/php_errors.log"'
    $content = Set-IniLine $content 'expose_php' 'Off'

    $content = Set-IniLine $content 'opcache.enable' '1'
    $content = Set-IniLine $content 'opcache.enable_cli' '0'
    $content = Set-IniLine $content 'opcache.memory_consumption' '256'
    $content = Set-IniLine $content 'opcache.interned_strings_buffer' '32'
    $content = Set-IniLine $content 'opcache.max_accelerated_files' '20000'
    $content = Set-IniLine $content 'opcache.max_wasted_percentage' '10'
    $content = Set-IniLine $content 'opcache.validate_timestamps' '1'
    $content = Set-IniLine $content 'opcache.revalidate_freq' '60'
    $content = Set-IniLine $content 'opcache.revalidate_path' '0'
    $content = Set-IniLine $content 'opcache.enable_file_override' '1'
    $content = Set-IniLine $content 'opcache.save_comments' '1'
    $content = Set-IniLine $content 'opcache.jit' '1255'
    $content = Set-IniLine $content 'opcache.jit_buffer_size' '128M'
    $content = Set-IniLine $content 'realpath_cache_size' '4096K'
    $content = Set-IniLine $content 'realpath_cache_ttl' '600'

    $opcacheDll = Join-Path (Join-Path $PhpDir 'ext') 'php_opcache.dll'
    if (Test-Path $opcacheDll) {
        $content = Enable-IniExtension $content 'opcache' $true
    } else {
        Write-Host "OPcache is built-in for this PHP 8.5 build (no php_opcache.dll) - settings still apply under Apache"
    }

    $ordered = New-Object System.Collections.Generic.List[string]
    [void]$ordered.Add('mbstring')
    foreach ($name in $RequiredExtensions) {
        if (-not $ordered.Contains($name)) { [void]$ordered.Add($name) }
    }
    foreach ($name in $ordered) {
        $dllPath = Join-Path (Join-Path $PhpDir 'ext') ("php_$name.dll")
        if (-not (Test-Path $dllPath)) {
            Write-Warning "Skipping extension=$name (DLL not in this build)"
            continue
        }
        $content = Enable-IniExtension $content $name $false
    }

    $iniPath = Join-Path $PhpDir 'php.ini'
    Set-Content -Path $iniPath -Value $content -Encoding ASCII
    return $iniPath
}

function Copy-PhpDllsToApache([string]$PhpDir, [string]$ApacheBin) {
    $names = @(
        'libsasl.dll', 'libsqlite3.dll',
        'libcrypto-3-x64.dll', 'libssl-3-x64.dll',
        'nghttp2.dll', 'libssh2.dll',
        'brotlicommon.dll', 'brotlidec.dll',
        'libcurl.dll', 'libcurl-x64.dll'
    )
    $copied = 0
    foreach ($name in $names) {
        $src = Join-Path $PhpDir $name
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $ApacheBin $name) -Force
            $copied++
        }
    }
    Get-ChildItem (Join-Path $PhpDir 'icu*.dll') -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $ApacheBin $_.Name) -Force
        $copied++
    }
    Write-Host "Copied $copied PHP dependency DLLs into Apache\bin"
}

function Assert-PhpModules([string]$PhpExe, [string]$IniPath, [string]$PhpDir) {
    $missing = @()
    $probe = Join-Path $PhpDir '_ln_ext_probe.php'
    $extDir = ((Join-Path $PhpDir 'ext') -replace '\\', '/')
    $cacert = ((Join-Path $PhpDir 'cacert.pem') -replace '\\', '/')
    foreach ($ext in @('pdo_sqlite', 'sqlite3', 'curl', 'openssl', 'mbstring', 'ldap', 'fileinfo', 'zip')) {
        Set-Content -Path $probe -Value "<?php echo extension_loaded('$ext') ? '1' : '0';" -Encoding ASCII
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $out = & $PhpExe -c $IniPath -d "extension_dir=$extDir" -d "curl.cainfo=$cacert" -d display_errors=0 $probe 2>&1 | Out-String
        $ErrorActionPreference = $prev
        if ($out -notmatch '1') { $missing += $ext }
    }
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    if ($missing.Count -gt 0) {
        throw "Required PHP extensions did not load: $($missing -join ', ')"
    }
    Write-Host "PHP extensions OK"
}

# ---- paths ----
$here = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputDir)) { $OutputDir = $here }
$OutputDir = [IO.Path]::GetFullPath($OutputDir)
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$work = Join-Path $env:TEMP "linknest-apache-php85-$stamp"
$payload = Join-Path $work 'payload'
$apacheDir = Join-Path $payload 'Apache'
$phpDir = Join-Path $payload 'php'
New-Item -ItemType Directory -Path $apacheDir, $phpDir -Force | Out-Null

$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinkNest-runtime-packager'

try {
    # PHP
    $phpZip = $PhpZipPath
    $release = $null
    if ([string]::IsNullOrWhiteSpace($phpZip)) {
        $release = Resolve-PhpRelease -WantMinor $Version -WantPatch $Patch
        Write-Host "Target PHP $($release.Version) ($($release.TsKey))"
        $phpZip = Join-Path $env:TEMP $release.Path
        $need = $true
        if (Test-Path $phpZip) {
            $hash = (Get-FileHash -Algorithm SHA256 -Path $phpZip).Hash.ToLowerInvariant()
            if ($hash -eq $release.Sha256.ToLowerInvariant()) {
                Write-Host "Reusing cached PHP zip (SHA256 OK)"
                $need = $false
            }
        }
        if ($need) {
            Write-Step "Downloading PHP $($release.Version)"
            Download-File $release.Url $phpZip $ua
            $hash = (Get-FileHash -Algorithm SHA256 -Path $phpZip).Hash.ToLowerInvariant()
            if ($hash -ne $release.Sha256.ToLowerInvariant()) {
                throw "PHP SHA256 mismatch. Expected $($release.Sha256) got $hash"
            }
        }
    } elseif (-not (Test-Path $phpZip)) {
        throw "PhpZipPath not found: $phpZip"
    }

    Write-Step "Extracting PHP"
    Expand-Archive -Path $phpZip -DestinationPath $phpDir -Force
    $nestedPhp = Get-ChildItem -Path $phpDir -Filter 'php.exe' -Recurse | Select-Object -First 1
    if (-not $nestedPhp) { throw "php.exe missing after extract" }
    if ($nestedPhp.DirectoryName -ne $phpDir) {
        Get-ChildItem $nestedPhp.DirectoryName -Force | ForEach-Object {
            Move-Item $_.FullName (Join-Path $phpDir $_.Name) -Force
        }
    }
    if (-not (Test-Path (Join-Path $phpDir 'php8apache2_4.dll'))) {
        throw "php8apache2_4.dll missing - need Thread Safe x64, not NTS"
    }

    Write-Step "Downloading CA bundle"
    $cacertDest = Join-Path $phpDir 'cacert.pem'
    try {
        Download-File $CacertUrl $cacertDest $ua
    } catch {
        $extras = Join-Path $phpDir 'extras\ssl\cacert.pem'
        if (Test-Path $extras) { Copy-Item $extras $cacertDest -Force }
        else { Write-Warning "Could not download cacert.pem: $($_.Exception.Message)" }
    }

    Write-Step "Writing php.ini"
    $iniPath = Build-PhpIni -PhpDir $phpDir
    Assert-PhpModules -PhpExe (Join-Path $phpDir 'php.exe') -IniPath $iniPath -PhpDir $phpDir

    # Apache
    $apacheUrls = @(Resolve-ApacheLoungeZip -PreferredUrl $ApacheZipUrl)
    $apacheZip = Join-Path $env:TEMP ('httpd-linknest-' + $stamp + '.zip')
    $apacheOk = $false
    foreach ($url in $apacheUrls) {
        try {
            Write-Step "Downloading Apache: $url"
            Download-File $url $apacheZip $ua
            $apacheOk = $true
            break
        } catch {
            Write-Warning "Apache download failed from $url : $($_.Exception.Message)"
        }
    }
    if (-not $apacheOk) { throw "Could not download Apache Lounge Win64 VS17 zip" }

    Write-Step "Extracting Apache"
    $apacheTmp = Join-Path $work 'apache-extract'
    New-Item -ItemType Directory -Path $apacheTmp -Force | Out-Null
    Expand-Archive -Path $apacheZip -DestinationPath $apacheTmp -Force
    Flatten-ApacheExtract $apacheTmp | Out-Null
    Get-ChildItem $apacheTmp -Force | ForEach-Object {
        $dest = Join-Path $apacheDir $_.Name
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
        Move-Item $_.FullName $dest
    }

    $httpdConf = Find-HttpdConf $apacheDir
    Write-Step "Patching httpd.conf ($httpdConf)"
    Patch-HttpdConf $httpdConf

    $apacheBin = Join-Path $apacheDir 'bin'
    if (-not (Test-Path (Join-Path $apacheBin 'httpd.exe'))) {
        throw "Apache bin\httpd.exe missing after flatten"
    }
    Copy-PhpDllsToApache -PhpDir $phpDir -ApacheBin $apacheBin

    foreach ($d in @(
        (Join-Path $apacheDir 'tmp'),
        (Join-Path $apacheDir 'htdocs\linknest\data'),
        (Join-Path $apacheDir 'htdocs\linknest\uploads'),
        (Join-Path $apacheDir 'logs')
    )) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
    $assets = Join-Path $PSScriptRoot 'vanilla-apache-php85'
    Copy-Item (Join-Path $assets 'htdocs-index.html') (Join-Path $apacheDir 'htdocs\index.html') -Force
    Copy-Item (Join-Path $assets 'install-runtime.bat') (Join-Path $payload 'install-runtime.bat') -Force
    $phpVer = & (Join-Path $phpDir 'php.exe') -n -r 'echo PHP_VERSION;'
    $readmeText = Get-Content -Raw -Path (Join-Path $assets 'README.txt')
    $readmeText = $readmeText.Replace('__PHP_VERSION__', [string]$phpVer)
    Set-Content -Path (Join-Path $payload 'README.txt') -Value $readmeText -Encoding ASCII

    $zipName = "linknest-apache-php85-runtime-$stamp.zip"
    $zipPath = Join-Path $OutputDir $zipName
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

    Write-Step "Creating $zipPath"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($payload, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

    $sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
    Write-Host ""
    Write-Host "OK  $zipPath  ($sizeMb MB)" -ForegroundColor Green
    Write-Host "PHP $phpVer TS  |  extract to D:\  |  run install-runtime.bat as Administrator"
    Write-Output $zipPath
}
finally {
    if (Test-Path $work) {
        Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

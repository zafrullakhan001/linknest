#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy a LinkNest package ZIP to a remote Windows/XAMPP host over SMB + scheduled task.

.DESCRIPTION
    Pattern proven on Windows Server 2022 when WinRM TrustedHosts is unavailable:
      1) Map \\HOST\C$ (or custom share)
      2) Copy ZIP / optionally mirror local Apache+PHP runtime
      3) Run elevated schtasks on the remote to extract + deploy-xampp / update-xampp
      4) Run harden-xampp-target.ps1
      5) Smoke-test http://HOST/linknest/

.PARAMETER ComputerName
    Target IP or hostname (e.g. 192.168.0.197)

.PARAMETER UserName
    Remote Windows admin user (default Administrator)

.PARAMETER Password
    Plain-text password (prefer prompting). Avoid committing this.

.PARAMETER ZipPath
    Path to linknest-deploy-*.zip on this machine

.PARAMETER PackageDir
    Already-extracted package folder (alternative to ZipPath)

.PARAMETER Mode
    Fresh (deploy-xampp.bat logic) or Update (preserve data/)

.PARAMETER XamppRoot
    Remote XAMPP root (default C:\xampp)

.PARAMETER Subfolder
    htdocs subfolder (default linknest)

.PARAMETER IncludeXamppRuntime
    Also copy Apache + PHP from local XAMPP to the remote (when remote has no httpd/php)

.PARAMETER SourceXamppRoot
    Local XAMPP to mirror when -IncludeXamppRuntime (default C:\xampp)

.PARAMETER Share
    Admin share name (default C$)

.PARAMETER SkipHarden
    Skip harden-xampp-target.ps1 on the remote

.PARAMETER SkipSmokeTest
    Skip HTTP smoke tests

.EXAMPLE
    .\deploy-remote-xampp.ps1 -ComputerName 192.168.0.197 -UserName administrator -ZipPath .\linknest-deploy-20260810_120000.zip -Mode Fresh

.EXAMPLE
    .\deploy-remote-xampp.ps1 -ComputerName 192.168.0.197 -ZipPath .\linknest-deploy-....zip -IncludeXamppRuntime -Mode Fresh
#>
param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [string]$UserName = "Administrator",
    [string]$Password = "",
    [string]$ZipPath = "",
    [string]$PackageDir = "",
    [ValidateSet("Fresh", "Update")][string]$Mode = "Fresh",
    [string]$XamppRoot = "C:\xampp",
    [string]$Subfolder = "linknest",
    [switch]$IncludeXamppRuntime,
    [string]$SourceXamppRoot = "C:\xampp",
    [string]$Share = "C$",
    [switch]$SkipHarden,
    [switch]$SkipSmokeTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-OK([string]$m) { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "  [!!]  $m" -ForegroundColor Yellow }
function Write-Err([string]$m) { Write-Host "  [XX]  $m" -ForegroundColor Red }
function Write-Step([string]$m) { Write-Host "   ->   $m" -ForegroundColor White }

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot

if ([string]::IsNullOrWhiteSpace($Password)) {
    $sec = Read-Host -AsSecureString -Prompt "Password for $UserName@$ComputerName"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try {
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

if ([string]::IsNullOrWhiteSpace($ZipPath) -and [string]::IsNullOrWhiteSpace($PackageDir)) {
    $latest = Get-ChildItem -Path $RepoRoot -Filter "linknest-deploy-*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) {
        $ZipPath = $latest.FullName
        Write-Warn "Using latest ZIP: $ZipPath"
    }
    else {
        throw "Provide -ZipPath or -PackageDir (no linknest-deploy-*.zip found in repo root)"
    }
}

if ($ZipPath -and -not (Test-Path $ZipPath)) {
    throw "ZipPath not found: $ZipPath"
}
if ($PackageDir -and -not (Test-Path $PackageDir)) {
    throw "PackageDir not found: $PackageDir"
}

$uncRoot = "\\$ComputerName\$Share"
$mapped = $false

Write-Host ""
Write-Host "  LinkNest remote deploy -> $ComputerName ($Mode)" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Step "Connecting to $uncRoot as $UserName ..."
    # Drop stale mapping if present
    net use $uncRoot /delete /y 2>$null | Out-Null
    $netOut = net use $uncRoot /user:$UserName $Password 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("SMB map failed: " + ($netOut | Out-String))
    }
    $mapped = $true
    Write-OK "SMB connected"

    # Remote paths via UNC (C$ => C:\)
    $remoteDrive = if ($Share -match '^([A-Za-z])\$') { $Matches[1] + ":" } else { "C:" }
    $remoteXamppUnc = Join-Path $uncRoot ($XamppRoot -replace '^[A-Za-z]:\\', '')
    $remoteHtdocsUnc = Join-Path $remoteXamppUnc "htdocs"
    $remoteInstallUnc = Join-Path $remoteHtdocsUnc $Subfolder
    $remoteTempUnc = Join-Path $uncRoot "Temp\linknest-remote-deploy"
    $remoteTempLocal = "$remoteDrive\Temp\linknest-remote-deploy"

    New-Item -ItemType Directory -Force -Path $remoteTempUnc | Out-Null
    New-Item -ItemType Directory -Force -Path $remoteHtdocsUnc -ErrorAction SilentlyContinue | Out-Null

    if ($IncludeXamppRuntime) {
        Write-Step "Mirroring local Apache + PHP runtime to remote (IncludeXamppRuntime)..."
        if (-not (Test-Path (Join-Path $SourceXamppRoot "apache\bin\httpd.exe"))) {
            throw "Local httpd.exe missing under $SourceXamppRoot"
        }
        if (-not (Test-Path (Join-Path $SourceXamppRoot "php\php.exe"))) {
            throw "Local php.exe missing under $SourceXamppRoot"
        }
        # Preserve remote htdocs siblings (e.g. mermaid)
        $htdocsBackup = Join-Path $uncRoot "Temp\htdocs-backup-linknest"
        if (Test-Path $remoteHtdocsUnc) {
            New-Item -ItemType Directory -Force -Path $htdocsBackup | Out-Null
            robocopy $remoteHtdocsUnc $htdocsBackup /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        }
        robocopy (Join-Path $SourceXamppRoot "apache") (Join-Path $remoteXamppUnc "apache") /MIR /R:2 /W:2 /MT:8 /XD logs /XF *.log /NFL /NDL /NP | Out-Null
        robocopy (Join-Path $SourceXamppRoot "php") (Join-Path $remoteXamppUnc "php") /MIR /R:2 /W:2 /MT:8 /NFL /NDL /NP | Out-Null
        foreach ($rootFile in @("setup_xampp.bat", "apache_start.bat", "apache_stop.bat", "xampp-control.exe", "xampp_start.exe", "xampp_stop.exe", "properties.ini")) {
            $srcF = Join-Path $SourceXamppRoot $rootFile
            if (Test-Path $srcF) {
                Copy-Item $srcF (Join-Path $remoteXamppUnc $rootFile) -Force
            }
        }
        # ICU into apache\bin
        robocopy (Join-Path $SourceXamppRoot "php") (Join-Path $remoteXamppUnc "apache\bin") "icu*.dll" /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
        # Restore prior htdocs content (merge)
        if (Test-Path $htdocsBackup) {
            New-Item -ItemType Directory -Force -Path $remoteHtdocsUnc | Out-Null
            robocopy $htdocsBackup $remoteHtdocsUnc /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        }
        # Soften remote httpd includes that often break on a new host
        $httpdUnc = Join-Path $remoteXamppUnc "apache\conf\httpd.conf"
        if (Test-Path $httpdUnc) {
            $hc = Get-Content $httpdUnc -Raw
            $hc = $hc -replace '(?m)^Include conf/extra/httpd-ssl\.conf', '#Include conf/extra/httpd-ssl.conf'
            $hc = $hc -replace '(?m)^Include conf/extra/httpd-vhosts\.conf', '#Include conf/extra/httpd-vhosts.conf'
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($httpdUnc, $hc, $utf8NoBom)
            Write-OK "remote httpd.conf: SSL/vhosts includes commented for first boot"
        }
        Write-OK "Apache/PHP runtime mirrored"
    }

    # Stage package on remote
    $remotePkgUnc = Join-Path $remoteTempUnc "package"
    if (Test-Path $remotePkgUnc) { Remove-Item $remotePkgUnc -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Force -Path $remotePkgUnc | Out-Null

    if ($PackageDir) {
        Write-Step "Copying extracted package to remote..."
        robocopy $PackageDir $remotePkgUnc /E /R:2 /W:2 /MT:8 /XD node_modules .git /NFL /NDL /NP | Out-Null
    }
    else {
        Write-Step "Copying ZIP to remote and extracting..."
        $remoteZipUnc = Join-Path $remoteTempUnc "linknest-deploy.zip"
        Copy-Item $ZipPath $remoteZipUnc -Force
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($remoteZipUnc, $remotePkgUnc)
    }
    Write-OK "package staged at $remoteTempLocal\package"

    # Ensure harden script is present in staged package
    $hardenSrc = Join-Path $ScriptRoot "harden-xampp-target.ps1"
    $hardenDst = Join-Path $remotePkgUnc "scripts\harden-xampp-target.ps1"
    if (Test-Path $hardenSrc) {
        New-Item -ItemType Directory -Force -Path (Split-Path $hardenDst) | Out-Null
        Copy-Item $hardenSrc $hardenDst -Force
    }

    # Remote worker script (token-replaced; runs elevated via schtasks)
    $hardenFlag = if ($SkipHarden) { "0" } else { "1" }
    $worker = @'
$ErrorActionPreference = "Continue"
$log = "__REMOTE_DRIVE__\Temp\linknest-remote-deploy\worker.log"
function Log($m) { "$(Get-Date -Format o) $m" | Tee-Object -FilePath $log -Append }
Log "START remote worker"
$pkg = "__REMOTE_DRIVE__\Temp\linknest-remote-deploy\package"
$xampp = "__XAMPP_ROOT__"
$sub = "__SUBFOLDER__"
$install = Join-Path $xampp ("htdocs\" + $sub)
$mode = "__MODE__"
$doHarden = "__DO_HARDEN__"

New-Item -ItemType Directory -Force -Path (Join-Path $xampp "tmp") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $xampp "htdocs") | Out-Null

if (-not (Test-Path (Join-Path $pkg "dist\index.html"))) { throw "staged package missing dist/index.html" }
if (-not (Test-Path (Join-Path $pkg "api\index.php"))) { throw "staged package missing api/index.php" }

if ($mode -eq "Fresh") {
  Log "Fresh deploy -> $install"
  if (Test-Path $install) { Remove-Item $install -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $install | Out-Null
  robocopy $pkg $install /E /R:2 /W:2 /XD node_modules .git /XF deploy-xampp.bat update-xampp.bat verify-install.bat deploy-remote-xampp.bat install-sqlite-xampp.bat /NFL /NDL /NP | Out-Null
} else {
  Log "Update deploy -> $install"
  if (-not (Test-Path $install)) { throw "Install dir missing for Update mode: $install" }
  $bak = Join-Path $env:TEMP ("ln-bak-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $bak | Out-Null
  if (Test-Path (Join-Path $install "data")) { robocopy (Join-Path $install "data") (Join-Path $bak "data") /E /NFL /NDL /NJH /NJS | Out-Null }
  if (Test-Path (Join-Path $install "uploads")) { robocopy (Join-Path $install "uploads") (Join-Path $bak "uploads") /E /NFL /NDL /NJH /NJS | Out-Null }
  if (Test-Path (Join-Path $install "dist")) { Remove-Item (Join-Path $install "dist") -Recurse -Force }
  if (Test-Path (Join-Path $install "vendor")) { Remove-Item (Join-Path $install "vendor") -Recurse -Force }
  robocopy $pkg $install /E /R:2 /W:2 /XD node_modules .git /XF deploy-xampp.bat update-xampp.bat verify-install.bat deploy-remote-xampp.bat install-sqlite-xampp.bat /NFL /NDL /NP | Out-Null
  if (Test-Path (Join-Path $bak "data")) {
    if (Test-Path (Join-Path $install "data")) { Remove-Item (Join-Path $install "data") -Recurse -Force }
    robocopy (Join-Path $bak "data") (Join-Path $install "data") /E /NFL /NDL /NJH /NJS | Out-Null
  }
  if (Test-Path (Join-Path $bak "uploads")) {
    if (Test-Path (Join-Path $install "uploads")) { Remove-Item (Join-Path $install "uploads") -Recurse -Force }
    robocopy (Join-Path $bak "uploads") (Join-Path $install "uploads") /E /NFL /NDL /NJH /NJS | Out-Null
  }
}

@(
  ("VITE_BASE_PATH=/" + $sub)
  ("VITE_API_BASE=/" + $sub + "/api")
) | Set-Content (Join-Path $install ".env") -Encoding ASCII
New-Item -ItemType Directory -Force -Path (Join-Path $install "data"), (Join-Path $install "uploads"), (Join-Path $install "logs") | Out-Null

$sqliteBat = Join-Path $pkg "install-sqlite-xampp.bat"
if (Test-Path $sqliteBat) {
  Log "install-sqlite-xampp.bat"
  & cmd.exe /c "`"$sqliteBat`" `"$xampp`" quiet"
}

if ($doHarden -eq "1") {
  $harden = Join-Path $install "scripts\harden-xampp-target.ps1"
  if (-not (Test-Path $harden)) { $harden = Join-Path $pkg "scripts\harden-xampp-target.ps1" }
  if (Test-Path $harden) {
    Log "harden-xampp-target.ps1"
    powershell -NoProfile -ExecutionPolicy Bypass -File $harden -XamppRoot $xampp -InstallDir $install -RestartApache
  } else {
    Log "harden script missing"
  }
}

if (-not (Get-Service Apache2.4 -ErrorAction SilentlyContinue)) {
  if (Test-Path (Join-Path $xampp "apache\bin\httpd.exe")) {
    Log "installing Apache2.4 service"
    Push-Location (Join-Path $xampp "apache\bin")
    & .\httpd.exe -k install -n Apache2.4 2>&1 | Out-File "__REMOTE_DRIVE__\Temp\linknest-remote-deploy\apache-install.txt"
    Pop-Location
  }
}
try {
  Set-Service Apache2.4 -StartupType Automatic -ErrorAction SilentlyContinue
  Start-Service Apache2.4 -ErrorAction Stop
  Log "Apache started"
} catch {
  Log ("Apache start: " + $_.Exception.Message)
  if (Test-Path (Join-Path $xampp "apache\bin\httpd.exe")) {
    Push-Location (Join-Path $xampp "apache\bin")
    & .\httpd.exe -k start -n Apache2.4 2>&1 | Out-Null
    Pop-Location
  }
}

Get-Service Apache2.4 -ErrorAction SilentlyContinue | Format-List Name,Status | Out-File "__REMOTE_DRIVE__\Temp\linknest-remote-deploy\apache-service.txt"
if (Test-Path (Join-Path $xampp "php\php.exe")) {
  & (Join-Path $xampp "php\php.exe") -v 2>&1 | Out-File "__REMOTE_DRIVE__\Temp\linknest-remote-deploy\php-v.txt"
}
Log "DONE"
"DONE" | Out-File "__REMOTE_DRIVE__\Temp\linknest-remote-deploy\worker-done.txt"
'@
    $worker = $worker.Replace("__REMOTE_DRIVE__", $remoteDrive).Replace("__XAMPP_ROOT__", $XamppRoot).Replace("__SUBFOLDER__", $Subfolder).Replace("__MODE__", $Mode).Replace("__DO_HARDEN__", $hardenFlag)

    $workerUnc = Join-Path $remoteTempUnc "worker.ps1"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($workerUnc, $worker, $utf8NoBom)

    $taskName = "LinkNestRemoteDeploy"
    Write-Step "Scheduling elevated remote worker..."
    schtasks /Create /S $ComputerName /U $UserName /P $Password /TN $taskName /TR "powershell -NoProfile -ExecutionPolicy Bypass -File $remoteTempLocal\worker.ps1" /SC ONCE /ST 00:00 /RL HIGHEST /F /RU $UserName /RP $Password | Out-Null
    schtasks /Run /S $ComputerName /U $UserName /P $Password /TN $taskName | Out-Null
    Write-OK "remote task started"

    $deadline = (Get-Date).AddMinutes(15)
    $doneUnc = Join-Path $remoteTempUnc "worker-done.txt"
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $doneUnc) { break }
        Start-Sleep -Seconds 3
    }
    if (-not (Test-Path $doneUnc)) {
        $logUnc = Join-Path $remoteTempUnc "worker.log"
        if (Test-Path $logUnc) { Write-Host (Get-Content $logUnc -Raw) }
        throw "Remote worker did not finish within 15 minutes"
    }
    Write-OK "remote worker finished"
    $logUnc = Join-Path $remoteTempUnc "worker.log"
    if (Test-Path $logUnc) {
        Write-Host ""
        Write-Host "---- remote log (tail) ----" -ForegroundColor Gray
        Get-Content $logUnc -Tail 40
        Write-Host "---------------------------" -ForegroundColor Gray
    }

    if (-not $SkipSmokeTest) {
        Write-Step "Smoke tests..."
        $base = "http://$ComputerName/$Subfolder"
        Start-Sleep -Seconds 2
        foreach ($path in @("/", "/api/tiles", "/BUILD_INFO.json")) {
            try {
                $r = Invoke-WebRequest -Uri ($base.TrimEnd('/') + $path) -UseBasicParsing -TimeoutSec 30
                Write-OK ("{0} -> {1}" -f $path, $r.StatusCode)
            } catch {
                Write-Warn ("{0} -> {1}" -f $path, $_.Exception.Message)
            }
        }
        try {
            $body = '{"tileId":"tile_dashboard"}'
            $r = Invoke-WebRequest -Uri ($base.TrimEnd('/') + "/api/linkhealth/check-tile") -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 90
            Write-OK ("check-tile -> {0} {1}" -f $r.StatusCode, $r.Content.Substring(0, [Math]::Min(60, $r.Content.Length)))
        } catch {
            Write-Warn ("check-tile -> " + $_.Exception.Message)
        }
    }

    Write-Host ""
    Write-OK ("Open http://{0}/{1}/" -f $ComputerName, $Subfolder)
    Write-Host "  Tip: run upgrade-xampp-php.bat on the target if PHP is still < 8.5" -ForegroundColor Yellow
    Write-Host ""
}
finally {
    if ($mapped) {
        net use $uncRoot /delete /y 2>$null | Out-Null
    }
}

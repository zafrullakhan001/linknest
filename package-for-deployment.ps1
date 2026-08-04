#Requires -Version 5.1
<#
.SYNOPSIS
    LinkNest Deployment Packager
.DESCRIPTION
    Clean-builds the React frontend with the correct base path, gathers all
    runtime files, stamps BUILD_INFO.json (for PWA cache busting), and produces
    a self-contained ZIP ready to deploy/update on another XAMPP machine.
.PARAMETER SkipBuild
    Skip the npm build step (use existing dist/). Not recommended when shipping code changes.
.PARAMETER ExcludeUploads
    Do not include the uploads/ directory in the package.
.PARAMETER OutputDir
    Where to save the final ZIP. Defaults to the project root.
.PARAMETER BasePath
    Vite base path baked into the frontend. Default: /linknest
.EXAMPLE
    .\package-for-deployment.ps1
    .\package-for-deployment.ps1 -BasePath "/myapp"
    .\package-for-deployment.ps1 -OutputDir "E:\"
#>
param(
    [switch]$SkipBuild,
    [switch]$ExcludeUploads,
    [string]$OutputDir = "",
    [string]$BasePath = "/linknest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
#  Paths
# ---------------------------------------------------------------------------
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$PackageName = "linknest-deploy-$Timestamp"
$TempDir = Join-Path $env:TEMP $PackageName
$BuildId = $Timestamp

# Normalize base path: /linknest (no trailing slash)
$BasePath = "/" + ($BasePath.Trim().Trim("/").Replace("\", "/"))
if ($BasePath -eq "/") { $BasePath = "" }

if ($OutputDir -ne "") {
    $ZipOutput = Join-Path $OutputDir "$PackageName.zip"
}
else {
    $ZipOutput = Join-Path $ProjectRoot "$PackageName.zip"
}

# ---------------------------------------------------------------------------
#  Helper functions  (ASCII-only output to avoid encoding issues)
# ---------------------------------------------------------------------------
function Write-Header([string]$msg) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

function Write-OK([string]$msg) {
    Write-Host "  [OK]  $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "  [!!]  $msg" -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host "  [XX]  $msg" -ForegroundColor Red
}

function Write-Step([string]$msg) {
    Write-Host "   ->   $msg" -ForegroundColor White
}

function Ensure-Dir([string]$path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

function Get-FileSha256([string]$path) {
    # Use .NET directly — Get-FileHash is missing in some hosted/constrained PowerShell hosts.
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($path)
        try {
            $hashBytes = $sha.ComputeHash($stream)
            $hex = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
            return $hex.Substring(0, 12)
        }
        finally {
            $stream.Dispose()
        }
    }
    finally {
        $sha.Dispose()
    }
}

# ---------------------------------------------------------------------------
#  Banner
# ---------------------------------------------------------------------------
Clear-Host
Write-Host ""
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host "     LinkNest - Deployment Packager"           -ForegroundColor Magenta
Write-Host "     $(Get-Date -Format 'yyyy-MM-dd  HH:mm:ss')"                  -ForegroundColor Magenta
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Project Root : $ProjectRoot" -ForegroundColor Gray
Write-Host "  Package Name : $PackageName" -ForegroundColor Gray
Write-Host "  Base Path    : $(if ($BasePath) { $BasePath } else { '/' })" -ForegroundColor Gray
Write-Host "  Build ID     : $BuildId" -ForegroundColor Gray
Write-Host "  Output ZIP   : $ZipOutput"   -ForegroundColor Gray
Write-Host ""

# ---------------------------------------------------------------------------
#  0. Sanity checks
# ---------------------------------------------------------------------------
Write-Header "0 / Sanity Checks"

if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    Write-Err "Cannot find package.json. Run this script from the linknest project root."
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeVer = $null
try { $nodeVer = (node --version 2>&1) } catch { }
if ((-not $SkipBuild) -and (-not $nodeVer)) {
    Write-Err "Node.js is not installed or not in PATH. Install Node.js or run with -SkipBuild."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-OK "Project root looks correct"
if ($nodeVer) { Write-OK "Node.js found: $nodeVer" }

# ---------------------------------------------------------------------------
#  1. Build frontend (always clean unless SkipBuild)
# ---------------------------------------------------------------------------
Write-Header "1 / Build React Frontend"

Push-Location $ProjectRoot
try {
    if ($SkipBuild) {
        Write-Warn "Skipping build (-SkipBuild flag was set)"
        if (-not (Test-Path (Join-Path $ProjectRoot "dist\index.html"))) {
            Write-Err "No existing dist/index.html - cannot package without a build."
            exit 1
        }
        Write-OK "Using existing dist/ directory"
    }
    else {
        $distPath = Join-Path $ProjectRoot "dist"
        if (Test-Path $distPath) {
            Write-Step "Removing old dist/ so stale hashed assets cannot ship..."
            Remove-Item $distPath -Recurse -Force
            Write-OK "Old dist/ removed"
        }

        Write-Step "Running: npm install ..."
        cmd /c "npm install"
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
        Write-OK "npm install completed"

        # Force the subdirectory base path into the process env so Vite
        # cannot silently build for "/" when .env is missing/outdated.
        if ($BasePath) {
            $env:VITE_BASE_PATH = $BasePath
            $env:VITE_API_BASE = "$BasePath/api"
        }
        else {
            $env:VITE_BASE_PATH = ""
            $env:VITE_API_BASE = "/api"
        }

        Write-Step "Running: npm run build:prod (VITE_BASE_PATH=$($env:VITE_BASE_PATH)) ..."
        cmd /c "npm run build:prod"
        if ($LASTEXITCODE -ne 0) { throw "npm run build:prod failed with exit code $LASTEXITCODE" }
        Write-OK "Build completed - dist/ is ready"
    }
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
#  1b. Verify built frontend (catch broken packages early)
# ---------------------------------------------------------------------------
Write-Header "1b / Verify Built Frontend"

$distIndex = Join-Path $ProjectRoot "dist\index.html"
if (-not (Test-Path $distIndex)) {
    Write-Err "dist/index.html missing after build."
    exit 1
}

$distHtml = Get-Content $distIndex -Raw
if ($distHtml -match '/index\.tsx') {
    Write-Err "dist/index.html still references /index.tsx - this is a DEV shell, not a production build."
    Write-Err "Aborting so you do not ship a broken/stale bundle."
    exit 1
}
if ($distHtml -notmatch 'assets/.+\.(js|css)') {
    Write-Err "dist/index.html does not reference hashed assets under assets/."
    exit 1
}

$assetJs = @(Get-ChildItem (Join-Path $ProjectRoot "dist\assets") -Recurse -Filter "*.js" -ErrorAction SilentlyContinue)
if ($assetJs.Count -lt 1) {
    Write-Err "No JS files found under dist/assets/. Build looks incomplete."
    exit 1
}

# Confirm base path was baked in when using a subfolder
if ($BasePath -and ($distHtml -notmatch [regex]::Escape($BasePath))) {
    Write-Warn "Built HTML does not mention '$BasePath'. Assets may break when hosted under that subfolder."
}

$assetCount = $assetJs.Count
Write-OK ("Production dist/ verified ({0} JS assets)" -f $assetCount)

# Ensure public SW lands in dist (Vite usually copies public/, but be explicit)
$swPublic = Join-Path $ProjectRoot "public\sw-cache-first.js"
$swDist = Join-Path $ProjectRoot "dist\sw-cache-first.js"
if (Test-Path $swPublic) {
    Copy-Item $swPublic $swDist -Force
    Write-OK "dist/sw-cache-first.js refreshed from public/"
}

# ---------------------------------------------------------------------------
#  2. Prepare staging directory
# ---------------------------------------------------------------------------
Write-Header "2 / Prepare Staging Directory"

if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
Ensure-Dir $TempDir
Write-OK "Staging dir created: $TempDir"

# ---------------------------------------------------------------------------
#  3. Copy source files
# ---------------------------------------------------------------------------
Write-Header "3 / Copy Source Files"

$DirsToInclude = @(
    "api",
    "components",
    "contexts",
    "services",
    "hooks",
    "config",
    "migrations",
    "public",
    "src",
    "analytics",
    "monitorv2",
    "docker",
    "land",
    "vendor"   # OneLogin php-saml (+ xmlseclibs) required for SAML 2.0
)

$FilesToInclude = @(
    "index.html",
    "index.tsx",
    "index.css",
    "App.tsx",
    "types.ts",
    "router.php",
    "landing.php",
    "clones.php",
    "backup_restore.php",
    ".htaccess",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "vite.docker.config.ts",
    "vite.runtime.config.ts",
    "tsconfig.json",
    "tailwind.config.js",
    "postcss.config.js",
    "composer.json",
    "composer.lock",
    "sw-cache-first.php",
    "metadata.json"
)

# Exclude junk that commonly sneaks into recursive copies
$ExcludeDirNames = @("node_modules", ".git", "__pycache__", ".vite", "dist", "linknest-deploy-*")

foreach ($dir in $DirsToInclude) {
    $src = Join-Path $ProjectRoot $dir
    $dst = Join-Path $TempDir $dir
    if (Test-Path $src) {
        Write-Step "Copying $dir/ ..."
        # Robocopy is more reliable than Copy-Item for large trees and skips node_modules.
        $null = robocopy $src $dst /E /NFL /NDL /NJH /NJS /nc /ns /np `
            /XD node_modules .git __pycache__ .vite dist
        if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $dir/ (exit $LASTEXITCODE)" }
        Write-OK "$dir/ copied"
    }
    else {
        Write-Warn "$dir/ not found, skipping"
    }
}

Write-Step "Copying root-level source files..."
$copiedFiles = 0
$skippedFiles = 0
foreach ($file in $FilesToInclude) {
    $src = Join-Path $ProjectRoot $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $TempDir $file) -Force
        $copiedFiles++
    }
    else {
        Write-Warn "Optional file not found, skipping: $file"
        $skippedFiles++
    }
}
Write-OK ("{0} root files copied ({1} skipped)" -f $copiedFiles, $skippedFiles)

# Verify SAML library ships with the package (avoids "OneLogin library not loaded" on target)
$samlAutoload = Join-Path $TempDir "vendor\autoload.php"
$samlAuthClass = Join-Path $TempDir "vendor\onelogin\php-saml\src\OneLogin\Saml2\Auth.php"
$samlAuthLib = Join-Path $TempDir "vendor\onelogin\php-saml\lib\Saml2\Auth.php"
if (-not (Test-Path $samlAutoload)) {
    Write-Warn "vendor/autoload.php missing - SAML will not work on the target until you run composer install"
}
elseif ((Test-Path $samlAuthClass) -or (Test-Path $samlAuthLib)) {
    Write-OK "SAML OneLogin library bundled (vendor/)"
}
else {
    Write-Warn "vendor/ present but OneLogin Auth.php not found - check vendor/onelogin/php-saml"
}

# ---------------------------------------------------------------------------
#  4. Copy built frontend (dist/) - wipe then copy
# ---------------------------------------------------------------------------
Write-Header "4 / Copy Built Frontend (dist/)"

$distSrc = Join-Path $ProjectRoot "dist"
$distDst = Join-Path $TempDir "dist"
if (Test-Path $distSrc) {
    if (Test-Path $distDst) { Remove-Item $distDst -Recurse -Force }
    Copy-Item -Path $distSrc -Destination $distDst -Recurse -Force
    $distBytes = (Get-ChildItem $distDst -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $distKB = [math]::Round($distBytes / 1KB, 1)
    Write-OK ("dist/ copied ({0} KB total)" -f $distKB)
}
else {
    Write-Err "dist/ not found - cannot create a deployable package"
    exit 1
}

# ---------------------------------------------------------------------------
#  5. Copy SQLite Database
# ---------------------------------------------------------------------------
Write-Header "5 / Copy SQLite Database"

Ensure-Dir (Join-Path $TempDir "data")

$dbCopied = $false
$dbCandidates = @(
    (Join-Path $ProjectRoot "data\linknest.db"),
    (Join-Path $ProjectRoot "linknest.db")
)

foreach ($dbPath in $dbCandidates) {
    if (Test-Path $dbPath) {
        $dbDst = Join-Path $TempDir "data\linknest.db"
        Copy-Item -Path $dbPath -Destination $dbDst -Force
        $dbMB = [math]::Round((Get-Item $dbPath).Length / 1MB, 2)
        Write-OK ("Database copied: {0}  ({1} MB)" -f $dbPath, $dbMB)
        $dbCopied = $true
        break
    }
}

$appDbSrc = Join-Path $ProjectRoot "data\app.db"
if (Test-Path $appDbSrc) {
    Copy-Item -Path $appDbSrc -Destination (Join-Path $TempDir "data\app.db") -Force
    Write-OK "app.db also copied"
}

if (-not $dbCopied) {
    Write-Warn "No SQLite database found. A fresh database will be created on first launch."
}

# Ensure portable encryption key exists (LDAP bind passwords survive path/machine moves)
$encKeySrc = Join-Path $ProjectRoot "data\.encryption_key"
if (-not (Test-Path $encKeySrc)) {
    # Seed with the same material PHP used historically (absolute DB path + salt)
    $dbForKey = Join-Path $ProjectRoot "data\linknest.db"
    if (-not (Test-Path $dbForKey)) { $dbForKey = Join-Path $ProjectRoot "linknest.db" }
    if (Test-Path $dbForKey) {
        $keyMaterial = ((Resolve-Path $dbForKey).Path) + "linknest_ldap_encryption_salt_v1"
        # Write without BOM so PHP trim/hash matches
        [System.IO.File]::WriteAllText($encKeySrc, $keyMaterial, (New-Object System.Text.UTF8Encoding $false))
        Write-OK "Created data\.encryption_key for portable LDAP password decrypt"
    }
}
if (Test-Path $encKeySrc) {
    Copy-Item -Path $encKeySrc -Destination (Join-Path $TempDir "data\.encryption_key") -Force
    Write-OK "Encryption key copied (data\.encryption_key)"
}

$gitkeepSrc = Join-Path $ProjectRoot "data\.gitkeep"
if (Test-Path $gitkeepSrc) {
    Copy-Item -Path $gitkeepSrc -Destination (Join-Path $TempDir "data\.gitkeep") -Force
}

# ---------------------------------------------------------------------------
#  6. Copy uploads (logos, favicons, etc.)
# ---------------------------------------------------------------------------
Write-Header "6 / Copy Uploads"

$uploadsSrc = Join-Path $ProjectRoot "uploads"
$uploadsDst = Join-Path $TempDir "uploads"

if (-not $ExcludeUploads) {
    if (Test-Path $uploadsSrc) {
        Copy-Item -Path $uploadsSrc -Destination $uploadsDst -Recurse -Force
        $upBytes = (Get-ChildItem $uploadsDst -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if (-not $upBytes) { $upBytes = 0 }
        $upKB = [math]::Round($upBytes / 1KB, 1)
        Write-OK ("uploads/ copied ({0} KB)" -f $upKB)
    }
    else {
        Write-Warn "uploads/ directory not found - creating empty placeholder"
        Ensure-Dir $uploadsDst
    }
}
else {
    Write-Warn "Skipping uploads/ (-ExcludeUploads flag was set)"
    Ensure-Dir $uploadsDst
}

# ---------------------------------------------------------------------------
#  7. Copy scripts/
# ---------------------------------------------------------------------------
Write-Header "7 / Copy Deployment Scripts"

$scriptsSrc = Join-Path $ProjectRoot "scripts"
$scriptsDst = Join-Path $TempDir "scripts"
if (Test-Path $scriptsSrc) {
    $null = robocopy $scriptsSrc $scriptsDst /E /NFL /NDL /NJH /NJS /nc /ns /np /XD __pycache__
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed for scripts/ (exit $LASTEXITCODE)" }
    Write-OK "scripts/ copied"
}
else {
    Write-Warn "scripts/ not found, skipping"
}

# ---------------------------------------------------------------------------
#  7b. Write BUILD_INFO.json (used by SW to bust PWA caches)
# ---------------------------------------------------------------------------
Write-Header "7b / Stamp BUILD_INFO.json"

$indexAssetMatch = [regex]::Match($distHtml, 'assets/js/index-[^"''\s]+\.js')
$indexAsset = if ($indexAssetMatch.Success) { $indexAssetMatch.Value } else { "" }
$indexHash = Get-FileSha256 $distIndex

$buildInfo = [ordered]@{
    buildId     = $BuildId
    builtAt     = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    packageName = $PackageName
    basePath    = $(if ($BasePath) { $BasePath } else { "/" })
    indexAsset  = $indexAsset
    indexSha12  = $indexHash
    jsAssetCount = $assetJs.Count
}
$buildInfoJson = $buildInfo | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $TempDir "BUILD_INFO.json") -Value $buildInfoJson -Encoding UTF8
# Also keep a copy inside dist for easy discovery
Set-Content -Path (Join-Path $TempDir "dist\BUILD_INFO.json") -Value $buildInfoJson -Encoding UTF8
Write-OK ("BUILD_INFO.json written (buildId={0}, {1})" -f $BuildId, $indexAsset)

# Write a small .env template so manual deploys get the correct base path
$envTemplate = @"
VITE_BASE_PATH=$(if ($BasePath) { $BasePath } else { "" })
VITE_API_BASE=$(if ($BasePath) { "$BasePath/api" } else { "/api" })
"@
Set-Content -Path (Join-Path $TempDir ".env") -Value $envTemplate -Encoding ASCII
Write-OK ".env written for target base path"

# ---------------------------------------------------------------------------
#  8. Write deployment guide and helper scripts into the package
# ---------------------------------------------------------------------------
Write-Header "8 / Generating Deployment Files"

$basePathForBat = if ($BasePath) { $BasePath.TrimStart("/") } else { "linknest" }

# ── deploy-xampp.bat (fresh install — wipes target folder) ─────────────────
$deployBat = @"
@echo off
setlocal enabledelayedexpansion
REM ==========================================================
REM  LinkNest XAMPP Deployment Script (Windows) — FRESH INSTALL
REM  Wipes the target folder, then copies this package in.
REM  Prefer update-xampp.bat if you want to KEEP data/uploads.
REM ==========================================================
echo.
echo  =============================================
echo     LinkNest - XAMPP Fresh Deploy (Windows)
echo     Package build: $BuildId
echo  =============================================
echo.

set "XAMPP_ROOT=C:\xampp"
set /p "XAMPP_ROOT=XAMPP install path (press Enter for C:\xampp): "
if "%XAMPP_ROOT%"=="" set "XAMPP_ROOT=C:\xampp"
set "HTDOCS=%XAMPP_ROOT%\htdocs"

set "SUBFOLDER=$basePathForBat"
set /p "SUBFOLDER=Install subfolder inside htdocs (press Enter for '$basePathForBat'): "
if "%SUBFOLDER%"=="" set "SUBFOLDER=$basePathForBat"

set "INSTALL_DIR=%HTDOCS%\%SUBFOLDER%"
echo.
echo  XAMPP root  : %XAMPP_ROOT%
echo  Install dir : %INSTALL_DIR%
echo  URL will be : http://localhost/%SUBFOLDER%
echo  Build ID    : $BuildId
echo.

if not exist "%HTDOCS%" (
    echo  ERROR: Cannot find %HTDOCS%
    pause
    exit /b 1
)

if exist "%INSTALL_DIR%" (
    echo  Removing old installation at %INSTALL_DIR% ...
    rd /s /q "%INSTALL_DIR%"
)
mkdir "%INSTALL_DIR%"
echo  [OK] Install directory ready

echo  Copying application files...
set "PKG_DIR=%~dp0"
if "%PKG_DIR:~-1%"=="\" set "PKG_DIR=%PKG_DIR:~0,-1%"

xcopy "%PKG_DIR%\*" "%INSTALL_DIR%\" /E /I /Y /Q >nul
if exist "%INSTALL_DIR%\deploy-xampp.bat" del /f /q "%INSTALL_DIR%\deploy-xampp.bat"
if exist "%INSTALL_DIR%\deploy-xampp.sh" del /f /q "%INSTALL_DIR%\deploy-xampp.sh"
if exist "%INSTALL_DIR%\update-xampp.bat" del /f /q "%INSTALL_DIR%\update-xampp.bat"
echo  [OK] Files copied

(
echo VITE_BASE_PATH=/%SUBFOLDER%
echo VITE_API_BASE=/%SUBFOLDER%/api
) > "%INSTALL_DIR%\.env"
echo  [OK] .env written  (VITE_BASE_PATH=/%SUBFOLDER%)

if not exist "%INSTALL_DIR%\data"    mkdir "%INSTALL_DIR%\data"
if not exist "%INSTALL_DIR%\uploads" mkdir "%INSTALL_DIR%\uploads"
if not exist "%INSTALL_DIR%\logs"    mkdir "%INSTALL_DIR%\logs"

if /i NOT "%SUBFOLDER%"=="$basePathForBat" (
    echo.
    echo  NOTE: Subfolder differs from packaged base '$basePathForBat'.
    echo  Checking for Node.js to rebuild frontend...
    node --version >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        cd /d "%INSTALL_DIR%"
        set "VITE_BASE_PATH=/%SUBFOLDER%"
        set "VITE_API_BASE=/%SUBFOLDER%/api"
        call npm install
        call npm run build:prod
        if !ERRORLEVEL! EQU 0 (
            echo  [OK] Frontend rebuilt for /%SUBFOLDER%
        ) else (
            echo  [!!] Build failed. Run npm install ^&^& npm run build:prod manually.
        )
    ) else (
        echo  [!!] Node.js not found. Use subfolder '$basePathForBat' or rebuild on a machine with Node.
    )
)

echo.
echo  =============================================
echo  Deployment Complete!  Build: $BuildId
echo  =============================================
echo.
echo  1. Start Apache in XAMPP
echo  2. Open: http://localhost/%SUBFOLDER%
echo  3. Hard refresh once (Ctrl+F5) if you still see the old UI
echo  4. Confirm build: open http://localhost/%SUBFOLDER%/BUILD_INFO.json
echo  5. Default login: admin / admin123 — change it immediately
echo.
pause
"@

# ── update-xampp.bat (KEEP data/uploads — recommended for upgrades) ───────
$updateBat = @"
@echo off
setlocal enabledelayedexpansion
REM ==========================================================
REM  LinkNest XAMPP UPDATE Script (Windows)
REM  Replaces app code + dist, PRESERVES data/ and uploads/.
REM  Use this when manually deploying a new bundle over an
REM  existing install (fixes "old UI still showing").
REM ==========================================================
echo.
echo  =============================================
echo     LinkNest - XAMPP Update (preserve data)
echo     Package build: $BuildId
echo  =============================================
echo.

set "XAMPP_ROOT=C:\xampp"
set /p "XAMPP_ROOT=XAMPP install path (press Enter for C:\xampp): "
if "%XAMPP_ROOT%"=="" set "XAMPP_ROOT=C:\xampp"
set "HTDOCS=%XAMPP_ROOT%\htdocs"

set "SUBFOLDER=$basePathForBat"
set /p "SUBFOLDER=Existing install subfolder (press Enter for '$basePathForBat'): "
if "%SUBFOLDER%"=="" set "SUBFOLDER=$basePathForBat"

set "INSTALL_DIR=%HTDOCS%\%SUBFOLDER%"
echo.
echo  Updating : %INSTALL_DIR%
echo  Build ID : $BuildId
echo.

if not exist "%INSTALL_DIR%" (
    echo  ERROR: %INSTALL_DIR% does not exist.
    echo  Use deploy-xampp.bat for a fresh install instead.
    pause
    exit /b 1
)

set "PKG_DIR=%~dp0"
if "%PKG_DIR:~-1%"=="\" set "PKG_DIR=%PKG_DIR:~0,-1%"

set "BACKUP_DIR=%TEMP%\linknest-update-backup-%RANDOM%"
mkdir "%BACKUP_DIR%" >nul 2>&1

echo  Backing up data/ and uploads/ ...
if exist "%INSTALL_DIR%\data" (
    xcopy "%INSTALL_DIR%\data" "%BACKUP_DIR%\data\" /E /I /Y /Q >nul
    echo  [OK] data/ backed up
)
if exist "%INSTALL_DIR%\uploads" (
    xcopy "%INSTALL_DIR%\uploads" "%BACKUP_DIR%\uploads\" /E /I /Y /Q >nul
    echo  [OK] uploads/ backed up
)

echo  Wiping old dist/ so stale hashed assets cannot remain ...
if exist "%INSTALL_DIR%\dist" rd /s /q "%INSTALL_DIR%\dist"

echo  Copying updated application files (excluding deploy helpers)...
REM Copy everything from package, then restore data/uploads
xcopy "%PKG_DIR%\*" "%INSTALL_DIR%\" /E /I /Y /Q >nul
if exist "%INSTALL_DIR%\deploy-xampp.bat" del /f /q "%INSTALL_DIR%\deploy-xampp.bat"
if exist "%INSTALL_DIR%\deploy-xampp.sh" del /f /q "%INSTALL_DIR%\deploy-xampp.sh"
if exist "%INSTALL_DIR%\update-xampp.bat" del /f /q "%INSTALL_DIR%\update-xampp.bat"

echo  Restoring preserved data/ and uploads/ ...
if exist "%BACKUP_DIR%\data" (
    if exist "%INSTALL_DIR%\data" rd /s /q "%INSTALL_DIR%\data"
    xcopy "%BACKUP_DIR%\data" "%INSTALL_DIR%\data\" /E /I /Y /Q >nul
    echo  [OK] data/ restored
)
if exist "%BACKUP_DIR%\uploads" (
    if exist "%INSTALL_DIR%\uploads" rd /s /q "%INSTALL_DIR%\uploads"
    xcopy "%BACKUP_DIR%\uploads" "%INSTALL_DIR%\uploads\" /E /I /Y /Q >nul
    echo  [OK] uploads/ restored
)

rd /s /q "%BACKUP_DIR%" >nul 2>&1

(
echo VITE_BASE_PATH=/%SUBFOLDER%
echo VITE_API_BASE=/%SUBFOLDER%/api
) > "%INSTALL_DIR%\.env"

if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"

echo.
echo  =============================================
echo  Update Complete!  Build: $BuildId
echo  =============================================
echo.
echo  VERIFY the new build is live:
echo    http://localhost/%SUBFOLDER%/BUILD_INFO.json
echo    Expect buildId = $BuildId
echo.
echo  If Semi-PWA is enabled, do ONE hard refresh (Ctrl+F5)
echo  so the service worker picks up the new cache version.
echo.
echo  Tip: restart Apache if PHP still serves oddly stale code.
echo.
pause
"@

# ── deploy-xampp.sh (Linux/macOS) ──────────────────────────────────────────
$deploySh = @"
#!/usr/bin/env bash
set -euo pipefail
PKG_DIR="`$(cd "`$(dirname "`${BASH_SOURCE[0]}")" && pwd)"
BUILD_ID="$BuildId"
DEFAULT_SUB="$basePathForBat"

echo ""
echo "  ============================================="
echo "     LinkNest - XAMPP Deploy (Linux/macOS)"
echo "     Package build: `$BUILD_ID"
echo "  ============================================="
echo ""

read -rp "  XAMPP install path [/opt/lampp]: " XAMPP_ROOT
XAMPP_ROOT="`${XAMPP_ROOT:-/opt/lampp}"
HTDOCS="`$XAMPP_ROOT/htdocs"

read -rp "  Install subfolder inside htdocs [`$DEFAULT_SUB]: " SUBFOLDER
SUBFOLDER="`${SUBFOLDER:-`$DEFAULT_SUB}"
INSTALL_DIR="`$HTDOCS/`$SUBFOLDER"

if [ ! -d "`$HTDOCS" ]; then
    echo "  ERROR: Cannot find `$HTDOCS"
    exit 1
fi

if [ -d "`$INSTALL_DIR" ]; then
    echo "  Backing up data/uploads then replacing install..."
    BACKUP_DIR="`$(mktemp -d)"
    [ -d "`$INSTALL_DIR/data" ] && cp -a "`$INSTALL_DIR/data" "`$BACKUP_DIR/" || true
    [ -d "`$INSTALL_DIR/uploads" ] && cp -a "`$INSTALL_DIR/uploads" "`$BACKUP_DIR/" || true
    rm -rf "`$INSTALL_DIR"
    mkdir -p "`$INSTALL_DIR"
else
    mkdir -p "`$INSTALL_DIR"
    BACKUP_DIR=""
fi

cp -a "`$PKG_DIR"/. "`$INSTALL_DIR/"
rm -f "`$INSTALL_DIR/deploy-xampp.sh" "`$INSTALL_DIR/deploy-xampp.bat" "`$INSTALL_DIR/update-xampp.bat"

if [ -n "`$BACKUP_DIR" ]; then
    [ -d "`$BACKUP_DIR/data" ] && rm -rf "`$INSTALL_DIR/data" && cp -a "`$BACKUP_DIR/data" "`$INSTALL_DIR/"
    [ -d "`$BACKUP_DIR/uploads" ] && rm -rf "`$INSTALL_DIR/uploads" && cp -a "`$BACKUP_DIR/uploads" "`$INSTALL_DIR/"
    rm -rf "`$BACKUP_DIR"
fi

cat > "`$INSTALL_DIR/.env" <<ENVEOF
VITE_BASE_PATH=/`$SUBFOLDER
VITE_API_BASE=/`$SUBFOLDER/api
ENVEOF

mkdir -p "`$INSTALL_DIR/data" "`$INSTALL_DIR/uploads" "`$INSTALL_DIR/logs"
chmod -R 755 "`$INSTALL_DIR"
chmod -R 777 "`$INSTALL_DIR/data" "`$INSTALL_DIR/uploads" "`$INSTALL_DIR/logs" 2>/dev/null || true

if [ "`$SUBFOLDER" != "`$DEFAULT_SUB" ]; then
    if command -v node &>/dev/null; then
        cd "`$INSTALL_DIR"
        export VITE_BASE_PATH="/`$SUBFOLDER"
        export VITE_API_BASE="/`$SUBFOLDER/api"
        npm install
        npm run build:prod
    else
        echo "  [!!] Node.js not found; use subfolder `$DEFAULT_SUB or rebuild manually."
    fi
fi

echo ""
echo "  Done. Verify: http://localhost/`$SUBFOLDER/BUILD_INFO.json (buildId=`$BUILD_ID)"
echo "  Hard refresh (Ctrl+F5) once if the old UI still appears."
echo ""
"@

$createdAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$readmeMd = @"
# LinkNest - Deployment Package

Created : $createdAt
Package : $PackageName
Build ID: $BuildId
Base    : $(if ($BasePath) { $BasePath } else { "/" })

---

## Important: why updates sometimes looked "stuck"

If Semi-PWA is enabled, the browser service worker uses cache-first.
This package stamps a unique **buildId** into ``BUILD_INFO.json``. The
service worker cache name includes that id, so a new deploy automatically
invalidates the old UI cache.

After updating, open:
``http://localhost/YOUR_SUBFOLDER/BUILD_INFO.json``

If ``buildId`` is not ``$BuildId``, the new files are not where Apache is serving from.

---

## Recommended upgrade (keep database)

1. Extract this ZIP anywhere.
2. Run **update-xampp.bat** (Windows).
3. It wipes old ``dist/``, copies the new app, and restores ``data/`` + ``uploads/``.
4. Hard refresh once (Ctrl+F5).
5. Confirm ``BUILD_INFO.json`` shows buildId ``$BuildId``.

## Fresh install

1. Run **deploy-xampp.bat** (wipes the target folder completely).
2. Start Apache and open ``http://localhost/$basePathForBat``.

## Manual copy (if you must)

Do **not** merge folders blindly. Always:

1. Delete the target ``dist/`` folder completely first.
2. Copy the new package files over.
3. Keep existing ``data/`` and ``uploads/`` if you need them.
4. Copy ``BUILD_INFO.json`` and ``sw-cache-first.php`` / ``public/sw-cache-first.js``.
5. Hard refresh (Ctrl+F5).

---

## Default Credentials

Username : admin
Password : admin123

Change the password immediately after login.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Old UI after update | Run update-xampp.bat, then Ctrl+F5; check BUILD_INFO.json |
| Blank / wrong assets | Confirm VITE base path matches folder name; rebuild if different |
| API oddness after PHP edits | Restart Apache (clears OPcache if enabled) |
| 404 | Enable AllowOverride All + mod_rewrite in XAMPP |
| SAML: OneLogin library not loaded | Ensure ``vendor/`` was copied (autoload.php + onelogin/php-saml). Or run ``composer install`` on the server. |
"@

Set-Content -Path (Join-Path $TempDir "deploy-xampp.bat") -Value $deployBat -Encoding ASCII
Set-Content -Path (Join-Path $TempDir "update-xampp.bat") -Value $updateBat -Encoding ASCII
Set-Content -Path (Join-Path $TempDir "deploy-xampp.sh") -Value $deploySh -Encoding UTF8
Set-Content -Path (Join-Path $TempDir "DEPLOYMENT_README.md") -Value $readmeMd -Encoding UTF8

Write-OK "deploy-xampp.bat written"
Write-OK "update-xampp.bat written (preserve data - use this for upgrades)"
Write-OK "deploy-xampp.sh written"
Write-OK "DEPLOYMENT_README.md written"

# ---------------------------------------------------------------------------
#  9. Create ZIP
# ---------------------------------------------------------------------------
Write-Header "9 / Creating ZIP Archive"

if (Test-Path $ZipOutput) { Remove-Item $ZipOutput -Force }

Write-Step "Compressing -> $ZipOutput ..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $TempDir,
    $ZipOutput,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)

$zipMB = [math]::Round((Get-Item $ZipOutput).Length / 1MB, 2)
Write-OK ("ZIP created: {0}  ({1} MB)" -f $ZipOutput, $zipMB)

# ---------------------------------------------------------------------------
#  10. Cleanup
# ---------------------------------------------------------------------------
Write-Header "10 / Cleanup"
Remove-Item $TempDir -Recurse -Force
Write-OK "Staging directory cleaned up"

# ---------------------------------------------------------------------------
#  Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  =============================================" -ForegroundColor Green
Write-Host "  Packaging Complete!" -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Green
Write-Host "  ZIP     : $ZipOutput" -ForegroundColor Green
Write-Host "  Size    : $zipMB MB"  -ForegroundColor Green
Write-Host "  BuildId : $BuildId" -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  ON THE TARGET MACHINE:" -ForegroundColor Yellow
Write-Host "  - Upgrade (keep DB) : extract ZIP -> run update-xampp.bat" -ForegroundColor Yellow
Write-Host "  - Fresh install     : extract ZIP -> run deploy-xampp.bat" -ForegroundColor Yellow
Write-Host "  - Then verify       : /BUILD_INFO.json shows buildId above" -ForegroundColor Yellow
Write-Host "  - If old UI remains : Ctrl+F5 once (service worker refresh)" -ForegroundColor Yellow
Write-Host ""

$outputFolder = Split-Path $ZipOutput -Parent
if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion") {
    Start-Process explorer.exe -ArgumentList $outputFolder
}

#Requires -Version 5.1
<#
.SYNOPSIS
    LinkNest Deployment Packager
.DESCRIPTION
    Builds the React frontend, gathers all source files, copies the SQLite
    database, and produces a self-contained ZIP file ready to deploy on
    another computer running XAMPP.
.PARAMETER SkipBuild
    Skip the npm build step (use existing dist/).
.PARAMETER ExcludeUploads
    Do not include the uploads/ directory in the package.
.PARAMETER OutputDir
    Where to save the final ZIP. Defaults to the project root.
.EXAMPLE
    .\package-for-deployment.ps1
    .\package-for-deployment.ps1 -SkipBuild
    .\package-for-deployment.ps1 -OutputDir "E:\"
#>
param(
    [switch]$SkipBuild,
    [switch]$ExcludeUploads,
    [string]$OutputDir = ""
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
#  1. Build frontend
# ---------------------------------------------------------------------------
Write-Header "1 / Build React Frontend"

Push-Location $ProjectRoot
try {
    if ($SkipBuild) {
        Write-Warn "Skipping build (-SkipBuild flag was set)"
        if (-not (Test-Path (Join-Path $ProjectRoot "dist"))) {
            Write-Warn "No existing dist/ directory found - package will lack built assets."
        }
        else {
            Write-OK "Using existing dist/ directory"
        }
    }
    else {
        Write-Step "Running: npm install ..."
        cmd /c "npm install"
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
        Write-OK "npm install completed"

        Write-Step "Running: npm run build ..."
        cmd /c "npm run build"
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
        Write-OK "Build completed - dist/ is ready"
    }
}
finally {
    Pop-Location
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
    "land"
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
    "sw-cache-first.php",
    "metadata.json"
)

foreach ($dir in $DirsToInclude) {
    $src = Join-Path $ProjectRoot $dir
    $dst = Join-Path $TempDir $dir
    if (Test-Path $src) {
        Write-Step "Copying $dir/ ..."
        Copy-Item -Path $src -Destination $dst -Recurse -Force
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
Write-OK "$copiedFiles root files copied ($skippedFiles skipped)"

# ---------------------------------------------------------------------------
#  4. Copy built frontend (dist/)
# ---------------------------------------------------------------------------
Write-Header "4 / Copy Built Frontend (dist/)"

$distSrc = Join-Path $ProjectRoot "dist"
$distDst = Join-Path $TempDir "dist"
if (Test-Path $distSrc) {
    Copy-Item -Path $distSrc -Destination $distDst -Recurse -Force
    $distBytes = (Get-ChildItem $distDst -Recurse | Measure-Object -Property Length -Sum).Sum
    $distKB = [math]::Round($distBytes / 1KB, 1)
    Write-OK "dist/ copied ($distKB KB total)"
}
else {
    Write-Warn "dist/ not found - bundle will not contain pre-built frontend assets"
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
        Write-OK "Database copied: $dbPath  ($dbMB MB)"
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
        $upBytes = (Get-ChildItem $uploadsDst -Recurse | Measure-Object -Property Length -Sum).Sum
        $upKB = [math]::Round($upBytes / 1KB, 1)
        Write-OK "uploads/ copied ($upKB KB)"
    }
    else {
        Write-Warn "uploads/ directory not found - creating empty placeholder"
        Ensure-Dir $uploadsDst
    }
}
else {
    Write-Warn "Skipping uploads/ (-ExcludeUploads flag was set)"
}

# ---------------------------------------------------------------------------
#  7. Copy scripts/
# ---------------------------------------------------------------------------
Write-Header "7 / Copy Deployment Scripts"

$scriptsSrc = Join-Path $ProjectRoot "scripts"
$scriptsDst = Join-Path $TempDir "scripts"
if (Test-Path $scriptsSrc) {
    Copy-Item -Path $scriptsSrc -Destination $scriptsDst -Recurse -Force
    $pycache = Join-Path $scriptsDst "__pycache__"
    if (Test-Path $pycache) { Remove-Item $pycache -Recurse -Force }
    Write-OK "scripts/ copied"
}
else {
    Write-Warn "scripts/ not found, skipping"
}

# ---------------------------------------------------------------------------
#  8. Write deployment guide and helper scripts into the package
# ---------------------------------------------------------------------------
Write-Header "8 / Generating Deployment Files"

# ── deploy-xampp.bat (Windows target) ──────────────────────────────────────
$deployBat = @'
@echo off
setlocal enabledelayedexpansion
REM ==========================================================
REM  LinkNest XAMPP Deployment Script (Windows)
REM  Run this script ONCE on the target computer to deploy.
REM  Works in ANY htdocs subfolder - you choose the name!
REM ==========================================================
echo.
echo  =============================================
echo     LinkNest - XAMPP Deployment (Windows)
echo  =============================================
echo.

REM ---- Ask for XAMPP location -----------------------------------------
set "XAMPP_ROOT=C:\xampp"
set /p "XAMPP_ROOT=XAMPP install path (press Enter for C:\xampp): "
if "%XAMPP_ROOT%"=="" set "XAMPP_ROOT=C:\xampp"
set "HTDOCS=%XAMPP_ROOT%\htdocs"

REM ---- Ask for subfolder name -----------------------------------------
set "SUBFOLDER=linknest"
set /p "SUBFOLDER=Install subfolder inside htdocs (press Enter for 'linknest'): "
if "%SUBFOLDER%"=="" set "SUBFOLDER=linknest"

set "INSTALL_DIR=%HTDOCS%\%SUBFOLDER%"
echo.
echo  XAMPP root  : %XAMPP_ROOT%
echo  Install dir : %INSTALL_DIR%
echo  URL will be : http://localhost/%SUBFOLDER%
echo.

REM ---- Verify XAMPP ---------------------------------------------------
if not exist "%HTDOCS%" (
    echo  ERROR: Cannot find %HTDOCS%
    echo  Make sure XAMPP is installed and you entered the correct path.
    pause
    exit /b 1
)

REM ---- Create / wipe install directory --------------------------------
if exist "%INSTALL_DIR%" (
    echo  Removing old installation at %INSTALL_DIR% ...
    rd /s /q "%INSTALL_DIR%"
)
mkdir "%INSTALL_DIR%"
echo  [OK] Install directory ready

REM ---- Copy all files from this package -------------------------------
echo  Copying application files...
set "PKG_DIR=%~dp0"
if "%PKG_DIR:~-1%"=="\" set "PKG_DIR=%PKG_DIR:~0,-1%"

for %%D in (api components contexts services dist docker data uploads scripts analytics monitorv2 hooks config migrations public src land) do (
    if exist "%PKG_DIR%\%%D" (
        xcopy "%PKG_DIR%\%%D" "%INSTALL_DIR%\%%D\" /E /I /Y >nul 2>&1
    )
)

for %%F in (index.html index.tsx index.css App.tsx types.ts router.php landing.php clones.php backup_restore.php .htaccess package.json package-lock.json vite.config.ts vite.docker.config.ts vite.runtime.config.ts tsconfig.json tailwind.config.js postcss.config.js composer.json sw-cache-first.php metadata.json) do (
    if exist "%PKG_DIR%\%%F" copy /Y "%PKG_DIR%\%%F" "%INSTALL_DIR%\%%F" >nul 2>&1
)

echo  [OK] Files copied

REM ---- Write .env with the chosen subfolder path ----------------------
echo  Writing .env ...
(
echo VITE_BASE_PATH=/%SUBFOLDER%
echo VITE_API_BASE=/%SUBFOLDER%/api
) > "%INSTALL_DIR%\.env"
echo  [OK] .env written  (VITE_BASE_PATH=/%SUBFOLDER%)

REM ---- Ensure data/ uploads/ logs/ exist -----------------------------
if not exist "%INSTALL_DIR%\data"    mkdir "%INSTALL_DIR%\data"
if not exist "%INSTALL_DIR%\uploads" mkdir "%INSTALL_DIR%\uploads"
if not exist "%INSTALL_DIR%\logs"    mkdir "%INSTALL_DIR%\logs"
echo  [OK] data/, uploads/, logs/ directories confirmed

REM ---- Rebuild frontend if subfolder name differs from 'linknest' -----
if /i NOT "%SUBFOLDER%"=="linknest" (
    echo.
    echo  NOTE: You chose a subfolder name other than 'linknest'.
    echo  The pre-built frontend (dist/) has '/linknest' baked in.
    echo  Checking if Node.js is available to rebuild...
    node --version >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo  Node.js found - rebuilding frontend for /%SUBFOLDER% ...
        cd /d "%INSTALL_DIR%"
        call npm install >nul 2>&1
        call npm run build >nul 2>&1
        if !ERRORLEVEL! EQU 0 (
            echo  [OK] Frontend rebuilt for /%SUBFOLDER%
        ) else (
            echo  [!!] Build failed. The app may not display correctly.
            echo       Try running 'npm install ^&^& npm run build' manually in:
            echo       %INSTALL_DIR%
        )
    ) else (
        echo  [!!] Node.js not found. The pre-built assets use '/linknest'.
        echo       To fix: install Node.js, then run in %INSTALL_DIR%:
        echo         npm install
        echo         npm run build
        echo       OR rename your subfolder to 'linknest' to use the pre-built assets.
    )
)

echo.
echo  =============================================
echo  Deployment Complete!
echo  =============================================
echo.
echo  1. Open XAMPP Control Panel
echo  2. Click [Start] next to Apache
echo  3. Browse to:  http://localhost/%SUBFOLDER%
echo  4. Default login:  admin / admin123
echo     IMPORTANT: Change the password immediately!
echo.
echo  If you see a 404, make sure mod_rewrite is enabled in XAMPP.
echo  See DEPLOYMENT_README.md for troubleshooting.
echo.
pause
'@

# ── deploy-xampp.sh (Linux/macOS target) ───────────────────────────────────
$deploySh = @'
#!/usr/bin/env bash
# ==========================================================
#  LinkNest XAMPP / Apache Deployment Script (Linux / macOS)
#  Works in ANY htdocs subfolder - you choose the name!
# ==========================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "  ============================================="
echo "     LinkNest - XAMPP Deployment (Linux/macOS)"
echo "  ============================================="
echo ""

# ---- Ask for XAMPP location -------------------------------------------
read -rp "  XAMPP install path [/opt/lampp]: " XAMPP_ROOT
XAMPP_ROOT="${XAMPP_ROOT:-/opt/lampp}"
HTDOCS="$XAMPP_ROOT/htdocs"

# ---- Ask for subfolder name -------------------------------------------
read -rp "  Install subfolder inside htdocs [linknest]: " SUBFOLDER
SUBFOLDER="${SUBFOLDER:-linknest}"

INSTALL_DIR="$HTDOCS/$SUBFOLDER"
echo ""
echo "  XAMPP root  : $XAMPP_ROOT"
echo "  Install dir : $INSTALL_DIR"
echo "  URL will be : http://localhost/$SUBFOLDER"
echo ""

if [ ! -d "$HTDOCS" ]; then
    echo "  ERROR: Cannot find $HTDOCS"
    echo "  Make sure XAMPP is installed and you entered the correct path."
    exit 1
fi

if [ -d "$INSTALL_DIR" ]; then
    echo "  Removing old installation..."
    rm -rf "$INSTALL_DIR"
fi
mkdir -p "$INSTALL_DIR"
echo "  [OK] Install directory ready"

echo "  Copying application files..."
cp -r "$PKG_DIR/." "$INSTALL_DIR/"
rm -f "$INSTALL_DIR/deploy-xampp.sh"
rm -f "$INSTALL_DIR/deploy-xampp.bat"
echo "  [OK] Files copied"

echo "  Writing .env ..."
cat > "$INSTALL_DIR/.env" <<ENVEOF
VITE_BASE_PATH=/$SUBFOLDER
VITE_API_BASE=/$SUBFOLDER/api
ENVEOF
echo "  [OK] .env written (VITE_BASE_PATH=/$SUBFOLDER)"

mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/uploads"
mkdir -p "$INSTALL_DIR/logs"

chmod -R 755 "$INSTALL_DIR"
chmod -R 777 "$INSTALL_DIR/data"    2>/dev/null || true
chmod -R 777 "$INSTALL_DIR/uploads" 2>/dev/null || true
chmod -R 777 "$INSTALL_DIR/logs"    2>/dev/null || true
echo "  [OK] Permissions set"

# ---- Rebuild if subfolder differs from 'linknest' --------------------
if [ "$SUBFOLDER" != "linknest" ]; then
    echo ""
    echo "  NOTE: Subfolder is '$SUBFOLDER', not 'linknest'."
    echo "  The pre-built dist/ has '/linknest' baked in. Checking for Node.js..."
    if command -v node &>/dev/null; then
        echo "  Node.js found - rebuilding frontend for /$SUBFOLDER ..."
        cd "$INSTALL_DIR"
        npm install --silent
        npm run build --silent
        echo "  [OK] Frontend rebuilt for /$SUBFOLDER"
    else
        echo "  [!!] Node.js not found. The pre-built assets reference '/linknest'."
        echo "       To fix: install Node.js then run inside $INSTALL_DIR:"
        echo "         npm install && npm run build"
        echo "       OR rename the subfolder to 'linknest' to skip rebuilding."
    fi
fi

echo ""
echo "  ============================================="
echo "  Deployment Complete!"
echo "  ============================================="
echo ""
echo "  1. Start XAMPP: sudo $XAMPP_ROOT/manager-linux-x64.run"
echo "  2. Open: http://localhost/$SUBFOLDER"
echo "  3. Default login: admin / admin123"
echo "     IMPORTANT: Change the password immediately!"
echo ""
'@

# ── DEPLOYMENT_README.md ───────────────────────────────────────────────────
$createdAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$readmeMd = @"
# LinkNest - Deployment Package

Created : $createdAt
Package : $PackageName

---

## What Is Inside

| Path                  | Description                              |
|-----------------------|------------------------------------------|
| api/                  | PHP backend                              |
| components/           | React components (TypeScript)            |
| contexts/             | React contexts                           |
| services/             | Frontend service layer                   |
| dist/                 | Pre-built frontend (ready to serve)      |
| data/linknest.db      | SQLite database (your live data)         |
| uploads/              | User-uploaded files (logos, favicons)    |
| docker/               | Docker / Docker-Compose setup            |
| scripts/              | Helper scripts                           |
| deploy-xampp.bat      | One-click deploy for Windows + XAMPP     |
| deploy-xampp.sh       | One-click deploy for Linux/macOS + XAMPP |

---

## Quick Deploy on XAMPP (Recommended)

### Windows
1. Extract this ZIP anywhere (e.g. Desktop).
2. Double-click **deploy-xampp.bat**.
3. When prompted, enter your XAMPP path (default: C:\xampp).
4. Enter the subfolder name you want (e.g. linknest, myapp, tools\linknest).
5. Start XAMPP and click Start next to Apache.
6. Open http://localhost/YOUR_SUBFOLDER in your browser.

### Linux / macOS
    chmod +x deploy-xampp.sh
    ./deploy-xampp.sh

The script will ask for XAMPP path and subfolder name interactively.

NOTE: The pre-built dist/ folder has '/linknest' baked into asset paths.
If you deploy to a DIFFERENT subfolder name, the deploy script will
automatically rebuild the frontend if Node.js is available on that machine.
If Node.js is NOT available, rename your subfolder to 'linknest' to use
the pre-built assets without rebuilding.

---

## Requirements on Target Computer

- XAMPP (Apache + PHP 8.1+) - https://www.apachefriends.org
- PHP Extensions (pre-installed with XAMPP): pdo_sqlite, sqlite3, json, mbstring, openssl

Node.js / npm are NOT required - the frontend is pre-built (dist/ is included).

---

## Database

The package includes data/linknest.db (your live SQLite database).
It will be used automatically on the new machine. No import steps needed.

---

## Default Credentials

Username : admin
Password : admin123

IMPORTANT: Change the admin password immediately after logging in!

---

## Troubleshooting

| Problem               | Fix                                                      |
|-----------------------|----------------------------------------------------------|
| Blank page / 404      | Make sure Apache is started in XAMPP                     |
| API errors            | Check that mod_rewrite is enabled in XAMPP               |
| Database errors       | Ensure data/ folder is writeable by Apache (chmod 777)   |
| Uploads missing       | Check uploads/ folder permissions                        |
| White screen          | Clear browser cache (Ctrl+Shift+R)                       |

For mod_rewrite on XAMPP Windows:
Open C:\xampp\apache\conf\httpd.conf and make sure AllowOverride All
is set for the htdocs directory, then restart Apache.

---

## Re-building the Frontend (Optional)

If you want to rebuild the frontend on the target machine (not usually needed):

    npm install
    npm run build
"@

# Write the files
Set-Content -Path (Join-Path $TempDir "deploy-xampp.bat")       -Value $deployBat  -Encoding ASCII
Set-Content -Path (Join-Path $TempDir "deploy-xampp.sh")        -Value $deploySh   -Encoding UTF8
Set-Content -Path (Join-Path $TempDir "DEPLOYMENT_README.md")   -Value $readmeMd   -Encoding UTF8

Write-OK "deploy-xampp.bat written"
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
Write-OK "ZIP created: $ZipOutput  ($zipMB MB)"

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
Write-Host "  ZIP  : $ZipOutput" -ForegroundColor Green
Write-Host "  Size : $zipMB MB"  -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Copy the ZIP to the target computer"       -ForegroundColor Yellow
Write-Host "  2. Extract it anywhere"                       -ForegroundColor Yellow
Write-Host "  3. Run deploy-xampp.bat  (Windows)"           -ForegroundColor Yellow
Write-Host "     OR  deploy-xampp.sh   (Linux/macOS)"       -ForegroundColor Yellow
Write-Host ""

# Open output folder in Explorer (Windows only)
$outputFolder = Split-Path $ZipOutput -Parent
if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion") {
    Start-Process explorer.exe -ArgumentList $outputFolder
}

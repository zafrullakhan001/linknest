#Requires -Version 5.1
<#
.SYNOPSIS
    LinkNest Deployment Packager
.DESCRIPTION
    Clean-builds the React frontend with the correct base path, gathers all
    runtime files (API, vendor/SAML, dist, utils, docs), stamps BUILD_INFO.json
    (for PWA cache busting + in-app updater), bundles SQLite 3.53.4 for XAMPP PHP,
    captures a SOURCE_SPECS.json snapshot from this known-good host, and produces
    a self-contained ZIP ready to deploy/update on another XAMPP machine.

    Also emits linknest-update-vX.Y.Z.zip for the Admin → App Updates (GitHub)
    in-app updater. Ships api/updater*.php, utils/, docs/APP_UPDATES.md, and
    scripts/publish-update-release.ps1.

    Default: FRESH install package (no live SQLite DB). The target PC creates
    a new database on first launch. Use -IncludeDatabase to mirror this PC's DB.

    SQLite: ships runtime/sqlite/ (libsqlite3.dll 3.53.4) plus install-sqlite-xampp.bat.
    deploy/update scripts install that DLL into the target XAMPP PHP folder so
    performance pragmas in api/config.php (WAL, mmap, cache, worker threads) take effect.

    Specs: api/system_specs_check.php (Admin -> Maintenance Scripts -> System Specs Check)
    validates that the target matches this packager host (PHP/SQLite/dirs/cache).

    Showcase: bundles load-tests/ including results/report.html + last-summary.json from
    this host so the target can open the performance report for reference.
.PARAMETER SkipBuild
    Skip the npm build step (use existing dist/). Not recommended when shipping code changes.
.PARAMETER IncludeDatabase
    Include data/linknest.db (and related DB files) from this machine.
.PARAMETER ExcludeUploads
    Do not include the uploads/ directory in the package.
.PARAMETER SkipSqliteRuntime
    Do not bundle/download SQLite 3.53.4 DLL for XAMPP (not recommended).
.PARAMETER OutputDir
    Where to save the final ZIP. Defaults to the project root.
.PARAMETER BasePath
    Vite base path baked into the frontend. Default: /linknest
.EXAMPLE
    .\package-for-deployment.ps1
    .\package-for-deployment.ps1 -IncludeDatabase
    .\package-for-deployment.ps1 -BasePath "/myapp"
    .\package-for-deployment.ps1 -OutputDir "E:\"
    .\package-for-deployment.ps1 -SkipSqliteRuntime
#>
param(
    [switch]$SkipBuild,
    [switch]$IncludeDatabase,
    [switch]$ExcludeUploads,
    [switch]$SkipSqliteRuntime,
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

# Official SQLite Windows x64 build shipped with the package (https://sqlite.org/)
$SqliteTargetVersion = "3.53.4"
$SqliteDllZipUrl = "https://www.sqlite.org/2026/sqlite-dll-win-x64-3530400.zip"
$SqliteToolsZipUrl = "https://www.sqlite.org/2026/sqlite-tools-win-x64-3530400.zip"
$SqliteVersionShipped = $null
$SqliteRuntimeBundled = $false
$SourceSpecsSnapshot = $null
$SourceSpecsReady = $false
$LoadTestReportBundled = $false
$LoadTestReportRel = $null

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

function Copy-TreeReliable {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$ExcludeDirs = @("node_modules", ".git", "__pycache__", ".vite", "dist"),
        [string[]]$ExcludeFiles = @()
    )
    Ensure-Dir $Destination
    $roboArgs = @($Source, $Destination, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np")
    if ($ExcludeDirs.Count -gt 0) {
        $roboArgs += "/XD"
        $roboArgs += $ExcludeDirs
    }
    if ($ExcludeFiles.Count -gt 0) {
        $roboArgs += "/XF"
        $roboArgs += $ExcludeFiles
    }
    $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList $roboArgs -Wait -PassThru -NoNewWindow
    # Robocopy: 0-7 = success / no-op; >= 8 = failure
    if ($proc.ExitCode -ge 8) {
        throw "robocopy failed for '$Source' -> '$Destination' (exit $($proc.ExitCode))"
    }
    $fileCount = @(Get-ChildItem -LiteralPath $Destination -Recurse -File -ErrorAction SilentlyContinue).Count
    if ($fileCount -lt 1) {
        # Fallback if robocopy produced an empty tree (junction/ACL edge cases)
        Write-Warn "robocopy left 0 files for $(Split-Path $Source -Leaf); falling back to Copy-Item"
        if (Test-Path $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
        Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
        $fileCount = @(Get-ChildItem -LiteralPath $Destination -Recurse -File -ErrorAction SilentlyContinue).Count
    }
    return $fileCount
}

function Get-FileSha256([string]$path) {
    # Use .NET directly - Get-FileHash is missing in some hosted/constrained PowerShell hosts.
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
$pkgVersion = "unknown"
try {
    $pkgJson = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
    if ($pkgJson.version) { $pkgVersion = [string]$pkgJson.version }
} catch { }

Write-Host "  Project Root : $ProjectRoot" -ForegroundColor Gray
Write-Host "  Package Name : $PackageName" -ForegroundColor Gray
Write-Host "  App Version  : $pkgVersion" -ForegroundColor Gray
Write-Host "  Base Path    : $(if ($BasePath) { $BasePath } else { '/' })" -ForegroundColor Gray
Write-Host "  Build ID     : $BuildId" -ForegroundColor Gray
Write-Host "  Database     : $(if ($IncludeDatabase) { 'INCLUDE live DB from this PC' } else { 'FRESH (no live DB - recommended)' })" -ForegroundColor Gray
Write-Host "  Uploads      : $(if ($ExcludeUploads) { 'excluded' } else { 'included' })" -ForegroundColor Gray
Write-Host "  SQLite DLL   : $(if ($SkipSqliteRuntime) { 'SKIPPED' } else { "bundle $SqliteTargetVersion for target XAMPP" })" -ForegroundColor Gray
Write-Host "  Load report  : load-tests/results/report.html (if present)" -ForegroundColor Gray
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

$phpVer = $null
try { $phpVer = (& php -r 'echo PHP_VERSION;' 2>$null) } catch { }
if ($phpVer) {
    Write-OK "PHP found: $phpVer"
} else {
    Write-Warn "PHP not in PATH - SOURCE_SPECS.json snapshot will be skipped (still packaging system_specs_check.php)"
}

# ---------------------------------------------------------------------------
#  0b. Capture source-host system specs (known-good baseline for target)
# ---------------------------------------------------------------------------
Write-Header "0b / Source System Specs Snapshot"

$specsScript = Join-Path $ProjectRoot "api\system_specs_check.php"
if (-not (Test-Path $specsScript)) {
    Write-Err "api/system_specs_check.php missing - cannot package a specs-aware deploy."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-OK "system_specs_check.php present"

if ($phpVer) {
    Write-Step "Running: php api/system_specs_check.php --json ..."
    $specsOutFile = Join-Path $env:TEMP ("linknest-source-specs-" + [guid]::NewGuid().ToString("N") + ".json")
    try {
        $specsProc = Start-Process -FilePath 'php' -ArgumentList @($specsScript, '--json') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $specsOutFile -RedirectStandardError ($specsOutFile + '.err')
        $specsExit = $specsProc.ExitCode
        if (Test-Path $specsOutFile) {
            $rawSpecs = Get-Content -LiteralPath $specsOutFile -Raw -ErrorAction SilentlyContinue
            if ($rawSpecs -and $rawSpecs.Trim().StartsWith("{")) {
                $SourceSpecsSnapshot = $rawSpecs.Trim() | ConvertFrom-Json
                $passed = 0
                $total = 0
                if ($SourceSpecsSnapshot.verdict) {
                    $passed = [int]$SourceSpecsSnapshot.verdict.checks_passed
                    $total = [int]$SourceSpecsSnapshot.verdict.checks_total
                }
                $ready = [bool]$SourceSpecsSnapshot.verdict.ready_for_target_parity
                $SourceSpecsReady = $ready
                if ($ready) {
                    Write-OK ("Source host specs OK ($passed/$total) - baseline ready for target parity")
                }
                else {
                    Write-Warn ("Source host has failing specs ($passed/$total, exit=$specsExit). Package still builds; fix before expecting target parity.")
                    if ($SourceSpecsSnapshot.summary) {
                        Write-Warn ([string]$SourceSpecsSnapshot.summary)
                    }
                }
            }
            else {
                Write-Warn "Specs JSON parse failed - continuing without SOURCE_SPECS.json body"
            }
        }
        else {
            Write-Warn "Specs check produced no output file"
        }
    }
    catch {
        Write-Warn ("Specs snapshot failed: {0}" -f $_.Exception.Message)
    }
    finally {
        Remove-Item -LiteralPath $specsOutFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath "$specsOutFile.err" -Force -ErrorAction SilentlyContinue
    }
}
else {
    Write-Warn "Skipped live specs snapshot (php unavailable)"
}

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
    "utils",      # Vite imports (urlDisplay, releaseNotesMarkdown, richTextDisplay)
    "docs",       # Operator docs including APP_UPDATES.md
    "config",
    "migrations",
    "public",
    "src",
    "analytics",
    "monitorv2",
    "docker",
    "land",
    "vendor",   # OneLogin php-saml (+ xmlseclibs) required for SAML 2.0
    "load-tests"  # k6 harness + showcase report (results/report.html)
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
    "backup_restore_docker.php",
    "migrate_templates.php",
    "check_opcache.php",
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
    "composer.phar",
    "sw-cache-first.php",
    "metadata.json",
    "README.md",
    "AGENTS.md",
    # Staging AI Offline Kit + related import templates (served by PHP from app root)
    "staging-ai-import-template.csv",
    "staging-ai-prompt-guide.md",
    "bulk-import-template.csv",
    "section-links-import-template.csv",
    "bulk-import-ldap-users-template.csv",
    "bulk-import-saml-users-template.csv",
    "bulk-import-local-users-template.csv"
)

# Exclude junk that commonly sneaks into recursive copies
$ExcludeDirNames = @(
    "node_modules", ".git", "__pycache__", ".vite", "dist",
    "linknest-deploy-*", "linknest-deployment-*", "linknest-update-*",
    "test-bundle", "docker-deploy-package", "api copy", "data - Copy",
    ".agent", ".docs", ".gemini", ".vscode", "logs"
)

# Large / machine-local noise inside analytics (keep workers, schema, dashboard)
$AnalyticsExcludeFiles = @(
    "analytics_backup_*.sql",
    "backup_*.sql",
    "backup_*.dump",
    "*.dump"
)

foreach ($dir in $DirsToInclude) {
    $src = Join-Path $ProjectRoot $dir
    $dst = Join-Path $TempDir $dir
    if (Test-Path $src) {
        Write-Step "Copying $dir/ ..."
        $xf = @()
        if ($dir -eq "analytics") { $xf = $AnalyticsExcludeFiles }
        $copied = Copy-TreeReliable -Source $src -Destination $dst `
            -ExcludeDirs $ExcludeDirNames `
            -ExcludeFiles $xf
        Write-OK ("{0}/ copied ({1} files)" -f $dir, $copied)
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

# Confirm showcase load-test report was copied (results/ is gitignored locally but must ship)
Write-Step "Checking load-test showcase report..."
$ltReportSrc = Join-Path $ProjectRoot "load-tests\results\report.html"
$ltReportDst = Join-Path $TempDir "load-tests\results\report.html"
$ltSummarySrc = Join-Path $ProjectRoot "load-tests\results\last-summary.json"
if (Test-Path $ltReportSrc) {
    if (-not (Test-Path $ltReportDst)) {
        Ensure-Dir (Join-Path $TempDir "load-tests\results")
        Copy-Item -Path $ltReportSrc -Destination $ltReportDst -Force
        if (Test-Path $ltSummarySrc) {
            Copy-Item -Path $ltSummarySrc -Destination (Join-Path $TempDir "load-tests\results\last-summary.json") -Force
        }
        foreach ($extra in @("meta.json", "smoke-summary.json")) {
            $es = Join-Path $ProjectRoot "load-tests\results\$extra"
            if (Test-Path $es) {
                Copy-Item -Path $es -Destination (Join-Path $TempDir "load-tests\results\$extra") -Force
            }
        }
    }
    $LoadTestReportBundled = $true
    $LoadTestReportRel = "load-tests/results/report.html"
    $reportKB = [math]::Round((Get-Item $ltReportDst).Length / 1KB, 1)
    Write-OK ("Load-test report bundled ({0} KB) - open on target for showcase" -f $reportKB)
}
else {
    Write-Warn "load-tests/results/report.html not found on this PC - package will ship harness without showcase report"
    Write-Warn "Generate first: .\\load-tests\\run.ps1 then node load-tests/generate-report.js"
}

# Strip machine-local / secret configs that must NEVER ship
Write-Step "Scrubbing machine-local secrets from package..."
$configDst = Join-Path $TempDir "config"
if (Test-Path $configDst) {
    Get-ChildItem -LiteralPath $configDst -Filter "*.local.php" -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object {
            Write-Warn ("Removing local config (not portable): {0}" -f $_.Name)
            Remove-Item -LiteralPath $_.FullName -Force
        }
}
# Drop accidental "Copy" duplicates (Windows Explorer leftovers)
Get-ChildItem -LiteralPath $TempDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match ' - Copy(\s*\(\d+\))?\.' } |
    ForEach-Object {
        Write-Warn ("Removing copy leftover: {0}" -f $_.FullName.Substring($TempDir.Length))
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }

# Verify SAML library ships with the package (avoids "OneLogin library not loaded" on target)
$samlAutoload = Join-Path $TempDir "vendor\autoload.php"
$samlAuthClass = Join-Path $TempDir "vendor\onelogin\php-saml\src\OneLogin\Saml2\Auth.php"
$samlAuthLib = Join-Path $TempDir "vendor\onelogin\php-saml\lib\Saml2\Auth.php"
if (-not (Test-Path $samlAutoload)) {
    Write-Err "vendor/autoload.php missing after copy - SAML and Composer deps will break on the target."
    Write-Err "Fix: ensure vendor/ exists on this PC (run composer install), then re-package."
    Read-Host "Press Enter to exit"
    exit 1
}
elseif ((Test-Path $samlAuthClass) -or (Test-Path $samlAuthLib)) {
    $vendorFiles = @(Get-ChildItem (Join-Path $TempDir "vendor") -Recurse -File).Count
    Write-OK ("SAML OneLogin library bundled (vendor/ - {0} files)" -f $vendorFiles)
}
else {
    Write-Err "vendor/ present but OneLogin Auth.php not found - check vendor/onelogin/php-saml"
    Read-Host "Press Enter to exit"
    exit 1
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
#  5. SQLite Database (optional - default is FRESH on the other PC)
# ---------------------------------------------------------------------------
Write-Header "5 / Database (data/)"

Ensure-Dir (Join-Path $TempDir "data")
Ensure-Dir (Join-Path $TempDir "data\cache")
Ensure-Dir (Join-Path $TempDir "logs")

$gitkeepSrc = Join-Path $ProjectRoot "data\.gitkeep"
$gitkeepDst = Join-Path $TempDir "data\.gitkeep"
if (Test-Path $gitkeepSrc) {
    Copy-Item -Path $gitkeepSrc -Destination $gitkeepDst -Force
}
else {
    Set-Content -Path $gitkeepDst -Value "" -Encoding ASCII
}
Set-Content -Path (Join-Path $TempDir "data\cache\.gitkeep") -Value "" -Encoding ASCII
Write-OK "data/cache/ placeholder ready (guest response cache)"

if ($IncludeDatabase) {
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
        Write-Warn "No SQLite database found despite -IncludeDatabase. Target will create a fresh DB."
    }

    # Portable encryption key so LDAP bind passwords survive path/machine moves
    $encKeySrc = Join-Path $ProjectRoot "data\.encryption_key"
    if (-not (Test-Path $encKeySrc)) {
        $dbForKey = Join-Path $ProjectRoot "data\linknest.db"
        if (-not (Test-Path $dbForKey)) { $dbForKey = Join-Path $ProjectRoot "linknest.db" }
        if (Test-Path $dbForKey) {
            $keyMaterial = ((Resolve-Path $dbForKey).Path) + "linknest_ldap_encryption_salt_v1"
            [System.IO.File]::WriteAllText($encKeySrc, $keyMaterial, (New-Object System.Text.UTF8Encoding $false))
            Write-OK "Created data\.encryption_key for portable LDAP password decrypt"
        }
    }
    if (Test-Path $encKeySrc) {
        Copy-Item -Path $encKeySrc -Destination (Join-Path $TempDir "data\.encryption_key") -Force
        Write-OK "Encryption key copied (data\.encryption_key)"
    }
}
else {
    Write-OK "Fresh mode: NOT copying live databases (target will create linknest.db on first launch)"
    Write-OK "data/ placeholder ready (.gitkeep + empty logs/)"
}

# ---------------------------------------------------------------------------
#  5b. Bundle SQLite 3.53.4 runtime for target XAMPP PHP
# ---------------------------------------------------------------------------
Write-Header "5b / Bundle SQLite Runtime ($SqliteTargetVersion)"

$runtimeSqliteDir = Join-Path $TempDir "runtime\sqlite"
Ensure-Dir $runtimeSqliteDir

if ($SkipSqliteRuntime) {
    Write-Warn "Skipping SQLite runtime bundle (-SkipSqliteRuntime)"
    Set-Content -Path (Join-Path $runtimeSqliteDir "SKIPPED.txt") -Value "SQLite runtime was not packaged. Target keeps its existing XAMPP SQLite." -Encoding ASCII
}
else {
    $dllStaged = $false
    $downloadTmp = Join-Path $env:TEMP ("linknest-sqlite-pack-" + [guid]::NewGuid().ToString("N"))
    Ensure-Dir $downloadTmp

    try {
        Write-Step "Downloading official SQLite $SqliteTargetVersion Windows x64 DLL..."
        $dllZip = Join-Path $downloadTmp "sqlite-dll.zip"
        Invoke-WebRequest -Uri $SqliteDllZipUrl -OutFile $dllZip -UseBasicParsing
        Expand-Archive -Path $dllZip -DestinationPath (Join-Path $downloadTmp "dll") -Force
        $downloadedDll = Get-ChildItem (Join-Path $downloadTmp "dll") -Filter "sqlite3.dll" -Recurse | Select-Object -First 1
        if (-not $downloadedDll) { throw "sqlite3.dll missing from official zip" }

        Copy-Item $downloadedDll.FullName (Join-Path $runtimeSqliteDir "sqlite3.dll") -Force
        Copy-Item $downloadedDll.FullName (Join-Path $runtimeSqliteDir "libsqlite3.dll") -Force
        $dllStaged = $true
        $SqliteVersionShipped = $SqliteTargetVersion
        Write-OK ("Official sqlite3.dll staged ({0:N0} bytes)" -f $downloadedDll.Length)

        Write-Step "Downloading SQLite CLI tools..."
        try {
            $toolsZip = Join-Path $downloadTmp "sqlite-tools.zip"
            Invoke-WebRequest -Uri $SqliteToolsZipUrl -OutFile $toolsZip -UseBasicParsing
            Expand-Archive -Path $toolsZip -DestinationPath (Join-Path $downloadTmp "tools") -Force
            $cli = Get-ChildItem (Join-Path $downloadTmp "tools") -Filter "sqlite3.exe" -Recurse | Select-Object -First 1
            if ($cli) {
                Copy-Item $cli.FullName (Join-Path $runtimeSqliteDir "sqlite3.exe") -Force
                Write-OK "sqlite3.exe CLI bundled"
            }
        }
        catch {
            Write-Warn ("CLI tools download skipped: {0}" -f $_.Exception.Message)
        }
    }
    catch {
        Write-Warn ("Official download failed: {0}" -f $_.Exception.Message)
        Write-Step "Falling back to local XAMPP libsqlite3.dll if version matches..."

        $localCandidates = @(
            "C:\xampp\php\libsqlite3.dll",
            "C:\xampp\php\sqlite3.dll",
            (Join-Path $env:ProgramFiles "xampp\php\libsqlite3.dll")
        )
        $localPhpVer = $null
        try {
            $localPhpVer = (& php -r "echo SQLite3::version()['versionString'];" 2>$null)
        } catch { }

        $localDll = $localCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($localDll -and $localPhpVer -and ($localPhpVer -eq $SqliteTargetVersion)) {
            Copy-Item $localDll (Join-Path $runtimeSqliteDir "libsqlite3.dll") -Force
            Copy-Item $localDll (Join-Path $runtimeSqliteDir "sqlite3.dll") -Force
            $dllStaged = $true
            $SqliteVersionShipped = $localPhpVer
            Write-OK ("Using local DLL from {0} (PHP reports {1})" -f $localDll, $localPhpVer)
        }
        else {
            Write-Err "Could not obtain SQLite $SqliteTargetVersion DLL for the package."
            Write-Err "Re-run with network access, or install 3.53.4 on this PC first."
            if (Test-Path $downloadTmp) { Remove-Item $downloadTmp -Recurse -Force -ErrorAction SilentlyContinue }
            Read-Host "Press Enter to exit"
            exit 1
        }
    }
    finally {
        if (Test-Path $downloadTmp) { Remove-Item $downloadTmp -Recurse -Force -ErrorAction SilentlyContinue }
    }

    if ($dllStaged) {
        $SqliteRuntimeBundled = $true
        $packagedAtTxt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        $versionTxt = @(
            "SQLite $SqliteVersionShipped for LinkNest XAMPP deployments"
            'Source: https://sqlite.org/ (Windows x64 precompiled binary)'
            "Packaged: $packagedAtTxt"
            "Build ID: $BuildId"
            ''
            'Install on target with install-sqlite-xampp.bat (also run by deploy/update scripts).'
            'Replaces %XAMPP%\php\libsqlite3.dll so PHP PDO/SQLite3 use this version.'
            'LinkNest api/config.php then applies WAL, mmap 256MB, 32MB cache, 4 worker threads.'
        ) -join [Environment]::NewLine
        Set-Content -Path (Join-Path $runtimeSqliteDir "SQLITE_VERSION.txt") -Value $versionTxt -Encoding ASCII
        Write-OK ("SQLite runtime bundled: version {0}" -f $SqliteVersionShipped)
    }
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
    $copied = Copy-TreeReliable -Source $scriptsSrc -Destination $scriptsDst `
        -ExcludeDirs @("__pycache__", "node_modules") `
        -ExcludeFiles @(".env", "*.local", "*.pem", "*.key")
    Write-OK ("scripts/ copied ({0} files)" -f $copied)
    # Ensure in-app updater publisher is present
    $publishPs1 = Join-Path $scriptsDst "publish-update-release.ps1"
    if (Test-Path $publishPs1) {
        Write-OK "scripts/publish-update-release.ps1 present"
    }
    else {
        Write-Warn "scripts/publish-update-release.ps1 missing (re-check scripts/ on packager host)"
    }
}
else {
    Write-Warn "scripts/ not found, skipping"
}

# ---------------------------------------------------------------------------
#  7b. Write BUILD_INFO.json (used by SW to bust PWA caches)
# ---------------------------------------------------------------------------
Write-Header "7b / Stamp BUILD_INFO.json"

$indexAssetMatch = [regex]::Match($distHtml, 'assets/js/index-\S+\.js')
$indexAsset = if ($indexAssetMatch.Success) { $indexAssetMatch.Value } else { '' }
$indexHash = Get-FileSha256 $distIndex

$loadTestReportInfo = @{
    bundled = [bool]$LoadTestReportBundled
    path    = $LoadTestReportRel
    summary = 'load-tests/results/last-summary.json'
    note    = $(if ($LoadTestReportBundled) {
        'Open report.html in a browser for packager-host performance showcase'
    } else {
        'Report was missing on packager host; re-run load tests then re-package'
    })
}

# Capture packager git SHA for in-app updater baseline (commit tracking / rollback)
$gitCommitSha = $null
try {
    $gitOut = & git -C $ProjectRoot rev-parse HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $gitOut) {
        $gitCommitSha = ([string]$gitOut).Trim()
    }
} catch { }

$buildInfo = [ordered]@{
    buildId     = $BuildId
    builtAt     = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    packageName = $PackageName
    appVersion  = $pkgVersion
    gitCommit   = $gitCommitSha
    releaseTag  = $(if ($pkgVersion -and $pkgVersion -ne 'unknown') { "v$pkgVersion" } else { $null })
    trackBranch = "main"
    updatedVia  = "package-for-deployment.ps1"
    basePath    = $(if ($BasePath) { $BasePath } else { '/' })
    includeDatabase = [bool]$IncludeDatabase
    sqliteRuntime = $(if ($SqliteRuntimeBundled) { $SqliteVersionShipped } else { $null })
    sqlitePerformance = @(
        'journal_mode=WAL',
        'synchronous=NORMAL',
        'mmap_size=256MB',
        'cache_size=32MB',
        'threads=4',
        'temp_store=MEMORY'
    )
    updater = @{
        enabled = $true
        endpoints = @('/api/updater/status', '/api/updater/apply', '/api/updater/rollback')
        adminUi = 'Admin -> Tools -> App Updates (or nav bell)'
        docs = 'docs/APP_UPDATES.md'
        publishScript = 'scripts/publish-update-release.ps1'
        updateAsset = "linknest-update-v$pkgVersion.zip"
        requiresPhp = @('curl', 'zip', 'openssl')
        modes = @('git (checkout+rebuild)', 'zip (release asset or GitHub zipball)')
    }
    systemSpecsCheck = @{
        adminUi     = 'Admin -> Maintenance Scripts -> System Specs Check'
        apiEndpoint = '/api/system-specs-check'
        cli         = 'php api/system_specs_check.php'
        cliJson     = 'php api/system_specs_check.php --json'
        packagedScript = 'api/system_specs_check.php'
        sourceSnapshot = 'SOURCE_SPECS.json'
        purpose     = 'Validate target host matches packager-known-good PHP/SQLite/dirs/cache'
    }
    loadTestReport = $loadTestReportInfo
    sourceSpecsReady = [bool]$SourceSpecsReady
    indexAsset  = $indexAsset
    indexSha12  = $indexHash
    jsAssetCount = $assetJs.Count
}
$buildInfoJson = $buildInfo | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $TempDir "BUILD_INFO.json") -Value $buildInfoJson -Encoding UTF8
# Also keep a copy inside dist for easy discovery
Set-Content -Path (Join-Path $TempDir "dist\BUILD_INFO.json") -Value $buildInfoJson -Encoding UTF8
Write-OK ("BUILD_INFO.json written (buildId={0}, {1})" -f $BuildId, $indexAsset)

# Ship known-good specs from this packager host for operators on the target
if ($null -ne $SourceSpecsSnapshot) {
    $sourceSpecsPayload = [ordered]@{
        packagedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        buildId    = $BuildId
        packageName = $PackageName
        note       = 'Snapshot of the packager host when this ZIP was built. On the target: Admin -> System Specs Check (or php api/system_specs_check.php --json) and reconcile against target_specs below.'
        result     = $SourceSpecsSnapshot
    }
    $sourceSpecsJson = $sourceSpecsPayload | ConvertTo-Json -Depth 12
    Set-Content -Path (Join-Path $TempDir "SOURCE_SPECS.json") -Value $sourceSpecsJson -Encoding UTF8
    if ($SourceSpecsSnapshot.target_specs) {
        $targetOnly = [ordered]@{
            packagedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
            buildId    = $BuildId
            note       = 'Minimum requirements the target must meet for known-good LinkNest parity.'
            target_specs = $SourceSpecsSnapshot.target_specs
            inAppUpdater = @{
                adminUi = 'Admin -> Tools -> App Updates'
                docs = 'docs/APP_UPDATES.md'
                phpExtensions = @('curl', 'zip', 'openssl')
                apiFiles = @(
                    'api/updater.php',
                    'api/updater_lib.php',
                    'api/updater_apply_cli.php'
                )
            }
        }
        Set-Content -Path (Join-Path $TempDir "TARGET_REQUIREMENTS.json") -Value ($targetOnly | ConvertTo-Json -Depth 8) -Encoding UTF8
        Write-OK "SOURCE_SPECS.json + TARGET_REQUIREMENTS.json written"
    }
    else {
        Write-OK "SOURCE_SPECS.json written"
    }
}
else {
    Write-Warn "SOURCE_SPECS.json not written (no live snapshot)"
}

# Write a small .env template so manual deploys get the correct base path
# Do NOT copy .env.local (may contain GEMINI_API_KEY / secrets)
$envBasePath = if ($BasePath) { $BasePath } else { '' }
$envApiBase = if ($BasePath) { ($BasePath + '/api') } else { '/api' }
$envTemplate = @(
    "VITE_BASE_PATH=$envBasePath"
    "VITE_API_BASE=$envApiBase"
    '# Optional: GEMINI_API_KEY=your_key_here'
) -join [Environment]::NewLine
Set-Content -Path (Join-Path $TempDir ".env") -Value $envTemplate -Encoding ASCII
Write-OK ".env written for target base path (no secrets copied from this PC)"

# ---------------------------------------------------------------------------
#  8. Write deployment guide and helper scripts into the package
# ---------------------------------------------------------------------------
Write-Header "8 / Generating Deployment Files"

$basePathForBat = if ($BasePath) { $BasePath.TrimStart("/") } else { "linknest" }
$dbModeNote = if ($IncludeDatabase) { "includes live DB from packager PC" } else { "FRESH database on first launch" }
$sqliteShipNote = if ($SqliteRuntimeBundled) { "SQLite $SqliteVersionShipped bundled for XAMPP PHP" } else { "SQLite runtime not bundled" }

# -- install-sqlite-xampp.bat (upgrade target XAMPP PHP SQLite DLL) ---------
$installSqliteBat = @'
@echo off
setlocal enabledelayedexpansion
REM ==========================================================
REM  LinkNest - Install SQLite __SQLITE_TARGET__ into XAMPP PHP
REM  Replaces php\libsqlite3.dll (backed up first). Needs Admin.
REM ==========================================================
echo.
echo  =============================================
echo     LinkNest - SQLite XAMPP Upgrade
echo     Target version: __SQLITE_TARGET__
echo     Package build : __BUILD_ID__
echo  =============================================
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo  Administrator rights required to replace PHP SQLite DLL.
    echo  Re-launching elevated...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs -Wait"
    exit /b %ERRORLEVEL%
)

set "PKG_DIR=%~dp0"
if "%PKG_DIR:~-1%"=="\" set "PKG_DIR=%PKG_DIR:~0,-1%"
set "SRC_DLL=%PKG_DIR%\runtime\sqlite\libsqlite3.dll"
if not exist "%SRC_DLL%" set "SRC_DLL=%PKG_DIR%\runtime\sqlite\sqlite3.dll"

if /i "%~2"=="quiet" set "LINKNEST_SQLITE_QUIET=1"
if /i "%~1"=="quiet" (
    set "LINKNEST_SQLITE_QUIET=1"
    set "XAMPP_ROOT=C:\xampp"
)

if not exist "%SRC_DLL%" (
    echo  ERROR: runtime\sqlite\libsqlite3.dll not found in this package.
    echo  Re-package with network access, or omit -SkipSqliteRuntime.
    pause
    exit /b 1
)

if /i not "%~1"=="quiet" if not "%~1"=="" set "XAMPP_ROOT=%~1"
if "%XAMPP_ROOT%"=="" (
    set "XAMPP_ROOT=C:\xampp"
    set /p "XAMPP_ROOT=XAMPP install path (press Enter for C:\xampp): "
)
if "%XAMPP_ROOT%"=="" set "XAMPP_ROOT=C:\xampp"

set "PHP_DIR=%XAMPP_ROOT%\php"
if not exist "%PHP_DIR%\php.exe" (
    echo  ERROR: Cannot find "%PHP_DIR%\php.exe"
    pause
    exit /b 1
)

echo  XAMPP PHP : %PHP_DIR%
echo  Source DLL: %SRC_DLL%
echo.

echo  Current SQLite (before):
"%PHP_DIR%\php.exe" -r "echo '  PHP SQLite: '.SQLite3::version()['versionString'].PHP_EOL;" 2>nul
echo.

echo  Stopping Apache so the DLL can be replaced...
net stop Apache2.4 >nul 2>&1
taskkill /F /IM httpd.exe >nul 2>&1
timeout /t 2 /nobreak >nul

set "DEST=%PHP_DIR%\libsqlite3.dll"
set "DEST2=%PHP_DIR%\windowsXamppPhp\libsqlite3.dll"
set "BACKUP=%PHP_DIR%\libsqlite3.dll.bak-before-linknest"

if exist "%DEST%" (
    if not exist "%BACKUP%" copy /Y "%DEST%" "%BACKUP%" >nul
    echo  [OK] Backup: %BACKUP%
)

copy /Y "%SRC_DLL%" "%DEST%" >nul
if errorlevel 1 (
    echo  ERROR: Could not write %DEST%
    net start Apache2.4 >nul 2>&1
    pause
    exit /b 1
)
echo  [OK] Installed %DEST%

if exist "%PHP_DIR%\windowsXamppPhp" (
    copy /Y "%SRC_DLL%" "%DEST2%" >nul 2>&1
    copy /Y "%SRC_DLL%" "%PHP_DIR%\sqlite3.dll" >nul 2>&1
    echo  [OK] Also updated windowsXamppPhp copy / sqlite3.dll
) else (
    copy /Y "%SRC_DLL%" "%PHP_DIR%\sqlite3.dll" >nul 2>&1
)

echo  Starting Apache...
net start Apache2.4 >nul 2>&1

echo.
echo  SQLite after upgrade:
"%PHP_DIR%\php.exe" -r "echo '  PHP SQLite: '.SQLite3::version()['versionString'].PHP_EOL; $p=new PDO('sqlite::memory:'); echo '  PDO SQLite: '.$p->query('select sqlite_version()')->fetchColumn().PHP_EOL;" 2>nul
echo.
echo  LinkNest performance pragmas (WAL / mmap / cache / threads) apply on next API request.
echo.
if "%LINKNEST_SQLITE_QUIET%"=="1" exit /b 0
pause
'@
$installSqliteBat = $installSqliteBat.Replace('__SQLITE_TARGET__', $SqliteTargetVersion).Replace('__BUILD_ID__', $BuildId)

# -- deploy-xampp.bat (fresh install - wipes target folder) -----------------
$deployBat = @'
@echo off
setlocal enabledelayedexpansion
REM ==========================================================
REM  LinkNest XAMPP Deployment Script (Windows) - FRESH INSTALL
REM  Wipes the target folder, then copies this package in.
REM  Prefer update-xampp.bat if you want to KEEP data/uploads.
REM ==========================================================
echo.
echo  =============================================
echo     LinkNest - XAMPP Fresh Deploy (Windows)
echo     Package build: __BUILD_ID__
echo     App version  : __PKG_VERSION__
echo     DB mode      : __DB_MODE_NOTE__
echo     SQLite       : __SQLITE_SHIP_NOTE__
echo  =============================================
echo.

where docker >nul 2>&1
REM (Docker not required - this is an XAMPP deploy)

set "XAMPP_ROOT=C:\xampp"
set /p "XAMPP_ROOT=XAMPP install path (press Enter for C:\xampp): "
if "%XAMPP_ROOT%"=="" set "XAMPP_ROOT=C:\xampp"
set "HTDOCS=%XAMPP_ROOT%\htdocs"

set "SUBFOLDER=__BASE_PATH_FOR_BAT__"
set /p "SUBFOLDER=Install subfolder inside htdocs (press Enter for '__BASE_PATH_FOR_BAT__'): "
if "%SUBFOLDER%"=="" set "SUBFOLDER=__BASE_PATH_FOR_BAT__"

set "INSTALL_DIR=%HTDOCS%\%SUBFOLDER%"
echo.
echo  XAMPP root  : %XAMPP_ROOT%
echo  Install dir : %INSTALL_DIR%
echo  URL will be : http://localhost/%SUBFOLDER%
echo  Build ID    : __BUILD_ID__
echo.

if not exist "%HTDOCS%" (
    echo  ERROR: Cannot find %HTDOCS%
    echo  Install XAMPP or enter the correct path.
    pause
    exit /b 1
)

REM Package integrity (catch incomplete ZIP extracts)
set "PKG_DIR=%~dp0"
if "%PKG_DIR:~-1%"=="\" set "PKG_DIR=%PKG_DIR:~0,-1%"

if not exist "%PKG_DIR%\dist\index.html" (
    echo  ERROR: dist\index.html missing - ZIP extract incomplete or wrong folder.
    pause
    exit /b 1
)
if not exist "%PKG_DIR%\api\index.php" (
    echo  ERROR: api\index.php missing - package is incomplete.
    pause
    exit /b 1
)
if not exist "%PKG_DIR%\.htaccess" (
    echo  ERROR: .htaccess missing - Apache rewrite will break.
    pause
    exit /b 1
)
if not exist "%PKG_DIR%\vendor\autoload.php" (
    echo  ERROR: vendor\autoload.php missing - SAML/Composer libs not packaged.
    pause
    exit /b 1
)
echo  [OK] Package integrity check passed

if exist "%INSTALL_DIR%" (
    echo  WARNING: This will DELETE everything in:
    echo    %INSTALL_DIR%
    set /p "CONFIRM=Type YES to continue: "
    if /i not "!CONFIRM!"=="YES" (
        echo  Cancelled.
        pause
        exit /b 1
    )
    echo  Removing old installation at %INSTALL_DIR% ...
    rd /s /q "%INSTALL_DIR%"
)
mkdir "%INSTALL_DIR%"
echo  [OK] Install directory ready

echo  Copying application files...
xcopy "%PKG_DIR%\*" "%INSTALL_DIR%\" /E /I /Y /Q >nul
if errorlevel 1 (
    echo  ERROR: xcopy failed
    pause
    exit /b 1
)
if exist "%INSTALL_DIR%\deploy-xampp.bat" del /f /q "%INSTALL_DIR%\deploy-xampp.bat"
if exist "%INSTALL_DIR%\deploy-xampp.sh" del /f /q "%INSTALL_DIR%\deploy-xampp.sh"
if exist "%INSTALL_DIR%\update-xampp.bat" del /f /q "%INSTALL_DIR%\update-xampp.bat"
if exist "%INSTALL_DIR%\verify-install.bat" del /f /q "%INSTALL_DIR%\verify-install.bat"
if exist "%INSTALL_DIR%\install-sqlite-xampp.bat" del /f /q "%INSTALL_DIR%\install-sqlite-xampp.bat"
echo  [OK] Files copied

(
echo VITE_BASE_PATH=/%SUBFOLDER%
echo VITE_API_BASE=/%SUBFOLDER%/api
) > "%INSTALL_DIR%\.env"
echo  [OK] .env written  (VITE_BASE_PATH=/%SUBFOLDER%)

if not exist "%INSTALL_DIR%\data"    mkdir "%INSTALL_DIR%\data"
if not exist "%INSTALL_DIR%\uploads" mkdir "%INSTALL_DIR%\uploads"
if not exist "%INSTALL_DIR%\logs"    mkdir "%INSTALL_DIR%\logs"

if /i NOT "%SUBFOLDER%"=="__BASE_PATH_FOR_BAT__" (
    echo.
    echo  NOTE: Subfolder differs from packaged base '__BASE_PATH_FOR_BAT__'.
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
        echo  [!!] Node.js not found. Use subfolder '__BASE_PATH_FOR_BAT__' or rebuild on a machine with Node.
    )
)

echo.
echo  Upgrading XAMPP PHP SQLite to __SQLITE_TARGET__ (recommended)...
if exist "%PKG_DIR%\install-sqlite-xampp.bat" (
    call "%PKG_DIR%\install-sqlite-xampp.bat" "%XAMPP_ROOT%" quiet
) else (
    echo  [!!] install-sqlite-xampp.bat missing - skip SQLite DLL upgrade
)

echo.
echo  =============================================
echo  Deployment Complete!  Build: __BUILD_ID__
echo  =============================================
echo.
echo  BEFORE OPENING THE APP:
echo  1. Start Apache in the XAMPP Control Panel
echo  2. Confirm AllowOverride All for htdocs ^(mod_rewrite^)
echo  3. Open: http://localhost/%SUBFOLDER%
echo  4. Hard refresh once ^(Ctrl+F5^) if you still see an old UI
echo  5. Confirm build: http://localhost/%SUBFOLDER%/BUILD_INFO.json
echo  6. Default login: admin / admin123 - change it immediately
echo  7. Confirm SQLite: "%XAMPP_ROOT%\php\php.exe" -r "echo SQLite3::version()['versionString'];"
echo  8. Admin -^> Maintenance Scripts -^> System Specs Check ^(must match SOURCE_SPECS.json / TARGET_REQUIREMENTS.json^)
echo  9. Showcase: open load-tests\results\report.html in a browser ^(packager host load-test report^)
echo.
echo  Tip: run verify-install.bat from the extracted ZIP if anything looks wrong.
echo.
pause
'@
$deployBat = $deployBat.Replace('__BUILD_ID__', $BuildId).Replace('__PKG_VERSION__', $pkgVersion).Replace('__DB_MODE_NOTE__', $dbModeNote).Replace('__SQLITE_SHIP_NOTE__', $sqliteShipNote).Replace('__BASE_PATH_FOR_BAT__', $basePathForBat).Replace('__SQLITE_TARGET__', $SqliteTargetVersion)

# -- update-xampp.bat (KEEP data/uploads - recommended for upgrades) -------
$updateBat = @'
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
echo     Package build: __BUILD_ID__
echo     App version  : __PKG_VERSION__
echo     SQLite       : __SQLITE_SHIP_NOTE__
echo  =============================================
echo.

set "XAMPP_ROOT=C:\xampp"
set /p "XAMPP_ROOT=XAMPP install path (press Enter for C:\xampp): "
if "%XAMPP_ROOT%"=="" set "XAMPP_ROOT=C:\xampp"
set "HTDOCS=%XAMPP_ROOT%\htdocs"

set "SUBFOLDER=__BASE_PATH_FOR_BAT__"
set /p "SUBFOLDER=Existing install subfolder (press Enter for '__BASE_PATH_FOR_BAT__'): "
if "%SUBFOLDER%"=="" set "SUBFOLDER=__BASE_PATH_FOR_BAT__"

set "INSTALL_DIR=%HTDOCS%\%SUBFOLDER%"
echo.
echo  Updating : %INSTALL_DIR%
echo  Build ID : __BUILD_ID__
echo.

if not exist "%INSTALL_DIR%" (
    echo  ERROR: %INSTALL_DIR% does not exist.
    echo  Use deploy-xampp.bat for a fresh install instead.
    pause
    exit /b 1
)

set "PKG_DIR=%~dp0"
if "%PKG_DIR:~-1%"=="\" set "PKG_DIR=%PKG_DIR:~0,-1%"

if not exist "%PKG_DIR%\dist\index.html" (
    echo  ERROR: dist\index.html missing in package.
    pause
    exit /b 1
)
if not exist "%PKG_DIR%\vendor\autoload.php" (
    echo  ERROR: vendor\autoload.php missing in package.
    pause
    exit /b 1
)

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
if exist "%INSTALL_DIR%\vendor" rd /s /q "%INSTALL_DIR%\vendor"

echo  Copying updated application files (excluding deploy helpers)...
xcopy "%PKG_DIR%\*" "%INSTALL_DIR%\" /E /I /Y /Q >nul
if exist "%INSTALL_DIR%\deploy-xampp.bat" del /f /q "%INSTALL_DIR%\deploy-xampp.bat"
if exist "%INSTALL_DIR%\deploy-xampp.sh" del /f /q "%INSTALL_DIR%\deploy-xampp.sh"
if exist "%INSTALL_DIR%\update-xampp.bat" del /f /q "%INSTALL_DIR%\update-xampp.bat"
if exist "%INSTALL_DIR%\verify-install.bat" del /f /q "%INSTALL_DIR%\verify-install.bat"
if exist "%INSTALL_DIR%\install-sqlite-xampp.bat" del /f /q "%INSTALL_DIR%\install-sqlite-xampp.bat"

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
echo  Upgrading XAMPP PHP SQLite to __SQLITE_TARGET__ ...
if exist "%PKG_DIR%\install-sqlite-xampp.bat" (
    call "%PKG_DIR%\install-sqlite-xampp.bat" "%XAMPP_ROOT%" quiet
) else (
    echo  [!!] install-sqlite-xampp.bat missing - skip SQLite DLL upgrade
)

echo.
echo  =============================================
echo  Update Complete!  Build: __BUILD_ID__
echo  =============================================
echo.
echo  VERIFY the new build is live:
echo    http://localhost/%SUBFOLDER%/BUILD_INFO.json
echo    Expect buildId = __BUILD_ID__
echo.
echo  If Semi-PWA is enabled, do ONE hard refresh (Ctrl+F5)
echo  so the service worker picks up the new cache version.
echo.
echo  Tip: restart Apache if PHP still serves oddly stale code.
echo  Confirm SQLite: "%XAMPP_ROOT%\php\php.exe" -r "echo SQLite3::version()['versionString'];"
echo  Then: Admin -^> Maintenance Scripts -^> System Specs Check
echo.
pause
'@
$updateBat = $updateBat.Replace('__BUILD_ID__', $BuildId).Replace('__PKG_VERSION__', $pkgVersion).Replace('__SQLITE_SHIP_NOTE__', $sqliteShipNote).Replace('__BASE_PATH_FOR_BAT__', $basePathForBat).Replace('__SQLITE_TARGET__', $SqliteTargetVersion)

# -- verify-install.bat (quick health check against an install OR this ZIP) -
$verifySqliteChecks = if ($SqliteRuntimeBundled) {
    "    `"runtime\sqlite\libsqlite3.dll`"`r`n    `"install-sqlite-xampp.bat`""
} else {
    ''
}

$verifyBat = @'
@echo off
setlocal enabledelayedexpansion
echo.
echo  =============================================
echo     LinkNest - Package / Install Verifier
echo     Expected buildId: __BUILD_ID__
echo  =============================================
echo.

set "TARGET=%~dp0"
if "%TARGET:~-1%"=="\" set "TARGET=%TARGET:~0,-1%"
set /p "CUSTOM=Check this folder (Enter = this ZIP folder): "
if not "!CUSTOM!"=="" set "TARGET=!CUSTOM!"

set "FAIL=0"
echo  Checking: !TARGET!
echo.

for %%F in (
    "dist\index.html"
    "api\index.php"
    "api\config.php"
    "api\system_specs_check.php"
    "api\updater.php"
    "api\updater_lib.php"
    "api\updater_apply_cli.php"
    ".htaccess"
    "vendor\autoload.php"
    "BUILD_INFO.json"
    "sw-cache-first.php"
    "public\sw-cache-first.js"
    "package.json"
    "App.tsx"
    "utils\releaseNotesMarkdown.ts"
    "docs\APP_UPDATES.md"
    "scripts\publish-update-release.ps1"
    "components\UpdatesDialog.tsx"
    "services\updaterService.ts"
__VERIFY_SQLITE_CHECKS__
) do (
    if exist "!TARGET!\%%~F" (
        echo  [OK] %%~F
    ) else (
        echo  [XX] MISSING %%~F
        set "FAIL=1"
    )
)

if exist "!TARGET!\SOURCE_SPECS.json" (
    echo  [OK] SOURCE_SPECS.json ^(packager host baseline^)
) else (
    echo  [!!] SOURCE_SPECS.json missing ^(optional but recommended^)
)

if exist "!TARGET!\TARGET_REQUIREMENTS.json" (
    echo  [OK] TARGET_REQUIREMENTS.json
)

if exist "!TARGET!\load-tests\results\report.html" (
    echo  [OK] load-tests\results\report.html ^(showcase report^)
) else (
    echo  [!!] load-tests\results\report.html missing ^(showcase report not packaged^)
)

if exist "!TARGET!\runtime\sqlite\SQLITE_VERSION.txt" (
    echo.
    echo  --- SQLite runtime ---
    type "!TARGET!\runtime\sqlite\SQLITE_VERSION.txt"
    echo.
)

if exist "!TARGET!\BUILD_INFO.json" (
    echo.
    echo  --- BUILD_INFO.json ---
    type "!TARGET!\BUILD_INFO.json"
    echo.
)

if "!FAIL!"=="1" (
    echo  RESULT: FAILED - package/install is incomplete.
    pause
    exit /b 1
) else (
    echo  RESULT: OK - required files present.
    pause
    exit /b 0
)
'@
$verifyBat = $verifyBat.Replace('__BUILD_ID__', $BuildId).Replace('__VERIFY_SQLITE_CHECKS__', $verifySqliteChecks)

# -- deploy-xampp.sh (Linux/macOS) ------------------------------------------
$deploySh = @'
#!/usr/bin/env bash
set -euo pipefail
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_ID="__BUILD_ID__"
DEFAULT_SUB="__BASE_PATH_FOR_BAT__"

echo ""
echo "  ============================================="
echo "     LinkNest - XAMPP Deploy (Linux/macOS)"
echo "     Package build: $BUILD_ID"
echo "  ============================================="
echo ""

for f in dist/index.html api/index.php .htaccess vendor/autoload.php; do
    if [ ! -e "$PKG_DIR/$f" ]; then
        echo "  ERROR: missing $f - incomplete package"
        exit 1
    fi
done

read -rp "  XAMPP install path [/opt/lampp]: " XAMPP_ROOT
XAMPP_ROOT="${XAMPP_ROOT:-/opt/lampp}"
HTDOCS="$XAMPP_ROOT/htdocs"

read -rp "  Install subfolder inside htdocs [$DEFAULT_SUB]: " SUBFOLDER
SUBFOLDER="${SUBFOLDER:-$DEFAULT_SUB}"
INSTALL_DIR="$HTDOCS/$SUBFOLDER"

if [ ! -d "$HTDOCS" ]; then
    echo "  ERROR: Cannot find $HTDOCS"
    exit 1
fi

if [ -d "$INSTALL_DIR" ]; then
    echo "  Backing up data/uploads then replacing install..."
    BACKUP_DIR="$(mktemp -d)"
    [ -d "$INSTALL_DIR/data" ] && cp -a "$INSTALL_DIR/data" "$BACKUP_DIR/" || true
    [ -d "$INSTALL_DIR/uploads" ] && cp -a "$INSTALL_DIR/uploads" "$BACKUP_DIR/" || true
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
else
    mkdir -p "$INSTALL_DIR"
    BACKUP_DIR=""
fi

cp -a "$PKG_DIR"/. "$INSTALL_DIR/"
rm -f "$INSTALL_DIR/deploy-xampp.sh" "$INSTALL_DIR/deploy-xampp.bat" "$INSTALL_DIR/update-xampp.bat" "$INSTALL_DIR/verify-install.bat" "$INSTALL_DIR/install-sqlite-xampp.bat"

if [ -n "$BACKUP_DIR" ]; then
    [ -d "$BACKUP_DIR/data" ] && rm -rf "$INSTALL_DIR/data" && cp -a "$BACKUP_DIR/data" "$INSTALL_DIR/"
    [ -d "$BACKUP_DIR/uploads" ] && rm -rf "$INSTALL_DIR/uploads" && cp -a "$BACKUP_DIR/uploads" "$INSTALL_DIR/"
    rm -rf "$BACKUP_DIR"
fi

cat > "$INSTALL_DIR/.env" <<ENVEOF
VITE_BASE_PATH=/$SUBFOLDER
VITE_API_BASE=/$SUBFOLDER/api
ENVEOF

mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/uploads" "$INSTALL_DIR/logs"
chmod -R 755 "$INSTALL_DIR"
chmod -R 777 "$INSTALL_DIR/data" "$INSTALL_DIR/uploads" "$INSTALL_DIR/logs" 2>/dev/null || true

if [ "$SUBFOLDER" != "$DEFAULT_SUB" ]; then
    if command -v node &>/dev/null; then
        cd "$INSTALL_DIR"
        export VITE_BASE_PATH="/$SUBFOLDER"
        export VITE_API_BASE="/$SUBFOLDER/api"
        npm install
        npm run build:prod
    else
        echo "  [!!] Node.js not found; use subfolder $DEFAULT_SUB or rebuild manually."
    fi
fi

echo ""
echo "  Done. Verify: http://localhost/$SUBFOLDER/BUILD_INFO.json (buildId=$BUILD_ID)"
echo "  Hard refresh (Ctrl+F5) once if the old UI still appears."
echo ""
'@
$deploySh = $deploySh.Replace('__BUILD_ID__', $BuildId).Replace('__BASE_PATH_FOR_BAT__', $basePathForBat)

$createdAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$readmeMd = @'
# LinkNest - Deployment Package

Created : __CREATED_AT__
Package : __PACKAGE_NAME__
Build ID: __BUILD_ID__
Version : __PKG_VERSION__
Base    : __BASE_PATH_DISPLAY__
Database: __DB_MODE_NOTE__
SQLite  : __SQLITE_SHIP_NOTE__

---

## On the other computer (XAMPP)

1. Install / start **XAMPP** (Apache). Enable ``mod_rewrite`` and ``AllowOverride All`` for ``htdocs``.
2. Extract this ZIP anywhere (Desktop is fine).
3. **Fresh install:** double-click ``deploy-xampp.bat``
4. **Upgrade existing:** double-click ``update-xampp.bat`` (keeps ``data/`` + ``uploads/``)
5. Approve the UAC prompt so ``install-sqlite-xampp.bat`` can upgrade XAMPP PHP to SQLite **__SQLITE_TARGET__**
6. Open ``http://localhost/__BASE_PATH_FOR_BAT__``
7. Confirm ``http://localhost/__BASE_PATH_FOR_BAT__/BUILD_INFO.json`` shows buildId `__BUILD_ID__``
8. Hard refresh once (Ctrl+F5) if Semi-PWA still shows an old UI
9. Login: ``admin`` / ``admin123`` - change immediately
10. **System Specs Check:** Admin → Maintenance Scripts → System Specs Check
    (or ``php api/system_specs_check.php``). Compare against ``SOURCE_SPECS.json`` /
    ``TARGET_REQUIREMENTS.json`` shipped in this ZIP.
11. **In-app updates (optional):** Admin → Tools → App Updates (or the nav bell).
    Save a GitHub PAT (``repo`` scope) for private repos. Track branch defaults to ``main``.
    See ``docs/APP_UPDATES.md``. PHP needs **curl** + **zip** extensions enabled.

Optional: run ``verify-install.bat`` to confirm required files (including ``runtime/sqlite/``,
``api/system_specs_check.php``, and ``api/updater*.php``) are present.
Optional: run ``install-sqlite-xampp.bat`` alone if you skipped it during deploy.

---

## In-app App Updates (GitHub)

| Piece | Purpose |
|-------|---------|
| ``api/updater.php`` / ``updater_lib.php`` / ``updater_apply_cli.php`` | Check commits + Releases, apply, rollback |
| ``docs/APP_UPDATES.md`` | Full operator guide |
| ``scripts/publish-update-release.ps1`` | Package + publish ``linknest-update-vX.Y.Z.zip`` to GitHub |
| ``utils/releaseNotesMarkdown.ts`` | Release-notes rendering (bundled into ``dist/``; kept for rebuilds) |
| Nav bell / Admin → App Updates | Admin UI |

Requires PHP extensions: ``curl``, ``zip`` (and ``openssl`` for encrypted token storage).

---

## System Specs Check (match this package's host)

| File / action | Purpose |
|---------------|---------|
| ``api/system_specs_check.php`` | Validator for PHP, SQLite 3.53+, WAL/mmap/cache, writable dirs, response cache |
| ``SOURCE_SPECS.json`` | Snapshot of the packager PC when this ZIP was built |
| ``TARGET_REQUIREMENTS.json`` | Compact checklist the target must meet |
| Admin → System Specs Check | Live re-check on the installed target |

Expect a **Specs match** verdict after SQLite DLL install + first app request (schema migrate).

---

## Load-test showcase report

This package includes the k6 load-test harness under ``load-tests/`` plus the
HTML report from the packager host (when available):

| Path | Purpose |
|------|---------|
| ``load-tests/results/report.html`` | Open in a browser — performance showcase |
| ``load-tests/results/last-summary.json`` | Raw k6 summary used to build the report |
| ``load-tests/README.md`` | How to re-run tests on another machine |

---

## SQLite 3.53.4 + performance (ships with this package)

| Piece | What it does |
|-------|----------------|
| ``runtime/sqlite/libsqlite3.dll`` | Official Windows x64 SQLite **__SQLITE_TARGET__** for XAMPP PHP |
| ``install-sqlite-xampp.bat`` | Replaces ``%XAMPP%\php\libsqlite3.dll`` (backs up the old one) |
| ``api/config.php`` | Applies WAL, mmap 256MB, 32MB cache, 4 worker threads, temp in memory |

After install, confirm on the target PC:

``````
C:\xampp\php\php.exe -r "echo SQLite3::version()['versionString'];"
``````

Expect `__SQLITE_TARGET__``.

> Linux/macOS XAMPP: the DLL installer is Windows-only. Use your distro/PHP package for a recent SQLite; app pragmas in ``api/config.php`` still apply.

---

## Important: why updates sometimes looked "stuck"

If Semi-PWA is enabled, the browser service worker uses cache-first.
This package stamps a unique **buildId** into ``BUILD_INFO.json``. The
service worker cache name includes that id, so a new deploy automatically
invalidates the old UI cache.

---

## Default Credentials

Username : admin
Password : admin123

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Old UI after update | Run update-xampp.bat, then Ctrl+F5; check BUILD_INFO.json |
| In-app updater 404 | Private repo needs GitHub PAT in App Updates settings (repo scope) |
| Updater apply fails | Enable PHP curl + zip; git mode needs clean tree + Node/npm |
| Blank / wrong assets | Confirm folder name is `__BASE_PATH_FOR_BAT__`` (or rebuild with Node) |
| API 404 | Enable AllowOverride All + mod_rewrite in Apache |
| SAML library missing | Package must include ``vendor/`` - re-run packager on source PC |
| Permission errors | Ensure ``data/``, ``uploads/``, ``logs/`` are writable by Apache |
| Old SQLite (3.39.x) | Run ``install-sqlite-xampp.bat`` as Administrator; restart Apache |
| DLL locked / copy failed | Stop Apache in XAMPP Control Panel, re-run install-sqlite-xampp.bat |
| Specs Check failing | Open Admin → System Specs Check; follow each advice line; compare ``TARGET_REQUIREMENTS.json`` |
'@
$readmeMd = $readmeMd.Replace('__CREATED_AT__', $createdAt).Replace('__PACKAGE_NAME__', $PackageName).Replace('__BUILD_ID__', $BuildId).Replace('__PKG_VERSION__', $pkgVersion).Replace('__DB_MODE_NOTE__', $dbModeNote).Replace('__SQLITE_SHIP_NOTE__', $sqliteShipNote).Replace('__SQLITE_TARGET__', $SqliteTargetVersion).Replace('__BASE_PATH_FOR_BAT__', $basePathForBat).Replace('__BASE_PATH_DISPLAY__', $(if ($BasePath) { $BasePath } else { "/" }))

Set-Content -Path (Join-Path $TempDir "deploy-xampp.bat") -Value $deployBat -Encoding ASCII
Set-Content -Path (Join-Path $TempDir "update-xampp.bat") -Value $updateBat -Encoding ASCII
Set-Content -Path (Join-Path $TempDir "verify-install.bat") -Value $verifyBat -Encoding ASCII
if ($SqliteRuntimeBundled) {
    Set-Content -Path (Join-Path $TempDir "install-sqlite-xampp.bat") -Value $installSqliteBat -Encoding ASCII
}
Set-Content -Path (Join-Path $TempDir "deploy-xampp.sh") -Value $deploySh -Encoding UTF8
Set-Content -Path (Join-Path $TempDir "DEPLOYMENT_README.md") -Value $readmeMd -Encoding UTF8

Write-OK "deploy-xampp.bat written"
Write-OK "update-xampp.bat written (preserve data - use this for upgrades)"
Write-OK "verify-install.bat written"
if ($SqliteRuntimeBundled) {
    Write-OK "install-sqlite-xampp.bat written (SQLite $SqliteTargetVersion -> XAMPP PHP)"
}
else {
    Write-Warn "install-sqlite-xampp.bat omitted (SQLite runtime not bundled)"
}
Write-OK "deploy-xampp.sh written"
Write-OK "DEPLOYMENT_README.md written"

# ---------------------------------------------------------------------------
#  8b. Pre-ZIP integrity gate (refuse incomplete packages)
# ---------------------------------------------------------------------------
Write-Header "8b / Pre-ZIP Integrity Gate"

$requiredInPackage = @(
    "dist\index.html",
    "api\index.php",
    "api\config.php",
    "api\system_specs_check.php",
    "api\updater.php",
    "api\updater_lib.php",
    "api\updater_apply_cli.php",
    ".htaccess",
    "vendor\autoload.php",
    "App.tsx",
    "package.json",
    "public\sw-cache-first.js",
    "sw-cache-first.php",
    "BUILD_INFO.json",
    "deploy-xampp.bat",
    "update-xampp.bat",
    "verify-install.bat",
    "utils\releaseNotesMarkdown.ts",
    "utils\urlDisplay.ts",
    "docs\APP_UPDATES.md",
    "scripts\publish-update-release.ps1",
    "components\UpdatesDialog.tsx",
    "services\updaterService.ts"
)

if ($SqliteRuntimeBundled) {
    $requiredInPackage += @(
        "runtime\sqlite\libsqlite3.dll",
        "runtime\sqlite\SQLITE_VERSION.txt",
        "install-sqlite-xampp.bat"
    )
}

if ($LoadTestReportBundled) {
    $requiredInPackage += @(
        "load-tests\results\report.html",
        "load-tests\results\last-summary.json"
    )
}

$integrityFailed = $false
foreach ($rel in $requiredInPackage) {
    $p = Join-Path $TempDir $rel
    if (-not (Test-Path $p)) {
        Write-Err "Required file missing in staging: $rel"
        $integrityFailed = $true
    }
}
# Confirm hashed assets inside dist
$stagedJs = @(Get-ChildItem (Join-Path $TempDir "dist\assets") -Recurse -Filter "*.js" -ErrorAction SilentlyContinue)
if ($stagedJs.Count -lt 1) {
    Write-Err "No JS assets under staging dist/assets/"
    $integrityFailed = $true
}
# Confirm no machine-local secrets leaked
$leakedLocal = @(Get-ChildItem (Join-Path $TempDir "config") -Filter "*.local.php" -Recurse -ErrorAction SilentlyContinue)
if ($leakedLocal.Count -gt 0) {
    Write-Err "Refusing to ship *.local.php (machine secrets)"
    $integrityFailed = $true
}
if (-not $IncludeDatabase) {
    $accidentalDb = Join-Path $TempDir "data\linknest.db"
    if (Test-Path $accidentalDb) {
        Write-Err "Fresh mode but data/linknest.db is present - aborting"
        $integrityFailed = $true
    }
}

if ($integrityFailed) {
    Write-Err "Package integrity check FAILED. ZIP was not created."
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
    Read-Host "Press Enter to exit"
    exit 1
}
Write-OK ("Integrity OK ({0} required paths + {1} JS assets)" -f $requiredInPackage.Count, $stagedJs.Count)

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

# Also emit updater-compatible asset name: linknest-update-vX.Y.Z.zip
$UpdateAssetName = "linknest-update-v$pkgVersion.zip"
$UpdateAssetPath = Join-Path (Split-Path -Parent $ZipOutput) $UpdateAssetName
Copy-Item -Path $ZipOutput -Destination $UpdateAssetPath -Force
Write-OK ("Updater asset: {0}" -f $UpdateAssetPath)

# Spot-check the ZIP itself (previous packages silently omitted vendor/)
Write-Step "Verifying ZIP contents..."
$zipCheck = [System.IO.Compression.ZipFile]::OpenRead($ZipOutput)
try {
    $names = @($zipCheck.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    $mustHaveInZip = @(
        "dist/index.html",
        "api/index.php",
        "api/system_specs_check.php",
        "api/updater.php",
        "api/updater_lib.php",
        "api/updater_apply_cli.php",
        "vendor/autoload.php",
        "BUILD_INFO.json",
        "deploy-xampp.bat",
        "update-xampp.bat",
        "verify-install.bat",
        "utils/releaseNotesMarkdown.ts",
        "docs/APP_UPDATES.md",
        "scripts/publish-update-release.ps1",
        ".htaccess"
    )
    if ($SqliteRuntimeBundled) {
        $mustHaveInZip += @(
            "runtime/sqlite/libsqlite3.dll",
            "install-sqlite-xampp.bat"
        )
    }
    if ($LoadTestReportBundled) {
        $mustHaveInZip += @(
            "load-tests/results/report.html"
        )
    }
    $zipBad = $false
    foreach ($m in $mustHaveInZip) {
        if ($names -notcontains $m) {
            Write-Err "ZIP is missing: $m"
            $zipBad = $true
        }
    }
    $vendorCount = @($names | Where-Object { $_ -like "vendor/*" }).Count
    if ($vendorCount -lt 5) {
        Write-Err ("ZIP vendor/ entry count looks wrong: {0}" -f $vendorCount)
        $zipBad = $true
    }
    else {
        Write-OK ("ZIP vendor/ entries: {0}" -f $vendorCount)
    }
    if ($zipBad) {
        $zipCheck.Dispose()
        Remove-Item $ZipOutput -Force -ErrorAction SilentlyContinue
        throw "ZIP failed content verification and was deleted"
    }
    Write-OK "ZIP content verification passed"
}
finally {
    $zipCheck.Dispose()
}

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
Write-Host "  Update  : $UpdateAssetPath" -ForegroundColor Green
Write-Host "  Size    : $zipMB MB"  -ForegroundColor Green
Write-Host "  BuildId : $BuildId" -ForegroundColor Green
Write-Host "  Version : $pkgVersion" -ForegroundColor Green
Write-Host "  DB mode : $(if ($IncludeDatabase) { 'includes live DB' } else { 'FRESH (no live DB)' })" -ForegroundColor Green
Write-Host "  SQLite  : $(if ($SqliteRuntimeBundled) { "bundled $SqliteVersionShipped + install-sqlite-xampp.bat" } else { 'not bundled' })" -ForegroundColor Green
Write-Host "  Specs   : $(if ($SourceSpecsReady) { 'SOURCE_SPECS.json (ready_for_target_parity=true)' } elseif ($null -ne $SourceSpecsSnapshot) { 'SOURCE_SPECS.json (warnings on source host)' } else { 'no live snapshot' })" -ForegroundColor Green
Write-Host "  Report  : $(if ($LoadTestReportBundled) { 'load-tests/results/report.html (showcase)' } else { 'not bundled' })" -ForegroundColor Green
Write-Host "  Updater : api/updater*.php + docs/APP_UPDATES.md + publish-update-release.ps1" -ForegroundColor Green
if ($gitCommitSha) {
    Write-Host ("  Commit  : {0}" -f $gitCommitSha) -ForegroundColor Green
}
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  ON THE TARGET MACHINE:" -ForegroundColor Yellow
Write-Host "  1. Extract the ZIP" -ForegroundColor Yellow
Write-Host "  2. Fresh install : run deploy-xampp.bat" -ForegroundColor Yellow
Write-Host "  3. Upgrade       : run update-xampp.bat (keeps data/)" -ForegroundColor Yellow
Write-Host "  4. Approve UAC   : installs SQLite $SqliteTargetVersion into XAMPP PHP" -ForegroundColor Yellow
Write-Host "  5. Optional check: run verify-install.bat" -ForegroundColor Yellow
Write-Host "  6. Open BUILD_INFO.json and confirm buildId above" -ForegroundColor Yellow
Write-Host "  7. Ctrl+F5 once if old UI remains (service worker)" -ForegroundColor Yellow
Write-Host "  8. Admin -> Maintenance Scripts -> System Specs Check (match SOURCE_SPECS.json)" -ForegroundColor Yellow
Write-Host "  9. Admin -> App Updates: set GitHub PAT, track branch, Check for updates" -ForegroundColor Yellow
Write-Host "  10. Docs: docs/APP_UPDATES.md" -ForegroundColor Yellow
if ($LoadTestReportBundled) {
    Write-Host "  11. Showcase report: open load-tests\results\report.html in a browser" -ForegroundColor Yellow
}
Write-Host ""

$outputFolder = Split-Path $ZipOutput -Parent
if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion") {
    Start-Process explorer.exe -ArgumentList $outputFolder
}

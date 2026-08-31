# LinkNest k6 load test runner (Windows / PowerShell)
param(
    [string]$BaseUrl = "http://localhost/linknest",
    # -1 = auto: 10 VUs for -Login (typical office concurrency), 100 for guest browse
    [int]$Vus = -1,
    [string]$Duration = "5m",
    [string]$Ramp = "30s",
    [switch]$Login,
    [string]$Username = "admin",
    [string]$Password = "admin123",
    [switch]$HitExternalLinks,
    [switch]$SkipAnalytics,
    [switch]$Smoke
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot "browse-spaces.js"
$resultsDir = Join-Path $PSScriptRoot "results"

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    Write-Host "k6 not found. Installing via winget..." -ForegroundColor Yellow
    winget install --id GrafanaLabs.k6 -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
        throw "k6 installed but not on PATH. Open a new terminal and re-run."
    }
}

if (-not (Test-Path $script)) {
    throw "Missing script: $script"
}

New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null

if ($Vus -lt 0) {
    $Vus = if ($Login) { 10 } else { 100 }
}

if ($Smoke) {
    $Vus = 10
    $Duration = "1m"
    $Ramp = "10s"
}

$envArgs = @(
    "-e", "BASE_URL=$BaseUrl",
    "-e", "VUS=$Vus",
    "-e", "DURATION=$Duration",
    "-e", "RAMP=$Ramp",
    "-e", "SUMMARY_JSON=$($resultsDir -replace '\\','/')/last-summary.json"
)

if ($Login) {
    $envArgs += @("-e", "LOGIN=1", "-e", "USERNAME=$Username", "-e", "PASSWORD=$Password")
}
if ($HitExternalLinks) {
    $envArgs += @("-e", "HIT_EXTERNAL_LINKS=1")
}
if ($SkipAnalytics) {
    $envArgs += @("-e", "HIT_ANALYTICS=0")
}

Write-Host "Running application load test" -ForegroundColor Cyan
Write-Host "  BASE_URL=$BaseUrl  VUS=$Vus  DURATION=$Duration  RAMP=$Ramp"
Write-Host "  LOGIN=$([bool]$Login)  HIT_EXTERNAL=$([bool]$HitExternalLinks)"

$testedAt = (Get-Date).ToUniversalTime().ToString("o")

& k6 run @envArgs $script
$exit = $LASTEXITCODE

Write-Host ""
if ($exit -eq 0) {
    Write-Host "Load test finished (thresholds passed)." -ForegroundColor Green
} else {
    Write-Host "Load test finished with failures (exit $exit). See thresholds above." -ForegroundColor Yellow
}

$reportScript = Join-Path $PSScriptRoot "generate-report.js"
$summaryJson = Join-Path $resultsDir "last-summary.json"
$reportHtml = Join-Path $resultsDir "report.html"
if ((Test-Path $reportScript) -and (Test-Path $summaryJson)) {
    Write-Host "Generating HTML report..." -ForegroundColor Cyan
    $env:TESTED_AT = $testedAt
    $env:BASE_URL = $BaseUrl
    node $reportScript $summaryJson $reportHtml
    if (Test-Path $reportHtml) {
        Write-Host "Report: $reportHtml" -ForegroundColor Cyan
        Write-Host "Also available in the app: Admin → Load Test" -ForegroundColor Cyan
        Start-Process $reportHtml
    }
}

exit $exit

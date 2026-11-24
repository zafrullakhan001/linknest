# Restore Linknest Analytics PostgreSQL schema
# Uses: postgres/postgres on localhost:5433
# Creates database linknest_analytics and all tables (including geo location_lookup)
#
# Prerequisites: PostgreSQL (with TimescaleDB) and psql/createdb in PATH
# Run from repo root or analytics folder:
#   .\analytics\restore-analytics-db.ps1
#   # or
#   cd analytics; .\restore-analytics-db.ps1

param(
    [string]$DbHost = "localhost",
    [int]$Port = 5433,
    [string]$User = "postgres",
    [string]$Password = "postgres",
    [string]$Database = "linknest_analytics"
)

$ErrorActionPreference = "Stop"
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$SchemaPath = Join-Path $ScriptDir "schema.sql"

if (-not (Test-Path $SchemaPath)) {
    Write-Error "Schema file not found: $SchemaPath"
    exit 1
}

# Avoid password in command line; use environment
$env:PGPASSWORD = $Password

Write-Host "=== Linknest Analytics – Restore PostgreSQL schema ===" -ForegroundColor Cyan
Write-Host "Host: $DbHost`:$Port  User: $User  Database: $Database"
Write-Host ""

# 1) Create database if it doesn't exist
$exists = & psql -h $DbHost -p $Port -U $User -d "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to connect to PostgreSQL. Is the server running on $DbHost`:$Port? Error: $exists"
    exit 1
}
if (-not $exists) {
    Write-Host "Creating database: $Database ..."
    & createdb -h $DbHost -p $Port -U $User $Database 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create database: $Database"
        exit 1
    }
    Write-Host "Database created."
} else {
    Write-Host "Database '$Database' already exists. Applying schema..."
}
Write-Host ""

# 2) Run schema (Tables, hypertable, views, continuous aggregate, trigger, location_lookup)
Write-Host "Running schema.sql ..."
& psql -h $DbHost -p $Port -U $User -d $Database -f $SchemaPath 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Schema execution failed. Check errors above."
    exit 1
}

Write-Host ""
Write-Host "Schema restored successfully." -ForegroundColor Green
Write-Host 'Tables: metrics_queue, performance_metrics (hypertable), link_latency_summary, user_geolocations, alert_thresholds, location_lookup'
Write-Host "Views: user_current_location, performance_alerts"
Write-Host "Continuous aggregate: performance_by_region_hourly"
Write-Host ""
Write-Host "Optional – populate location_lookup with cities:"
Write-Host "  php $ScriptDir\geoip\setup-location-lookup-table.php"
Write-Host "  php $ScriptDir\geoip\import-world-cities.php <path-to-world-cities.csv>"
Write-Host ""

# Clear password from environment
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

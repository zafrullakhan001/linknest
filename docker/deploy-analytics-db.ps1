# Deploy PostgreSQL analytics container (TimescaleDB, postgres/postgres, port 5433)
# Auto-creates database "analytics" and runs schema.sql on first start.
#
# Run from repo root: .\docker\deploy-analytics-db.ps1
# Or:  .\docker\deploy-analytics-db.ps1 -Detach
#      .\docker\deploy-analytics-db.ps1 -Stop

param(
    [switch]$Detach = $true,
    [switch]$Stop
)

$ComposeDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$ComposeFile = Join-Path $ComposeDir "docker-compose.analytics.yml"

if (-not (Test-Path $ComposeFile)) {
    Write-Error "Compose file not found: $ComposeFile"
    exit 1
}

# Ensure we run from repo root so volume .. is correct
$RepoRoot = (Resolve-Path (Join-Path $ComposeDir "..")).Path
Push-Location $RepoRoot
try {
    if ($Stop) {
        Write-Host "Stopping analytics database container..." -ForegroundColor Cyan
        & docker compose -f $ComposeFile down
        Write-Host "Done." -ForegroundColor Green
        exit 0
    }

    Write-Host "=== Deploy Analytics PostgreSQL (TimescaleDB) ===" -ForegroundColor Cyan
    Write-Host "Database: analytics  |  User: postgres  |  Password: postgres  |  Port: 5433"
    Write-Host "Schema and tables are created automatically on first start."
    Write-Host ""

    if ($Detach) {
        & docker compose -f $ComposeFile up -d
    } else {
        & docker compose -f $ComposeFile up
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker Compose failed."
        exit 1
    }

    Write-Host ""
    Write-Host "Connect: psql -h localhost -p 5433 -U postgres -d analytics" -ForegroundColor Green
    Write-Host "In Linknest: set Performance Analytics DB to host=localhost, port=5433, database=analytics, user=postgres, password=postgres"
    Write-Host ""
} finally {
    Pop-Location
}

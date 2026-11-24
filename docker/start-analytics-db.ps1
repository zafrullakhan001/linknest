# Start PostgreSQL + TimescaleDB for Linknest Analytics
# - Database: linknest_analytics
# - Port: 5433  (host) -> 5432 (container)
# - User: postgres
# - Password: password
#
# On first run, init scripts create the analytics schema and location_lookup table.
# Run from repo root:  .\docker\start-analytics-db.ps1

$ErrorActionPreference = "Stop"
$composeFile = Join-Path $PSScriptRoot "docker-compose.analytics-db.yml"

# Ensure we run from repo root so volume mount ".." resolves correctly
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot
try {
    Write-Host "Starting Linknest Analytics DB (PostgreSQL + Timescale) on port 5433..." -ForegroundColor Cyan
    & docker compose -f $composeFile up -d
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host ""
    Write-Host "Analytics database is starting. Connection details:" -ForegroundColor Green
    Write-Host "  Host:     localhost"
    Write-Host "  Port:     5433"
    Write-Host "  Database: linknest_analytics"
    Write-Host "  User:     postgres"
    Write-Host "  Password: password"
    Write-Host ""
    Write-Host "Configure these in Linknest Admin -> Addons -> Performance Analytics (PostgreSQL settings)."
    Write-Host "Check logs: docker compose -f docker/docker-compose.analytics-db.yml logs -f analytics-db"
    Write-Host "Stop:       docker compose -f docker/docker-compose.analytics-db.yml down"
} finally {
    Pop-Location
}

# Onboard all extensions to database zmonitoring (PG-full container), including pg_cron.
# For pg_cron in zmonitoring: set PG_CRON_DATABASE=zmonitoring, recreate container, then run this script.
# Usage: .\scripts\db\onboard_extensions_zmonitoring.ps1
#        .\scripts\db\onboard_extensions_zmonitoring.ps1 -ContainerName PG-full

param(
    [string]$ContainerName = "PG-full"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sqlFile = Join-Path $scriptDir "onboard_extensions_zmonitoring.sql"

if (-not (Test-Path $sqlFile)) {
    Write-Host "SQL file not found: $sqlFile" -ForegroundColor Red
    exit 1
}

Write-Host "Adding extensions to database zmonitoring in container $ContainerName..." -ForegroundColor Cyan
Get-Content $sqlFile | docker exec -i $ContainerName psql -U postgres -d zmonitoring
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Done. Verifying extensions:" -ForegroundColor Green
docker exec $ContainerName psql -U postgres -d zmonitoring -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"

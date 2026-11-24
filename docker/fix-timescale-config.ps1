# Fix PG-timescale postgresql.conf (broken after manual edits)
# - Stops the container, backs up and repairs postgresql.conf in the volume,
#   then restarts. Use this when the container won't start after editing postgresql.conf.
#
# Fixes applied:
# - timezone / log_timezone / TimeZone: LOCAL -> UTC (PG18 invalid)
# - shared_preload_libraries -> 'timescaledb,pg_cron'
# - cron.database_name -> 'linknest_analytics'
#
# Run from project root: .\docker\fix-timescale-config.ps1

$ErrorActionPreference = "Stop"
$containerName = "PG-timescale"

Write-Host "=== PG-timescale config fix (repair postgresql.conf in volume) ===" -ForegroundColor Cyan
Write-Host ""

# 1. Find container (running or stopped)
$cid = docker ps -aq -f "name=^${containerName}$"
if (-not $cid) {
    Write-Host "Container '$containerName' not found." -ForegroundColor Red
    Write-Host "If you use Compose, start once with: docker compose -f docker/docker-compose.timescale.yml up -d" -ForegroundColor Yellow
    exit 1
}

# 2. Get volume
$inspect = docker inspect $containerName | ConvertFrom-Json
$mounts = $inspect.Mounts
if (-not $mounts -or $mounts.Count -eq 0) {
    Write-Host "No volume found on '$containerName'. Cannot fix config." -ForegroundColor Red
    exit 1
}
$vol = $mounts[0]
$volumeName = $vol.Source
$volumeDest = $vol.Destination
Write-Host "Container: $containerName"
Write-Host "Volume:    $volumeName"
Write-Host ""

# 3. Stop container
Write-Host "Stopping container..." -ForegroundColor Yellow
docker stop $containerName 2>$null
Write-Host "Stopped."
Write-Host ""

# 4. Fix postgresql.conf in volume (backup + sed fixes)
$backupSuffix = Get-Date -Format "yyyyMMdd-HHmmss"
$fixSh = @'
set -e
DEST="DEST_PLACEHOLDER"
backup_one() {
  [ -f "$1" ] || return 0
  cp -a "$1" "$1.bak.BACKUP_SUFFIX" && echo "Backed up: $1"
}
fix_one() {
  [ -f "$1" ] || return 0
  echo "Fixing: $1"
  backup_one "$1"
  # Timezone: LOCAL -> UTC (all variants)
  sed -i.bak -e "s/timezone = '\''LOCAL'\''/timezone = '\''UTC'\''/g" -e "s/log_timezone = '\''LOCAL'\''/log_timezone = '\''UTC'\''/g" -e "s/TimeZone = '\''LOCAL'\''/TimeZone = '\''UTC'\''/g" "$1"
  sed -i.bak -e 's/timezone = "LOCAL"/timezone = "UTC"/g' -e 's/log_timezone = "LOCAL"/log_timezone = "UTC"/g' -e 's/TimeZone = "LOCAL"/TimeZone = "UTC"/g' "$1"
  sed -i.bak -e 's/^timezone = LOCAL/timezone = UTC/g' -e 's/^log_timezone = LOCAL/log_timezone = UTC/g' -e 's/^TimeZone = LOCAL/TimeZone = UTC/g' "$1"
  # shared_preload_libraries: ensure timescaledb and pg_cron
  if grep -qE '^#?\s*shared_preload_libraries' "$1" 2>/dev/null; then
    sed -i.bak -r "s/^#?\s*shared_preload_libraries\s*=\s*.*/shared_preload_libraries = 'timescaledb,pg_cron'/" "$1"
  else
    echo "shared_preload_libraries = 'timescaledb,pg_cron'" >> "$1"
  fi
  # cron.database_name (for pg_cron)
  if grep -qE '^#?\s*cron\.database_name' "$1" 2>/dev/null; then
    sed -i.bak -r "s/^#?\s*cron\.database_name\s*=\s*.*/cron.database_name = 'linknest_analytics'/" "$1"
  else
    echo "cron.database_name = 'linknest_analytics'" >> "$1"
  fi
  rm -f "$1.bak" 2>/dev/null
}
find DEST_PLACEHOLDER -name "postgresql.conf" -type f 2>/dev/null | while read f; do fix_one "$f"; done
echo "Config fix complete."
'@
$fixSh = $fixSh -replace 'DEST_PLACEHOLDER', $volumeDest
$fixSh = $fixSh -replace 'BACKUP_SUFFIX', $backupSuffix
$scriptPathWin = Join-Path $env:TEMP "fix-timescale-config.sh"
$fixSh | Set-Content -Path $scriptPathWin -Encoding UTF8 -NoNewline
# Ensure Unix line endings for shell
$content = [System.IO.File]::ReadAllText($scriptPathWin)
$content = $content -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($scriptPathWin, $content)
$scriptPathDocker = (Resolve-Path $scriptPathWin).Path.Replace('\', '/')

docker run --rm `
  -v "${volumeName}:${volumeDest}:rw" `
  -v "${scriptPathDocker}:/fix.sh:ro" `
  --entrypoint "sh" `
  alpine:3.19 `
  -c "apk add --no-cache findutils sed grep 2>/dev/null; sh /fix.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Fix failed. Your config backup is in the volume (*.bak.$backupSuffix)." -ForegroundColor Red
    if (Test-Path $scriptPathWin) { Remove-Item $scriptPathWin -Force -ErrorAction SilentlyContinue }
    exit 1
}
if (Test-Path $scriptPathWin) { Remove-Item $scriptPathWin -Force -ErrorAction SilentlyContinue }

Write-Host "Config updated (backups: *.bak.$backupSuffix in volume)."
Write-Host ""

# 5. Start container again
Write-Host "Starting $containerName..." -ForegroundColor Green
docker start $containerName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Start failed. Try: docker start $containerName" -ForegroundColor Red
    Write-Host "Or with Compose: docker compose -f docker/docker-compose.timescale.yml up -d" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Done. Check: docker logs -f $containerName" -ForegroundColor Green
Write-Host "To use pg_cron: ensure you use the image built from Dockerfile.timescale-pgcron, then run:" -ForegroundColor Gray
Write-Host "  psql -h localhost -p 5433 -U postgres -d linknest_analytics -c \"CREATE EXTENSION IF NOT EXISTS pg_cron;\"" -ForegroundColor Gray

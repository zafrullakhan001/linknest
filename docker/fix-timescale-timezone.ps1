# Fix PG-timescale "LOCAL" timezone without destroying container or data
# - Stops the container (does not remove it)
# - Mounts its data volume in a temp container and fixes postgresql.conf
# - You then start PG-timescale again
# Run from project root or docker folder: .\docker\fix-timescale-timezone.ps1

$ErrorActionPreference = "Stop"
$containerName = "PG-timescale"

Write-Host "=== PG-timescale timezone fix (no data loss, container kept) ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check container exists
$cid = docker ps -aq -f "name=^${containerName}$"
if (-not $cid) {
    Write-Host "Container '$containerName' not found. Is it already removed?" -ForegroundColor Red
    exit 1
}

# 2. Get volume mount (source volume and destination path)
$inspect = docker inspect $containerName | ConvertFrom-Json
$mounts = $inspect.Mounts
if (-not $mounts -or $mounts.Count -eq 0) {
    Write-Host "No volume found on container '$containerName'. Cannot fix config safely." -ForegroundColor Red
    exit 1
}
$vol = $mounts[0]
$volumeName = $vol.Source
$volumeDest = $vol.Destination
Write-Host "Container: $containerName"
Write-Host "Volume:    $volumeName"
Write-Host "Mount at:  $volumeDest"
Write-Host ""

# 3. Stop container (do NOT remove)
Write-Host "Stopping container (keeping it and the volume)..." -ForegroundColor Yellow
docker stop $containerName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to stop container." -ForegroundColor Red
    exit 1
}
Write-Host "Stopped."
Write-Host ""

# 4. Run a one-off container to fix postgresql.conf in the volume
#    Config path in PG18 image is often /var/lib/postgresql/18/docker/postgresql.conf
#    Fix all postgresql.conf under mount and both quoted/unquoted LOCAL.
Write-Host "Fixing postgresql.conf in volume (replace LOCAL -> UTC)..." -ForegroundColor Yellow
$fixSh = @'
set -e
fix_one() {
  [ -f "$1" ] || return 0
  echo "Fixing: $1"
  # Single-quoted, double-quoted, and unquoted LOCAL
  sed -i.bak \
    -e "s/timezone = '\''LOCAL'\''/timezone = '\''UTC'\''/g" \
    -e "s/log_timezone = '\''LOCAL'\''/log_timezone = '\''UTC'\''/g" \
    -e "s/TimeZone = '\''LOCAL'\''/TimeZone = '\''UTC'\''/g" \
    -e 's/timezone = "LOCAL"/timezone = "UTC"/g' \
    -e 's/log_timezone = "LOCAL"/log_timezone = "UTC"/g' \
    -e 's/TimeZone = "LOCAL"/TimeZone = "UTC"/g' \
    -e 's/timezone = LOCAL/timezone = UTC/g' \
    -e 's/log_timezone = LOCAL/log_timezone = UTC/g' \
    -e 's/TimeZone = LOCAL/TimeZone = UTC/g' \
    "$1"
  grep -E 'timezone|log_timezone|TimeZone' "$1" || true
}
# Try exact path from error message, then search entire mount
fix_one "DEST/postgresql.conf"
fix_one "DEST/18/docker/postgresql.conf"
fix_one "/var/lib/postgresql/18/docker/postgresql.conf"
find DEST -name postgresql.conf -type f 2>/dev/null | while read f; do fix_one "$f"; done
echo "Fix complete."
'@
$fixSh = $fixSh -replace 'DEST', $volumeDest
$scriptPathWin = Join-Path $env:TEMP "fix-timescale-timezone.sh"
$fixSh | Set-Content -Path $scriptPathWin -Encoding UTF8
# Docker on Windows needs path with forward slashes for bind mount
$scriptPathDocker = (Resolve-Path $scriptPathWin).Path.Replace('\', '/')
docker run --rm `
  -v "${volumeName}:${volumeDest}:rw" `
  -v "${scriptPathDocker}:/fix.sh:ro" `
  --entrypoint "sh" `
  timescale/timescaledb:latest-pg18 `
  /fix.sh
if (Test-Path $scriptPathWin) { Remove-Item $scriptPathWin -Force -ErrorAction SilentlyContinue }

if ($LASTEXITCODE -ne 0) {
    Write-Host "Fix failed. Container is stopped; volume unchanged." -ForegroundColor Red
    Write-Host "You can start the container again: docker start $containerName" -ForegroundColor Yellow
    exit 1
}

Write-Host "Config updated."
Write-Host ""

# 5. Start the container again
Write-Host "Starting $containerName again..." -ForegroundColor Green
docker start $containerName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Start failed. Try manually: docker start $containerName" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done. Check logs: docker logs -f $containerName" -ForegroundColor Green
Write-Host "If you still see 'log_timezone: LOCAL' errors, run: .\docker\start-timescale-with-override.ps1" -ForegroundColor Gray

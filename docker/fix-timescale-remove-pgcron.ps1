# Remove pg_cron from shared_preload_libraries so PG-timescale can start with the base image.
# Use when you see: FATAL: could not access file "pg_cron": No such file or directory
#
# After this, start with: docker compose -f docker/docker-compose.timescale-no-pgcron.yml up -d
# To use pg_cron later: build the pg_cron image and use docker-compose.timescale.yml.
#
# Run from project root: .\docker\fix-timescale-remove-pgcron.ps1

$ErrorActionPreference = "Stop"
$containerName = "PG-timescale"

Write-Host "=== Remove pg_cron from preload (so container can start with base image) ===" -ForegroundColor Cyan
Write-Host ""

$cid = docker ps -aq -f "name=^${containerName}$"
if (-not $cid) {
    Write-Host "Container '$containerName' not found. Locating volume by name..." -ForegroundColor Yellow
    $volumeName = "linknest_timescale_data"
    $volList = docker volume ls -q
    if ($volList -match "timescale_data") {
        $volumeName = ($volList | Select-String "timescale_data") | Select-Object -First 1
    }
    if (-not $volumeName) {
        Write-Host "Run once: docker compose -f docker/docker-compose.timescale-no-pgcron.yml up -d" -ForegroundColor Yellow
        Write-Host "Then run this script again, or pass volume name." -ForegroundColor Gray
        exit 1
    }
    $volumeDest = "/var/lib/postgresql/data"
} else {
    $inspect = docker inspect $containerName | ConvertFrom-Json
    $mounts = $inspect.Mounts
    if (-not $mounts -or $mounts.Count -eq 0) {
        Write-Host "No volume on '$containerName'." -ForegroundColor Red
        exit 1
    }
    $volumeName = $mounts[0].Source
    $volumeDest = $mounts[0].Destination
    Write-Host "Stopping container..." -ForegroundColor Yellow
    docker stop $containerName 2>$null
}

Write-Host "Volume: $volumeName"
Write-Host ""

$backupSuffix = Get-Date -Format "yyyyMMdd-HHmmss"
$fixSh = @'
set -e
DEST="DEST_PLACEHOLDER"
for f in $(find DEST_PLACEHOLDER -name "postgresql.conf" -type f 2>/dev/null); do
  [ -f "$f" ] || continue
  echo "Fixing: $f"
  cp -a "$f" "$f.bak.BACKUP_SUFFIX"
  sed -i.bak -r "s/^#?\s*shared_preload_libraries\s*=\s*.*/shared_preload_libraries = '\''timescaledb'\''/" "$f"
  rm -f "$f.bak" 2>/dev/null
done
echo "Done. shared_preload_libraries set to timescaledb only."
'@
$fixSh = $fixSh -replace 'DEST_PLACEHOLDER', $volumeDest
$fixSh = $fixSh -replace 'BACKUP_SUFFIX', $backupSuffix
$scriptPathWin = Join-Path $env:TEMP "fix-timescale-remove-pgcron.sh"
$fixSh | Set-Content -Path $scriptPathWin -Encoding UTF8 -NoNewline
$content = [System.IO.File]::ReadAllText($scriptPathWin) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($scriptPathWin, $content)
$scriptPathDocker = (Resolve-Path $scriptPathWin).Path.Replace('\', '/')

docker run --rm `
  -v "${volumeName}:${volumeDest}:rw" `
  -v "${scriptPathDocker}:/fix.sh:ro" `
  --entrypoint "sh" `
  alpine:3.19 `
  -c "apk add --no-cache findutils sed 2>/dev/null; sh /fix.sh"

if ($LASTEXITCODE -ne 0) {
    if (Test-Path $scriptPathWin) { Remove-Item $scriptPathWin -Force -ErrorAction SilentlyContinue }
    exit 1
}
if (Test-Path $scriptPathWin) { Remove-Item $scriptPathWin -Force -ErrorAction SilentlyContinue }

Write-Host "Config updated (backups: *.bak.$backupSuffix)." -ForegroundColor Green
Write-Host ""
Write-Host "Start the container with the compose that does NOT load pg_cron:" -ForegroundColor Yellow
Write-Host "  cd c:\xampp\htdocs\linknest" -ForegroundColor White
Write-Host "  docker compose -f docker/docker-compose.timescale-no-pgcron.yml up -d" -ForegroundColor White
Write-Host ""
Write-Host "This recreates the container with command: shared_preload_libraries=timescaledb (no pg_cron)." -ForegroundColor Gray
Write-Host "To add pg_cron later: build with docker-compose.timescale.yml and use that compose." -ForegroundColor Gray

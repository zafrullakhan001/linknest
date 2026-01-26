# Start PG-timescale with timezone override (no config edit)
# Use this if fix-timescale-timezone.ps1 still leaves the container failing.
# Recreates the container with the SAME volume (data is kept) and runs Postgres
# with -c log_timezone=UTC -c TimeZone=UTC so the invalid "LOCAL" in the config is ignored.
# Run from project root: .\docker\start-timescale-with-override.ps1

$ErrorActionPreference = "Stop"
$containerName = "PG-timescale"

Write-Host "=== Recreate PG-timescale with timezone override (volume kept) ===" -ForegroundColor Cyan

$cid = docker ps -aq -f "name=^${containerName}$"
if (-not $cid) {
    Write-Host "Container '$containerName' not found." -ForegroundColor Red
    exit 1
}

$inspect = docker inspect $containerName | ConvertFrom-Json
$mounts = $inspect.Mounts
if (-not $mounts -or $mounts.Count -eq 0) {
    Write-Host "No volume on container. Exiting." -ForegroundColor Red
    exit 1
}
$vol = $mounts[0]
$volumeName = $vol.Source
$volumeDest = $vol.Destination

# Collect run options from existing container (approx.)
$envList = @()
foreach ($e in $inspect.Config.Env) {
    if ($e -match '^([^=]+)=(.*)$') { $envList += "-e", $e }
}
$portList = @()
foreach ($p in $inspect.NetworkSettings.Ports.PsObject.Properties) {
    if ($p.Value -and $p.Value.Count -gt 0) {
        $hostPort = $p.Value[0].HostPort
        $portList += "-p", "${hostPort}:5432"
    }
}
if ($portList.Count -eq 0) { $portList = @("-p", "5433:5432") }

$image = $inspect.Config.Image
if (-not $image -or $image -eq "<no value>") { $image = "timescale/timescaledb:latest-pg18" }
if ($image -notmatch ':') { $image = "${image}:latest" }

Write-Host "Stopping and removing container (volume '$volumeName' is NOT removed)..." -ForegroundColor Yellow
docker stop $containerName 2>$null
docker rm $containerName

Write-Host "Creating new container with same volume and timezone override..." -ForegroundColor Green
$runArgs = @(
    "run", "-d",
    "--name", $containerName,
    "-v", "${volumeName}:${volumeDest}:rw",
    "--restart", "unless-stopped"
)
$runArgs += $envList
$runArgs += $portList
$runArgs += $image
$runArgs += "postgres", "-c", "log_timezone=UTC", "-c", "TimeZone=UTC"

& docker @runArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "Create failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done. Check: docker logs -f $containerName" -ForegroundColor Green

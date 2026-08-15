<#
.SYNOPSIS
  Copy LinkNest SQLite database and uploads between the Windows host and the running Docker container.

.PARAMETER Direction
  In  = host -> container (default). Restores XAMPP data into Docker.
  Out = container -> host. Pulls the live Docker database back to data/ and uploads/.

.PARAMETER DatabaseOnly
  Copy only data/linknest.db (skip uploads/).

.PARAMETER UploadsOnly
  Copy only uploads/ (skip the database).

.PARAMETER SkipPathRewrite
  Do not rewrite /linknest/uploads/... vs /uploads/... after copy.

.PARAMETER HostBasePath
  Subpath used by the host XAMPP install when copying Out (default /linknest).
  Docker always serves at /. Inbound copies rewrite to /uploads/.

.PARAMETER Container
  Docker container name (default linknest).
#>
[CmdletBinding()]
param(
    [ValidateSet('In', 'Out')]
    [string]$Direction = 'In',
    [switch]$DatabaseOnly,
    [switch]$UploadsOnly,
    [switch]$SkipPathRewrite,
    [string]$HostBasePath = '/linknest',
    [string]$Container = 'linknest'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'docker\docker-compose.yml'))) {
    $Root = (Get-Location).Path
}

$HostDb = Join-Path $Root 'data\linknest.db'
$HostUploads = Join-Path $Root 'uploads'
$CtrDb = '/var/www/html/data/linknest.db'
$CtrUploads = '/var/www/html/uploads'

function Assert-Docker {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker daemon is not running. Start Docker Desktop, then retry.'
    }
    $running = docker inspect -f '{{.State.Running}}' $Container 2>$null
    if ($running -ne 'true') {
        throw "Container '$Container' is not running. Start it with redeploy-docker.bat first."
    }
}

function Normalize-HostBasePath([string]$p) {
    $p = $p.Trim()
    if ($p -eq '' -or $p -eq '/' -or $p -eq './') { return '' }
    if (-not $p.StartsWith('/')) { $p = '/' + $p }
    return $p.TrimEnd('/')
}

function Invoke-ContainerSql([string]$sql) {
    docker exec $Container sqlite3 $CtrDb $sql
}

Assert-Docker
$base = Normalize-HostBasePath $HostBasePath
$doDb = -not $UploadsOnly.IsPresent
$doUp = -not $DatabaseOnly.IsPresent

Write-Host "[sync] Direction: $Direction"
Write-Host "[sync] Container: $Container"
Write-Host "[sync] Host:      $Root"

if ($Direction -eq 'In') {
    if ($doDb) {
        if (-not (Test-Path $HostDb)) { throw "Host database not found: $HostDb" }
        Write-Host '[sync] Copying host database into container...'
        docker exec $Container sqlite3 $CtrDb 'PRAGMA wal_checkpoint(TRUNCATE);' 2>$null | Out-Null
        docker cp $HostDb "${Container}:/tmp/linknest.db.in"
        if ($LASTEXITCODE -ne 0) { throw 'docker cp database failed' }
        docker exec -u root $Container sh -c "cp /tmp/linknest.db.in $CtrDb && chown www-data:www-data $CtrDb && chmod 644 $CtrDb && rm -f /tmp/linknest.db.in $CtrDb-wal $CtrDb-shm"
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install database inside container' }
        Write-Host '[sync] Database copied.'
    }
    if ($doUp) {
        if (-not (Test-Path $HostUploads)) { throw "Host uploads folder not found: $HostUploads" }
        Write-Host '[sync] Copying host uploads into container...'
        docker exec -u root $Container sh -c "mkdir -p $CtrUploads && rm -rf /tmp/uploads.in && mkdir -p /tmp/uploads.in"
        docker cp "${HostUploads}/." "${Container}:/tmp/uploads.in"
        if ($LASTEXITCODE -ne 0) { throw 'docker cp uploads failed' }
        docker exec -u root $Container sh -c "cp -a /tmp/uploads.in/. $CtrUploads/ && chown -R www-data:www-data $CtrUploads && chmod -R 755 $CtrUploads && rm -rf /tmp/uploads.in"
        Write-Host '[sync] Uploads copied.'
    }
    if ($doDb -and -not $SkipPathRewrite) {
        Write-Host '[sync] Rewriting /linknest/uploads (and other subpaths) to /uploads for Docker root...'
        Invoke-ContainerSql "UPDATE tiles SET emoji_image = substr(emoji_image, instr(emoji_image, '/uploads/')) WHERE emoji_image LIKE '%/uploads/%' AND emoji_image NOT LIKE '/uploads/%';"
        Invoke-ContainerSql "UPDATE tiles SET header_image = substr(header_image, instr(header_image, '/uploads/')) WHERE header_image LIKE '%/uploads/%' AND header_image NOT LIKE '/uploads/%';"
        Invoke-ContainerSql "UPDATE settings SET value = substr(value, instr(value, '/uploads/')) WHERE typeof(value)='text' AND value LIKE '%/uploads/%' AND value NOT LIKE '/uploads/%' AND length(value) < 512;"
        Write-Host '[sync] Path rewrite done.'
    }
    Write-Host '[sync] Restarting container so PHP drops the old SQLite handle...'
    docker restart $Container | Out-Null
    Write-Host '[ok] Host data is now inside Docker. Refresh https://localhost:8443 (Ctrl+F5).'
    exit 0
}

# Direction Out
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null
New-Item -ItemType Directory -Force -Path $HostUploads | Out-Null

if ($doDb) {
    Write-Host '[sync] Copying container database to host...'
    docker exec $Container sqlite3 $CtrDb 'PRAGMA wal_checkpoint(TRUNCATE);' 2>$null | Out-Null
    $bak = Join-Path $Root ("data\linknest.db.hostbak-{0:yyyyMMdd-HHmmss}" -f (Get-Date))
    if (Test-Path $HostDb) {
        Copy-Item $HostDb $bak
        Write-Host "[sync] Host DB backup: $bak"
    }
    docker cp "${Container}:${CtrDb}" $HostDb
    if ($LASTEXITCODE -ne 0) { throw 'docker cp database out failed' }
    Get-ChildItem (Join-Path $Root 'data\linknest.db-*') -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host '[sync] Database copied to host.'
}

if ($doUp) {
    Write-Host '[sync] Copying container uploads to host...'
    docker cp "${Container}:${CtrUploads}/." $HostUploads
    if ($LASTEXITCODE -ne 0) { throw 'docker cp uploads out failed' }
    Write-Host '[sync] Uploads copied to host.'
}

if ($doDb -and -not $SkipPathRewrite -and $base -ne '') {
    Write-Host "[sync] Rewriting /uploads/ to $base/uploads/ for host XAMPP..."
    $prefix = $base + '/uploads/'
    $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if ($sqlite) {
        & sqlite3 $HostDb "UPDATE tiles SET emoji_image = '$prefix' || substr(emoji_image, 10) WHERE emoji_image LIKE '/uploads/%';"
        & sqlite3 $HostDb "UPDATE tiles SET header_image = '$prefix' || substr(header_image, 10) WHERE header_image LIKE '/uploads/%';"
        & sqlite3 $HostDb "UPDATE settings SET value = replace(value, '/uploads/', '$prefix') WHERE typeof(value)='text' AND value LIKE '/uploads/%' AND length(value) < 512;"
    } else {
        Write-Host '[warn] sqlite3.exe not on PATH — left Docker /uploads/ paths as-is.'
        Write-Host '       Settings API still rewrites logo/favicon; tile emoji images may need a Docker Apache rewrite or sqlite3.'
    }
}

Write-Host '[ok] Docker data is now on the host. Refresh the XAMPP site (Ctrl+F5).'
exit 0

<#
.SYNOPSIS
    Restore all PostgreSQL databases into PG-full container and ensure all extensions exist.
.DESCRIPTION
    Copies backup files into the container, restores postgres, linknest_analytics, and zmonitoring,
    then creates all extensions (pg_cron only in linknest_analytics) in each database.
.PARAMETER ContainerName
    Docker container name (default: PG-full).
.PARAMETER BackupDir
    Directory containing backup_*.sql and backup_*.dump files (default: project root).
.PARAMETER PostgresBackup
    Filename for postgres backup (e.g. backup_postgres_2026-01-30_064936.sql).
.PARAMETER AnalyticsBackup
    Filename for analytics backup (e.g. backup_analytics_2026-01-30_064936.sql).
.PARAMETER ZmonitoringBackup
    Filename for zmonitoring backup (e.g. backup_zmonitoring_2026-01-30_064936.sql or .dump).
#>
param(
    [string]$ContainerName = "PG-full",
    [string]$BackupDir = "",
    [string]$PostgresBackup = "backup_postgres_2026-01-30_064936.sql",
    [string]$AnalyticsBackup = "backup_analytics_2026-01-30_064936.sql",
    [string]$ZmonitoringBackup = "backup_zmonitoring_2026-01-30_064936.sql"
)

$ErrorActionPreference = "Stop"
if (-not $BackupDir) {
    $BackupDir = Join-Path (Split-Path $PSScriptRoot -Parent) ".."
    $BackupDir = (Resolve-Path $BackupDir).Path
}

function Sanitize-SqlFile {
    param([string]$Path)
    $content = Get-Content $Path -Raw
    $content = $content -replace '(?m)^\\restrict.*$', '-- \restrict (commented for restore)'
    $content = $content -replace '(?m)^(CREATE EXTENSION IF NOT EXISTS timescaledb.*)$', '-- $1'
    $content = $content -replace '(?m)^(CREATE EXTENSION timescaledb.*)$', '-- $1'
    return $content
}

function Ensure-Extensions {
    param([string]$Container, [string]$Database, [bool]$IncludePgCron)
    $exts = @("timescaledb", "pg_stat_statements", "postgis", "postgres_fdw", "intarray")
    if ($IncludePgCron) { $exts = @("timescaledb", "pg_cron", "pg_stat_statements", "postgis", "postgres_fdw", "intarray") }
    foreach ($ext in $exts) {
        docker exec $Container psql -U postgres -d $Database -c "CREATE EXTENSION IF NOT EXISTS $ext;" 2>$null
    }
}

Write-Host "=== Restore all databases to $ContainerName ===" -ForegroundColor Cyan
Write-Host "Backup dir: $BackupDir"

# 1) Restore postgres
$fp = Join-Path $BackupDir $PostgresBackup
if (Test-Path $fp) {
    Write-Host "Restoring postgres from $PostgresBackup..." -ForegroundColor Yellow
    $sanitized = Sanitize-SqlFile -Path $fp
    $tempFile = Join-Path $env:TEMP "restore_postgres_sanitized.sql"
    $sanitized | Set-Content $tempFile -NoNewline
    docker cp $tempFile "${ContainerName}:/tmp/restore_postgres.sql"
    docker exec $ContainerName psql -U postgres -d postgres -f /tmp/restore_postgres.sql 2>$null
    Remove-Item $tempFile -ErrorAction SilentlyContinue
    Ensure-Extensions -Container $ContainerName -Database "postgres" -IncludePgCron $false
    Write-Host "  postgres: done." -ForegroundColor Green
} else { Write-Host "  Skip postgres: $fp not found." -ForegroundColor Gray }

# 2) Restore linknest_analytics (fresh)
$fa = Join-Path $BackupDir $AnalyticsBackup
if (Test-Path $fa) {
    Write-Host "Restoring linknest_analytics from $AnalyticsBackup (fresh)..." -ForegroundColor Yellow
    docker exec $ContainerName psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS linknest_analytics WITH (FORCE);"
    docker exec $ContainerName psql -U postgres -d postgres -c "CREATE DATABASE linknest_analytics;"
    docker exec $ContainerName psql -U postgres -d linknest_analytics -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
    docker exec $ContainerName psql -U postgres -d linknest_analytics -c "SELECT public.timescaledb_pre_restore();"
    $sanitized = Sanitize-SqlFile -Path $fa
    $tempFile = Join-Path $env:TEMP "restore_analytics_sanitized.sql"
    $sanitized | Set-Content $tempFile -NoNewline
    docker cp $tempFile "${ContainerName}:/tmp/restore_analytics.sql"
    docker exec $ContainerName psql -U postgres -d linknest_analytics -f /tmp/restore_analytics.sql 2>$null
    docker exec $ContainerName psql -U postgres -d linknest_analytics -c "SELECT public.timescaledb_post_restore();"
    Ensure-Extensions -Container $ContainerName -Database "linknest_analytics" -IncludePgCron $true
    Write-Host "  linknest_analytics: done." -ForegroundColor Green
} else { Write-Host "  Skip linknest_analytics: $fa not found." -ForegroundColor Gray }

# 3) Restore zmonitoring (fresh)
$fz = Join-Path $BackupDir $ZmonitoringBackup
if (Test-Path $fz) {
    Write-Host "Restoring zmonitoring from $ZmonitoringBackup (fresh)..." -ForegroundColor Yellow
    docker exec $ContainerName psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS zmonitoring WITH (FORCE);"
    docker exec $ContainerName psql -U postgres -d postgres -c "CREATE DATABASE zmonitoring;"
    docker exec $ContainerName psql -U postgres -d zmonitoring -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
    docker exec $ContainerName psql -U postgres -d zmonitoring -c "SELECT public.timescaledb_pre_restore();"
    if ($ZmonitoringBackup -match "\.dump$") {
        docker cp $fz "${ContainerName}:/tmp/restore_zmonitoring.dump"
        docker exec $ContainerName pg_restore -U postgres -d zmonitoring --no-owner --no-acl /tmp/restore_zmonitoring.dump 2>$null
    } else {
        $sanitized = Sanitize-SqlFile -Path $fz
        $tempFile = Join-Path $env:TEMP "restore_zmonitoring_sanitized.sql"
        $sanitized | Set-Content $tempFile -NoNewline
        docker cp $tempFile "${ContainerName}:/tmp/restore_zmonitoring.sql"
        docker exec $ContainerName psql -U postgres -d zmonitoring -f /tmp/restore_zmonitoring.sql 2>$null
    }
    docker exec $ContainerName psql -U postgres -d zmonitoring -c "SELECT public.timescaledb_post_restore();"
    Ensure-Extensions -Container $ContainerName -Database "zmonitoring" -IncludePgCron $false
    Write-Host "  zmonitoring: done." -ForegroundColor Green
} else { Write-Host "  Skip zmonitoring: $fz not found." -ForegroundColor Gray }

Write-Host "=== Verifying extensions ===" -ForegroundColor Cyan
foreach ($db in @("postgres", "linknest_analytics", "zmonitoring")) {
    $exists = docker exec $ContainerName psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db';" 2>$null
    if ($exists -eq "1") {
        Write-Host "  $db :" -NoNewline
        docker exec $ContainerName psql -U postgres -d $db -tAc "SELECT string_agg(extname, ', ' ORDER BY extname) FROM pg_extension;"
    }
}
Write-Host "Done." -ForegroundColor Green

# Backup Linknest Analytics PostgreSQL database
# Uses: postgres/postgres, database: analytics (default), port 5433
#
# When the DB runs in Docker, use -ContainerName so pg_dump runs inside the container
# (no need for pg_dump on the host).
#
#   .\analytics\backup-analytics-db.ps1 -ContainerName linknest-analytics-db
#   .\analytics\backup-analytics-db.ps1 -OutputDir D:\backups -ContainerName linknest-analytics-db

param(
    [string]$DbHost = "localhost",
    [int]$Port = 5433,
    [string]$User = "postgres",
    [string]$Password = "postgres",
    [string]$Database = "analytics",
    [string]$OutputDir = "",
    [ValidateSet("Plain", "Custom")]
    [string]$Format = "Plain",
    [string]$ContainerName = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $OutputDir) { $OutputDir = $ScriptDir }

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Ext = if ($Format -eq "Custom") { "dump" } else { "sql" }
$FileName = "analytics_backup_$Timestamp.$Ext"
$FilePath = Join-Path $OutputDir $FileName
$UseDocker = $ContainerName -ne ""

# If pg_dump not in PATH and no container given, try default container if it's running
if (-not $UseDocker -and -not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    $defaultContainer = "linknest-analytics-db"
    $runningNames = docker ps --format "{{.Names}}" 2>$null
    if ($runningNames -match $defaultContainer) {
        Write-Host "pg_dump not found on host. Using Docker container: $defaultContainer" -ForegroundColor Yellow
        $ContainerName = $defaultContainer
        $UseDocker = $true
    } else {
        Write-Error "pg_dump is not in PATH. Install PostgreSQL client tools, or run backup via Docker: -ContainerName linknest-analytics-db"
        exit 1
    }
}

Write-Host "=== PostgreSQL Analytics Backup ===" -ForegroundColor Cyan
if ($UseDocker) {
    Write-Host "Mode: Docker (container: $ContainerName)"
} else {
    $env:PGPASSWORD = $Password
    Write-Host "Host: $DbHost`:$Port  User: $User  Database: $Database"
}
Write-Host "Database: $Database  Format: $Format"
Write-Host "Output: $FilePath"
Write-Host ""

try {
    if ($UseDocker) {
        $tempInContainer = "/tmp/analytics_backup_$Timestamp.$Ext"
        if ($Format -eq "Custom") {
            docker exec $ContainerName pg_dump -U $User -d $Database -F c -f $tempInContainer
        } else {
            docker exec $ContainerName pg_dump -U $User -d $Database -F p -f $tempInContainer
        }
        if ($LASTEXITCODE -ne 0) { throw "pg_dump in container failed" }
        docker cp "${ContainerName}:${tempInContainer}" $FilePath
        docker exec $ContainerName rm -f $tempInContainer
    } else {
        if ($Format -eq "Custom") {
            & pg_dump -h $DbHost -p $Port -U $User -d $Database -F c -f $FilePath
        } else {
            & pg_dump -h $DbHost -p $Port -U $User -d $Database -F p -f $FilePath
        }
        if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
    }
    $size = (Get-Item $FilePath).Length
    Write-Host "Backup completed successfully." -ForegroundColor Green
    Write-Host "File: $FilePath ($([math]::Round($size/1KB, 2)) KB)"
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "To restore: .\analytics\restore-analytics-backup.ps1 -BackupFile `"$FilePath`"$(if ($UseDocker) { ' -ContainerName ' + $ContainerName })"
Write-Host ""

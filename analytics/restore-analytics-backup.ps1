# Restore Linknest Analytics PostgreSQL database from a backup file
# Uses: postgres/postgres, database: analytics (default), port 5433
#
# When the DB runs in Docker, use -ContainerName so psql/pg_restore run inside the container.
#
#   .\analytics\restore-analytics-backup.ps1 -BackupFile ".\analytics_backup_20260125-120000.sql" -ContainerName linknest-analytics-db
#   .\analytics\restore-analytics-backup.ps1 -BackupFile ".\backup.dump" -DropDatabase -ContainerName linknest-analytics-db

param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$DbHost = "localhost",
    [int]$Port = 5433,
    [string]$User = "postgres",
    [string]$Password = "postgres",
    [string]$Database = "analytics",
    [switch]$DropDatabase,
    [string]$ContainerName = ""
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $BackupFile)) {
    Write-Error "Backup file not found: $BackupFile"
    exit 1
}

$UseDocker = $ContainerName -ne ""
if (-not $UseDocker -and -not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "psql not found on host. Using Docker container: linknest-analytics-db" -ForegroundColor Yellow
    $ContainerName = "linknest-analytics-db"
    $UseDocker = $true
}

$env:PGPASSWORD = $Password
$isCustom = [System.IO.Path]::GetExtension($BackupFile) -eq ".dump"

Write-Host "=== PostgreSQL Analytics Restore ===" -ForegroundColor Cyan
Write-Host "Backup: $BackupFile"
if ($UseDocker) {
    Write-Host "Mode: Docker (container: $ContainerName)"
} else {
    Write-Host "Host: $DbHost`:$Port  User: $User  Database: $Database"
}
Write-Host "Format: $(if ($isCustom) { 'Custom' } else { 'Plain SQL' })"
if ($DropDatabase) { Write-Host "Drop database before restore: Yes" }
Write-Host ""

try {
    if ($UseDocker) {
        $baseName = [System.IO.Path]::GetFileName($BackupFile)
        $tempInContainer = "/tmp/$baseName"
        docker cp $BackupFile "${ContainerName}:${tempInContainer}"
        try {
            if ($DropDatabase) {
                Write-Host "Dropping and recreating database '$Database'..." -ForegroundColor Yellow
                docker exec $ContainerName psql -U $User -d "postgres" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Database' AND pid <> pg_backend_pid();" 2>$null
                docker exec $ContainerName psql -U $User -d "postgres" -c "DROP DATABASE IF EXISTS \"$Database\";"
                docker exec $ContainerName psql -U $User -d "postgres" -c "CREATE DATABASE \"$Database\";"
            }
            Write-Host "Restoring data..."
            if ($isCustom) {
                docker exec $ContainerName pg_restore -U $User -d $Database --no-owner --no-acl $tempInContainer 2>$null
            } else {
                docker exec $ContainerName psql -U $User -d $Database -f $tempInContainer -v ON_ERROR_STOP=1
                if ($LASTEXITCODE -ne 0) { throw "psql restore failed" }
            }
        } finally {
            docker exec $ContainerName rm -f $tempInContainer 2>$null
        }
    } else {
        if ($DropDatabase) {
            Write-Host "Dropping database '$Database' (and disconnecting existing sessions)..." -ForegroundColor Yellow
            & psql -h $DbHost -p $Port -U $User -d "postgres" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Database' AND pid <> pg_backend_pid();" 2>$null
            & psql -h $DbHost -p $Port -U $User -d "postgres" -c "DROP DATABASE IF EXISTS \"$Database\";"
            & psql -h $DbHost -p $Port -U $User -d "postgres" -c "CREATE DATABASE \"$Database\";"
            Write-Host "Database recreated."
        } else {
            $exists = & psql -h $DbHost -p $Port -U $User -d "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'" 2>&1
            if (-not $exists) {
                Write-Host "Creating database '$Database'..."
                & createdb -h $DbHost -p $Port -U $User $Database
            }
        }

        Write-Host "Restoring data..."
        if ($isCustom) {
            & pg_restore -h $DbHost -p $Port -U $User -d $Database --no-owner --no-acl $BackupFile 2>$null
            if ($LASTEXITCODE -ne 0) { Write-Host "pg_restore finished (check for errors above)." -ForegroundColor Yellow }
        } else {
            & psql -h $DbHost -p $Port -U $User -d $Database -f $BackupFile -v ON_ERROR_STOP=1
            if ($LASTEXITCODE -ne 0) { throw "psql restore failed" }
        }
    }

    Write-Host ""
    Write-Host "Restore completed successfully." -ForegroundColor Green
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

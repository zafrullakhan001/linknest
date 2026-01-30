<#
.SYNOPSIS
    PostgreSQL Backup and Restore Script for Windows.
#>

param (
    [Parameter(Mandatory = $false)]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [string]$Username,

    [Parameter(Mandatory = $false)]
    [string]$Password,

    [Parameter(Mandatory = $false)]
    [string]$Port,

    [Parameter(Mandatory = $false)]
    [string]$Database,

    [Parameter(Mandatory = $false)]
    [string]$Server = "localhost",

    [Parameter(Mandatory = $false)]
    [string]$BackupFile,

    [Parameter(Mandatory = $false)]
    [string]$Format = "sql" # sql or custom
)

# 1. Interactive input for missing mandatory params
if (-not $Action) {
    Write-Host "Select Action:"
    Write-Host "1. Backup"
    Write-Host "2. Restore"
    $choice = Read-Host "Choice (1 or 2)"
    $Action = if ($choice -eq "1") { "backup" } else { "restore" }
}

if (-not $Username) {
    $Username = Read-Host "Username (default: postgres)"
    if (-not $Username) { $Username = "postgres" }
}

if (-not $Password) {
    Write-Host "Enter Password for ${Username}: " -NoNewline
    $secPass = Read-Host -AsSecureString
    $Password = [System.Net.NetworkCredential]::new("temp", $secPass).Password
}

if (-not $Port) {
    $inputP = Read-Host "Port (default: 5433)"
    $Port = if (-not $inputP) { "5433" } else { $inputP }
}

# Process Database List for Backup
$Databases = @()
if ($Action -eq "backup") {
    if ($Database) {
        $Databases = @($Database -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
    }
    else {
        Write-Host "Backup Scope:"
        Write-Host "1. All Databases"
        Write-Host "2. Specific Database(s)"
        $dbChoice = Read-Host "Choice (1 or 2, default 1)"
        if ($dbChoice -eq "2") {
            $DatabaseInput = Read-Host "Enter Database Names (split by comma)"
            $Databases = @($DatabaseInput -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
        }
    }

    # Ask for Format
    Write-Host "Backup Format:"
    Write-Host "1. SQL (Plain Text)"
    Write-Host "2. Custom (Binary / -Fc - Recommended for TimescaleDB/Large DBs)"
    $fChoice = Read-Host "Choice (1 or 2, default 1)"
    $Format = if ($fChoice -eq "2") { "custom" } else { "sql" }
}

# Process File Selection for Restore
if ($Action -eq "restore" -and -not $BackupFile) {
    $files = Get-ChildItem -Include "*.sql", "*.dump" -Path (Get-Location).Path | Select-Object -ExpandProperty Name
    if ($files.Count -gt 0) {
        Write-Host "Available Backup Files:"
        for ($i = 0; $i -lt $files.Count; $i++) { Write-Host "$($i+1). $($files[$i])" }
        $fileChoice = Read-Host "Select a file number (or type filename)"
        if ($fileChoice -match '^\d+$' -and [int]$fileChoice -le $files.Count) {
            $BackupFile = $files[[int]$fileChoice - 1]
        }
        else { $BackupFile = $fileChoice }
    }
    else { $BackupFile = Read-Host "Enter Backup Filename" }
    
    if (-not $Database) {
        $dbInput = Read-Host "Enter Target Database (default: postgres)"
        $Database = if (-not $dbInput) { "postgres" } else { $dbInput }
    }
}

$ErrorActionPreference = "Stop"

function Check-Tools {
    $pgAdminPath = "C:\Program Files\pgAdmin 4\runtime"
    $tools = @("pg_dumpall", "pg_dump", "psql", "pg_restore")
    foreach ($tool in $tools) {
        if (Get-Command $tool -ErrorAction SilentlyContinue) { continue }
        $toolPath = Join-Path $pgAdminPath "$tool.exe"
        if (Test-Path $toolPath) {
            if ($env:PATH -notlike "*$pgAdminPath*") { $env:PATH = "$pgAdminPath;$env:PATH" }
            continue
        }
        throw "Could not find $tool in PATH or pgAdmin directory."
    }
}

try {
    Check-Tools
    $env:PGPASSWORD = $Password
    $Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
    $Cwd = (Get-Location).Path

    if ($Action -eq "backup") {
        Write-Host "Starting Backup..."
        $ext = if ($Format -eq "custom") { "dump" } else { "sql" }
        
        if ($Databases.Count -gt 0) {
            foreach ($db in $Databases) {
                $targetFile = Join-Path $Cwd "backup_$($db)_$($Timestamp).$ext"
                Write-Host "Backing up $db -> $targetFile (Format: $Format)"
                if ($Format -eq "custom") {
                    & pg_dump -h $Server -p $Port -U $Username -d $db -Fc --file="$targetFile" --blobs
                }
                else {
                    & pg_dump -h $Server -p $Port -U $Username -d $db --file="$targetFile" --clean --if-exists --blobs
                }
            }
        }
        else {
            $targetFile = Join-Path $Cwd "backup_all_$($Timestamp).$ext"
            Write-Host "Backing up ALL -> $targetFile (Format: SQL only for dumpall)"
            # Note: pg_dumpall only supports plain SQL
            & pg_dumpall -h $Server -p $Port -U $Username --file="$targetFile" --clean --if-exists --blobs
        }
        Write-Host "Backup processes finished successfully."
    }
    elseif ($Action -eq "restore") {
        $FullFile = Join-Path $Cwd $BackupFile
        if (-not (Test-Path $FullFile)) { throw "File not found: $FullFile" }
        
        $targetDb = if ($Database) { $Database } else { "postgres" }
        Write-Host "----------------------------------------"
        Write-Host "Starting PostgreSQL Restore"
        Write-Host "Source: $FullFile"
        Write-Host "Target: $targetDb"
        Write-Host "----------------------------------------"

        if ($targetDb -ne "postgres") {
            Write-Host "Would you like to perform a FRESH restore? (Drops $targetDb first)"
            $freshChoice = Read-Host "Enter 'Y' to proceed, otherwise Enter"
            if ($freshChoice -eq 'Y' -or $freshChoice -eq 'y') {
                Write-Host "Dropping and Recreating $targetDb..."
                & psql -h $Server -p $Port -U $Username -c "DROP DATABASE IF EXISTS $targetDb WITH (FORCE);" postgres
                & psql -h $Server -p $Port -U $Username -c "CREATE DATABASE $targetDb;" postgres
            }
        }

        # TimescaleDB Handling (Only for SQL files, pg_restore handles extensions better)
        if ($targetDb -ne "postgres" -and $FullFile -match "\.sql$") {
            & psql -h $Server -p $Port -U $Username -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" $targetDb
            & psql -h $Server -p $Port -U $Username -c "SELECT public.timescaledb_pre_restore();" $targetDb
        }

        Write-Host "Restoring data to $targetDb..."
        if ($FullFile -match "\.dump$") {
            # Custom Format Restore
            & pg_restore -h $Server -p $Port -U $Username -d $targetDb --clean --if-exists "$FullFile"
        }
        else {
            # Standard SQL Restore
            # Sanitization for SQL files
            $sanitizedFile = Join-Path $Cwd "temp_restore_sanitized.sql"
            $content = Get-Content $FullFile
            $newContent = foreach ($line in $content) {
                if ($line -match "^\\restrict") { "-- " + $line }
                elseif ($line -match "EXTENSION IF EXISTS timescaledb") { "-- " + $line }
                elseif ($line -match "EXTENSION timescaledb") { "-- " + $line }
                else { $line }
            }
            $newContent | Set-Content $sanitizedFile
            & psql -h $Server -p $Port -U $Username -f "$sanitizedFile" $targetDb
            if (Test-Path $sanitizedFile) { Remove-Item $sanitizedFile }
        }
        
        if ($targetDb -ne "postgres" -and $FullFile -match "\.sql$") {
            & psql -h $Server -p $Port -U $Username -c "SELECT public.timescaledb_post_restore();" $targetDb
        }

        Write-Host "Restore complete."
    }
}
catch {
    Write-Host "Error: $_"
}
finally {
    if (Test-Path Env:PGPASSWORD) { Remove-Item Env:PGPASSWORD }
}

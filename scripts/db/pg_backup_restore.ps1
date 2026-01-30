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
    [string]$BackupFile
)

# 1. Interactive input for missing mandatory params
if (-not $Action) {
    Write-Host "Select Action:"
    Write-Host "1. Backup"
    Write-Host "2. Restore"
    $choice = Read-Host "Choice (1 or 2)"
    if ($choice -eq "1") { $Action = "backup" } else { $Action = "restore" }
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
    if (-not $inputP) { $Port = "5433" } else { $Port = $inputP }
}

# Process Database List
$Databases = @()
if ($Database) {
    $Databases = @($Database -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}
elseif ($Action -eq "backup") {
    Write-Host "Backup Scope:"
    Write-Host "1. All Databases"
    Write-Host "2. Specific Database(s)"
    $dbChoice = Read-Host "Choice (1 or 2, default 1)"
    if ($dbChoice -eq "2") {
        $DatabaseInput = Read-Host "Enter Database Names (split by comma)"
        $Databases = @($DatabaseInput -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
    }
}

if ($Action -eq "restore" -and -not $BackupFile) {
    $sqlFiles = Get-ChildItem -Filter "*.sql" | Select-Object -ExpandProperty Name
    if ($sqlFiles.Count -gt 0) {
        Write-Host "Available Backup Files:"
        for ($i = 0; $i -lt $sqlFiles.Count; $i++) {
            Write-Host "$($i+1). $($sqlFiles[$i])"
        }
        $fileChoice = Read-Host "Select a file number (or type filename)"
        if ($fileChoice -match '^\d+$' -and [int]$fileChoice -le $sqlFiles.Count) {
            $BackupFile = $sqlFiles[[int]$fileChoice - 1]
        }
        else {
            $BackupFile = $fileChoice
        }
    }
    else {
        $BackupFile = Read-Host "Enter Backup Filename"
    }
    
    if ($Databases.Count -eq 0) {
        $dbInput = Read-Host "Enter Target Database (default: postgres)"
        if (-not $dbInput) { $dbInput = "postgres" }
        $Databases = @($dbInput)
    }
}

$ErrorActionPreference = "Stop"

function Check-Tools {
    $pgAdminPath = "C:\Program Files\pgAdmin 4\runtime"
    $tools = @("pg_dumpall", "pg_dump", "psql")
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
        if ($Databases.Count -gt 0) {
            foreach ($db in $Databases) {
                $targetFile = Join-Path $Cwd "backup_$($db)_$($Timestamp).sql"
                Write-Host "Backing up $db -> $targetFile"
                & pg_dump -h $Server -p $Port -U $Username -d $db --file="$targetFile" --clean --if-exists
            }
        }
        else {
            $targetFile = Join-Path $Cwd "backup_all_$($Timestamp).sql"
            Write-Host "Backing up ALL -> $targetFile"
            & pg_dumpall -h $Server -p $Port -U $Username --file="$targetFile" --clean --if-exists
        }
        Write-Host "Backup processes finished successfully."
    }
    elseif ($Action -eq "restore") {
        if (-not $BackupFile) { throw "BackupFile parameter is required for restore." }
        $FullFile = Join-Path $Cwd $BackupFile
        if (-not (Test-Path $FullFile)) { throw "File not found: $FullFile" }
        
        $targetDb = if ($Databases.Count -ge 1) { $Databases[0] } else { "postgres" }
        Write-Host "----------------------------------------"
        Write-Host "Starting PostgreSQL Restore"
        Write-Host "Source: $FullFile"
        Write-Host "User:   $Username"
        Write-Host "Host:   $Server : $Port"
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

        # TimescaleDB Handling
        if ($targetDb -ne "postgres") {
            & psql -h $Server -p $Port -U $Username -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" $targetDb
            & psql -h $Server -p $Port -U $Username -c "SELECT public.timescaledb_pre_restore();" $targetDb
        }

        # Sanitize SQL
        $sanitizedFile = Join-Path $Cwd "temp_restore_sanitized.sql"
        $content = Get-Content $FullFile
        $newContent = foreach ($line in $content) {
            if ($line -match "^\\restrict") { "-- " + $line }
            elseif ($line -match "EXTENSION IF EXISTS timescaledb") { "-- " + $line }
            elseif ($line -match "EXTENSION timescaledb") { "-- " + $line }
            else { $line }
        }
        $newContent | Set-Content $sanitizedFile

        Write-Host "Restoring SQL to $targetDb..."
        & psql -h $Server -p $Port -U $Username -f "$sanitizedFile" $targetDb
        
        if ($targetDb -ne "postgres") {
            & psql -h $Server -p $Port -U $Username -c "SELECT public.timescaledb_post_restore();" $targetDb
        }

        if (Test-Path $sanitizedFile) { Remove-Item $sanitizedFile }
        Write-Host "Restore complete."
    }
}
catch {
    Write-Host "Error: $_"
}
finally {
    if (Test-Path Env:PGPASSWORD) { Remove-Item Env:PGPASSWORD }
}

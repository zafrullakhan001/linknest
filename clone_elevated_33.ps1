# Elevated Clone Worker Launcher
# This script runs the clone worker with administrator privileges

$ErrorActionPreference = "Stop"

$cloneId = 33
$phpPath = 'C:\\xampp\\apache\\bin\\httpd.exe'
$workerPath = 'C:\\xampp\\htdocs\\linknest\\api\\clone_worker.php'
$apiDir = 'C:\\xampp\\htdocs\\linknest\\api'

Write-Host "Starting clone worker with elevated privileges..."
Write-Host "Clone ID: $cloneId"
Write-Host "PHP Path: $phpPath"
Write-Host "Worker Path: $workerPath"
Write-Host "API Directory: $apiDir"

try {
    # Change to the API directory
    Set-Location $apiDir
    
    # Run the PHP worker
    & $phpPath $workerPath $cloneId
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Clone worker completed successfully"
        exit 0
    } else {
        Write-Host "Clone worker failed with exit code: $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "Error running clone worker: $_\"
    exit 1
}
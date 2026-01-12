# Configure Mercury Email Server for LinkNest
# This script configures SMTP settings for Mercury mail server in XAMPP

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Mercury Email Server Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$phpScript = Join-Path $scriptDir "api\configure_mercury.php"

# Check if PHP is available
Write-Host "Checking for PHP..." -ForegroundColor Yellow
try {
    $phpVersion = php -v 2>&1 | Select-Object -First 1
    Write-Host "Found: $phpVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: PHP is not found in PATH" -ForegroundColor Red
    Write-Host "Please ensure PHP is installed and available in your PATH" -ForegroundColor Yellow
    Write-Host "Or ensure XAMPP PHP is accessible" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Running Mercury configuration..." -ForegroundColor Yellow
Write-Host ""

# Change to the script directory
Push-Location $scriptDir

try {
    # Run the PHP configuration script
    php api\configure_mercury.php
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Configuration Completed Successfully!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "1. Ensure Mercury is running in XAMPP Control Panel" -ForegroundColor White
        Write-Host "2. Test email from your LinkNest application's SMTP Settings page" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "Configuration failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Error running configuration script: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

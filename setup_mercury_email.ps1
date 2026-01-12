# Mercury Email Server Setup Script for LinkNest
# This script configures Mercury mail server for testing with test users

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Mercury Email Server Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$mercuryPath = "C:\xampp\MercuryMail"
$mercuryIniPath = Join-Path $mercuryPath "mercury.ini"
$mercuryMailPath = Join-Path $mercuryPath "mail"
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Test users to create
$testUsers = @(
    @{Username = "test"; Password = "test123"; Domain = "localhost.com"; Email = "test@localhost.com"},
    @{Username = "admin"; Password = "admin123"; Domain = "localhost.com"; Email = "admin@localhost.com"},
    @{Username = "zafar"; Password = "zafar123"; Domain = "localhost.com"; Email = "zafar@localhost.com"},
    @{Username = "noreply"; Password = "noreply123"; Domain = "localhost.com"; Email = "noreply@localhost.com"}
)

# Check if Mercury directory exists
if (-not (Test-Path $mercuryPath)) {
    Write-Host "ERROR: Mercury directory not found at: $mercuryPath" -ForegroundColor Red
    Write-Host "Please ensure XAMPP is installed and Mercury is available." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "Step 1: Configuring Mercury Domains..." -ForegroundColor Yellow

# Check if mercury.ini exists
if (-not (Test-Path $mercuryIniPath)) {
    Write-Host "WARNING: mercury.ini not found at: $mercuryIniPath" -ForegroundColor Yellow
    Write-Host "Mercury may use a different configuration location." -ForegroundColor Yellow
    Write-Host "You may need to configure domains manually via Mercury web interface." -ForegroundColor Yellow
    Write-Host ""
} else {
    # Read mercury.ini
    $iniContent = Get-Content $mercuryIniPath -Raw
    
    # Check if [Domains] section exists
    if ($iniContent -match '\[Domains\]') {
        Write-Host "Found [Domains] section in mercury.ini" -ForegroundColor Green
        
        # Check if localhost.com is already listed
        if ($iniContent -match 'localhost\.com') {
            Write-Host "Domain 'localhost.com' already configured" -ForegroundColor Green
        } else {
            # Add localhost.com to domains
            $iniContent = $iniContent -replace '(\[Domains\][^\r\n]*)', "`$1`r`nlocalhost.com"
            
            # Backup original file
            $backupPath = "$mercuryIniPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            Copy-Item $mercuryIniPath $backupPath
            Write-Host "Backed up mercury.ini to: $backupPath" -ForegroundColor Cyan
            
            # Write updated content
            Set-Content -Path $mercuryIniPath -Value $iniContent -NoNewline
            Write-Host "Added 'localhost.com' to Mercury domains" -ForegroundColor Green
        }
    } else {
        Write-Host "WARNING: [Domains] section not found in mercury.ini" -ForegroundColor Yellow
        Write-Host "You may need to add it manually or use Mercury web interface." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Step 2: Creating Test Users..." -ForegroundColor Yellow

# Create mail directory if it doesn't exist
if (-not (Test-Path $mercuryMailPath)) {
    New-Item -ItemType Directory -Path $mercuryMailPath -Force | Out-Null
    Write-Host "Created mail directory: $mercuryMailPath" -ForegroundColor Green
}

# Create user directories and files
foreach ($user in $testUsers) {
    $userDir = Join-Path $mercuryMailPath $user.Domain
    if (-not (Test-Path $userDir)) {
        New-Item -ItemType Directory -Path $userDir -Force | Out-Null
    }
    
    $userMailDir = Join-Path $userDir $user.Username
    if (-not (Test-Path $userMailDir)) {
        New-Item -ItemType Directory -Path $userMailDir -Force | Out-Null
        Write-Host "Created user directory: $userMailDir" -ForegroundColor Green
    }
    
    # Create user password file (Mercury format)
    $passFile = Join-Path $userMailDir "password.txt"
    if (-not (Test-Path $passFile)) {
        # Mercury stores passwords in plain text or MD5 hash
        # For testing, we'll create a simple password file
        Set-Content -Path $passFile -Value $user.Password
        Write-Host "Created password file for: $($user.Email)" -ForegroundColor Green
    }
    
    Write-Host "  User: $($user.Email) | Password: $($user.Password)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Step 3: Configuring Database SMTP Settings..." -ForegroundColor Yellow

# Check if PHP is available
try {
    $phpVersion = php -v 2>&1 | Select-Object -First 1
    Write-Host "Found PHP: $phpVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: PHP is not found in PATH" -ForegroundColor Red
    Write-Host "Please ensure PHP is installed and available in your PATH" -ForegroundColor Yellow
    Write-Host "Or ensure XAMPP PHP is accessible" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Change to project directory
Push-Location $projectPath

try {
    # Run the PHP configuration script
    Write-Host "Updating database SMTP settings..." -ForegroundColor Cyan
    php api\configure_mercury.php
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database SMTP settings configured successfully!" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Database configuration returned exit code: $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: Failed to configure database: $_" -ForegroundColor Red
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup Completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "CONFIGURED TEST USERS:" -ForegroundColor Cyan
Write-Host "----------------------" -ForegroundColor Cyan
foreach ($user in $testUsers) {
    Write-Host "  Email: $($user.Email)" -ForegroundColor White
    Write-Host "  Password: $($user.Password)" -ForegroundColor White
    Write-Host ""
}

Write-Host "SMTP SETTINGS FOR YOUR APPS:" -ForegroundColor Cyan
Write-Host "----------------------------" -ForegroundColor Cyan
Write-Host "  Host: localhost" -ForegroundColor White
Write-Host "  Port: 25" -ForegroundColor White
Write-Host "  Encryption: None (plain text)" -ForegroundColor White
Write-Host "  Authentication: Not required for local testing" -ForegroundColor White
Write-Host "  From Email: noreply@localhost.com" -ForegroundColor White
Write-Host ""

Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "----------" -ForegroundColor Yellow
Write-Host "1. Ensure Mercury is running in XAMPP Control Panel" -ForegroundColor White
Write-Host "2. Restart Mercury if you modified mercury.ini" -ForegroundColor White
Write-Host "3. Test SMTP connection from your application:" -ForegroundColor White
Write-Host "   - Use SMTP host: localhost" -ForegroundColor Cyan
Write-Host "   - Use SMTP port: 25" -ForegroundColor Cyan
Write-Host "   - Send test email to: test@localhost.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. View received emails:" -ForegroundColor White
Write-Host "   - Mercury Web Interface: http://localhost/mail/" -ForegroundColor Cyan
Write-Host "   - Or: http://localhost:2224/" -ForegroundColor Cyan
Write-Host "   - Mail files location: $mercuryMailPath" -ForegroundColor Cyan
Write-Host ""

Write-Host "NOTE:" -ForegroundColor Yellow
Write-Host "-----" -ForegroundColor Yellow
Write-Host "If Mercury web interface doesn't show the users, you may need to:" -ForegroundColor White
Write-Host "- Add users manually via Mercury web interface (http://localhost/mail/)" -ForegroundColor Cyan
Write-Host "- Or restart Mercury after running this script" -ForegroundColor Cyan
Write-Host ""

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

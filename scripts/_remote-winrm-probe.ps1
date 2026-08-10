# Configure local WinRM client for workgroup remote deploy, then probe target.
param(
    [string]$Target = '192.168.127.130',
    [string]$User = 'administrator',
    [string]$Password = 'Tiger123!'
)

$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'remote-winrm-setup.log'

function Write-Log($m) {
    $line = "$(Get-Date -Format o) $m"
    Add-Content -Path $log -Value $line
    Write-Host $line
}

try {
    Set-Item WSMan:\localhost\Client\TrustedHosts -Value $Target -Force
    Set-Item WSMan:\localhost\Client\AllowUnencrypted -Value $true -Force
    Write-Log "TrustedHosts + AllowUnencrypted configured for $Target"

    $sec = ConvertTo-SecureString $Password -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential($User, $sec)
    $opt = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck

    $s = $null
    try {
        $s = New-PSSession -ComputerName $Target -Credential $cred -Authentication Negotiate -SessionOption $opt
        Write-Log 'Negotiate session OK'
    } catch {
        Write-Log ("Negotiate failed: " + $_.Exception.Message)
        $s = New-PSSession -ComputerName $Target -Credential $cred -Authentication Basic -SessionOption $opt
        Write-Log 'Basic session OK'
    }

    $info = Invoke-Command -Session $s -ScriptBlock {
        [pscustomobject]@{
            Host = $env:COMPUTERNAME
            User = whoami
            OS = (Get-CimInstance Win32_OperatingSystem).Caption
            HasXampp = Test-Path 'C:\xampp'
            PhpVersion = if (Test-Path 'C:\xampp\php\php.exe') { (& 'C:\xampp\php\php.exe' -v 2>&1 | Select-Object -First 1) } else { 'n/a' }
            Htdocs = if (Test-Path 'C:\xampp\htdocs') { (Get-ChildItem 'C:\xampp\htdocs' -Directory | Select-Object -ExpandProperty Name) -join ', ' } else { 'n/a' }
            ApacheService = (Get-Service Apache2.4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status)
            WinRM = (Get-Service WinRM | Select-Object -ExpandProperty Status)
        }
    }
    $info | Format-List | Out-String | ForEach-Object { Write-Log $_.TrimEnd() }
    Remove-PSSession $s
    Write-Log 'PROBE_OK'
    exit 0
} catch {
    Write-Log ("PROBE_FAIL: " + $_.Exception.Message)
    exit 1
}

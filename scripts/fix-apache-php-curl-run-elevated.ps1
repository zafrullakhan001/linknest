# UAC launcher for fix-apache-php-curl.ps1
param(
    [string]$XamppRoot = 'C:\xampp'
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$main = Join-Path $here 'fix-apache-php-curl.ps1'
$log = Join-Path $here 'fix-apache-php-curl-last-run.log'
$err = Join-Path $here 'fix-apache-php-curl-last-run.err.log'

$argList = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$main`"",
    '-XamppRoot', "`"$XamppRoot`"",
    '-RestartApache'
)

$p = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList $argList `
    -Verb RunAs `
    -Wait -PassThru

# Elevated process can't easily redirect; re-run status check here.
Write-Host "Elevated fix exit code: $($p.ExitCode)"
exit $p.ExitCode

# Elevated launcher for upgrade-xampp-php.ps1
# Logs to scripts\upgrade-xampp-php-last-run.log
param(
    [string]$Version = '8.5',
    [string]$Patch = '8.5.9',
    [switch]$RestartApache
)

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here 'upgrade-xampp-php-last-run.log'
$err = Join-Path $here 'upgrade-xampp-php-last-run.err.log'
$main = Join-Path $here 'upgrade-xampp-php.ps1'

$argList = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$main`"",
    '-Version', $Version,
    '-Patch', $Patch
)
if ($RestartApache) { $argList += '-RestartApache' }

$p = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList $argList `
    -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput $log `
    -RedirectStandardError $err

exit $p.ExitCode

# Elevated launcher for upgrade-vanilla-apache-php.ps1
# Logs to scripts\upgrade-vanilla-apache-php-last-run.log
param(
    [string]$Version = '8.5',
    [string]$Patch = '',
    [switch]$LatestMinor,
    [switch]$SkipPhp,
    [switch]$SkipApache,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here 'upgrade-vanilla-apache-php-last-run.log'
$err = Join-Path $here 'upgrade-vanilla-apache-php-last-run.err.log'
$main = Join-Path $here 'upgrade-vanilla-apache-php.ps1'

$argList = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$main`"",
    '-Version', $Version
)
if (-not [string]::IsNullOrWhiteSpace($Patch)) { $argList += @('-Patch', $Patch) }
if ($LatestMinor) { $argList += '-LatestMinor' }
if ($SkipPhp) { $argList += '-SkipPhp' }
if ($SkipApache) { $argList += '-SkipApache' }
if ($NoRestart) { $argList += '-NoRestart' }

$p = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList $argList `
    -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput $log `
    -RedirectStandardError $err

exit $p.ExitCode

<#
.SYNOPSIS
  Install, remove, or check Windows Task Scheduler jobs for LinkNest monitoring workers.

.DESCRIPTION
  Registers two repeating tasks that run:
    - scripts\monitor_runner.py  (due monitor checks + email outbox queue)
    - scripts\email_sender.py    (drain email_outbox via SMTP settings in DB)

  Preferred unattended path on Windows/XAMPP (avoids PHP HTTP timeouts).
  Docker deployments usually do NOT need this — workers already loop in the container entrypoint.

.PARAMETER Action
  install   (default) Create/update the two scheduled tasks
  uninstall Remove the tasks
  status    Show whether the tasks exist
  run-once  Run both workers once in the foreground (for verification)

.PARAMETER Root
  LinkNest project root. Defaults to parent of this scripts folder.

.PARAMETER Python
  Python executable (default: python). Use a full path if needed.

.PARAMETER IntervalMinutes
  How often tasks repeat (default: 1). Use 2–5 for lighter hosts.

.PARAMETER DbPath
  Optional path to linknest.db. Default: <Root>\data\linknest.db

.EXAMPLE
  .\scripts\schedule-monitor-workers.ps1
  .\scripts\schedule-monitor-workers.ps1 -Action status
  .\scripts\schedule-monitor-workers.ps1 -IntervalMinutes 2
  .\scripts\schedule-monitor-workers.ps1 -Action uninstall
#>

[CmdletBinding()]
param(
    [ValidateSet('install', 'uninstall', 'status', 'run-once')]
    [string]$Action = 'install',

    [string]$Root = '',

    [string]$Python = 'python',

    [ValidateRange(1, 60)]
    [int]$IntervalMinutes = 1,

    [string]$DbPath = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-LinkNestRoot {
    param([string]$Explicit)
    if ($Explicit -and (Test-Path -LiteralPath $Explicit)) {
        return (Resolve-Path -LiteralPath $Explicit).Path
    }
    $here = $PSScriptRoot
    if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }
    return (Resolve-Path -LiteralPath (Join-Path $here '..')).Path
}

function Resolve-PythonExe {
    param([string]$Preferred)
    if ($Preferred -and (Test-Path -LiteralPath $Preferred)) {
        return (Resolve-Path -LiteralPath $Preferred).Path
    }
    $cmd = Get-Command $Preferred -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    $cmd = Get-Command python3 -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    throw "Python not found. Install Python 3.9+ or pass -Python with the full path to python.exe."
}

$root = Resolve-LinkNestRoot -Explicit $Root
$runnerPy = Join-Path $root 'scripts\monitor_runner.py'
$senderPy = Join-Path $root 'scripts\email_sender.py'
if (-not (Test-Path -LiteralPath $runnerPy)) { throw "Missing monitor runner: $runnerPy" }
if (-not (Test-Path -LiteralPath $senderPy)) { throw "Missing email sender: $senderPy" }

if (-not $DbPath) {
    $DbPath = Join-Path $root 'data\linknest.db'
}
$dbArg = "--db `"$DbPath`""

$pythonExe = Resolve-PythonExe -Preferred $Python

$taskMonitor = 'LinkNest - Monitor Runner'
$taskEmail = 'LinkNest - Email Sender'

function Get-TaskSafe {
    param([string]$Name)
    try { return Get-ScheduledTask -TaskName $Name -ErrorAction Stop } catch { return $null }
}

function Show-Status {
    foreach ($name in @($taskMonitor, $taskEmail)) {
        $t = Get-TaskSafe -Name $name
        if ($t) {
            $info = Get-ScheduledTaskInfo -TaskName $name
            Write-Host ("[{0}] State={1} LastRun={2} LastResult={3}" -f $name, $t.State, $info.LastRunTime, $info.LastTaskResult)
        } else {
            Write-Host "[$name] not installed"
        }
    }
}

function Remove-WorkerTasks {
    foreach ($name in @($taskMonitor, $taskEmail)) {
        $t = Get-TaskSafe -Name $name
        if ($t) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Host "Removed task: $name"
        } else {
            Write-Host "Task not found (skip): $name"
        }
    }
}

function Register-WorkerTask {
    param(
        [string]$Name,
        [string]$Arguments,
        [string]$Description
    )

    $existing = Get-TaskSafe -Name $Name
    if ($existing) {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false
    }

    $action = New-ScheduledTaskAction -Execute $pythonExe -Argument $Arguments -WorkingDirectory $root
    $start = (Get-Date).AddMinutes(1)
    # 10-year repetition window ≈ “indefinitely” (MaxValue can fail on some Windows builds)
    $trigger = New-ScheduledTaskTrigger -Once -At $start `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 3650)

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $Name `
        -Description $Description `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal | Out-Null

    Write-Host "Installed task: $Name (every $IntervalMinutes min)"
    Write-Host "  Program: $pythonExe"
    Write-Host "  Args:    $Arguments"
    Write-Host "  Start in: $root"
}

function Install-WorkerTasks {
    $monitorArgs = "scripts\monitor_runner.py $dbArg --max-workers 10"
    $emailArgs = "scripts\email_sender.py $dbArg --limit 25 --smtp-timeout 20"

    Register-WorkerTask -Name $taskMonitor -Arguments $monitorArgs `
        -Description "LinkNest: run due monitor checks and queue notification emails"
    Register-WorkerTask -Name $taskEmail -Arguments $emailArgs `
        -Description "LinkNest: send queued monitor notification emails via SMTP"

    Write-Host ""
    Write-Host "Done. Verify with:"
    Write-Host "  .\scripts\schedule-monitor-workers.ps1 -Action run-once"
    Write-Host "  .\scripts\schedule-monitor-workers.ps1 -Action status"
    Write-Host ""
    Write-Host "Docker tip: if you run LinkNest in Docker, workers already loop in the container"
    Write-Host "  (LINKNEST_WORKERS_ENABLED=1). You usually do NOT need these Windows tasks."
}

function Invoke-RunOnce {
    Write-Host "Running monitor_runner once..."
    & $pythonExe $runnerPy --db $DbPath --max-workers 10 --verbose
    if ($LASTEXITCODE -ne 0) { throw "monitor_runner exited with code $LASTEXITCODE" }

    Write-Host ""
    Write-Host "Running email_sender once..."
    & $pythonExe $senderPy --db $DbPath --limit 25 --smtp-timeout 20 --verbose
    if ($LASTEXITCODE -ne 0) { throw "email_sender exited with code $LASTEXITCODE" }

    Write-Host ""
    Write-Host "run-once completed."
}

switch ($Action) {
    'install' { Install-WorkerTasks }
    'uninstall' { Remove-WorkerTasks }
    'status' { Show-Status }
    'run-once' { Invoke-RunOnce }
}

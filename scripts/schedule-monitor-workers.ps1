<#
.SYNOPSIS
  Install, verify, remove, or check Windows Task Scheduler jobs for LinkNest monitoring workers.

.DESCRIPTION
  Registers two repeating tasks:
    - LinkNest - Monitor Runner  (monitor_runner.py - checks + queue emails)
    - LinkNest - Email Sender    (email_sender.py - SMTP send from outbox)

  Includes preflight checks and post-install verification (Task Scheduler API + schtasks.exe).

.PARAMETER Action
  install   (default) Preflight -> create/update tasks -> verify -> optional smoke run
  verify    Deep check that both tasks exist and are configured correctly (no changes)
  status    Short status of both tasks
  uninstall Remove the tasks
  run-once  Run both workers once in the foreground

.PARAMETER Root
  LinkNest project root. Defaults to parent of this scripts folder.

.PARAMETER Python
  Python executable (default: python). Use a full path if needed.

.PARAMETER IntervalMinutes
  How often tasks repeat (default: 1). Use 2-5 for lighter hosts.

.PARAMETER DbPath
  Optional path to linknest.db. Default: <Root>\data\linknest.db

.PARAMETER SkipSmoke
  With install: skip the post-install run-once smoke test.

.EXAMPLE
  .\scripts\schedule-monitor-workers.ps1
  .\scripts\schedule-monitor-workers.ps1 -Action verify
  .\scripts\schedule-monitor-workers.ps1 -IntervalMinutes 2
  .\scripts\schedule-monitor-workers.ps1 -Action uninstall
#>

[CmdletBinding()]
param(
    [ValidateSet('install', 'uninstall', 'status', 'run-once', 'verify')]
    [string]$Action = 'install',

    [string]$Root = '',

    [string]$Python = 'python',

    [ValidateRange(1, 60)]
    [int]$IntervalMinutes = 1,

    [string]$DbPath = '',

    [switch]$SkipSmoke
)

$ErrorActionPreference = 'Stop'
$script:FailCount = 0
$script:WarnCount = 0

function Write-Ok([string]$Message) { Write-Host "  [OK]   $Message" -ForegroundColor Green }
function Write-WarnLine([string]$Message) {
    $script:WarnCount++
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
}
function Write-Fail([string]$Message) {
    $script:FailCount++
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
}
function Write-Info([string]$Message) { Write-Host "  [INFO] $Message" -ForegroundColor Cyan }
function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor White
}

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
    if ($cmd -and $cmd.Source) {
        # Prefer real python.exe over Windows Store stub
        $src = [string]$cmd.Source
        if ($src -match 'WindowsApps\\python\.exe$') {
            $cmd3 = Get-Command python3 -ErrorAction SilentlyContinue
            if ($cmd3 -and $cmd3.Source -and ($cmd3.Source -notmatch 'WindowsApps\\')) {
                return $cmd3.Source
            }
        }
        return $src
    }
    $cmd = Get-Command python3 -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    throw "Python not found. Install Python 3.9+ (and enable PATH), or pass -Python with the full path to python.exe."
}

function Get-PythonVersionInfo {
    param([string]$Exe)
    $out = & $Exe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}'); print(sys.executable)" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Python failed to start ($Exe): $out"
    }
    $lines = @($out | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    if ($lines.Count -lt 1) { throw "Could not read Python version from $Exe" }
    return @{
        Version = $lines[0]
        Executable = if ($lines.Count -ge 2) { $lines[1] } else { $Exe }
    }
}

function Test-PythonVersionAtLeast {
    param([string]$Version, [int]$Major = 3, [int]$Minor = 9)
    $parts = $Version.Split('.')
    $maj = [int]$parts[0]
    $min = if ($parts.Count -gt 1) { [int]$parts[1] } else { 0 }
    return ($maj -gt $Major) -or (($maj -eq $Major) -and ($min -ge $Minor))
}

$root = Resolve-LinkNestRoot -Explicit $Root
$runnerPy = Join-Path $root 'scripts\monitor_runner.py'
$senderPy = Join-Path $root 'scripts\email_sender.py'
$libPy = Join-Path $root 'scripts\linknest_worker_lib.py'

if (-not $DbPath) {
    $DbPath = Join-Path $root 'data\linknest.db'
}

$taskMonitor = 'LinkNest - Monitor Runner'
$taskEmail = 'LinkNest - Email Sender'
$expectedMonitorArgsFragment = 'scripts\monitor_runner.py'
$expectedEmailArgsFragment = 'scripts\email_sender.py'

function Get-TaskSafe {
    param([string]$Name)
    try { return Get-ScheduledTask -TaskName $Name -ErrorAction Stop } catch { return $null }
}

function Get-SchtasksQueryText {
    param([string]$Name)
    try {
        $out = & schtasks.exe /Query /TN $Name /V /FO LIST 2>&1
        if ($LASTEXITCODE -ne 0) { return $null }
        return ($out | Out-String)
    } catch {
        return $null
    }
}

function Invoke-Preflight {
    Write-Section "Preflight checks"

    Write-Info "Root: $root"
    Write-Info "DB:   $DbPath"
    Write-Info "User: $env:USERNAME"
    Write-Info "Action: $Action  IntervalMinutes: $IntervalMinutes"

    if (-not (Test-Path -LiteralPath $root)) {
        Write-Fail "Project root not found: $root"
    } else {
        Write-Ok "Project root exists"
    }

    foreach ($pair in @(
            @{ Path = $runnerPy; Label = 'monitor_runner.py' },
            @{ Path = $senderPy; Label = 'email_sender.py' },
            @{ Path = $libPy; Label = 'linknest_worker_lib.py' }
        )) {
        if (Test-Path -LiteralPath $pair.Path) {
            Write-Ok "$($pair.Label) found"
        } else {
            Write-Fail "Missing $($pair.Label): $($pair.Path)"
        }
    }

    if (Test-Path -LiteralPath $DbPath) {
        Write-Ok "Database file exists"
    } else {
        Write-WarnLine "Database not found yet ($DbPath). Workers still install; open the app once so PHP can create the DB, or checks may no-op until then."
    }

    $script:pythonExe = $null
    try {
        $script:pythonExe = Resolve-PythonExe -Preferred $Python
        $ver = Get-PythonVersionInfo -Exe $script:pythonExe
        $script:pythonExe = $ver.Executable
        if (Test-PythonVersionAtLeast -Version $ver.Version) {
            Write-Ok "Python $($ver.Version) at $($script:pythonExe)"
        } else {
            Write-Fail "Python $($ver.Version) is too old (need 3.9+): $($script:pythonExe)"
        }
    } catch {
        Write-Fail $_.Exception.Message
    }

    if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
        Write-Ok "ScheduledTasks PowerShell cmdlets available"
    } else {
        Write-Fail "Get-ScheduledTask not available (install RSAT / use Windows Task Scheduler capable edition)"
    }

    if (Get-Command schtasks.exe -ErrorAction SilentlyContinue) {
        Write-Ok "schtasks.exe available"
    } else {
        Write-WarnLine "schtasks.exe not on PATH (secondary verify will be skipped)"
    }

    if ($script:FailCount -gt 0) {
        throw "Preflight failed with $script:FailCount error(s). Fix the items above and retry."
    }
}

function Show-Status {
    Write-Section "Task status"
    $anyMissing = $false
    foreach ($name in @($taskMonitor, $taskEmail)) {
        $t = Get-TaskSafe -Name $name
        if ($t) {
            $info = Get-ScheduledTaskInfo -TaskName $name
            $actions = @($t.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)".Trim() })
            Write-Host ""
            Write-Host "  $name" -ForegroundColor White
            Write-Ok "Present | State=$($t.State) | Enabled=$($t.Settings.Enabled)"
            Write-Info "LastRun=$($info.LastRunTime)  LastResult=$($info.LastTaskResult)  NextRun=$($info.NextRunTime)"
            Write-Info "Action: $($actions -join ' | ')"
            if ($info.LastTaskResult -ne 0 -and $info.LastTaskResult -ne 267011 -and $null -ne $info.LastRunTime -and $info.LastRunTime -gt [datetime]'2000-01-01') {
                # 267011 = never run / SCHED_S_TASK_HAS_NOT_RUN-ish on some builds
                Write-WarnLine "LastResult was non-zero ($($info.LastTaskResult)). Run: -Action run-once"
            }
        } else {
            $anyMissing = $true
            Write-Host ""
            Write-Host "  $name" -ForegroundColor White
            Write-Fail "Not installed"
        }
    }
    Write-Host ""
    if ($anyMissing) {
        Write-Fail "One or more tasks are missing. Run: scripts\schedule-monitor-workers.bat"
        return 1
    }
    Write-Ok "Both tasks are registered"
    return 0
}

function Test-WorkerTaskConfiguration {
    param(
        [string]$Name,
        [string]$ExpectedArgsFragment,
        [string]$ExpectedWorkDir
    )

    Write-Host ""
    Write-Host "  Verifying: $Name" -ForegroundColor White

    $t = Get-TaskSafe -Name $Name
    if (-not $t) {
        Write-Fail "Task not found in Task Scheduler"
        return
    }
    Write-Ok "Task exists (State=$($t.State))"

    if ($t.Settings.Enabled) {
        Write-Ok "Task is enabled"
    } else {
        Write-Fail "Task is disabled"
    }

    $action = @($t.Actions)[0]
    if (-not $action) {
        Write-Fail "No action defined on task"
    } else {
        $exe = [string]$action.Execute
        $args = [string]$action.Arguments
        $wd = [string]$action.WorkingDirectory

        if ($exe -and (Test-Path -LiteralPath $exe)) {
            Write-Ok "Program exists: $exe"
        } elseif ($exe) {
            # May be bare "python" resolved via PATH at runtime
            $cmd = Get-Command $exe -ErrorAction SilentlyContinue
            if ($cmd) {
                Write-Ok "Program resolves on PATH: $exe -> $($cmd.Source)"
            } else {
                Write-Fail "Program not found: $exe"
            }
        } else {
            Write-Fail "Action Execute is empty"
        }

        if ($args -and ($args -like "*$ExpectedArgsFragment*")) {
            Write-Ok "Arguments include $ExpectedArgsFragment"
        } else {
            Write-Fail "Arguments missing expected fragment '$ExpectedArgsFragment'. Got: $args"
        }

        if ($args -and ($args -like "*$DbPath*" -or $args -like "*--db*")) {
            Write-Ok "Arguments reference --db"
        } else {
            Write-WarnLine "Arguments do not clearly include --db path"
        }

        $wdNorm = if ($wd) { [System.IO.Path]::GetFullPath($wd).TrimEnd('\') } else { '' }
        $rootNorm = [System.IO.Path]::GetFullPath($ExpectedWorkDir).TrimEnd('\')
        if ($wdNorm -and ($wdNorm -ieq $rootNorm)) {
            Write-Ok "Start in (WorkingDirectory) = $wdNorm"
        } elseif ($wdNorm) {
            Write-Fail "WorkingDirectory mismatch. Expected $rootNorm ; got $wdNorm"
        } else {
            Write-Fail "WorkingDirectory is empty (workers need project root)"
        }
    }

    $triggers = @($t.Triggers)
    if ($triggers.Count -gt 0) {
        Write-Ok "Trigger count: $($triggers.Count)"
        $rep = $triggers[0].Repetition
        if ($rep -and $rep.Interval) {
            Write-Ok "Repetition interval: $($rep.Interval)"
        } else {
            Write-WarnLine "No repetition interval detected on first trigger (may not re-run every few minutes)"
        }
    } else {
        Write-Fail "No triggers configured"
    }

    if ($t.Settings.MultipleInstances -eq 'IgnoreNew' -or [string]$t.Settings.MultipleInstances -eq 'IgnoreNew') {
        Write-Ok "MultipleInstances = IgnoreNew (won't stack overlapping runs)"
    } else {
        Write-WarnLine "MultipleInstances=$($t.Settings.MultipleInstances) (prefer IgnoreNew)"
    }

    $sch = Get-SchtasksQueryText -Name $Name
    if ($null -eq $sch) {
        Write-WarnLine "schtasks.exe could not query this task (API registration still counts)"
    } else {
        if ($sch -match '(?im)Status:\s*(Ready|Running|Queued)') {
            Write-Ok "schtasks.exe sees task (Status matched Ready/Running/Queued)"
        } elseif ($sch -match '(?im)TaskName:') {
            Write-Ok "schtasks.exe lists the task"
        } else {
            Write-WarnLine "schtasks.exe query returned unexpected output"
        }
        if ($sch -match [regex]::Escape($ExpectedArgsFragment)) {
            Write-Ok "schtasks.exe arguments mention $ExpectedArgsFragment"
        }
    }

    try {
        $info = Get-ScheduledTaskInfo -TaskName $Name
        Write-Info "NextRun=$($info.NextRunTime)  LastRun=$($info.LastRunTime)  LastResult=$($info.LastTaskResult)"
    } catch {
        Write-WarnLine "Could not read ScheduledTaskInfo: $($_.Exception.Message)"
    }
}

function Invoke-Verify {
    param([switch]$QuietHeader)
    if (-not $QuietHeader) {
        Write-Section "Verify scheduled tasks"
    } else {
        Write-Section "Post-install verification"
    }

    if (-not $script:pythonExe) {
        try { $script:pythonExe = Resolve-PythonExe -Preferred $Python } catch { $script:pythonExe = $Python }
    }

    Test-WorkerTaskConfiguration -Name $taskMonitor -ExpectedArgsFragment $expectedMonitorArgsFragment -ExpectedWorkDir $root
    Test-WorkerTaskConfiguration -Name $taskEmail -ExpectedArgsFragment $expectedEmailArgsFragment -ExpectedWorkDir $root

    Write-Host ""
    if ($script:FailCount -gt 0) {
        Write-Fail "Verification finished with $script:FailCount failure(s), $script:WarnCount warning(s)."
        return 1
    }
    if ($script:WarnCount -gt 0) {
        Write-WarnLine "Verification passed with $script:WarnCount warning(s)."
        Write-Ok "Both monitoring tasks look scheduled correctly."
        return 0
    }
    Write-Ok "Verification passed. Both tasks are installed, enabled, and look correct."
    return 0
}

function Remove-WorkerTasks {
    Write-Section "Uninstall"
    foreach ($name in @($taskMonitor, $taskEmail)) {
        $t = Get-TaskSafe -Name $name
        if ($t) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Ok "Removed task: $name"
        } else {
            Write-Info "Task not found (skip): $name"
        }
    }
    Start-Sleep -Milliseconds 400
    $stillThere = @()
    foreach ($name in @($taskMonitor, $taskEmail)) {
        if (Get-TaskSafe -Name $name) { $stillThere += $name }
    }
    if ($stillThere.Count -eq 0) {
        Write-Ok "Confirm: neither LinkNest worker task remains"
    } else {
        Write-Fail "Some tasks still present after uninstall: $($stillThere -join ', ')"
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
        Write-Info "Replacing existing task: $Name"
    }

    $action = New-ScheduledTaskAction -Execute $script:pythonExe -Argument $Arguments -WorkingDirectory $root
    $start = (Get-Date).AddMinutes(1)
    # 10-year repetition window ~= "indefinitely" (MaxValue can fail on some Windows builds)
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

    Write-Ok "Registered: $Name (every $IntervalMinutes min)"
    Write-Info "Program: $script:pythonExe"
    Write-Info "Args:    $Arguments"
    Write-Info "Start in: $root"
}

function Install-WorkerTasks {
    Write-Section "Install Task Scheduler jobs"

    $dbQuoted = $DbPath
    $monitorArgs = "scripts\monitor_runner.py --db `"$dbQuoted`" --max-workers 10"
    $emailArgs = "scripts\email_sender.py --db `"$dbQuoted`" --limit 25 --smtp-timeout 20"

    Register-WorkerTask -Name $taskMonitor -Arguments $monitorArgs `
        -Description "LinkNest: run due monitor checks and queue notification emails"
    Register-WorkerTask -Name $taskEmail -Arguments $emailArgs `
        -Description "LinkNest: send queued monitor notification emails via SMTP"

    # Reset counters for verify phase reporting
    $script:FailCount = 0
    $script:WarnCount = 0
    $verifyCode = Invoke-Verify -QuietHeader

    if ($verifyCode -ne 0) {
        throw "Tasks were registered but verification failed. See [FAIL] lines above."
    }

    if (-not $SkipSmoke) {
        Write-Section "Smoke test (run-once)"
        Write-Info "Running both workers once to confirm Python + DB access..."
        try {
            Invoke-RunOnce
            Write-Ok "Smoke test completed"
        } catch {
            Write-WarnLine "Smoke test failed: $($_.Exception.Message)"
            Write-WarnLine "Tasks are still scheduled; fix Python/DB then run: -Action run-once"
        }
    } else {
        Write-Info "SkipSmoke set - not running workers now"
    }

    Write-Section "Summary"
    Write-Ok "Install finished."
    Write-Info "Tasks run as user '$env:USERNAME' while logged on (no admin required)."
    Write-Info "Useful commands:"
    Write-Host "    scripts\schedule-monitor-workers.bat status"
    Write-Host "    scripts\schedule-monitor-workers.bat verify"
    Write-Host "    scripts\schedule-monitor-workers.bat run-once"
    Write-Host ""
    Write-Info "Docker tip: container entrypoint already loops workers (LINKNEST_WORKERS_ENABLED=1)."
    Write-Info "            Do not also schedule these host tasks against the same bind-mounted DB."
}

function Invoke-RunOnce {
    if (-not $script:pythonExe) {
        $script:pythonExe = Resolve-PythonExe -Preferred $Python
    }
    Write-Host "Running monitor_runner once..."
    & $script:pythonExe $runnerPy --db $DbPath --max-workers 10 --verbose
    if ($LASTEXITCODE -ne 0) { throw "monitor_runner exited with code $LASTEXITCODE" }

    Write-Host ""
    Write-Host "Running email_sender once..."
    & $script:pythonExe $senderPy --db $DbPath --limit 25 --smtp-timeout 20 --verbose
    if ($LASTEXITCODE -ne 0) { throw "email_sender exited with code $LASTEXITCODE" }

    Write-Host ""
    Write-Ok "run-once completed (checks + email outbox drain attempted)."
}

# --- main ---
$exitCode = 0
try {
    switch ($Action) {
        'install' {
            Invoke-Preflight
            Install-WorkerTasks
        }
        'verify' {
            Invoke-Preflight
            $exitCode = Invoke-Verify
        }
        'uninstall' {
            Invoke-Preflight
            Remove-WorkerTasks
            if ($script:FailCount -gt 0) { $exitCode = 1 }
        }
        'status' {
            # Light preflight: python optional for status
            Write-Section "Preflight (light)"
            Write-Info "Root: $root"
            if (-not (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue)) {
                throw "Get-ScheduledTask not available"
            }
            Write-Ok "ScheduledTasks cmdlets available"
            $exitCode = Show-Status
        }
        'run-once' {
            Invoke-Preflight
            Invoke-RunOnce
        }
    }
} catch {
    Write-Host ""
    Write-Fail $_.Exception.Message
    $exitCode = 1
}

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "Result: SUCCESS" -ForegroundColor Green
} else {
    Write-Host "Result: FAILED (exit $exitCode)" -ForegroundColor Red
}

exit $exitCode

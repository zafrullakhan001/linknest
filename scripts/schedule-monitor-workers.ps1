<#
.SYNOPSIS
  Install, verify, remove, or check Windows Task Scheduler jobs for LinkNest monitoring workers.

.DESCRIPTION
  Registers two repeating tasks (names follow the install folder so ERP3 / ArchLinks
  / linknest can all run on the same PC):
    - <Folder> - Monitor Runner  (monitor_runner.py - checks + queue emails)
    - <Folder> - Email Sender    (email_sender.py - SMTP send from outbox)

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

.PARAMETER TaskUser
  Optional DOMAIN\User to run tasks as (S4U - no stored password, runs whether
  logged on). Default: SYSTEM first, then the logged-on user via S4U. Do not use
  Interactive ("run only when user is logged on") - missed first triggers never repeat.

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

    [ValidateRange(1, 64)]
    [int]$MaxWorkers = 20,

    [string]$DbPath = '',

    [string]$TaskUser = '',

    [switch]$SkipSmoke
)

$ErrorActionPreference = 'Stop'
$script:FailCount = 0
$script:WarnCount = 0
$script:UsedInteractivePrincipal = $false

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

function Test-UsablePythonExe {
    param([string]$Path)
    if (-not $Path) { return $false }
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    if ($Path -match 'WindowsApps\\') { return $false }
    try {
        $item = Get-Item -LiteralPath $Path -ErrorAction Stop
        if ($item.Length -gt 0 -and $item.Length -lt 50000) { return $false }
    } catch {
        return $false
    }
    return $true
}

function Resolve-PythonExe {
    param([string]$Preferred)
    if ($Preferred -and (Test-UsablePythonExe $Preferred)) {
        return (Resolve-Path -LiteralPath $Preferred).Path
    }

    $bundled = Join-Path $root 'bin\python\python.exe'
    if (Test-UsablePythonExe $bundled) {
        return (Resolve-Path -LiteralPath $bundled).Path
    }

    foreach ($name in @($Preferred, 'python', 'python3')) {
        if (-not $name) { continue }
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -and (Test-UsablePythonExe ([string]$cmd.Source))) {
            return [string]$cmd.Source
        }
    }

    $candidates = @(
        'C:\Program Files\Python314\python.exe',
        'C:\Program Files\Python313\python.exe',
        'C:\Program Files\Python312\python.exe',
        'C:\Program Files\Python311\python.exe',
        'C:\Program Files\Python310\python.exe'
    )
    if ($env:LOCALAPPDATA) {
        $candidates += @(
            (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python314\python.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python310\python.exe')
        )
    }
    foreach ($cand in $candidates) {
        if (Test-UsablePythonExe $cand) {
            return (Resolve-Path -LiteralPath $cand).Path
        }
    }

    throw "Python not found. Use Install Python in the Monitoring scheduler panel, run scripts\ensure-python-runtime.ps1, install Python 3.9+ (and enable PATH), or pass -Python with the full path to python.exe."
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

$folderLeaf = Split-Path -Leaf $root
# Keep in sync with monitorWorkerSchedulerFolderLabel() in api/monitor_worker_scheduler_lib.php
$folderSafe = (($folderLeaf -replace '[^A-Za-z0-9._ -]', '').Trim(' .-'))
if (-not $folderSafe) { $folderSafe = 'LinkNest' }
$legacyTaskMonitor = 'LinkNest - Monitor Runner'
$legacyTaskEmail = 'LinkNest - Email Sender'
$expectedMonitorArgsFragment = 'scripts\monitor_runner.py'
$expectedEmailArgsFragment = 'scripts\email_sender.py'
$script:taskMonitor = $null
$script:taskEmail = $null

function Get-TaskSafe {
    param([string]$Name)
    try { return Get-ScheduledTask -TaskName $Name -ErrorAction Stop } catch { return $null }
}

function Test-TaskBelongsToThisRoot {
    param($Task)
    if (-not $Task) { return $false }
    $action = @($Task.Actions)[0]
    if (-not $action) { return $false }
    $rootNorm = [System.IO.Path]::GetFullPath($root).TrimEnd('\').ToLowerInvariant()
    $wd = [string]$action.WorkingDirectory
    if ($wd) {
        try {
            $wdNorm = [System.IO.Path]::GetFullPath($wd).TrimEnd('\').ToLowerInvariant()
            if ($wdNorm -eq $rootNorm) { return $true }
        } catch {}
    }
    $args = [string]$action.Arguments
    if ($args -and $args.ToLowerInvariant().Contains($rootNorm.ToLowerInvariant())) { return $true }
    return $false
}

function Get-PathFingerprint {
    param([string]$Path)
    # Keep in sync with monitorWorkerSchedulerNormalizedRoot() + InstallFingerprint() in PHP (SHA1 UTF-8, first 6 hex).
    $bs = [char]92
    $norm = [System.IO.Path]::GetFullPath($Path).Replace('/', $bs).TrimEnd($bs).ToLowerInvariant()
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($norm)
        $hash = [BitConverter]::ToString($sha1.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
        return $hash.Substring(0, 6)
    } finally {
        $sha1.Dispose()
    }
}

function Save-WorkerTaskNames {
    $dataDir = Join-Path $root 'data'
    if (-not (Test-Path -LiteralPath $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir | Out-Null
    }
    $payload = @{
        monitor = $script:taskMonitor
        email = $script:taskEmail
        root = $root
        updated_at = (Get-Date).ToUniversalTime().ToString('o')
    }
    $jsonPath = Join-Path $dataDir 'monitor_worker_tasks.json'
    ($payload | ConvertTo-Json) | Set-Content -LiteralPath $jsonPath -Encoding UTF8
    Write-Info "Saved task names to data\monitor_worker_tasks.json"
}

function Resolve-WorkerTaskNames {
    $fp = Get-PathFingerprint $root
    $folderMonitor = "$folderSafe - Monitor Runner"
    $folderEmail = "$folderSafe - Email Sender"
    $uniqueMonitor = "$folderSafe-$fp - Monitor Runner"
    $uniqueEmail = "$folderSafe-$fp - Email Sender"

    $namesFile = Join-Path $root 'data\monitor_worker_tasks.json'
    if (Test-Path -LiteralPath $namesFile) {
        try {
            $saved = Get-Content -LiteralPath $namesFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($saved.monitor -and $saved.email) {
                $t = Get-TaskSafe -Name ([string]$saved.monitor)
                if ($t -and (Test-TaskBelongsToThisRoot $t)) {
                    $script:taskMonitor = [string]$saved.monitor
                    $script:taskEmail = [string]$saved.email
                    Write-Info "Using saved task names: $($script:taskMonitor)"
                    return
                }
            }
        } catch {}
    }

    $existingMonitor = Get-TaskSafe -Name $folderMonitor
    $existingEmail = Get-TaskSafe -Name $folderEmail
    $monitorTaken = $existingMonitor -and -not (Test-TaskBelongsToThisRoot $existingMonitor)
    $emailTaken = $existingEmail -and -not (Test-TaskBelongsToThisRoot $existingEmail)
    if ($monitorTaken -or $emailTaken) {
        $script:taskMonitor = $uniqueMonitor
        $script:taskEmail = $uniqueEmail
        Write-Info "Folder name '$folderSafe' is already used by another LinkNest copy."
        Write-Info "This install will register: $($script:taskMonitor)"
        return
    }

    $script:taskMonitor = $folderMonitor
    $script:taskEmail = $folderEmail
}

Resolve-WorkerTaskNames
$taskMonitor = $script:taskMonitor
$taskEmail = $script:taskEmail

function Remove-LegacyTasksForThisRoot {
    foreach ($name in @($legacyTaskMonitor, $legacyTaskEmail)) {
        if ($name -eq $taskMonitor -or $name -eq $taskEmail) { continue }
        $t = Get-TaskSafe -Name $name
        if ($t -and (Test-TaskBelongsToThisRoot $t)) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Info "Removed leftover task '$name' (it pointed at this folder)"
        }
    }
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
        if ($sch -match '(?im)Logon Mode:\s*Interactive only') {
            Write-WarnLine "Logon Mode is Interactive only. The repeating schedule runs while that user is logged on. For unattended checks (no console login), run Apache as a Windows service so install can use SYSTEM."
        } elseif ($sch -match '(?im)Run As User:\s*SYSTEM') {
            Write-Ok "Runs as SYSTEM (no logged-on user required)"
        } elseif ($sch -match '(?im)Logon Mode:\s*S4U') {
            Write-Ok "Runs as S4U (no interactive login required)"
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
    Remove-LegacyTasksForThisRoot
    foreach ($name in @($taskMonitor, $taskEmail)) {
        $t = Get-TaskSafe -Name $name
        if (-not $t) {
            Write-Info "Task not found (skip): $name"
            continue
        }
        if (-not (Test-TaskBelongsToThisRoot $t)) {
            Write-WarnLine "Skipping '$name' - it belongs to another LinkNest folder ($($t.Actions[0].WorkingDirectory))"
            continue
        }
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
        Write-Ok "Removed task: $name"
    }
    $namesFile = Join-Path $root 'data\monitor_worker_tasks.json'
    if (Test-Path -LiteralPath $namesFile) {
        Remove-Item -LiteralPath $namesFile -Force
        Write-Info "Removed data\monitor_worker_tasks.json"
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

function Resolve-TaskRunAsUser {
    param([string]$Preferred = '')

    $candidates = [System.Collections.Generic.List[string]]::new()
    if ($Preferred) {
        $candidates.Add($Preferred.Trim())
    }

    if ($TaskUser) {
        $candidates.Add($TaskUser.Trim())
    }

    if ($env:USERNAME -and $env:USERNAME -notin @('SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE', 'SERVICE', 'ANONYMOUS LOGON')) {
        if ($env:USERDOMAIN -and $env:USERDOMAIN -ne '.' -and $env:USERDOMAIN -ne 'WORKGROUP') {
            $candidates.Add("$env:USERDOMAIN\$env:USERNAME")
        }
        $candidates.Add($env:USERNAME)
    }

    $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    if ($current -and $current -notmatch 'SYSTEM|LOCAL SERVICE|NETWORK SERVICE|ANONYMOUS LOGON') {
        $candidates.Add($current)
    }

    try {
        $consoleUser = (Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop).UserName
        if ($consoleUser) {
            $candidates.Add($consoleUser)
        }
    } catch {}

    try {
        $quserLines = @(query user 2>$null)
        foreach ($line in $quserLines) {
            if ($line -notmatch 'Active') { continue }
            $clean = ($line -replace '^\s*>', '').Trim()
            $parts = $clean.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
            if ($parts.Count -ge 1 -and $parts[0]) {
                $candidates.Add($parts[0])
            }
        }
    } catch {}

    $seen = @{}
    foreach ($user in $candidates) {
        if (-not $user) { continue }
        $key = $user.ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        try {
            $nt = New-Object System.Security.Principal.NTAccount($user)
            $null = $nt.Translate([System.Security.Principal.SecurityIdentifier])
            return $user
        } catch {}
    }

    return $null
}

function Get-WorkerPrincipalAttempts {
    $attempts = [System.Collections.Generic.List[object]]::new()

    if ($TaskUser) {
        $attempts.Add(@{
            Label = "user $TaskUser (S4U, runs whether logged on)"
            Principal = (New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType S4U -RunLevel Limited)
        })
        $attempts.Add(@{
            Label = "user $TaskUser (Interactive, only while logged on)"
            Principal = (New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType Interactive -RunLevel Limited)
        })
    }

    $attempts.Add(@{
        Label = 'SYSTEM (runs whether anyone is logged on)'
        Principal = (New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest)
    })

    $runAs = Resolve-TaskRunAsUser
    if ($runAs -and (-not $TaskUser -or ($runAs.ToLowerInvariant() -ne $TaskUser.Trim().ToLowerInvariant()))) {
        $attempts.Add(@{
            Label = "user $runAs (Interactive, only while logged on)"
            Principal = (New-ScheduledTaskPrincipal -UserId $runAs -LogonType Interactive -RunLevel Limited)
        })
        $attempts.Add(@{
            Label = "user $runAs (S4U, runs whether logged on)"
            Principal = (New-ScheduledTaskPrincipal -UserId $runAs -LogonType S4U -RunLevel Limited)
        })
    }

    return $attempts
}

function Register-WorkerTask {
    param(
        [string]$Name,
        [string]$Arguments,
        [string]$Description
    )

    $existing = Get-TaskSafe -Name $Name
    if ($existing) {
        if (-not (Test-TaskBelongsToThisRoot $existing)) {
            throw "Task '$Name' already belongs to another LinkNest folder ($($existing.Actions[0].WorkingDirectory)). Another copy is using this job name; this install should use a unique name (folder-xxxxxx)."
        }
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false
        Write-Info "Replacing existing task for this folder: $Name"
    }

    $action = New-ScheduledTaskAction -Execute $script:pythonExe -Argument $Arguments -WorkingDirectory $root
    $start = Get-Date
    # 10-year repetition window ~= "indefinitely" (MaxValue can fail on some Windows builds)
    $repeatTrigger = New-ScheduledTaskTrigger -Once -At $start `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 3650)

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    $attempts = @(Get-WorkerPrincipalAttempts)
    $registered = $false
    $lastError = $null
    foreach ($attempt in $attempts) {
        try {
            Register-ScheduledTask `
                -TaskName $Name `
                -Description $Description `
                -Action $action `
                -Trigger $repeatTrigger `
                -Settings $settings `
                -Principal $attempt.Principal | Out-Null
            Write-Ok "Registered: $Name as $($attempt.Label) (every $IntervalMinutes min)"
            if ($attempt.Label -like '*Interactive*') {
                $script:UsedInteractivePrincipal = $true
                Write-WarnLine "This task runs only while that user is logged on. Start now will kick off the repeating schedule. Prefer running Apache as a service (SYSTEM) for unattended checks."
            }
            $registered = $true
            break
        } catch {
            $lastError = $_
            Write-Info "Could not register as $($attempt.Label): $($_.Exception.Message)"
            $existingAfter = Get-TaskSafe -Name $Name
            if ($existingAfter) {
                Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
            }
        }
    }
    if (-not $registered) {
        throw "Failed to register $Name. $($lastError.Exception.Message)"
    }

    Write-Info "Program: $script:pythonExe"
    Write-Info "Args:    $Arguments"
    Write-Info "Start in: $root"

    try {
        Start-ScheduledTask -TaskName $Name -ErrorAction Stop
        Write-Ok "Started $Name now (does not wait for the next interval)"
    } catch {
        $runOut = & schtasks.exe /Run /TN $Name 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Started $Name now via schtasks"
        } else {
            Write-WarnLine "Could not start $Name immediately: $runOut"
        }
    }
}

function Install-WorkerTasks {
    Write-Section "Install Task Scheduler jobs"

    $dbQuoted = $DbPath
    $monitorArgs = "scripts\monitor_runner.py --db `"$dbQuoted`" --max-workers $MaxWorkers"
    $emailArgs = "scripts\email_sender.py --db `"$dbQuoted`" --limit 25 --smtp-timeout 20"

    Register-WorkerTask -Name $taskMonitor -Arguments $monitorArgs `
        -Description "LinkNest: run due monitor checks and queue notification emails"
    Register-WorkerTask -Name $taskEmail -Arguments $emailArgs `
        -Description "LinkNest: send queued monitor notification emails via SMTP"

    Remove-LegacyTasksForThisRoot
    Save-WorkerTaskNames

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
    if ($script:UsedInteractivePrincipal) {
        Write-WarnLine "Tasks are Interactive (run while this Windows user is logged on). SYSTEM/S4U need Administrator. Stay logged on, or run Apache as a service and reinstall."
    } else {
        Write-Info "Tasks run whether or not a user is logged on (SYSTEM, or S4U if SYSTEM is not allowed)."
    }
    Write-Info "This copy's Task Scheduler names:"
    Write-Host "    $($script:taskMonitor)"
    Write-Host "    $($script:taskEmail)"
    Write-Info "If Py jobs stay queued, click Run now in the scheduler panel or: schtasks /Run /TN `"$taskMonitor`""
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
    & $script:pythonExe $runnerPy --db $DbPath --max-workers $MaxWorkers --verbose
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

<#
.SYNOPSIS
  Read Task Scheduler principal/trigger/settings for one LinkNest worker job as JSON.

  Used by the Monitoring scheduler panel (api/monitor_worker_scheduler_lib.php).
  Invoked as: powershell.exe -File query-scheduled-task.ps1 -TaskName "linknest - Monitor Runner"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TaskName
)

$ErrorActionPreference = 'Stop'
try {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $p = $t.Principal
    $s = $t.Settings
    $tr = @($t.Triggers)[0]
    $rep = $null
    $dur = $null
    if ($null -ne $tr -and $null -ne $tr.Repetition) {
        $rep = [string]$tr.Repetition.Interval
        $dur = [string]$tr.Repetition.Duration
    }
    [ordered]@{
        logon_type = [string]$p.LogonType
        run_as = [string]$p.UserId
        run_level = [string]$p.RunLevel
        enabled = [bool]$s.Enabled
        repetition_interval = $rep
        repetition_duration = $dur
        start_when_available = [bool]$s.StartWhenAvailable
        disallow_start_on_batteries = [bool]$s.DisallowStartIfOnBatteries
        stop_if_going_on_batteries = [bool]$s.StopIfGoingOnBatteries
        multiple_instances = [string]$s.MultipleInstances
        wake_to_run = [bool]$s.WakeToRun
        execution_time_limit = [string]$s.ExecutionTimeLimit
        hidden = [bool]$s.Hidden
    } | ConvertTo-Json -Compress
} catch {
    Write-Output '{}'
    exit 0
}

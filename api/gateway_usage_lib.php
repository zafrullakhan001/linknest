<?php
/**
 * Shared host/process usage helpers for SSH + VNC gateway admin cards.
 */

function lnGatewayFormatBytes(?int $bytes): ?string {
    if ($bytes === null || $bytes < 0) {
        return null;
    }
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $n = (float)$bytes;
    $i = 0;
    while ($n >= 1024 && $i < count($units) - 1) {
        $n /= 1024;
        $i++;
    }
    $decimals = $i === 0 ? 0 : ($n >= 100 ? 0 : ($n >= 10 ? 1 : 2));
    return number_format($n, $decimals) . ' ' . $units[$i];
}

/**
 * Snapshot of running processes: pid => ['ppid' => int, 'ws' => int working-set bytes].
 *
 * @return array<int, array{ppid:int, ws:int}>
 */
function lnGatewaySnapshotProcesses(): array {
    $byPid = [];
    if (stripos(PHP_OS, 'WIN') === 0) {
        $out = [];
        @exec('wmic process get ProcessId,ParentProcessId,WorkingSetSize /FORMAT:CSV 2>NUL', $out);
        $header = null;
        foreach ($out as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $cols = str_getcsv($line);
            if ($header === null) {
                $header = array_map(static function ($h) {
                    return strtolower(trim((string)$h));
                }, $cols);
                continue;
            }
            if (count($cols) < count($header)) {
                continue;
            }
            $row = [];
            foreach ($header as $idx => $name) {
                $row[$name] = $cols[$idx] ?? '';
            }
            $pid = (int)($row['processid'] ?? 0);
            if ($pid < 1) {
                continue;
            }
            $byPid[$pid] = [
                'ppid' => (int)($row['parentprocessid'] ?? 0),
                'ws' => (int)($row['workingsetsize'] ?? 0),
            ];
        }
        if ($byPid !== []) {
            return $byPid;
        }
        $ps = [];
        @exec(
            'powershell -NoProfile -NonInteractive -Command '
            . '"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Csv -NoTypeInformation"',
            $ps
        );
        $header = null;
        foreach ($ps as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $cols = str_getcsv($line);
            if ($header === null) {
                $header = array_map(static function ($h) {
                    return strtolower(trim((string)$h));
                }, $cols);
                continue;
            }
            if (count($cols) < count($header)) {
                continue;
            }
            $row = [];
            foreach ($header as $idx => $name) {
                $row[$name] = $cols[$idx] ?? '';
            }
            $pid = (int)($row['processid'] ?? 0);
            if ($pid < 1) {
                continue;
            }
            $byPid[$pid] = [
                'ppid' => (int)($row['parentprocessid'] ?? 0),
                'ws' => (int)($row['workingsetsize'] ?? 0),
            ];
        }
        return $byPid;
    }

    foreach (glob('/proc/[0-9]*', GLOB_ONLYDIR) ?: [] as $dir) {
        $pid = (int)basename($dir);
        if ($pid < 1) {
            continue;
        }
        $stat = @file_get_contents($dir . '/stat');
        $ppid = 0;
        if (is_string($stat) && preg_match('/^\d+ \([^)]*\) \S+ (\d+)/', $stat, $m)) {
            $ppid = (int)$m[1];
        }
        $ws = 0;
        $status = @file_get_contents($dir . '/status');
        if (is_string($status) && preg_match('/VmRSS:\s+(\d+)\s+kB/i', $status, $rm)) {
            $ws = (int)$rm[1] * 1024;
        }
        $byPid[$pid] = ['ppid' => $ppid, 'ws' => $ws];
    }
    return $byPid;
}

/**
 * Working-set for a gateway root PID plus descendant processes.
 *
 * @param array<int, array{ppid:int, ws:int}> $byPid
 * @return array{pid:int, processBytes:?int, childrenBytes:int, childProcessCount:int, totalBytes:?int, processHuman:?string, childrenHuman:?string, totalHuman:?string}
 */
function lnGatewayTreeMemory(array $byPid, int $rootPid): array {
    $empty = [
        'pid' => $rootPid,
        'processBytes' => null,
        'childrenBytes' => 0,
        'childProcessCount' => 0,
        'totalBytes' => null,
        'processHuman' => null,
        'childrenHuman' => null,
        'totalHuman' => null,
    ];
    if ($rootPid < 1 || !isset($byPid[$rootPid])) {
        return $empty;
    }

    $processBytes = (int)($byPid[$rootPid]['ws'] ?? 0);
    $childrenBytes = 0;
    $childCount = 0;
    $queue = [$rootPid];
    $seen = [$rootPid => true];
    while ($queue !== []) {
        $parent = array_shift($queue);
        foreach ($byPid as $pid => $info) {
            if (isset($seen[$pid])) {
                continue;
            }
            if ((int)($info['ppid'] ?? 0) !== $parent) {
                continue;
            }
            $seen[$pid] = true;
            $queue[] = $pid;
            if ($pid === $rootPid) {
                continue;
            }
            $childrenBytes += (int)($info['ws'] ?? 0);
            $childCount++;
        }
    }
    $total = $processBytes + $childrenBytes;
    return [
        'pid' => $rootPid,
        'processBytes' => $processBytes > 0 ? $processBytes : null,
        'childrenBytes' => $childrenBytes,
        'childProcessCount' => $childCount,
        'totalBytes' => $total > 0 ? $total : null,
        'processHuman' => lnGatewayFormatBytes($processBytes > 0 ? $processBytes : null),
        'childrenHuman' => lnGatewayFormatBytes($childrenBytes > 0 ? $childrenBytes : 0),
        'totalHuman' => lnGatewayFormatBytes($total > 0 ? $total : null),
    ];
}

/**
 * Host RAM / CPU snapshot for capacity planning.
 *
 * @return array{memoryTotalBytes:?int, memoryAvailableBytes:?int, memoryUsedBytes:?int, memoryTotalHuman:?string, memoryAvailableHuman:?string, memoryUsedHuman:?string, cpuCount:?int, loadAverage:?array}
 */
function lnGatewayHostResources(): array {
    $total = null;
    $available = null;
    $cpuCount = null;
    $load = null;

    if (stripos(PHP_OS, 'WIN') === 0) {
        $out = [];
        @exec('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /FORMAT:CSV 2>NUL', $out);
        $header = null;
        foreach ($out as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $cols = str_getcsv($line);
            if ($header === null) {
                $header = array_map(static function ($h) {
                    return strtolower(trim((string)$h));
                }, $cols);
                continue;
            }
            $row = [];
            foreach ($header as $idx => $name) {
                $row[$name] = $cols[$idx] ?? '';
            }
            $freeKb = (int)($row['freephysicalmemory'] ?? 0);
            $totalKb = (int)($row['totalvisiblememorysize'] ?? 0);
            if ($totalKb > 0) {
                $total = $totalKb * 1024;
                $available = $freeKb * 1024;
            }
            break;
        }
        $envCpu = getenv('NUMBER_OF_PROCESSORS');
        if (is_string($envCpu) && ctype_digit(trim($envCpu))) {
            $cpuCount = (int)trim($envCpu);
        } else {
            $cpuOut = [];
            @exec('wmic cpu get NumberOfLogicalProcessors /VALUE 2>NUL', $cpuOut);
            $sum = 0;
            foreach ($cpuOut as $line) {
                if (preg_match('/NumberOfLogicalProcessors\s*=\s*(\d+)/i', $line, $m)) {
                    $sum += (int)$m[1];
                }
            }
            if ($sum > 0) {
                $cpuCount = $sum;
            }
        }
    } else {
        $meminfo = @file_get_contents('/proc/meminfo');
        if (is_string($meminfo)) {
            if (preg_match('/MemTotal:\s+(\d+)\s+kB/i', $meminfo, $m)) {
                $total = (int)$m[1] * 1024;
            }
            if (preg_match('/MemAvailable:\s+(\d+)\s+kB/i', $meminfo, $m)) {
                $available = (int)$m[1] * 1024;
            } elseif (preg_match('/MemFree:\s+(\d+)\s+kB/i', $meminfo, $m)) {
                $available = (int)$m[1] * 1024;
            }
        }
        $nproc = @exec('nproc 2>/dev/null');
        if (is_string($nproc) && ctype_digit(trim($nproc))) {
            $cpuCount = (int)trim($nproc);
        } elseif (is_file('/proc/cpuinfo')) {
            $cpuCount = substr_count((string)@file_get_contents('/proc/cpuinfo'), 'processor');
            if ($cpuCount < 1) {
                $cpuCount = null;
            }
        }
        if (function_exists('sys_getloadavg')) {
            $la = @sys_getloadavg();
            if (is_array($la) && count($la) >= 3) {
                $load = [
                    '1m' => round((float)$la[0], 2),
                    '5m' => round((float)$la[1], 2),
                    '15m' => round((float)$la[2], 2),
                ];
            }
        }
    }

    $used = ($total !== null && $available !== null) ? max(0, $total - $available) : null;
    return [
        'memoryTotalBytes' => $total,
        'memoryAvailableBytes' => $available,
        'memoryUsedBytes' => $used,
        'memoryTotalHuman' => lnGatewayFormatBytes($total),
        'memoryAvailableHuman' => lnGatewayFormatBytes($available),
        'memoryUsedHuman' => lnGatewayFormatBytes($used),
        'cpuCount' => $cpuCount,
        'loadAverage' => $load,
    ];
}

/**
 * @param array<int, array> $sessions
 * @return array{rows: array<int, array>, usageMemoryBytes: int}
 */
function lnGatewayAnnotateSessionsMemory(array $sessions): array {
    $byPid = lnGatewaySnapshotProcesses();
    $rows = [];
    $sum = 0;
    foreach ($sessions as $s) {
        if (!is_array($s)) {
            continue;
        }
        $pid = isset($s['pid']) ? (int)$s['pid'] : 0;
        $mem = lnGatewayTreeMemory($byPid, $pid);
        if (($mem['totalBytes'] ?? null) !== null) {
            $sum += (int)$mem['totalBytes'];
        }
        $s['_memory'] = $mem;
        $rows[] = $s;
    }
    return ['rows' => $rows, 'usageMemoryBytes' => $sum];
}

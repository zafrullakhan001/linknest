<?php
/**
 * OPcache Status API
 * Returns OPcache status including cache hits, misses, memory, and config. Admin only.
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }
    $db = getDB();
    $stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user || empty($user['is_admin'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }

    $loaded = extension_loaded('Zend OPcache');
    $status = $loaded ? opcache_get_status() : null;
    $config = $loaded ? opcache_get_configuration() : null;
    $isCli = (php_sapi_name() === 'cli');

    $payload = [
        'success' => true,
        'loaded' => $loaded,
        'active' => ($status !== false),
        'is_cli' => $isCli,
        'php_version' => PHP_VERSION,
        'sapi' => php_sapi_name(),
    ];

    if (!$loaded) {
        $payload['message'] = 'OPcache extension is not loaded. Enable zend_extension=opcache in php.ini.';
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($status === false) {
        $payload['message'] = $isCli
            ? 'OPcache is typically disabled for CLI. View this via web (Admin Panel) for full statistics.'
            : 'OPcache extension is loaded but not active. Check php.ini (opcache.enable=1).';
        $payload['config'] = null;
        $payload['memory'] = null;
        $payload['statistics'] = null;
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Memory (bytes)
    $mem = $status['memory_usage'] ?? [];
    $payload['memory'] = [
        'used_bytes' => (int) ($mem['used_memory'] ?? 0),
        'free_bytes' => (int) ($mem['free_memory'] ?? 0),
        'wasted_bytes' => (int) ($mem['wasted_memory'] ?? 0),
        'used_human' => formatBytesForJson($mem['used_memory'] ?? 0),
        'free_human' => formatBytesForJson($mem['free_memory'] ?? 0),
        'wasted_human' => formatBytesForJson($mem['wasted_memory'] ?? 0),
    ];
    $totalMem = ($mem['used_memory'] ?? 0) + ($mem['free_memory'] ?? 0);
    $payload['memory']['total_bytes'] = (int) $totalMem;
    $payload['memory']['total_human'] = formatBytesForJson($totalMem);
    $payload['memory']['used_percent'] = $totalMem > 0
        ? round(100.0 * ($mem['used_memory'] ?? 0) / $totalMem, 1)
        : 0;

    // Statistics: hits, misses, hit rate
    $stats = $status['opcache_statistics'] ?? [];
    $hits = (int) ($stats['hits'] ?? 0);
    $misses = (int) ($stats['misses'] ?? 0);
    $totalRequests = $hits + $misses;
    $hitRate = $totalRequests > 0 ? round(100.0 * $hits / $totalRequests, 2) : 0;

    $payload['statistics'] = [
        'hits' => $hits,
        'misses' => $misses,
        'total_requests' => $totalRequests,
        'hit_rate_percent' => $hitRate,
        'num_cached_scripts' => (int) ($stats['num_cached_scripts'] ?? 0),
        'num_cached_keys' => (int) ($stats['num_cached_keys'] ?? 0),
        'max_cached_keys' => (int) ($stats['max_cached_keys'] ?? 0),
    ];

    if ($config && isset($config['directives'])) {
        $d = $config['directives'];
        $payload['config'] = [
            'memory_consumption_mb' => (int) ($d['opcache.memory_consumption'] ?? 0),
            'max_accelerated_files' => (int) ($d['opcache.max_accelerated_files'] ?? 0),
            'validate_timestamps' => !empty($d['opcache.validate_timestamps']),
            'revalidate_freq' => (int) ($d['opcache.revalidate_freq'] ?? 0),
        ];
    } else {
        $payload['config'] = null;
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'OPcache status failed: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

function formatBytesForJson($bytes): string {
    $bytes = (int) $bytes;
    $units = ['B', 'KB', 'MB', 'GB'];
    $pow = $bytes > 0 ? (int) floor(log($bytes) / log(1024)) : 0;
    $pow = min($pow, count($units) - 1);
    $val = $bytes / pow(1024, $pow);
    return round($val, 2) . ' ' . $units[$pow];
}

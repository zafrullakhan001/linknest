<?php
/**
 * Short-TTL file cache for hot public/guest read endpoints.
 * Invalidate on write so guests never see stale cards/styles longer than TTL.
 */

if (!defined('RESPONSE_CACHE_TTL_SECONDS')) {
    // Short TTL: absorbs stampeding home loads; writes invalidate immediately
    define('RESPONSE_CACHE_TTL_SECONDS', 30);
}

function getResponseCacheDir(): string {
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }

    $base = defined('DB_PATH') ? dirname(DB_PATH) : (__DIR__ . '/../data');
    $dir = $base . DIRECTORY_SEPARATOR . 'cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function responseCacheKeyToFile(string $key): string {
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $key);
    return getResponseCacheDir() . DIRECTORY_SEPARATOR . $safe . '.json';
}

/**
 * @return mixed|null Decoded payload, or null on miss/expiry
 */
function responseCacheGet(string $key, ?int $ttl = null) {
    $file = responseCacheKeyToFile($key);
    if (!is_file($file)) {
        return null;
    }

    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return null;
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || !array_key_exists('payload', $data) || !isset($data['created_at'])) {
        @unlink($file);
        return null;
    }

    $ttl = $ttl ?? (int)RESPONSE_CACHE_TTL_SECONDS;
    if ((time() - (int)$data['created_at']) > $ttl) {
        @unlink($file);
        return null;
    }

    return $data['payload'];
}

function responseCacheSet(string $key, $payload, ?int $ttl = null): void {
    $dir = getResponseCacheDir();
    if (!is_dir($dir) || !is_writable($dir)) {
        return;
    }

    $file = responseCacheKeyToFile($key);
    $ttl = $ttl ?? (int)RESPONSE_CACHE_TTL_SECONDS;
    $json = json_encode([
        'created_at' => time(),
        'ttl' => $ttl,
        'payload' => $payload,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($json === false) {
        return;
    }

    $tmp = $file . '.tmp.' . getmypid() . '.' . mt_rand(1000, 9999);
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        return;
    }
    if (!@rename($tmp, $file)) {
        @unlink($file);
        @rename($tmp, $file);
    }
    @unlink($tmp);
}

function responseCacheInvalidate(string $prefix = ''): void {
    $dir = getResponseCacheDir();
    if (!is_dir($dir)) {
        return;
    }

    $safePrefix = $prefix === '' ? '' : preg_replace('/[^a-zA-Z0-9._-]/', '_', $prefix);
    $pattern = $dir . DIRECTORY_SEPARATOR . ($safePrefix === '' ? '*.json' : $safePrefix . '*.json');
    foreach (glob($pattern) ?: [] as $file) {
        @unlink($file);
    }
}

function invalidateGuestTilesListCache(): void {
    responseCacheInvalidate('tiles_summary_guest');
}

function invalidateStylesCache(): void {
    responseCacheInvalidate('styles_public');
}

function responseCacheHitHeader(bool $hit): void {
    if (!headers_sent()) {
        header('X-LinkNest-Cache: ' . ($hit ? 'HIT' : 'MISS'));
    }
}

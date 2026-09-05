<?php
/**
 * URL Safety Intelligence — domain blocklist lookup + local heuristics.
 * Does not fetch the target URL; verdict works even when the host is unreachable.
 */

if (!defined('URL_SAFETY_CACHE_DIR')) {
    define('URL_SAFETY_CACHE_DIR', (defined('DB_DIR') ? DB_DIR : (__DIR__ . '/../data')) . DIRECTORY_SEPARATOR . 'cache' . DIRECTORY_SEPARATOR . 'url_safety');
}

if (!defined('URL_SAFETY_REFRESH_SECONDS')) {
    define('URL_SAFETY_REFRESH_SECONDS', 86400);
}

/** @return array<string, array{url: string, category: string, label: string}> */
function urlSafetyFeedDefinitions(): array {
    // Order matters: later malware REPLACE overwrites phishing on domain overlap.
    return [
        'phishing_army' => [
            'url' => 'https://phishing.army/download/phishing_army_blocklist.txt',
            'category' => 'phishing',
            'label' => 'Phishing Army',
        ],
        'hagezi_fake' => [
            'url' => 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/fake-onlydomains.txt',
            'category' => 'phishing',
            'label' => 'HaGeZi Fake / Scam',
        ],
        'phishing_database' => [
            'url' => 'https://cdn.jsdelivr.net/gh/mitchellkrogza/Phishing.Database@master/phishing-domains-ACTIVE.txt',
            'category' => 'phishing',
            'label' => 'Phishing.Database (ACTIVE)',
        ],
        'hagezi_tif_mini' => [
            'url' => 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/tif.mini-onlydomains.txt',
            'category' => 'malware',
            'label' => 'HaGeZi Threat Intelligence (Mini)',
        ],
        'urlhaus_domains' => [
            'url' => 'https://cdn.jsdelivr.net/gh/curbengh/urlhaus-filter@gh-pages/urlhaus-filter-domains-online.txt',
            'category' => 'malware',
            'label' => 'URLhaus (Abuse.ch)',
        ],
        'hagezi_nsfw' => [
            'url' => 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/nsfw-onlydomains.txt',
            'category' => 'adult',
            'label' => 'HaGeZi NSFW',
        ],
    ];
}

function urlSafetyCategorySeverity(string $category): int {
    switch (strtolower($category)) {
        case 'malware':
        case 'phishing':
            return 3;
        case 'adult':
            return 1;
        default:
            return 0;
    }
}

function ensureUrlSafetySchema($db): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS url_safety_domains (
            domain TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            source TEXT NOT NULL
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_url_safety_domains_category ON url_safety_domains(category)');
        $db->exec('CREATE TABLE IF NOT EXISTS url_safety_meta (
            source TEXT PRIMARY KEY,
            fetched_at INTEGER NOT NULL DEFAULT 0,
            etag TEXT,
            entry_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT
        )');
        $db->exec('CREATE TABLE IF NOT EXISTS url_safety_allowlist (
            domain TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        )');
        $ensured = true;
    } catch (Throwable $e) {
        error_log('ensureUrlSafetySchema: ' . $e->getMessage());
    }
}

function urlSafetyNormalizeDomain(string $host): string {
    $host = strtolower(trim($host));
    if ($host === '') {
        return '';
    }
    // Strip trailing dots and brackets from IPv6
    $host = rtrim($host, '.');
    if (strlen($host) >= 2 && $host[0] === '[' && substr($host, -1) === ']') {
        $host = substr($host, 1, -1);
    }
    // IDN → ASCII if available
    if (function_exists('idn_to_ascii') && preg_match('/[^\x20-\x7E]/', $host)) {
        $ascii = @idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);
        if (is_string($ascii) && $ascii !== '') {
            $host = strtolower($ascii);
        }
    }
    return $host;
}

/**
 * Extract host from a URL or bare host string.
 */
function urlSafetyExtractHost(string $urlOrHost): string {
    $raw = trim($urlOrHost);
    if ($raw === '') {
        return '';
    }
    if (!preg_match('#^[a-z][a-z0-9+.-]*://#i', $raw)) {
        // Bare host / domain-like
        if (preg_match('#^([^/?#]+)#', $raw, $m)) {
            $candidate = $m[1];
            if (strpos($candidate, '@') !== false) {
                $candidate = substr(strrchr($candidate, '@') ?: $candidate, 1) ?: $candidate;
            }
            if (strpos($candidate, ':') !== false && !preg_match('/^\[[^\]]+\]/', $candidate)) {
                // host:port (not IPv6)
                $parts = explode(':', $candidate, 2);
                $candidate = $parts[0];
            }
            return urlSafetyNormalizeDomain($candidate);
        }
        return '';
    }
    $parts = parse_url($raw);
    if (!is_array($parts) || empty($parts['host'])) {
        return '';
    }
    return urlSafetyNormalizeDomain((string)$parts['host']);
}

/**
 * Parent domain suffixes for lookup (most specific first).
 * @return list<string>
 */
function urlSafetyDomainSuffixes(string $host): array {
    $host = urlSafetyNormalizeDomain($host);
    if ($host === '') {
        return [];
    }
    // Skip suffix expansion for raw IPs
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return [$host];
    }
    $labels = array_values(array_filter(explode('.', $host), static fn($l) => $l !== ''));
    if (count($labels) < 2) {
        return [$host];
    }
    $out = [];
    for ($i = 0; $i < count($labels) - 1; $i++) {
        $out[] = implode('.', array_slice($labels, $i));
    }
    return $out;
}

function urlSafetyIsAllowlisted(PDO $db, string $host): bool {
    $suffixes = urlSafetyDomainSuffixes($host);
    if ($suffixes === []) {
        return false;
    }
    $placeholders = implode(',', array_fill(0, count($suffixes), '?'));
    $stmt = $db->prepare("SELECT 1 FROM url_safety_allowlist WHERE domain IN ($placeholders) LIMIT 1");
    $stmt->execute($suffixes);
    return (bool)$stmt->fetchColumn();
}

/**
 * @return array{domain: string, category: string, source: string}|null
 */
function urlSafetyLookupDomain(PDO $db, string $host): ?array {
    $suffixes = urlSafetyDomainSuffixes($host);
    if ($suffixes === []) {
        return null;
    }
    $placeholders = implode(',', array_fill(0, count($suffixes), '?'));
    $stmt = $db->prepare(
        "SELECT domain, category, source FROM url_safety_domains WHERE domain IN ($placeholders)"
    );
    $stmt->execute($suffixes);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) {
        return null;
    }
    // Prefer most specific match, then highest severity
    $best = null;
    $bestScore = -1;
    $suffixRank = array_flip($suffixes); // lower index = more specific
    foreach ($rows as $row) {
        $domain = (string)($row['domain'] ?? '');
        $category = (string)($row['category'] ?? '');
        $spec = isset($suffixRank[$domain]) ? (1000 - (int)$suffixRank[$domain]) : 0;
        $sev = urlSafetyCategorySeverity($category);
        $score = ($sev * 10000) + $spec;
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = [
                'domain' => $domain,
                'category' => $category,
                'source' => (string)($row['source'] ?? ''),
            ];
        }
    }
    return $best;
}

/**
 * Local anomaly heuristics (no network).
 * @return list<array{id: string, title: string, detail: string}>
 */
function urlSafetyHeuristics(string $url): array {
    $flags = [];
    $trimmed = trim($url);
    if ($trimmed === '') {
        return $flags;
    }

    $parts = parse_url($trimmed);
    if (!is_array($parts)) {
        // Try with scheme for parse_url
        $parts = parse_url('https://' . ltrim($trimmed, '/'));
    }
    if (!is_array($parts)) {
        return $flags;
    }

    $host = isset($parts['host']) ? urlSafetyNormalizeDomain((string)$parts['host']) : '';
    $user = isset($parts['user']) ? (string)$parts['user'] : '';
    $pass = isset($parts['pass']) ? (string)$parts['pass'] : '';
    $path = isset($parts['path']) ? (string)$parts['path'] : '';

    if ($user !== '' || $pass !== '') {
        $flags[] = [
            'id' => 'credentials_in_url',
            'title' => 'Credentials in URL',
            'detail' => 'The URL embeds a username or password (user:pass@host), which is often used in phishing.',
        ];
    }

    if ($host !== '') {
        if (str_starts_with($host, 'xn--') || str_contains($host, '.xn--')) {
            $flags[] = [
                'id' => 'punycode_host',
                'title' => 'Internationalized domain',
                'detail' => 'Host uses punycode (xn--…), which can disguise lookalike domains.',
            ];
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $flags[] = [
                'id' => 'ip_host',
                'title' => 'IP address host',
                'detail' => 'The URL points at a raw IP address instead of a domain name.',
            ];
        }
        $labels = array_values(array_filter(explode('.', $host), static fn($l) => $l !== ''));
        if (!filter_var($host, FILTER_VALIDATE_IP) && count($labels) >= 6) {
            $flags[] = [
                'id' => 'deep_subdomains',
                'title' => 'Unusual subdomain depth',
                'detail' => 'The host has ' . count($labels) . ' labels, which is uncommon for legitimate bookmarks.',
            ];
        }
    }

    if ($path !== '' && preg_match('/\.(exe|scr|apk|msi|bat|cmd|ps1|dll|jar)(?:$|[?#])/i', $path)) {
        $flags[] = [
            'id' => 'executable_path',
            'title' => 'Executable download path',
            'detail' => 'The path looks like a downloadable executable or installer.',
        ];
    }

    return $flags;
}

function urlSafetyEnabled(): bool {
    if (!function_exists('getSetting')) {
        return true;
    }
    return (string)getSetting('url_safety_enabled', '1') !== '0';
}

function urlSafetyCheckAdultEnabled(): bool {
    if (!function_exists('getSetting')) {
        return true;
    }
    return (string)getSetting('url_safety_check_adult', '1') !== '0';
}

function urlSafetyBlockMaliciousEnabled(): bool {
    if (!function_exists('getSetting')) {
        return false;
    }
    return (string)getSetting('url_safety_block_malicious', '0') === '1';
}

function urlSafetyEnsureCacheDir(): string {
    $dir = URL_SAFETY_CACHE_DIR;
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

/**
 * Download a feed into the cache directory.
 * @return array{ok: bool, path?: string, etag?: string, error?: string, bytes?: int}
 */
function urlSafetyDownloadFeed(string $sourceId, string $url, ?string $etag = null): array {
    $dir = urlSafetyEnsureCacheDir();
    $safeId = preg_replace('/[^a-z0-9_\-]/i', '_', $sourceId) ?: 'feed';
    $path = $dir . DIRECTORY_SEPARATOR . $safeId . '.txt';

    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'cURL extension required to download blocklists'];
    }

    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'error' => 'Failed to init cURL'];
    }
    $headers = [
        'Accept: text/plain,*/*',
        'User-Agent: LinkNest-UrlSafety/1.0',
    ];
    if ($etag) {
        $headers[] = 'If-None-Match: ' . $etag;
    }
    $responseHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_HTTPHEADER => $headers,
        // Match linkhealth / XAMPP: local CA store is often incomplete on Windows.
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_HEADERFUNCTION => static function ($curl, $headerLine) use (&$responseHeaders) {
            $len = strlen($headerLine);
            $parts = explode(':', $headerLine, 2);
            if (count($parts) === 2) {
                $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return $len;
        },
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        return ['ok' => false, 'error' => $err !== '' ? $err : 'Download failed'];
    }
    if ($code === 304 && is_file($path)) {
        return [
            'ok' => true,
            'path' => $path,
            'etag' => $etag ?? ($responseHeaders['etag'] ?? null),
            'bytes' => (int)filesize($path),
            'not_modified' => true,
        ];
    }
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'error' => "HTTP $code downloading feed"];
    }
    if (!is_string($body) || strlen($body) < 32) {
        return ['ok' => false, 'error' => 'Feed body too small or empty'];
    }
    if (@file_put_contents($path, $body) === false) {
        return ['ok' => false, 'error' => 'Failed to write cache file'];
    }
    return [
        'ok' => true,
        'path' => $path,
        'etag' => $responseHeaders['etag'] ?? null,
        'bytes' => strlen($body),
    ];
}

/**
 * Parse a domain list file into normalized domains.
 * Supports plain domains, hosts (0.0.0.0 host), and Adblock ||domain^ lines.
 * @return list<string>
 */
function urlSafetyParseDomainListFile(string $path): array {
    $fh = @fopen($path, 'rb');
    if ($fh === false) {
        return [];
    }
    $domains = [];
    while (($line = fgets($fh)) !== false) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || $line[0] === '!' || str_starts_with($line, '//')) {
            continue;
        }
        // hosts format: 0.0.0.0 domain or 127.0.0.1 domain
        if (preg_match('/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/i', $line, $m)) {
            $line = $m[1];
        }
        // Full URL lines (e.g. OpenPhish-style feeds)
        if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $line)) {
            $host = parse_url($line, PHP_URL_HOST);
            if (!is_string($host) || $host === '') {
                continue;
            }
            $line = $host;
        }
        // Adblock: ||domain^ or ||domain^$...
        if (str_starts_with($line, '||')) {
            $line = substr($line, 2);
            $line = preg_replace('/[\^\$].*$/', '', $line) ?? $line;
        }
        // Strip trailing path if someone included one
        if (($slash = strpos($line, '/')) !== false) {
            $line = substr($line, 0, $slash);
        }
        $line = strtolower(trim($line));
        $line = ltrim($line, '*.');
        $line = rtrim($line, '.');
        if ($line === '' || str_contains($line, ' ') || str_contains($line, '*')) {
            continue;
        }
        if (!preg_match('/^[a-z0-9._\-\[\]]+$/i', $line)) {
            continue;
        }
        // Need at least one dot for domains (allow IPs)
        if (!str_contains($line, '.') && !filter_var($line, FILTER_VALIDATE_IP)) {
            continue;
        }
        $domains[$line] = true;
    }
    fclose($fh);
    return array_keys($domains);
}

/**
 * Run a DB callback with retries when SQLite reports "database is locked".
 * @template T
 * @param callable(): T $fn
 * @return T
 */
function urlSafetyDbRetry(callable $fn, int $maxAttempts = 8) {
    $attempt = 0;
    $last = null;
    while ($attempt < $maxAttempts) {
        $attempt++;
        try {
            return $fn();
        } catch (Throwable $e) {
            $last = $e;
            $msg = strtolower($e->getMessage());
            $locked = str_contains($msg, 'database is locked')
                || str_contains($msg, 'database table is locked')
                || str_contains($msg, 'busy');
            if (!$locked || $attempt >= $maxAttempts) {
                throw $e;
            }
            usleep(50000 * $attempt); // 50ms, 100ms, …
        }
    }
    throw $last ?? new RuntimeException('urlSafetyDbRetry failed');
}

/**
 * Prefer a longer busy wait during bulk imports (Apache/XAMPP concurrency).
 */
function urlSafetyPrepareBulkWrite(PDO $db): void {
    try {
        $db->exec('PRAGMA busy_timeout = 120000');
    } catch (Throwable $e) {
        // ignore
    }
}

/**
 * Import domains for one source. Replaces that source's rows in short batches
 * so WAL writers do not hold the main app DB locked for minutes.
 * @return array{ok: bool, entry_count: int, error?: string}
 */
function urlSafetyImportSource(PDO $db, string $sourceId, string $category, string $path): array {
    $domains = urlSafetyParseDomainListFile($path);
    if ($domains === []) {
        return ['ok' => false, 'entry_count' => 0, 'error' => 'No domains parsed from feed'];
    }

    if ($category === 'adult' && !urlSafetyCheckAdultEnabled()) {
        return ['ok' => true, 'entry_count' => 0];
    }

    urlSafetyPrepareBulkWrite($db);

    // Manual allowlist entries must never be overwritten by feed imports
    $manual = [];
    try {
        $rows = $db->query("SELECT domain FROM url_safety_domains WHERE source = 'manual'")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($rows ?: [] as $d) {
            $manual[strtolower((string)$d)] = true;
        }
    } catch (Throwable $e) {
        $manual = [];
    }

    try {
        // Drop previous rows for this feed in one short transaction
        urlSafetyDbRetry(static function () use ($db, $sourceId) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $db->beginTransaction();
            $db->prepare('DELETE FROM url_safety_domains WHERE source = ?')->execute([$sourceId]);
            $db->commit();
        });
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            try {
                $db->rollBack();
            } catch (Throwable $ignore) {
            }
        }
        return ['ok' => false, 'entry_count' => 0, 'error' => 'Delete failed: ' . $e->getMessage()];
    }

    // malware/phishing: REPLACE so we own the domain row
    // adult: IGNORE so we never overwrite malware/phishing from another feed
    $isAdult = ($category === 'adult');
    $sql = $isAdult
        ? 'INSERT OR IGNORE INTO url_safety_domains (domain, category, source) VALUES (?, ?, ?)'
        : 'INSERT OR REPLACE INTO url_safety_domains (domain, category, source) VALUES (?, ?, ?)';

    $batchSize = 2000;
    $count = 0;
    $batch = [];

    $flush = static function (array $chunk) use ($db, $sql, $category, $sourceId): int {
        if ($chunk === []) {
            return 0;
        }
        return (int)urlSafetyDbRetry(static function () use ($db, $sql, $chunk, $category, $sourceId) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $db->beginTransaction();
            $ins = $db->prepare($sql);
            $n = 0;
            foreach ($chunk as $domain) {
                $ins->execute([$domain, $category, $sourceId]);
                $n++;
            }
            $db->commit();
            return $n;
        });
    };

    try {
        foreach ($domains as $domain) {
            $domain = strtolower((string)$domain);
            if ($domain === '' || isset($manual[$domain])) {
                continue;
            }
            $batch[] = $domain;
            if (count($batch) >= $batchSize) {
                $count += $flush($batch);
                $batch = [];
            }
        }
        $count += $flush($batch);
        return ['ok' => true, 'entry_count' => $count];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            try {
                $db->rollBack();
            } catch (Throwable $ignore) {
            }
        }
        return ['ok' => false, 'entry_count' => $count, 'error' => $e->getMessage()];
    }
}

function urlSafetyUpdateMeta(PDO $db, string $sourceId, int $fetchedAt, ?string $etag, int $entryCount, ?string $error = null): void {
    urlSafetyDbRetry(static function () use ($db, $sourceId, $fetchedAt, $etag, $entryCount, $error) {
        $stmt = $db->prepare(
            'INSERT INTO url_safety_meta (source, fetched_at, etag, entry_count, last_error)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(source) DO UPDATE SET
               fetched_at = excluded.fetched_at,
               etag = excluded.etag,
               entry_count = excluded.entry_count,
               last_error = excluded.last_error'
        );
        $stmt->execute([$sourceId, $fetchedAt, $etag, $entryCount, $error]);
    });
}

/**
 * @return array{refreshed: bool, sources: array<string, mixed>, lists_ready: bool, error?: string}
 */
function urlSafetyRefreshLists(PDO $db, bool $force = false): array {
    ensureUrlSafetySchema($db);
    urlSafetyPrepareBulkWrite($db);
    $feeds = urlSafetyFeedDefinitions();
    $now = time();
    $results = [];
    $anyOk = false;

    // Serialize refreshes across Apache workers (file lock)
    $lockDir = urlSafetyEnsureCacheDir();
    $lockPath = $lockDir . DIRECTORY_SEPARATOR . 'refresh.lock';
    $lockFh = @fopen($lockPath, 'c+');
    if ($lockFh !== false) {
        $gotLock = @flock($lockFh, LOCK_EX | LOCK_NB);
        if (!$gotLock) {
            // Another refresh is running — wait briefly, then fail soft
            $gotLock = @flock($lockFh, LOCK_EX);
            if (!$gotLock) {
                fclose($lockFh);
                return [
                    'refreshed' => false,
                    'sources' => [],
                    'lists_ready' => urlSafetyListsReady($db),
                    'error' => 'Another URL Safety refresh is already in progress. Try again in a minute.',
                ];
            }
        }
        fwrite($lockFh, (string)getmypid() . ' ' . date('c'));
        fflush($lockFh);
    }

    try {
        foreach ($feeds as $sourceId => $feed) {
            if (($feed['category'] ?? '') === 'adult' && !urlSafetyCheckAdultEnabled()) {
                $results[$sourceId] = ['skipped' => true, 'reason' => 'adult_disabled'];
                try {
                    urlSafetyDbRetry(static function () use ($db, $sourceId) {
                        $db->prepare('DELETE FROM url_safety_domains WHERE source = ?')->execute([$sourceId]);
                    });
                } catch (Throwable $e) {
                    // non-fatal
                }
                continue;
            }

            $meta = null;
            try {
                $metaStmt = $db->prepare('SELECT fetched_at, etag, entry_count FROM url_safety_meta WHERE source = ?');
                $metaStmt->execute([$sourceId]);
                $meta = $metaStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            } catch (Throwable $e) {
                $meta = null;
            }
            $fetchedAt = $meta ? (int)$meta['fetched_at'] : 0;
            $etag = $meta['etag'] ?? null;

            if (!$force && $fetchedAt > 0 && ($now - $fetchedAt) < URL_SAFETY_REFRESH_SECONDS) {
                $results[$sourceId] = [
                    'skipped' => true,
                    'reason' => 'fresh',
                    'fetched_at' => $fetchedAt,
                    'entry_count' => (int)($meta['entry_count'] ?? 0),
                ];
                $anyOk = $anyOk || ((int)($meta['entry_count'] ?? 0) > 0);
                continue;
            }

            // Download outside of any DB transaction
            $dl = urlSafetyDownloadFeed($sourceId, $feed['url'], is_string($etag) ? $etag : null);
            if (empty($dl['ok'])) {
                try {
                    urlSafetyUpdateMeta($db, $sourceId, $fetchedAt, is_string($etag) ? $etag : null, (int)($meta['entry_count'] ?? 0), $dl['error'] ?? 'download failed');
                } catch (Throwable $e) {
                    // ignore meta write failure
                }
                $results[$sourceId] = ['ok' => false, 'error' => $dl['error'] ?? 'download failed'];
                continue;
            }

            $path = (string)$dl['path'];
            if (!empty($dl['not_modified'])) {
                try {
                    urlSafetyUpdateMeta($db, $sourceId, $now, $dl['etag'] ?? $etag, (int)($meta['entry_count'] ?? 0), null);
                } catch (Throwable $e) {
                }
                $results[$sourceId] = [
                    'ok' => true,
                    'not_modified' => true,
                    'entry_count' => (int)($meta['entry_count'] ?? 0),
                ];
                $anyOk = true;
                continue;
            }

            $imp = urlSafetyImportSource($db, $sourceId, $feed['category'], $path);
            if (empty($imp['ok'])) {
                try {
                    urlSafetyUpdateMeta($db, $sourceId, $fetchedAt, $dl['etag'] ?? $etag, (int)($meta['entry_count'] ?? 0), $imp['error'] ?? 'import failed');
                } catch (Throwable $e) {
                }
                $results[$sourceId] = ['ok' => false, 'error' => $imp['error'] ?? 'import failed'];
                continue;
            }
            try {
                urlSafetyUpdateMeta($db, $sourceId, $now, $dl['etag'] ?? null, (int)$imp['entry_count'], null);
            } catch (Throwable $e) {
                // Import succeeded; meta update can retry next status load
            }
            $results[$sourceId] = [
                'ok' => true,
                'entry_count' => (int)$imp['entry_count'],
                'label' => $feed['label'],
            ];
            $anyOk = true;
        }

        return [
            'refreshed' => true,
            'sources' => $results,
            'lists_ready' => $anyOk || urlSafetyListsReady($db),
        ];
    } finally {
        if ($lockFh !== false) {
            @flock($lockFh, LOCK_UN);
            @fclose($lockFh);
        }
    }
}

function urlSafetyListsReady(PDO $db): bool {
    try {
        $n = (int)$db->query('SELECT COUNT(*) FROM url_safety_domains')->fetchColumn();
        return $n > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function urlSafetyListsStale(PDO $db): bool {
    try {
        $stmt = $db->query('SELECT MIN(fetched_at) FROM url_safety_meta WHERE entry_count > 0');
        $min = $stmt ? $stmt->fetchColumn() : false;
        if ($min === false || $min === null) {
            return true;
        }
        return (time() - (int)$min) >= URL_SAFETY_REFRESH_SECONDS;
    } catch (Throwable $e) {
        return true;
    }
}

/**
 * Ensure lists exist; attempt a short refresh if empty/stale.
 * @return array{lists_ready: bool, lists_pending: bool, refreshed: bool}
 */
function urlSafetyEnsureLists(PDO $db, bool $allowDownload = true): array {
    ensureUrlSafetySchema($db);
    $ready = urlSafetyListsReady($db);
    if ($ready && !urlSafetyListsStale($db)) {
        return ['lists_ready' => true, 'lists_pending' => false, 'refreshed' => false];
    }
    if (!$allowDownload) {
        return ['lists_ready' => $ready, 'lists_pending' => !$ready, 'refreshed' => false];
    }
    // Cap time for interactive check path
    @set_time_limit(90);
    $result = urlSafetyRefreshLists($db, !$ready);
    return [
        'lists_ready' => !empty($result['lists_ready']),
        'lists_pending' => empty($result['lists_ready']),
        'refreshed' => true,
    ];
}

/**
 * Full safety check for a URL.
 * @return array<string, mixed>
 */
function urlSafetyCheckUrl(string $url, bool $allowDownload = true): array {
    $url = trim($url);
    $db = getDB();
    ensureUrlSafetySchema($db);

    $heuristics = urlSafetyHeuristics($url);
    $host = urlSafetyExtractHost($url);

    if (!urlSafetyEnabled()) {
        return [
            'ok' => true,
            'enabled' => false,
            'url' => $url,
            'host' => $host,
            'verdict' => 'disabled',
            'flags' => [],
            'heuristics' => $heuristics,
            'lists_ready' => false,
            'lists_pending' => false,
            'matched' => null,
        ];
    }

    $listState = urlSafetyEnsureLists($db, $allowDownload);
    $matched = null;
    $flags = [];

    if ($host !== '' && urlSafetyIsAllowlisted($db, $host)) {
        return [
            'ok' => true,
            'enabled' => true,
            'url' => $url,
            'host' => $host,
            'verdict' => 'safe',
            'flags' => [],
            'heuristics' => [],
            'lists_ready' => $listState['lists_ready'],
            'lists_pending' => $listState['lists_pending'],
            'matched' => null,
            'allowlisted' => true,
        ];
    }

    if ($host !== '' && $listState['lists_ready']) {
        $matched = urlSafetyLookupDomain($db, $host);
        if ($matched) {
            $cat = strtolower($matched['category']);
            if ($cat === 'adult' && !urlSafetyCheckAdultEnabled()) {
                $matched = null;
            } else {
                $feeds = urlSafetyFeedDefinitions();
                $sourceLabel = $feeds[$matched['source']]['label'] ?? $matched['source'];
                $flags[] = [
                    'id' => 'list_' . $cat,
                    'category' => $cat,
                    'title' => $cat === 'adult' ? 'Adult content list' : ($cat === 'phishing' ? 'Phishing list' : 'Malware / threat list'),
                    'detail' => 'Matched domain "' . $matched['domain'] . '" via ' . $sourceLabel . '.',
                    'source' => $matched['source'],
                    'sourceLabel' => $sourceLabel,
                    'matchedDomain' => $matched['domain'],
                ];
            }
        }
    }

    foreach ($heuristics as $h) {
        $flags[] = array_merge($h, ['category' => 'suspicious']);
    }

    $verdict = 'safe';
    $hasMalicious = false;
    $hasAdult = false;
    $hasSuspicious = false;
    foreach ($flags as $f) {
        $c = strtolower((string)($f['category'] ?? ''));
        if ($c === 'malware' || $c === 'phishing') {
            $hasMalicious = true;
        } elseif ($c === 'adult') {
            $hasAdult = true;
        } elseif ($c === 'suspicious') {
            $hasSuspicious = true;
        }
    }
    if ($hasMalicious) {
        $verdict = 'malicious';
    } elseif ($hasAdult) {
        $verdict = 'adult';
    } elseif ($hasSuspicious) {
        $verdict = 'suspicious';
    } elseif (!$listState['lists_ready']) {
        $verdict = $hasSuspicious ? 'suspicious' : 'unknown';
    }

    return [
        'ok' => true,
        'enabled' => true,
        'url' => $url,
        'host' => $host,
        'verdict' => $verdict,
        'flags' => $flags,
        'heuristics' => $heuristics,
        'lists_ready' => $listState['lists_ready'],
        'lists_pending' => $listState['lists_pending'],
        'matched' => $matched,
        'requiresConfirm' => $hasMalicious,
        'blockMalicious' => $hasMalicious && urlSafetyBlockMaliciousEnabled(),
    ];
}

/**
 * @return array<string, mixed>
 */
function urlSafetyStatus(PDO $db): array {
    ensureUrlSafetySchema($db);
    $feeds = urlSafetyFeedDefinitions();
    $sources = [];
    $total = 0;
    try {
        $total = (int)$db->query('SELECT COUNT(*) FROM url_safety_domains')->fetchColumn();
    } catch (Throwable $e) {
        $total = 0;
    }
    $byCat = ['malware' => 0, 'phishing' => 0, 'adult' => 0];
    try {
        $rows = $db->query('SELECT category, COUNT(*) AS c FROM url_safety_domains GROUP BY category')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $cat = strtolower((string)$row['category']);
            $byCat[$cat] = (int)$row['c'];
        }
    } catch (Throwable $e) {
        // ignore
    }

    foreach ($feeds as $id => $feed) {
        $stmt = $db->prepare('SELECT fetched_at, etag, entry_count, last_error FROM url_safety_meta WHERE source = ?');
        $stmt->execute([$id]);
        $meta = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        $sources[$id] = [
            'id' => $id,
            'label' => $feed['label'],
            'category' => $feed['category'],
            'url' => $feed['url'],
            'fetched_at' => $meta ? (int)$meta['fetched_at'] : 0,
            'entry_count' => $meta ? (int)$meta['entry_count'] : 0,
            'last_error' => $meta['last_error'] ?? null,
        ];
    }

    $allowCount = 0;
    try {
        $allowCount = (int)$db->query('SELECT COUNT(*) FROM url_safety_allowlist')->fetchColumn();
    } catch (Throwable $e) {
        $allowCount = 0;
    }

    $bySource = [];
    try {
        $rows = $db->query('SELECT source, COUNT(*) AS c FROM url_safety_domains GROUP BY source ORDER BY c DESC')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $bySource[] = [
                'source' => (string)$row['source'],
                'count' => (int)$row['c'],
            ];
        }
    } catch (Throwable $e) {
        $bySource = [];
    }

    $manualCount = 0;
    try {
        $stmt = $db->prepare('SELECT COUNT(*) FROM url_safety_domains WHERE source = ?');
        $stmt->execute(['manual']);
        $manualCount = (int)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $manualCount = 0;
    }

    $dbPath = defined('DB_PATH') ? DB_PATH : '';
    $cacheDir = defined('URL_SAFETY_CACHE_DIR') ? URL_SAFETY_CACHE_DIR : '';

    return [
        'ok' => true,
        'enabled' => urlSafetyEnabled(),
        'check_adult' => urlSafetyCheckAdultEnabled(),
        'block_malicious' => urlSafetyBlockMaliciousEnabled(),
        'lists_ready' => urlSafetyListsReady($db),
        'total_domains' => $total,
        'by_category' => $byCat,
        'by_source' => $bySource,
        'manual_count' => $manualCount,
        'sources' => array_values($sources),
        'allowlist_count' => $allowCount,
        'tables' => [
            [
                'name' => 'url_safety_domains',
                'purpose' => 'Blocked / flagged domains (malware, phishing, adult, manual)',
                'columns' => ['domain (PK)', 'category', 'source'],
                'row_count' => $total,
            ],
            [
                'name' => 'url_safety_meta',
                'purpose' => 'Feed download metadata (etag, last fetch, errors)',
                'columns' => ['source (PK)', 'fetched_at', 'etag', 'entry_count', 'last_error'],
                'row_count' => count($feeds) + ($manualCount > 0 ? 1 : 0),
            ],
            [
                'name' => 'url_safety_allowlist',
                'purpose' => 'Domains that should never be flagged',
                'columns' => ['domain (PK)', 'created_at'],
                'row_count' => $allowCount,
            ],
        ],
        'storage' => [
            'database' => $dbPath,
            'cache_dir' => $cacheDir,
            'refresh_seconds' => defined('URL_SAFETY_REFRESH_SECONDS') ? (int)URL_SAFETY_REFRESH_SECONDS : 86400,
        ],
        'attribution' => [
            'HaGeZi DNS Blocklists (GPL-3.0) — https://github.com/hagezi/dns-blocklists',
            'URLhaus / urlhaus-filter (Abuse.ch) — https://urlhaus.abuse.ch/ / https://github.com/curbengh/urlhaus-filter',
            'Phishing Army (CC BY-NC 4.0) — https://phishing.army/',
            'Phishing.Database — https://github.com/mitchellkrogza/Phishing.Database',
        ],
    ];
}

/**
 * Paginated browse of url_safety_domains.
 * @return array{ok: bool, total: int, page: int, page_size: int, rows: list<array{domain: string, category: string, source: string}>}
 */
function urlSafetyListDomains(
    PDO $db,
    string $q = '',
    string $category = '',
    string $source = '',
    int $page = 1,
    int $pageSize = 50
): array {
    ensureUrlSafetySchema($db);
    $page = max(1, $page);
    $pageSize = max(1, min(200, $pageSize));
    $offset = ($page - 1) * $pageSize;

    $where = [];
    $params = [];
    $q = trim($q);
    if ($q !== '') {
        $where[] = 'domain LIKE ?';
        $params[] = '%' . strtolower($q) . '%';
    }
    $category = strtolower(trim($category));
    if ($category !== '' && in_array($category, ['malware', 'phishing', 'adult'], true)) {
        $where[] = 'category = ?';
        $params[] = $category;
    }
    $source = trim($source);
    if ($source !== '') {
        $where[] = 'source = ?';
        $params[] = $source;
    }
    $sqlWhere = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $countStmt = $db->prepare("SELECT COUNT(*) FROM url_safety_domains $sqlWhere");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $stmt = $db->prepare(
        "SELECT domain, category, source FROM url_safety_domains $sqlWhere
         ORDER BY domain COLLATE NOCASE
         LIMIT ? OFFSET ?"
    );
    $bind = $params;
    $bind[] = $pageSize;
    $bind[] = $offset;
    $stmt->execute($bind);
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = [
            'domain' => (string)$row['domain'],
            'category' => (string)$row['category'],
            'source' => (string)$row['source'],
        ];
    }

    return [
        'ok' => true,
        'total' => $total,
        'page' => $page,
        'page_size' => $pageSize,
        'rows' => $rows,
    ];
}

/**
 * Add manual domains to the blocklist (source=manual). Survives feed refresh.
 * @param list<string> $domains
 * @return array{ok: bool, added: list<string>, skipped: list<string>, count: int}
 */
function urlSafetyAddManualDomains(PDO $db, array $domains, string $category = 'malware'): array {
    ensureUrlSafetySchema($db);
    $category = strtolower(trim($category));
    if (!in_array($category, ['malware', 'phishing', 'adult'], true)) {
        $category = 'malware';
    }

    $added = [];
    $skipped = [];
    $ins = $db->prepare('INSERT OR REPLACE INTO url_safety_domains (domain, category, source) VALUES (?, ?, ?)');
    foreach ($domains as $d) {
        if (!is_string($d)) {
            continue;
        }
        // Accept bare host or full URL
        $host = urlSafetyExtractHost($d);
        if ($host === '') {
            $host = urlSafetyNormalizeDomain($d);
        }
        if ($host === '') {
            $skipped[] = (string)$d;
            continue;
        }
        if (!str_contains($host, '.') && !filter_var($host, FILTER_VALIDATE_IP)) {
            $skipped[] = $host;
            continue;
        }
        $ins->execute([$host, $category, 'manual']);
        $added[$host] = true;
        if (count($added) >= 500) {
            break;
        }
    }

    $addedList = array_keys($added);
    // Track manual count in meta for admin visibility
    try {
        $stmt = $db->prepare('SELECT COUNT(*) FROM url_safety_domains WHERE source = ?');
        $stmt->execute(['manual']);
        $manualCount = (int)$stmt->fetchColumn();
        urlSafetyUpdateMeta($db, 'manual', time(), null, $manualCount, null);
    } catch (Throwable $e) {
        // non-fatal
    }

    return [
        'ok' => true,
        'added' => $addedList,
        'skipped' => $skipped,
        'count' => count($addedList),
    ];
}

/**
 * Delete domains from the blocklist. By default only removes source=manual;
 * pass $anySource=true to remove any matching row.
 * @param list<string> $domains
 * @return array{ok: bool, deleted: int}
 */
function urlSafetyDeleteDomains(PDO $db, array $domains, bool $anySource = false): array {
    ensureUrlSafetySchema($db);
    $deleted = 0;
    if ($anySource) {
        $stmt = $db->prepare('DELETE FROM url_safety_domains WHERE domain = ?');
    } else {
        $stmt = $db->prepare('DELETE FROM url_safety_domains WHERE domain = ? AND source = ?');
    }
    foreach ($domains as $d) {
        if (!is_string($d)) {
            continue;
        }
        $host = urlSafetyExtractHost($d);
        if ($host === '') {
            $host = urlSafetyNormalizeDomain($d);
        }
        if ($host === '') {
            continue;
        }
        if ($anySource) {
            $stmt->execute([$host]);
        } else {
            $stmt->execute([$host, 'manual']);
        }
        $deleted += $stmt->rowCount();
    }

    try {
        $cstmt = $db->prepare('SELECT COUNT(*) FROM url_safety_domains WHERE source = ?');
        $cstmt->execute(['manual']);
        $manualCount = (int)$cstmt->fetchColumn();
        urlSafetyUpdateMeta($db, 'manual', time(), null, $manualCount, null);
    } catch (Throwable $e) {
        // non-fatal
    }

    return ['ok' => true, 'deleted' => $deleted];
}

/**
 * @return list<string>
 */
function urlSafetyGetAllowlist(PDO $db): array {
    ensureUrlSafetySchema($db);
    $rows = $db->query('SELECT domain FROM url_safety_allowlist ORDER BY domain COLLATE NOCASE')->fetchAll(PDO::FETCH_COLUMN);
    return array_map('strval', $rows ?: []);
}

function urlSafetySetAllowlist(PDO $db, array $domains): array {
    ensureUrlSafetySchema($db);
    $clean = [];
    foreach ($domains as $d) {
        if (!is_string($d)) {
            continue;
        }
        $n = urlSafetyNormalizeDomain($d);
        if ($n === '' || !str_contains($n, '.')) {
            // allow IPs too
            if (!filter_var($n, FILTER_VALIDATE_IP)) {
                continue;
            }
        }
        $clean[$n] = true;
        if (count($clean) >= 2000) {
            break;
        }
    }
    $db->beginTransaction();
    try {
        $db->exec('DELETE FROM url_safety_allowlist');
        $ins = $db->prepare('INSERT INTO url_safety_allowlist (domain, created_at) VALUES (?, ?)');
        $now = time();
        foreach (array_keys($clean) as $domain) {
            $ins->execute([$domain, $now]);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    return array_keys($clean);
}

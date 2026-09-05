<?php
/**
 * URL Safety Intelligence API
 *
 * POST /url-safety/check   — check a URL (guests allowed, rate-limited)
 * GET  /url-safety/status  — admin: list status + table info
 * POST /url-safety/refresh — admin: force re-download feeds
 * GET  /url-safety/domains — admin: browse/search blocklist table
 * POST /url-safety/domains — admin: add manual domains
 * DELETE /url-safety/domains — admin: remove domains
 * GET/POST /url-safety/allowlist — admin: get/set allowlist
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/url_safety_lib.php';

$pathInfo = $_SERVER['PATH_INFO'] ?? '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($pathInfo === '' || $pathInfo === false) {
    $pathInfo = '/';
}
if ($pathInfo[0] !== '/') {
    $pathInfo = '/' . $pathInfo;
}

function enforceUrlSafetyCheckRateLimit(int $maxPerMinute = 100): bool {
    $key = 'url_safety_check_ts';
    $now = time();
    if (!isset($_SESSION[$key]) || !is_array($_SESSION[$key])) {
        $_SESSION[$key] = [];
    }
    $_SESSION[$key] = array_values(array_filter($_SESSION[$key], static function ($t) use ($now) {
        return ($now - (int)$t) < 60;
    }));
    if (count($_SESSION[$key]) >= $maxPerMinute) {
        sendJSON(['error' => 'Too many safety checks. Please wait a minute and try again.'], 429);
        return false;
    }
    $_SESSION[$key][] = $now;
    return true;
}

function releaseUrlSafetySessionLock(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

try {
    if ($pathInfo === '/check' && $method === 'POST') {
        if (!enforceUrlSafetyCheckRateLimit(100)) {
            return;
        }
        releaseUrlSafetySessionLock();
        $data = getJSONInput();
        $url = isset($data['url']) ? trim((string)$data['url']) : '';
        if ($url === '') {
            sendJSON(['error' => 'URL is required'], 400);
            return;
        }
        if (strlen($url) > 4000) {
            sendJSON(['error' => 'URL is too long'], 400);
            return;
        }
        $result = urlSafetyCheckUrl($url, true);
        sendJSON($result);
        return;
    }

    if ($pathInfo === '/status' && $method === 'GET') {
        requireAdmin();
        releaseUrlSafetySessionLock();
        $db = getDB();
        sendJSON(urlSafetyStatus($db));
        return;
    }

    if ($pathInfo === '/refresh' && $method === 'POST') {
        requireAdmin();
        releaseUrlSafetySessionLock();
        @set_time_limit(300);
        ignore_user_abort(true);
        $db = getDB();
        try {
            $db->exec('PRAGMA busy_timeout = 120000');
        } catch (Throwable $e) {
        }
        $result = urlSafetyRefreshLists($db, true);
        // Brief pause so WAL can settle before status read (avoids locked on Windows)
        usleep(100000);
        try {
            $status = urlSafetyStatus($db);
        } catch (Throwable $e) {
            sendJSON([
                'ok' => !empty($result['lists_ready']),
                'refresh' => $result,
                'error' => null,
                'warning' => 'Refresh finished but status read hit a lock; reload the page. ' . $e->getMessage(),
                'lists_ready' => !empty($result['lists_ready']),
                'total_domains' => 0,
                'by_category' => [],
                'sources' => [],
                'allowlist_count' => 0,
                'attribution' => [],
            ]);
            return;
        }
        sendJSON(array_merge($status, ['refresh' => $result]));
        return;
    }

    if ($pathInfo === '/domains' && $method === 'GET') {
        requireAdmin();
        releaseUrlSafetySessionLock();
        $db = getDB();
        $q = isset($_GET['q']) ? (string)$_GET['q'] : '';
        $category = isset($_GET['category']) ? (string)$_GET['category'] : '';
        $source = isset($_GET['source']) ? (string)$_GET['source'] : '';
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $pageSize = isset($_GET['page_size']) ? (int)$_GET['page_size'] : 50;
        sendJSON(urlSafetyListDomains($db, $q, $category, $source, $page, $pageSize));
        return;
    }

    if ($pathInfo === '/domains' && $method === 'POST') {
        requireAdmin();
        $data = getJSONInput();
        $domains = [];
        if (isset($data['domains']) && is_array($data['domains'])) {
            $domains = $data['domains'];
        } elseif (isset($data['domain']) && is_string($data['domain'])) {
            $domains = [$data['domain']];
        } elseif (isset($data['text']) && is_string($data['text'])) {
            $domains = preg_split('/[\r\n,]+/', $data['text']) ?: [];
        }
        if ($domains === []) {
            sendJSON(['error' => 'Provide domain, domains[], or text with one host per line'], 400);
            return;
        }
        $category = isset($data['category']) ? (string)$data['category'] : 'malware';
        $db = getDB();
        $result = urlSafetyAddManualDomains($db, $domains, $category);
        $result['status'] = urlSafetyStatus($db);
        sendJSON($result);
        return;
    }

    if ($pathInfo === '/domains' && $method === 'DELETE') {
        requireAdmin();
        $data = getJSONInput();
        $domains = [];
        if (isset($data['domains']) && is_array($data['domains'])) {
            $domains = $data['domains'];
        } elseif (isset($data['domain']) && is_string($data['domain'])) {
            $domains = [$data['domain']];
        }
        if ($domains === []) {
            sendJSON(['error' => 'Provide domain or domains[] to delete'], 400);
            return;
        }
        $anySource = !empty($data['any_source']);
        $db = getDB();
        $result = urlSafetyDeleteDomains($db, $domains, $anySource);
        $result['status'] = urlSafetyStatus($db);
        sendJSON($result);
        return;
    }

    if ($pathInfo === '/allowlist' && $method === 'GET') {
        requireAdmin();
        releaseUrlSafetySessionLock();
        $db = getDB();
        sendJSON(['ok' => true, 'allowlist' => urlSafetyGetAllowlist($db)]);
        return;
    }

    if ($pathInfo === '/allowlist' && $method === 'POST') {
        requireAdmin();
        $data = getJSONInput();
        $list = isset($data['allowlist']) && is_array($data['allowlist']) ? $data['allowlist'] : null;
        if ($list === null) {
            sendJSON(['error' => 'allowlist must be an array of domains'], 400);
            return;
        }
        $db = getDB();
        $saved = urlSafetySetAllowlist($db, $list);
        sendJSON(['ok' => true, 'allowlist' => $saved]);
        return;
    }

    sendJSON(['error' => 'Not found'], 404);
} catch (Throwable $e) {
    error_log('url_safety.php: ' . $e->getMessage());
    sendJSON(['error' => 'URL safety request failed: ' . $e->getMessage()], 500);
}

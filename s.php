<?php
/**
 * Short URL resolver: /s/{code}
 * Recycled codes never reveal the destination.
 */
require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/short_urls_lib.php';
require_once __DIR__ . '/api/access_restrictions_lib.php';

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$code = trim((string)($_GET['code'] ?? ''));
if ($code === '' && isset($_SERVER['PATH_INFO'])) {
    $code = trim((string)$_SERVER['PATH_INFO'], '/');
}
if (!preg_match('/^[A-Za-z0-9]{4,32}$/', $code)) {
    short_url_error_page(404, 'This short link was not found.', 'Not found');
}

try {
    $db = getDB();
} catch (Throwable $e) {
    short_url_error_page(500, 'This short link could not be opened right now.', 'Unavailable');
}

$row = lookupShortUrlByCode($db, $code);
if (!$row) {
    short_url_error_page(404, 'This short link was not found.', 'Not found');
}

$appName = function_exists('getAppName') ? (getAppName() ?: 'LinkNest') : 'LinkNest';
$homeUrl = rtrim(linknestPublicBaseUrl(), '/') . '/';

if (!empty($row['revoked'])) {
    short_url_error_page(
        410,
        'This short link was recycled. Open ' . $appName . ' to get the current one.',
        'Recycled',
        $homeUrl
    );
}

$ctx = resolveShortUrlTargetContext($db, $row);
if (!$ctx) {
    short_url_error_page(404, 'This short link is no longer available.', 'Not found');
}

$user = getAuthenticatedUser();
if (shortUrlContextNeedsAuth($user, $ctx) && !$user) {
    $next = rtrim(linknestPublicBaseUrl(), '/') . '/s/' . rawurlencode($code);
    $loginUrl = rtrim(linknestPublicBaseUrl(), '/') . '/?ln_login=1&ln_next=' . rawurlencode($next);
    header('Location: ' . $loginUrl, true, 302);
    exit;
}

$userGroupIds = [];
if ($user) {
    try {
        $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
        $groupStmt->execute([$user['id']]);
        while ($group = $groupStmt->fetch(PDO::FETCH_ASSOC)) {
            $userGroupIds[] = (int)$group['group_id'];
        }
    } catch (PDOException $e) {
        $userGroupIds = [];
    }
}

if (!userCanSeeShortUrlContext($db, $user, $ctx, $userGroupIds)) {
    short_url_error_page(403, 'You do not have access to this short link.', 'Access denied', $homeUrl);
}

$restrictionType = 'tile';
$restrictionId = (string)($ctx['tile']['id'] ?? '');
if (($ctx['type'] ?? '') === 'tab' && !empty($ctx['tab']['id'])) {
    $restrictionType = 'tab';
    $restrictionId = (string)$ctx['tab']['id'];
} elseif (($ctx['type'] ?? '') === 'link' && !empty($ctx['link']['id'])) {
    $restrictionType = 'link';
    $restrictionId = (string)$ctx['link']['id'];
} elseif (($ctx['type'] ?? '') === 'section' && !empty($ctx['tab']['id'])) {
    $restrictionType = 'tab';
    $restrictionId = (string)$ctx['tab']['id'];
}

if ($restrictionId !== '' && function_exists('evaluate_entity_access_chain')) {
    $access = evaluate_entity_access_chain($restrictionType, $restrictionId);
    if (empty($access['allowed'])) {
        $reason = (string)($access['reason'] ?? '');
        if ($reason === 'not_found') {
            short_url_error_page(404, 'This short link is no longer available.', 'Not found');
        }
        $message = trim((string)($access['message'] ?? ''));
        if ($message === '') {
            $message = 'This short link cannot be opened from here.';
        }
        short_url_error_page(403, $message, 'Restricted', $homeUrl);
    }
}

$type = $ctx['type'] ?? 'tile';
$tile = $ctx['tile'];

if ($type === 'tile' && !empty($tile['is_hyperlink']) && isHttpOrHttpsDestination($tile['hyperlink_url'] ?? '')) {
    header('Location: ' . $tile['hyperlink_url'], true, 302);
    exit;
}

if ($type === 'link') {
    $dest = trim((string)($ctx['link']['url'] ?? ''));
    if (isHttpOrHttpsDestination($dest)) {
        header('Location: ' . $dest, true, 302);
        exit;
    }
}

$spa = rtrim(linknestPublicBaseUrl(), '/') . '/' . spaHashForShortUrlContext($ctx);
header('Location: ' . $spa, true, 302);
exit;

function short_url_error_page(int $status, string $message, string $title, ?string $homeUrl = null): void {
    http_response_code($status);
    header('Content-Type: text/html; charset=UTF-8');
    $appName = 'LinkNest';
    try {
        if (function_exists('getAppName')) {
            $appName = getAppName() ?: 'LinkNest';
        }
    } catch (Throwable $e) {
        $appName = 'LinkNest';
    }
    if ($homeUrl === null) {
        try {
            $homeUrl = rtrim(linknestPublicBaseUrl(), '/') . '/';
        } catch (Throwable $e) {
            $homeUrl = '/';
        }
    }
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $safeMessage = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $safeApp = htmlspecialchars($appName, ENT_QUOTES, 'UTF-8');
    $safeHome = htmlspecialchars($homeUrl, ENT_QUOTES, 'UTF-8');
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">';
    echo '<title>' . $safeTitle . ' - ' . $safeApp . '</title>';
    echo '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f1f5f9}.box{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.5rem;margin:0 0 .75rem}p{color:#94a3b8;line-height:1.6}a{display:inline-block;margin-top:1.25rem;padding:.7rem 1.4rem;border-radius:9999px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600}</style>';
    echo '</head><body><div class="box"><h1>' . $safeTitle . '</h1><p>' . $safeMessage . '</p>';
    echo '<a href="' . $safeHome . '">Open ' . $safeApp . '</a></div></body></html>';
    exit;
}

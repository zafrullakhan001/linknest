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
    short_url_error_page(404, 'This short link was not found.', 'Not found', null, 'not_found');
}

try {
    $db = getDB();
} catch (Throwable $e) {
    short_url_error_page(500, 'This short link could not be opened right now. Please try again in a moment.', 'Unavailable', null, 'unavailable');
}

$row = lookupShortUrlByCode($db, $code);
if (!$row) {
    short_url_error_page(404, 'This short link was not found.', 'Not found', null, 'not_found');
}

$appName = function_exists('getAppName') ? (getAppName() ?: 'LinkNest') : 'LinkNest';
$homeUrl = rtrim(linknestPublicBaseUrl(), '/') . '/';

if (!empty($row['revoked'])) {
    short_url_error_page(
        410,
        'A newer short link was issued for this destination. Open ' . $appName . ' to copy the current one.',
        'Recycled',
        $homeUrl,
        'recycled'
    );
}

$ctx = resolveShortUrlTargetContext($db, $row);
if (!$ctx) {
    short_url_error_page(404, 'This short link is no longer available.', 'Not found', null, 'not_found');
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
    short_url_error_page(403, 'You do not have access to this short link.', 'Access denied', $homeUrl, 'denied');
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
        if ($reason === 'fingerprint_missing') {
            $returnUrl = rtrim(linknestPublicBaseUrl(), '/') . '/s/' . rawurlencode($code);
            $unlock = rtrim(linknestPublicBaseUrl(), '/') . '/#/fp-unlock?return=' . rawurlencode($returnUrl);
            header('Location: ' . $unlock, true, 302);
            exit;
        }
        if ($reason === 'not_found') {
            short_url_error_page(404, 'This short link is no longer available.', 'Not found', null, 'not_found');
        }
        $message = trim((string)($access['message'] ?? ''));
        if ($message === '') {
            $message = 'This short link cannot be opened from here.';
        }
        short_url_error_page(403, $message, 'Restricted', $homeUrl, 'restricted');
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

function short_url_safe_asset_url(string $raw): string {
    $raw = trim($raw);
    if ($raw === '' || preg_match('#^(javascript|vbscript):#i', $raw)) {
        return '';
    }
    if (str_starts_with($raw, 'data:image/')) {
        return $raw;
    }
    if (preg_match('#^https?://#i', $raw)) {
        return $raw;
    }

    $path = str_replace('\\', '/', $raw);
    if (!str_starts_with($path, '/')) {
        $path = '/' . ltrim($path, '/');
    }
    $normalized = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $path) ?? $path;
    $base = '';
    try {
        if (function_exists('getAppBasePath')) {
            $base = rtrim((string) getAppBasePath(), '/');
        }
    } catch (Throwable $e) {
        $base = '';
    }
    if ($base === '') {
        try {
            $public = rtrim(linknestPublicBaseUrl(), '/');
            $fromPublic = (string) (parse_url($public, PHP_URL_PATH) ?? '');
            $base = rtrim($fromPublic, '/');
        } catch (Throwable $e) {
            $base = '';
        }
    }
    if ($base !== '' && str_starts_with($normalized, '/uploads/')) {
        $normalized = $base . $normalized;
    }
    return $normalized;
}

function short_url_asset_usable(string $url): bool {
    if ($url === '' || preg_match('#^(javascript|vbscript):#i', $url)) {
        return false;
    }
    if (str_starts_with($url, 'data:image/') || preg_match('#^https?://#i', $url)) {
        return true;
    }
    if (!preg_match('#/uploads/([^?#]+)#', $url, $m)) {
        return true;
    }
    $rel = rawurldecode(str_replace('\\', '/', (string) $m[1]));
    if ($rel === '' || str_contains($rel, '..')) {
        return false;
    }
    $file = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    return is_file($file);
}

function short_url_error_page(int $status, string $message, string $title, ?string $homeUrl = null, string $kind = ''): void {
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

    $kind = strtolower(trim($kind));
    if ($kind === '') {
        $kind = match (strtolower($title)) {
            'recycled' => 'recycled',
            'not found' => 'not_found',
            'access denied' => 'denied',
            'restricted' => 'restricted',
            'unavailable' => 'unavailable',
            default => 'not_found',
        };
    }

    $headings = [
        'recycled' => 'This link was recycled',
        'not_found' => 'Short link not found',
        'denied' => 'You don\'t have access',
        'restricted' => 'This link is restricted',
        'unavailable' => 'Temporarily unavailable',
    ];
    $heading = $headings[$kind] ?? $title;
    $badge = $title;

    $svgBrandMark = '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l1.42-1.42a5 5 0 00-7.07-7.07L10.5 6.5"/><path d="M14 11a5 5 0 00-7.54-.54L5.04 11.88a5 5 0 007.07 7.07L13.5 17.5"/></svg></span>';
    $favicon = '';
    $brandSrc = '';
    try {
        if (function_exists('getSetting')) {
            $favicon = short_url_safe_asset_url((string) getSetting('favicon', ''));
            $headerLogo = short_url_safe_asset_url((string) getSetting('header_logo_image', ''));
            $logoImage = short_url_safe_asset_url((string) getSetting('logo_image', ''));
            $logoType = strtolower(trim((string) getSetting('logo_type', '')));
            if ($headerLogo !== '' && short_url_asset_usable($headerLogo)) {
                $brandSrc = $headerLogo;
            } elseif ($logoType === 'image' && $logoImage !== '' && short_url_asset_usable($logoImage)) {
                $brandSrc = $logoImage;
            } elseif ($favicon !== '' && short_url_asset_usable($favicon)) {
                $brandSrc = $favicon;
            }
        }
    } catch (Throwable $e) {
        $favicon = '';
        $brandSrc = '';
    }

    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $safeHeading = htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
    $safeBadge = htmlspecialchars($badge, ENT_QUOTES, 'UTF-8');
    $safeMessage = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $safeApp = htmlspecialchars($appName, ENT_QUOTES, 'UTF-8');
    $safeHome = htmlspecialchars($homeUrl, ENT_QUOTES, 'UTF-8');
    $safeKind = htmlspecialchars($kind, ENT_QUOTES, 'UTF-8');
    $safeFavicon = htmlspecialchars($favicon, ENT_QUOTES, 'UTF-8');
    $faviconTag = $favicon !== ''
        ? '<link rel="icon" href="' . $safeFavicon . '">'
        : '';
    $brandMark = $svgBrandMark;
    if ($brandSrc !== '') {
        $safeBrand = htmlspecialchars($brandSrc, ENT_QUOTES, 'UTF-8');
        $brandMark = '<img class="brand-logo" src="' . $safeBrand . '" alt="" onerror="var n=this.nextElementSibling;this.remove();if(n)n.hidden=false;">'
            . '<span class="brand-mark" hidden aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l1.42-1.42a5 5 0 00-7.07-7.07L10.5 6.5"/><path d="M14 11a5 5 0 00-7.54-.54L5.04 11.88a5 5 0 007.07 7.07L13.5 17.5"/></svg></span>';
    }

    $icons = [
        'recycled' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l4 4-4 4"/><path d="M20 7H9a5 5 0 00-4.9 4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h11a5 5 0 004.9-4"/></svg>',
        'not_found' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/></svg>',
        'denied' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
        'restricted' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4v5c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V7l8-4z"/></svg>',
        'unavailable' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v5"/><path d="M12 17h.01"/><path d="M10.3 3.9L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>',
    ];
    $icon = $icons[$kind] ?? $icons['not_found'];
    $footHtml = $kind === 'recycled'
        ? '<p class="foot">Recycled codes never reveal the destination.</p>'
        : '';

    echo <<<HTML
<!DOCTYPE html>
<html lang="en" data-kind="{$safeKind}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#070b14">
<title>{$safeTitle} · {$safeApp}</title>
{$faviconTag}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #070b14;
  --card: rgba(15, 23, 42, 0.72);
  --stroke: rgba(148, 163, 184, 0.14);
  --text: #f8fafc;
  --muted: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-soft: rgba(59, 130, 246, 0.16);
  --accent-ring: rgba(59, 130, 246, 0.28);
  --cta: #2563eb;
  --cta-top: #3b82f6;
  --cta-shadow: rgba(37, 99, 235, 0.4);
  --shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
}
html[data-kind="recycled"] {
  --accent: #10b981;
  --accent-hover: #34d399;
  --accent-soft: rgba(16, 185, 129, 0.16);
  --accent-ring: rgba(16, 185, 129, 0.32);
}
html[data-kind="denied"],
html[data-kind="restricted"] {
  --accent: #f59e0b;
  --accent-hover: #fbbf24;
  --accent-soft: rgba(245, 158, 11, 0.16);
  --accent-ring: rgba(245, 158, 11, 0.3);
}
html[data-kind="unavailable"] {
  --accent: #f43f5e;
  --accent-hover: #fb7185;
  --accent-soft: rgba(244, 63, 94, 0.16);
  --accent-ring: rgba(244, 63, 94, 0.3);
}
* { box-sizing: border-box; }
html { height: 100%; }
body {
  margin: 0;
  min-height: 100vh;
  min-height: 100dvh;
  font-family: Inter, system-ui, Segoe UI, Roboto, sans-serif;
  background:
    radial-gradient(1100px 520px at 50% -12%, var(--accent-soft), transparent 58%),
    radial-gradient(720px 380px at 92% 108%, rgba(37, 99, 235, 0.12), transparent 52%),
    var(--bg);
  color: var(--text);
  display: grid;
  place-items: center;
  padding: 1.5rem;
}
.wrap {
  width: min(100%, 26.5rem);
  animation: rise 0.55s ease both;
}
.card {
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: 2.15rem 1.75rem 1.85rem;
  border-radius: 1.5rem;
  background: var(--card);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}
.card::before {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0.85;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 1.5rem;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
}
.brand:hover { color: var(--text); }
.brand-logo {
  display: block;
  width: auto;
  height: 4.75rem;
  max-width: min(14rem, 100%);
  object-fit: contain;
}
.brand-mark {
  width: 4.75rem;
  height: 4.75rem;
  border-radius: 1.15rem;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent-hover);
}
.brand-mark svg { width: 2.35rem; height: 2.35rem; }
.brand-mark[hidden] { display: none !important; }
.brand-name {
  line-height: 1;
}
.icon {
  width: 4.25rem;
  height: 4.25rem;
  margin: 0 auto 1.2rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--accent-hover);
  background: var(--accent-soft);
  border: 1px solid var(--accent-ring);
  box-shadow: 0 0 0 8px rgba(255, 255, 255, 0.02);
  animation: pulse 2.8s ease-in-out infinite;
}
.icon svg { width: 1.85rem; height: 1.85rem; }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.7rem;
  padding: 0.22rem 0.7rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-hover);
  background: var(--accent-soft);
  border: 1px solid var(--accent-ring);
}
h1 {
  margin: 0 0 0.65rem;
  font-size: clamp(1.35rem, 4vw, 1.7rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
}
p {
  margin: 0 auto;
  max-width: 22rem;
  color: var(--muted);
  font-size: 0.98rem;
  line-height: 1.65;
}
.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 1.55rem;
  padding: 0.78rem 1.45rem;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--cta-top), var(--cta));
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  box-shadow: 0 10px 24px var(--cta-shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}
.cta:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
  box-shadow: 0 14px 28px var(--cta-shadow);
}
.cta:active { transform: translateY(0); }
.cta svg { width: 1.05rem; height: 1.05rem; }
.foot {
  margin-top: 1.1rem;
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.75rem;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 8px rgba(255, 255, 255, 0.02); }
  50% { box-shadow: 0 0 0 12px var(--accent-soft); }
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #eef2f7;
    --card: rgba(255, 255, 255, 0.86);
    --stroke: rgba(15, 23, 42, 0.08);
    --text: #0f172a;
    --muted: #64748b;
    --shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
  }
  body {
    background:
      radial-gradient(1100px 520px at 50% -12%, var(--accent-soft), transparent 58%),
      var(--bg);
  }
  .card { backdrop-filter: blur(16px); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before { animation: none !important; transition: none !important; }
}
</style>
</head>
<body>
  <main class="wrap">
    <div class="card">
      <a class="brand" href="{$safeHome}">{$brandMark}<span class="brand-name">{$safeApp}</span></a>
      <div class="icon" aria-hidden="true">{$icon}</div>
      <div class="badge">{$safeBadge}</div>
      <h1>{$safeHeading}</h1>
      <p>{$safeMessage}</p>
      <a class="cta" href="{$safeHome}">
        Open {$safeApp}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
      </a>
    </div>
    {$footHtml}
  </main>
</body>
</html>
HTML;
    exit;
}

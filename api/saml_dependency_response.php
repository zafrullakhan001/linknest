<?php
/**
 * Human-friendly HTML or JSON when SAML Composer / OneLogin dependencies are missing.
 */

declare(strict_types=1);

/**
 * Prefer JSON only when explicitly requested (query) or Accept omits HTML.
 */
function saml_client_wants_json(): bool
{
    if (isset($_GET['format']) && $_GET['format'] === 'json') {
        return true;
    }
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    if ($accept === '' || $accept === '*/*') {
        return false;
    }
    $hasJson = stripos($accept, 'application/json') !== false;
    $hasHtml = stripos($accept, 'text/html') !== false;
    return $hasJson && !$hasHtml;
}

function saml_app_base_path(): string
{
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    if (preg_match('#^/([^/]+)/api/#', $requestUri, $matches)) {
        return '/' . $matches[1];
    }
    return '';
}

/**
 * @param list<string> $instructions
 */
function saml_send_dependency_error(string $message, string $error, array $instructions = []): never
{
    http_response_code(500);

    $payload = [
        'success' => false,
        'message' => $message,
        'error' => $error,
        'instructions' => $instructions,
    ];

    if (saml_client_wants_json()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        exit;
    }

    $base = saml_app_base_path();
    $manualHref = htmlspecialchars($base . '/MANUAL_SAML_INSTALL.md', ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $docRoot = htmlspecialchars($base ?: '/', ENT_QUOTES | ENT_HTML5, 'UTF-8');

    $esc = static function (string $s): string {
        return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    };

    $instructionItems = '';
    foreach ($instructions as $line) {
        $instructionItems .= '<li>' . $esc($line) . '</li>';
    }

    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');

    echo '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SAML dependencies missing — LinkNest</title>
    <style>
        :root {
            --bg: #0f1419;
            --surface: #1a2332;
            --border: #2d3a4f;
            --text: #e7ecf3;
            --muted: #9aa8bc;
            --accent: #3b82f6;
            --accent-dim: #2563eb;
            --warn: #f59e0b;
            --code-bg: #0d1117;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif;
            background: radial-gradient(ellipse 120% 80% at 50% -20%, #1e3a5f 0%, var(--bg) 55%);
            color: var(--text);
            line-height: 1.6;
            padding: 1.5rem;
        }
        .wrap {
            max-width: 42rem;
            margin: 2rem auto;
        }
        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 1.75rem 1.75rem 1.5rem;
            box-shadow: 0 24px 48px rgba(0,0,0,.35);
        }
        .card::before {
            content: "";
            display: block;
            height: 3px;
            margin: -1.75rem -1.75rem 1.25rem;
            border-radius: 16px 16px 0 0;
            background: linear-gradient(90deg, var(--accent), #8b5cf6);
        }
        h1 {
            font-size: 1.35rem;
            font-weight: 700;
            margin: 0 0 .5rem;
            letter-spacing: -0.02em;
        }
        .lead {
            color: var(--muted);
            margin: 0 0 1.25rem;
            font-size: .95rem;
        }
        .badge {
            display: inline-block;
            font-size: .75rem;
            font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
            background: var(--code-bg);
            color: var(--warn);
            padding: .25rem .5rem;
            border-radius: 6px;
            border: 1px solid var(--border);
            margin-bottom: 1.25rem;
        }
        h2 {
            font-size: .8rem;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: var(--muted);
            margin: 1.5rem 0 .65rem;
            font-weight: 600;
        }
        h2:first-of-type { margin-top: 0; }
        .code {
            font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
            font-size: .82rem;
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: .85rem 1rem;
            overflow-x: auto;
            color: #c9d1d9;
            margin: 0 0 .75rem;
        }
        .hint {
            font-size: .85rem;
            color: var(--muted);
            margin: 0 0 1rem;
        }
        ul {
            margin: 0;
            padding-left: 1.2rem;
            color: var(--muted);
            font-size: .9rem;
        }
        ul li { margin: .35rem 0; }
        a {
            color: var(--accent);
            text-decoration: none;
            font-weight: 500;
        }
        a:hover { text-decoration: underline; color: #60a5fa; }
        .actions {
            margin-top: 1.5rem;
            padding-top: 1.25rem;
            border-top: 1px solid var(--border);
            font-size: .88rem;
            color: var(--muted);
        }
        .btn-row {
            display: flex;
            flex-wrap: wrap;
            gap: .75rem;
            margin-top: .75rem;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: .35rem;
            padding: .55rem 1rem;
            border-radius: 8px;
            font-size: .875rem;
            font-weight: 600;
            background: var(--accent-dim);
            color: #fff;
            border: none;
            cursor: pointer;
            text-decoration: none;
        }
        .btn:hover { background: var(--accent); color: #fff; text-decoration: none; }
        .btn-secondary {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text);
        }
        .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card">
            <h1>SAML is not available yet</h1>
            <p class="lead">' . $esc($message) . '</p>
            <div class="badge">' . $esc($error) . '</div>

            <h2>Recommended: Composer</h2>
            <p class="hint">From your LinkNest project root (where <code style="background:var(--code-bg);padding:.1rem .35rem;border-radius:4px;">composer.json</code> lives), install PHP dependencies:</p>
            <div class="code">cd /path/to/linknest<br>composer install</div>
            <p class="hint">On Windows without <code style="background:var(--code-bg);padding:.1rem .35rem;border-radius:4px;">composer</code> in PATH (e.g. XAMPP):</p>
            <div class="code">cd C:\\xampp\\htdocs\\linknest<br>php composer.phar install</div>
            <p class="hint">This installs <strong>onelogin/php-saml</strong> (^4.0) and generates <code style="background:var(--code-bg);padding:.1rem .35rem;border-radius:4px;">vendor/autoload.php</code>.</p>

            <h2>Manual installation</h2>
            <p class="hint">If Composer cannot run (e.g. SSL issues), follow the step-by-step guide:</p>
            <div class="btn-row">
                <a class="btn btn-secondary" href="' . $manualHref . '">Open MANUAL_SAML_INSTALL.md</a>
            </div>
            <p class="hint" style="margin-top:1rem;">Expected path after manual setup: <code style="background:var(--code-bg);padding:.1rem .35rem;border-radius:4px;font-size:.8rem;">vendor/onelogin/php-saml/src/OneLogin/Saml2/</code></p>';

    if ($instructionItems !== '') {
        echo '
            <h2>Summary</h2>
            <ul>' . $instructionItems . '</ul>';
    }

    echo '
            <div class="actions">
                After installing, reload this page or try SAML sign-in again from the app
                (<a href="' . $docRoot . '">return to LinkNest</a>).
                <span style="display:block;margin-top:.5rem;font-size:.8rem;">Developers: append <code style="background:var(--code-bg);padding:.1rem .35rem;border-radius:4px;">?format=json</code> for the raw API payload.</span>
            </div>
        </div>
    </div>
</body>
</html>';

    exit;
}

<?php
/**
 * Public documentation guides API.
 * Routes: GET /api/docs | /api/docs/list | /api/docs/file?name=APP_UPDATES.md
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
$path = rtrim($path, '/') ?: '/';

define('DOCS_ROOT', realpath(__DIR__ . '/../docs') ?: (__DIR__ . '/../docs'));

/** @var array<string, string> filename => category */
const DOCS_CATEGORY_MAP = [
    'SETUP.md' => 'Getting Started',
    'ARCHITECTURE.md' => 'Architecture',
    'APP_UPDATES.md' => 'Updates & Deploy',
    'PACKAGE_FOR_DEPLOYMENT.md' => 'Updates & Deploy',
    'XAMPP_PHP_UPGRADE.md' => 'Updates & Deploy',
    'DEPLOYMENT_INSTRUCTIONS.md' => 'Updates & Deploy',
    'PRODUCTION.md' => 'Updates & Deploy',
    'CREATE_BUNDLE.md' => 'Updates & Deploy',
    'HTTPS_CONFIGURATION.md' => 'Updates & Deploy',
    'PRODUCTION_TROUBLESHOOTING.md' => 'Updates & Deploy',
    'CUSTOM_WIDGETS_DEVELOPMENT.md' => 'Features',
    'TILE_ANIMATIONS.md' => 'Features',
    'TILE_ADMIN_GRANULAR_PERMISSIONS.md' => 'Features',
    'MULTIPLE_SMTP_SERVERS.md' => 'Features',
    'DATABASE_CLEANUP_UI.md' => 'Features',
    'REMOTE_WIDGETS_SETUP.md' => 'Features',
    'PYTHON_WORKERS.md' => 'Operations',
    'CLONED_INSTANCE_SCHEDULING.md' => 'Operations',
    'DUPLICATE_TILES_CLEANUP.md' => 'Operations',
    'DATABASE_OPTIMIZATION.md' => 'Database & Backend',
    'DATABASE_IN_MEMORY_OPTIMIZATION.md' => 'Database & Backend',
    'README_BACKEND.md' => 'Database & Backend',
];

const DOCS_CATEGORY_ORDER = [
    'Getting Started',
    'Architecture',
    'Updates & Deploy',
    'Features',
    'Operations',
    'Database & Backend',
    'Other',
];

/** Preferred sort within Updates & Deploy */
const DOCS_FILE_PRIORITY = [
    'APP_UPDATES.md' => 0,
    'PACKAGE_FOR_DEPLOYMENT.md' => 1,
    'XAMPP_PHP_UPGRADE.md' => 2,
    'SETUP.md' => 0,
    'ARCHITECTURE.md' => 0,
    'DEPLOYMENT_INSTRUCTIONS.md' => 3,
    'PRODUCTION.md' => 4,
    'CREATE_BUNDLE.md' => 5,
    'HTTPS_CONFIGURATION.md' => 6,
    'PRODUCTION_TROUBLESHOOTING.md' => 7,
];

function docsSendJson($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function docsHumanizeFilename(string $file): string {
    $base = preg_replace('/\.md$/i', '', $file) ?? $file;
    $base = str_replace(['_', '-'], ' ', $base);
    return ucwords(strtolower($base));
}

function docsExtractTitle(string $markdown, string $file): string {
    if (preg_match('/^#\s+(.+)$/m', $markdown, $m)) {
        return trim($m[1]);
    }
    return docsHumanizeFilename($file);
}

function docsSafeBasename(string $name): ?string {
    $name = trim($name);
    $name = basename(str_replace(['\\', "\0"], ['/', ''], $name));
    if ($name === '' || $name === '.' || $name === '..') {
        return null;
    }
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/', $name)) {
        return null;
    }
    return $name;
}

function docsResolveFile(string $name): ?string {
    $base = docsSafeBasename($name);
    if ($base === null) {
        return null;
    }
    $root = realpath(DOCS_ROOT);
    if ($root === false || !is_dir($root)) {
        return null;
    }
    $full = $root . DIRECTORY_SEPARATOR . $base;
    if (!is_file($full)) {
        return null;
    }
    $real = realpath($full);
    if ($real === false) {
        return null;
    }
    // Ensure resolved path stays under docs/
    $rootNorm = strtolower(str_replace('\\', '/', $root));
    $realNorm = strtolower(str_replace('\\', '/', $real));
    if (!str_starts_with($realNorm, $rootNorm . '/') && $realNorm !== $rootNorm) {
        return null;
    }
    return $real;
}

function docsCategoryFor(string $file): string {
    return DOCS_CATEGORY_MAP[$file] ?? 'Other';
}

function docsListEntries(): array {
    $root = realpath(DOCS_ROOT);
    if ($root === false || !is_dir($root)) {
        return [];
    }
    $files = glob($root . DIRECTORY_SEPARATOR . '*.md') ?: [];
    $entries = [];
    foreach ($files as $path) {
        $file = basename($path);
        if (!preg_match('/\.md$/i', $file)) {
            continue;
        }
        $raw = @file_get_contents($path);
        $markdown = is_string($raw) ? $raw : '';
        $title = docsExtractTitle($markdown, $file);
        $category = docsCategoryFor($file);
        $entries[] = [
            'id' => pathinfo($file, PATHINFO_FILENAME),
            'file' => $file,
            'title' => $title,
            'category' => $category,
            'description' => null,
        ];
    }

    usort($entries, static function ($a, $b) {
        $ca = array_search($a['category'], DOCS_CATEGORY_ORDER, true);
        $cb = array_search($b['category'], DOCS_CATEGORY_ORDER, true);
        if ($ca === false) {
            $ca = 99;
        }
        if ($cb === false) {
            $cb = 99;
        }
        if ($ca !== $cb) {
            return $ca <=> $cb;
        }
        $pa = DOCS_FILE_PRIORITY[$a['file']] ?? 50;
        $pb = DOCS_FILE_PRIORITY[$b['file']] ?? 50;
        if ($pa !== $pb) {
            return $pa <=> $pb;
        }
        return strcasecmp($a['title'], $b['title']);
    });

    return $entries;
}

try {
    if ($method !== 'GET') {
        docsSendJson(['error' => 'Method not allowed'], 405);
    }

    if ($path === '/' || $path === '/list') {
        $entries = docsListEntries();
        $grouped = [];
        foreach (DOCS_CATEGORY_ORDER as $cat) {
            $grouped[$cat] = [];
        }
        foreach ($entries as $e) {
            $cat = $e['category'];
            if (!isset($grouped[$cat])) {
                $grouped[$cat] = [];
            }
            $grouped[$cat][] = $e;
        }
        // Drop empty categories
        foreach ($grouped as $cat => $items) {
            if ($items === []) {
                unset($grouped[$cat]);
            }
        }
        docsSendJson([
            'data' => [
                'docs' => $entries,
                'categories' => $grouped,
                'count' => count($entries),
            ],
        ]);
    }

    if ($path === '/file') {
        $name = isset($_GET['name']) ? (string)$_GET['name'] : '';
        $resolved = docsResolveFile($name);
        if ($resolved === null) {
            docsSendJson(['error' => 'Document not found'], 404);
        }
        $raw = @file_get_contents($resolved);
        if ($raw === false) {
            docsSendJson(['error' => 'Unable to read document'], 500);
        }
        $file = basename($resolved);
        docsSendJson([
            'data' => [
                'file' => $file,
                'title' => docsExtractTitle($raw, $file),
                'category' => docsCategoryFor($file),
                'markdown' => $raw,
            ],
        ]);
    }

    docsSendJson(['error' => 'Invalid endpoint'], 404);
} catch (Throwable $e) {
    error_log('docs API: ' . $e->getMessage());
    docsSendJson(['error' => $e->getMessage()], 500);
}

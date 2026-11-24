<?php
/**
 * Queue Status API
 * Returns real-time statistics about the metrics queue
 * 
 * GET /api/metrics/queue-status
 */

require_once __DIR__ . '/../config_analytics.php';

// Handle CORS preflight
handlePreflight();

// Basic format negotiation:
// - Default: JSON (API-friendly)
// - HTML view for humans: ?format=html or Accept: text/html
$format = isset($_GET['format']) ? strtolower((string)$_GET['format']) : '';
$accept = isset($_SERVER['HTTP_ACCEPT']) ? (string)$_SERVER['HTTP_ACCEPT'] : '';
$wantsHtml = ($format === 'html') || ($format === '' && stripos($accept, 'text/html') !== false);
$wantsJson = ($format === 'json' || $format === '' || !$wantsHtml);
$prettyJson = isset($_GET['pretty']) && (string)$_GET['pretty'] !== '0';

// CORS headers (safe for both JSON/HTML reads)
header('Access-Control-Allow-Origin: *');

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    if ($wantsHtml) {
        header('Content-Type: text/html; charset=UTF-8');
        echo '<!doctype html><meta charset="utf-8"><title>405 Method Not Allowed</title><pre>Method not allowed</pre>';
    } else {
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Method not allowed']);
    }
    exit;
}

try {
    // Get PostgreSQL connection
    $pdo = getAnalyticsPDO();
    if (!$pdo) {
        http_response_code(503);
        if ($wantsHtml) {
            header('Content-Type: text/html; charset=UTF-8');
            echo '<!doctype html><meta charset="utf-8"><title>Analytics database not available</title><pre>Analytics database not available</pre>';
        } else {
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Analytics database not available']);
        }
        exit;
    }
    
    // Get queue statistics
    $queueStats = $pdo->query("
        SELECT 
            COUNT(*) as total_items,
            COUNT(*) FILTER (WHERE processed = FALSE) as pending,
            COUNT(*) FILTER (WHERE processed = TRUE) as processed,
            MIN(created_at) FILTER (WHERE processed = FALSE) as oldest_pending,
            MAX(created_at) as latest_item,
            MAX(processed_at) as latest_processed
        FROM metrics_queue
    ")->fetch(PDO::FETCH_ASSOC);
    
    // Get recent processing rate (last 5 minutes)
    $recentRate = $pdo->query("
        SELECT 
            COUNT(*) as items_processed,
            EXTRACT(EPOCH FROM (MAX(processed_at) - MIN(processed_at))) as time_span_seconds
        FROM metrics_queue
        WHERE processed = TRUE 
        AND processed_at >= NOW() - INTERVAL '5 minutes'
    ")->fetch(PDO::FETCH_ASSOC);
    
    // Calculate processing rate
    $processingRate = 0;
    if ($recentRate['time_span_seconds'] > 0) {
        $processingRate = round($recentRate['items_processed'] / $recentRate['time_span_seconds'] * 60, 1);
    }
    
    // Get performance metrics count
    $metricsCount = $pdo->query("
        SELECT 
            COUNT(*) as total_metrics,
            COUNT(DISTINCT link_url) as unique_urls,
            COUNT(DISTINCT country_name) as countries,
            MAX(time) as latest_metric
        FROM performance_metrics
    ")->fetch(PDO::FETCH_ASSOC);
    
    // Get storage info
    $storageInfo = $pdo->query("
        SELECT 
            pg_size_pretty(pg_total_relation_size('performance_metrics')) as metrics_size,
            pg_size_pretty(pg_total_relation_size('metrics_queue')) as queue_size,
            pg_size_pretty(pg_database_size(current_database())) as database_size
    ")->fetch(PDO::FETCH_ASSOC);
    
    // Calculate estimated wait time for pending items
    $estimatedWaitSeconds = 0;
    if ($processingRate > 0 && $queueStats['pending'] > 0) {
        $estimatedWaitSeconds = ceil($queueStats['pending'] / ($processingRate / 60));
    }
    
    // Determine queue health status
    $status = 'healthy';
    if ($queueStats['pending'] > 1000) {
        $status = 'degraded';
    }
    if ($queueStats['pending'] > 5000) {
        $status = 'overloaded';
    }
    
    // Format response
    $response = [
        'success' => true,
        'timestamp' => date('c'),
        'queue' => [
            'total_items' => (int)$queueStats['total_items'],
            'pending' => (int)$queueStats['pending'],
            'processed' => (int)$queueStats['processed'],
            'oldest_pending' => $queueStats['oldest_pending'],
            'latest_item' => $queueStats['latest_item'],
            'latest_processed' => $queueStats['latest_processed'],
            'estimated_wait_seconds' => $estimatedWaitSeconds,
            'status' => $status
        ],
        'processing' => [
            'rate_per_minute' => $processingRate,
            'items_last_5min' => (int)$recentRate['items_processed']
        ],
        'metrics' => [
            'total' => (int)$metricsCount['total_metrics'],
            'unique_urls' => (int)$metricsCount['unique_urls'],
            'countries' => (int)$metricsCount['countries'],
            'latest' => $metricsCount['latest_metric']
        ],
        'storage' => [
            'metrics_table' => $storageInfo['metrics_size'],
            'queue_table' => $storageInfo['queue_size'],
            'database' => $storageInfo['database_size']
        ]
    ];

    if ($wantsHtml) {
        header('Content-Type: text/html; charset=UTF-8');

        $h = static function ($v): string {
            return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
        };

        $statusText = (string)($response['queue']['status'] ?? 'unknown');
        $statusClass = 'status-healthy';
        if ($statusText === 'degraded') $statusClass = 'status-degraded';
        if ($statusText === 'overloaded') $statusClass = 'status-overloaded';

        $est = (int)($response['queue']['estimated_wait_seconds'] ?? 0);
        $estHuman = $est <= 0 ? '—' : (string)gmdate($est >= 3600 ? 'H:i:s' : 'i:s', $est);
        if ($est > 0 && $est < 60) $estHuman = $est . 's';

        $jsonPretty = json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        echo '<!doctype html>';
        echo '<html lang="en"><head>';
        echo '<meta charset="utf-8">';
        echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
        echo '<title>Metrics Queue Status</title>';
        echo '<style>
            :root{
              --indigo-50:#eef2ff; --indigo-100:#e0e7ff; --indigo-200:#c7d2fe;
              --indigo-600:#4f46e5; --indigo-700:#4338ca; --indigo-800:#3730a3;
              --slate-50:#f8fafc; --slate-100:#f1f5f9; --slate-200:#e2e8f0;
              --slate-500:#64748b; --slate-700:#334155; --slate-900:#0f172a;
              --green-600:#16a34a; --amber-600:#d97706; --red-600:#dc2626;
            }
            *{box-sizing:border-box}
            body{
              margin:0; padding:24px;
              font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
              background:linear-gradient(180deg,var(--indigo-50),#fff);
              color:var(--slate-900);
            }
            .container{max-width:1100px; margin:0 auto}
            .topbar{
              display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;
              padding:18px 20px; border:1px solid var(--indigo-200); background:#fff; border-radius:14px;
              box-shadow:0 8px 24px rgba(15,23,42,.06);
            }
            h1{
              margin:0 0 6px 0; font-size:20px; letter-spacing:-0.02em;
              color:var(--indigo-800);
            }
            .meta{color:var(--slate-500); font-size:13px}
            .actions{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
            a.btn{
              display:inline-flex; align-items:center; gap:8px;
              padding:8px 12px; border-radius:10px; text-decoration:none;
              font-size:13px; font-weight:600;
              border:1px solid var(--indigo-200); background:var(--indigo-50); color:var(--indigo-800);
            }
            a.btn:hover{background:var(--indigo-100)}
            .grid{
              margin-top:18px;
              display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px;
            }
            .card{
              background:#fff; border:1px solid var(--slate-200); border-radius:14px;
              padding:16px 16px 14px; box-shadow:0 8px 24px rgba(15,23,42,.05);
            }
            .card h2{
              margin:0 0 10px 0; font-size:13px; letter-spacing:0.06em; text-transform:uppercase;
              color:var(--slate-500);
            }
            .kv{display:flex; justify-content:space-between; gap:10px; padding:7px 0; border-top:1px dashed var(--slate-200)}
            .kv:first-of-type{border-top:none}
            .k{color:var(--slate-700); font-size:13px}
            .v{color:var(--slate-900); font-weight:700; font-size:13px}
            .status-pill{
              display:inline-flex; align-items:center; gap:8px;
              padding:6px 10px; border-radius:999px; font-weight:800; font-size:12px;
              border:1px solid var(--indigo-200); background:var(--indigo-50); color:var(--indigo-800);
              text-transform:uppercase; letter-spacing:0.06em;
            }
            .status-healthy{border-color:rgba(22,163,74,.25); background:rgba(22,163,74,.08); color:var(--green-600)}
            .status-degraded{border-color:rgba(217,119,6,.25); background:rgba(217,119,6,.10); color:var(--amber-600)}
            .status-overloaded{border-color:rgba(220,38,38,.25); background:rgba(220,38,38,.10); color:var(--red-600)}
            .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
            details{margin-top:16px}
            summary{cursor:pointer; color:var(--indigo-800); font-weight:700}
            pre{
              margin-top:10px; padding:14px; border-radius:14px;
              background:var(--slate-50); border:1px solid var(--slate-200);
              overflow:auto; font-size:12px; line-height:1.5;
            }
          </style>';
        echo '</head><body><div class="container">';
        echo '<div class="topbar">';
        echo '<div>';
        echo '<h1>Metrics Queue Status</h1>';
        echo '<div class="meta">Updated: <span class="mono">' . $h($response['timestamp']) . '</span></div>';
        echo '</div>';
        echo '<div class="actions">';
        echo '<span class="status-pill ' . $h($statusClass) . '">' . $h($statusText) . '</span>';
        echo '<a class="btn" href="?format=json&pretty=1" target="_blank" rel="noopener">View JSON</a>';
        echo '</div>';
        echo '</div>';

        echo '<div class="grid">';

        echo '<div class="card">';
        echo '<h2>Queue</h2>';
        echo '<div class="kv"><div class="k">Pending</div><div class="v mono">' . $h($response['queue']['pending']) . '</div></div>';
        echo '<div class="kv"><div class="k">Processed</div><div class="v mono">' . $h($response['queue']['processed']) . '</div></div>';
        echo '<div class="kv"><div class="k">Total items</div><div class="v mono">' . $h($response['queue']['total_items']) . '</div></div>';
        echo '<div class="kv"><div class="k">Est. wait</div><div class="v mono">' . $h($estHuman) . '</div></div>';
        echo '</div>';

        echo '<div class="card">';
        echo '<h2>Processing</h2>';
        echo '<div class="kv"><div class="k">Rate</div><div class="v mono">' . $h($response['processing']['rate_per_minute']) . '/min</div></div>';
        echo '<div class="kv"><div class="k">Items last 5min</div><div class="v mono">' . $h($response['processing']['items_last_5min']) . '</div></div>';
        echo '<div class="kv"><div class="k">Latest processed</div><div class="v mono">' . $h($response['queue']['latest_processed'] ?: '—') . '</div></div>';
        echo '</div>';

        echo '<div class="card">';
        echo '<h2>Metrics</h2>';
        echo '<div class="kv"><div class="k">Total metrics</div><div class="v mono">' . $h($response['metrics']['total']) . '</div></div>';
        echo '<div class="kv"><div class="k">Unique URLs</div><div class="v mono">' . $h($response['metrics']['unique_urls']) . '</div></div>';
        echo '<div class="kv"><div class="k">Countries</div><div class="v mono">' . $h($response['metrics']['countries']) . '</div></div>';
        echo '<div class="kv"><div class="k">Latest metric</div><div class="v mono">' . $h($response['metrics']['latest'] ?: '—') . '</div></div>';
        echo '</div>';

        echo '<div class="card">';
        echo '<h2>Storage</h2>';
        echo '<div class="kv"><div class="k">Queue table</div><div class="v mono">' . $h($response['storage']['queue_table']) . '</div></div>';
        echo '<div class="kv"><div class="k">Metrics table</div><div class="v mono">' . $h($response['storage']['metrics_table']) . '</div></div>';
        echo '<div class="kv"><div class="k">Database</div><div class="v mono">' . $h($response['storage']['database']) . '</div></div>';
        echo '</div>';

        echo '</div>';

        echo '<details>';
        echo '<summary>How to process the queue</summary>';
        echo '<pre class="mono">Why the dashboard shows “No data yet”
The dashboard lists URLs from performance_metrics.
If performance_metrics.total = 0 while metrics_queue.pending > 0, metrics are being collected but not processed.
Processing is done by the worker: analytics/process-metrics-queue.php

Fix (what to do now)
Start the workers and leave them running:
C:\xampp\htdocs\linknest\analytics\start-workers-xampp.bat
Keep BOTH command windows open:
- Metrics Queue Processor (required to move metrics_queue → performance_metrics)
- Server Checker Worker

Confirm it’s working
Refresh:
http://localhost:9333/api/metrics/queue-status
You should see:
- pending dropping toward 0
- processed increasing
- metrics.total increasing

Then refresh the dashboard page and click “Refresh Data”. The URL dropdown will populate.

About console errors (ERR_NAME_NOT_RESOLVED)
This usually means some link/URL being measured can’t be resolved (bad hostname, DNS, VPN, or offline host).
It won’t stop the dashboard itself, but those specific measurements may fail.</pre>';
        echo '</details>';

        echo '<details>';
        echo '<summary>Raw JSON</summary>';
        echo '<pre class="mono">' . $h($jsonPretty) . '</pre>';
        echo '</details>';

        echo '</div></body></html>';
        exit;
    }

    // JSON response (default)
    header('Content-Type: application/json');
    $jsonFlags = JSON_UNESCAPED_SLASHES;
    if ($prettyJson) {
        $jsonFlags |= JSON_PRETTY_PRINT;
    }
    echo json_encode($response, $jsonFlags);
    
} catch (PDOException $e) {
    error_log("Queue status error: " . $e->getMessage());
    http_response_code(500);
    $err = [
        'success' => false,
        'error' => 'Database error',
        'details' => $e->getMessage()
    ];
    if ($wantsHtml) {
        header('Content-Type: text/html; charset=UTF-8');
        echo '<!doctype html><meta charset="utf-8"><title>Queue status error</title><pre>' . htmlspecialchars($err['error'] . "\n\n" . $err['details'], ENT_QUOTES, 'UTF-8') . '</pre>';
    } else {
        header('Content-Type: application/json');
        echo json_encode($err);
    }
} catch (Exception $e) {
    error_log("Queue status error: " . $e->getMessage());
    http_response_code(500);
    $err = [
        'success' => false,
        'error' => 'Internal server error'
    ];
    if ($wantsHtml) {
        header('Content-Type: text/html; charset=UTF-8');
        echo '<!doctype html><meta charset="utf-8"><title>Queue status error</title><pre>' . htmlspecialchars($err['error'], ENT_QUOTES, 'UTF-8') . '</pre>';
    } else {
        header('Content-Type: application/json');
        echo json_encode($err);
    }
}

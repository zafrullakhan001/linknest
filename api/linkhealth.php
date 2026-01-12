<?php
// Set execution time limit early to prevent hangs
set_time_limit(10); // Maximum 10 seconds for entire script

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetHealthStatus();
        } elseif ($path === '/stats') {
            handleGetHealthStats();
        } else {
            sendJSON(['error' => 'Invalid endpoint', 'received_path' => $path, 'path_type' => gettype($path)], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/check') {
            handleCheckSingleLink();
        } elseif ($path === '/check-tile') {
            handleCheckTileLinks();
        } elseif ($path === '/check-all') {
            handleCheckAllLinks();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Determine health status from HTTP code, curl error, and error message
 * This centralizes the status logic so both single and parallel checks use the same logic
 */
function determineHealthStatus($httpCode, $errno, $error) {
    // Determine status based on response
    if ($errno !== 0) {
        // cURL error occurred
        $status = 'broken';
        if ($errno === CURLE_OPERATION_TIMEDOUT || $errno === CURLE_OPERATION_TIMEOUTED) {
            $status = 'timeout';
            $error = 'Connection timed out';
        } elseif ($errno === CURLE_COULDNT_RESOLVE_HOST) {
            $error = 'Could not resolve host';
        } elseif ($errno === CURLE_COULDNT_CONNECT) {
            $error = 'Could not connect to server';
        } elseif ($errno === CURLE_SSL_CONNECT_ERROR) {
            $error = 'SSL connection error';
        }
    } elseif ($httpCode >= 200 && $httpCode < 400) {
        // Success (2xx) or Redirect (3xx)
        $status = 'healthy';
        $error = null;
    } elseif ($httpCode >= 400 && $httpCode < 500) {
        // Client error (4xx)
        if ($httpCode === 404) {
            // 404 could mean:
            // 1. Page doesn't exist (broken)
            // 2. Server is up but HEAD request not supported (common for some sites)
            // 3. Internal/corporate site that requires specific path
            // Since server responded (not timeout/connection error), treat as "unknown" rather than "broken"
            // The link might work when clicked even if HEAD returns 404
            $status = 'unknown';
            $error = 'Page not found (404) - Server is reachable but page may not exist or HEAD not supported';
        } elseif ($httpCode === 403 || $httpCode === 401) {
            // Treat auth/permission errors as "accessible" - server is online, just requires authentication (SSO/proxy/SharePoint)
            $status = 'accessible';
            if ($httpCode === 403) {
                $error = 'Access forbidden (403) - Server is online, authentication required';
            } else { // 401
                $error = 'Unauthorized (401) - Server is online, authentication required';
            }
        } else {
            // All other 4xx codes (405, 406, 407, 408, etc.) indicate server is reachable and responding
            // These are often behind SSO proxies, SharePoint, or require specific methods/headers
            // Since the server responded, the link is accessible/online
            $status = 'accessible';
            $error = 'Server is online (HTTP ' . $httpCode . ') - May require authentication or specific access method';
        }
    } elseif ($httpCode >= 500) {
        // Server error (5xx)
        $status = 'broken';
        $error = 'Server error: ' . $httpCode;
    } else {
        // Unknown status
        $status = 'unknown';
        $error = 'Unknown response code: ' . $httpCode;
    }
    
    return ['status' => $status, 'error' => $error];
}

/**
 * Check if a URL is reachable and return health status
 */
function checkUrlHealth($url) {
    // Validate URL format
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return [
            'status' => 'broken',
            'http_code' => 0,
            'error' => 'Invalid URL format',
            'server_latency' => 0
        ];
    }

    // Initialize cURL
    $ch = curl_init();
    
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 2, // Reduced from 3 to 2
        // Aggressive timeouts: fail fast for better UX
        CURLOPT_TIMEOUT => 1, // Reduced to 1 second total
        CURLOPT_CONNECTTIMEOUT => 1, // 1 second to connect
        CURLOPT_NOBODY => true, // HEAD request for efficiency
        CURLOPT_SSL_VERIFYPEER => false, // Allow self-signed certs
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => 'LinkNest Health Checker/1.0',
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            'Cache-Control: no-cache',
            'Connection: close' // Close connection immediately
        ],
        CURLOPT_FRESH_CONNECT => true, // Don't reuse connections
        CURLOPT_FORBID_REUSE => true // Force new connection
    ]);

    // Measure ONLY cURL execution time (excluding PHP overhead)
    $curlStartTime = microtime(true);
    $response = curl_exec($ch);
    $serverLatency = round((microtime(true) - $curlStartTime) * 1000); // Convert to milliseconds
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    // Determine status using shared logic
    $statusResult = determineHealthStatus($httpCode, $errno, $error);
    $status = $statusResult['status'];
    $error = $statusResult['error'];

    return [
        'status' => $status,
        'http_code' => $httpCode,
        'error' => $error,
        'server_latency' => $serverLatency
    ];
}

/**
 * Check multiple URLs in parallel using curl_multi (much faster!)
 * Returns array of results indexed by URL
 */
function checkUrlsParallel($urls, $maxConcurrent = 5) {
    if (empty($urls)) {
        return [];
    }
    
    // If only one URL, use single check for simplicity
    if (count($urls) === 1) {
        $url = reset($urls);
        return [$url => checkUrlHealth($url)];
    }
    
    $multiHandle = curl_multi_init();
    $handles = [];
    $handleStartTimes = []; // Track start time for each handle
    $results = [];
    
    // Initialize handles for all URLs
    foreach ($urls as $url) {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            $results[$url] = [
                'status' => 'broken',
                'http_code' => 0,
                'error' => 'Invalid URL format',
                'server_latency' => 0
            ];
            continue;
        }
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 2, // Reduced from 3
            CURLOPT_TIMEOUT => 1, // Reduced to 1 second
            CURLOPT_CONNECTTIMEOUT => 1,
            CURLOPT_NOBODY => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_USERAGENT => 'LinkNest Health Checker/1.0',
            CURLOPT_HTTPHEADER => [
                'Accept: */*',
                'Cache-Control: no-cache',
                'Connection: close'
            ],
            CURLOPT_FRESH_CONNECT => true,
            CURLOPT_FORBID_REUSE => true
        ]);
        
        curl_multi_add_handle($multiHandle, $ch);
        $handles[$url] = $ch;
        $handleStartTimes[$url] = microtime(true); // Track start time
    }
    
    // Execute all handles in parallel with timeout protection
    $running = null;
    $startTime = microtime(true);
    $maxTime = 3.0; // Maximum 3 seconds total for all requests (reduced from 5)
    
    do {
        $mrc = curl_multi_exec($multiHandle, $running);
        
        // Check for timeout
        if ((microtime(true) - $startTime) > $maxTime) {
            // Timeout - cancel remaining requests
            foreach ($handles as $url => $ch) {
                if (!isset($results[$url])) {
                    curl_multi_remove_handle($multiHandle, $ch);
                    curl_close($ch);
                    $serverLatency = isset($handleStartTimes[$url]) ? round((microtime(true) - $handleStartTimes[$url]) * 1000) : 0;
                    $results[$url] = [
                        'status' => 'timeout',
                        'http_code' => 0,
                        'error' => 'Request timeout',
                        'server_latency' => $serverLatency
                    ];
                }
            }
            break;
        }
        
        if ($running > 0) {
            curl_multi_select($multiHandle, 0.05); // Reduced from 0.1 to 0.05 for faster polling
        }
    } while ($running > 0 && $mrc === CURLM_OK);
    
    // Process results
    foreach ($handles as $url => $ch) {
        if (isset($results[$url])) {
            continue; // Already processed (timeout or invalid)
        }
        
        $serverLatency = isset($handleStartTimes[$url]) ? round((microtime(true) - $handleStartTimes[$url]) * 1000) : 0;
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $errno = curl_errno($ch);
        
        // Determine status using shared logic (same as checkUrlHealth)
        $statusResult = determineHealthStatus($httpCode, $errno, $error);
        $status = $statusResult['status'];
        $error = $statusResult['error'];
        
        $results[$url] = [
            'status' => $status,
            'http_code' => $httpCode,
            'error' => $error,
            'server_latency' => $serverLatency
        ];
        
        curl_multi_remove_handle($multiHandle, $ch);
        curl_close($ch);
    }
    
    curl_multi_close($multiHandle);
    return $results;
}

/**
 * Update link health status in database (non-blocking with timeout)
 */
function updateLinkHealth($linkId, $healthResult) {
    // Use a very short timeout to prevent hanging
    $maxRetries = 2; // Reduced from 3
    $retryDelay = 50000; // 50ms in microseconds (reduced from 100ms)
    
    for ($attempt = 0; $attempt < $maxRetries; $attempt++) {
        try {
            $db = getDB();
            // Set very short busy timeout to fail fast
            $db->exec('PRAGMA busy_timeout = 500'); // Only wait 500ms for locks
            
            // Use a prepared statement for safety
            $stmt = $db->prepare('UPDATE links SET health_status = ?, health_http_code = ?, health_error = ?, health_checked_at = ? WHERE id = ?');
            
            // Set a timeout for the execute operation
            $startTime = microtime(true);
            $stmt->execute([
                $healthResult['status'],
                $healthResult['http_code'],
                $healthResult['error'],
                time(),
                $linkId
            ]);
            $executeTime = microtime(true) - $startTime;
            
            // If execute took too long, log it but continue
            if ($executeTime > 0.5) {
                error_log("Slow DB update for link $linkId: " . number_format($executeTime, 2) . "s");
            }
            
            return; // Success - exit function
        } catch (PDOException $e) {
            $errorCode = $e->getCode();
            $errorMsg = $e->getMessage();
            
            // SQLITE_BUSY = 5, SQLITE_LOCKED = 6
            if (($errorCode == 5 || $errorCode == 6) && $attempt < $maxRetries - 1) {
                // Database is busy/locked - retry after short delay
                usleep($retryDelay * ($attempt + 1));
                continue;
            }
            
            // Log but don't throw - allow operation to continue
            error_log("Failed to update link health for $linkId (attempt " . ($attempt + 1) . "): $errorMsg");
            return; // Exit on final failure
        }
    }
    
    // If we get here, all retries failed - log and continue
    error_log("All retries failed for link $linkId");
}

/**
 * Batch update link health statuses in database (much faster with transaction)
 */
function updateLinkHealthBatch($updates) {
    if (empty($updates)) {
        return;
    }
    
    // For small batches, use individual updates to avoid lock issues
    if (count($updates) <= 3) {
        foreach ($updates as $linkId => $healthResult) {
            updateLinkHealth($linkId, $healthResult);
        }
        return;
    }
    
    try {
        $db = getDB();
        // Set busy timeout to handle concurrent access
        $db->exec('PRAGMA busy_timeout = 3000'); // Wait up to 3 seconds for locks
        
        // Use deferred transaction (default) instead of immediate to reduce contention
        $db->beginTransaction();
        
        $stmt = $db->prepare('UPDATE links SET health_status = ?, health_http_code = ?, health_error = ?, health_checked_at = ? WHERE id = ?');
        $now = time();
        
        foreach ($updates as $linkId => $healthResult) {
            try {
                $stmt->execute([
                    $healthResult['status'],
                    $healthResult['http_code'],
                    $healthResult['error'],
                    $now,
                    $linkId
                ]);
            } catch (PDOException $e) {
                // Log individual update failure but continue with others
                error_log("Failed to update health for link $linkId: " . $e->getMessage());
            }
        }
        
        $db->commit();
    } catch (PDOException $e) {
        try {
            if (isset($db) && $db->inTransaction()) {
                $db->rollBack();
            }
        } catch (Exception $rollbackError) {
            // Ignore rollback errors
        }
        error_log('Batch health update failed: ' . $e->getMessage());
        // Fallback: try individual updates without transaction
        foreach ($updates as $linkId => $healthResult) {
            updateLinkHealth($linkId, $healthResult);
        }
    }
}

/**
 * GET /api/linkhealth.php - Get health status for all links
 */
function handleGetHealthStatus() {
    $db = getDB();
    
    // Get all links with their health status
    $stmt = $db->prepare('
        SELECT l.id, l.url, l.health_status, l.health_http_code, l.health_error, l.health_checked_at,
               s.tile_id
        FROM links l
        JOIN sections s ON l.section_id = s.id
    ');
    $stmt->execute();
    $links = $stmt->fetchAll();
    
    $result = [];
    foreach ($links as $link) {
        $result[$link['id']] = [
            'status' => $link['health_status'] ?? 'unknown',
            'httpCode' => $link['health_http_code'] ? (int)$link['health_http_code'] : null,
            'error' => $link['health_error'],
            'checkedAt' => $link['health_checked_at'] ? (int)$link['health_checked_at'] : null,
            'tileId' => $link['tile_id']
        ];
    }
    
    sendJSON(['health' => $result]);
}

/**
 * GET /api/linkhealth.php/stats - Get health statistics
 */
function handleGetHealthStats() {
    $db = getDB();
    
    $stmt = $db->prepare('
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN health_status = "healthy" THEN 1 ELSE 0 END) as healthy,
            SUM(CASE WHEN health_status = "broken" THEN 1 ELSE 0 END) as broken,
            SUM(CASE WHEN health_status = "timeout" THEN 1 ELSE 0 END) as timeout,
            SUM(CASE WHEN health_status = "restricted" OR health_status = "accessible" THEN 1 ELSE 0 END) as accessible,
            SUM(CASE WHEN health_status = "unknown" OR health_status IS NULL THEN 1 ELSE 0 END) as unknown
        FROM links
    ');
    $stmt->execute();
    $stats = $stmt->fetch();
    
    sendJSON([
        'stats' => [
            'total' => (int)$stats['total'],
            'healthy' => (int)$stats['healthy'],
            'broken' => (int)$stats['broken'],
            'timeout' => (int)$stats['timeout'],
            'accessible' => (int)($stats['accessible'] ?? 0),
            'unknown' => (int)$stats['unknown']
        ]
    ]);
}

/**
 * POST /api/linkhealth.php/check - Check a single link
 */
function handleCheckSingleLink() {
    // Set execution time limit for this specific request
    set_time_limit(3); // Maximum 3 seconds for this script (reduced from 5)
    
    $startTime = microtime(true);
    $healthResult = null;
    $link = null;
    
    try {
        $data = getJSONInput();
        
        if (!isset($data['linkId'])) {
            sendJSON(['error' => 'Link ID is required'], 400);
            return;
        }
        
        // Get link info quickly
        $db = getDB();
        $db->exec('PRAGMA busy_timeout = 500'); // Very short timeout - 500ms max wait
        
        $stmt = $db->prepare('SELECT id, url, health_status, health_http_code FROM links WHERE id = ?');
        $stmt->execute([$data['linkId']]);
        $link = $stmt->fetch();
        
        if (!$link) {
            sendJSON(['error' => 'Link not found'], 404);
            return;
        }
        
        // Always perform a fresh check for individual link health checks
        // This ensures consistent results with the "Check Links" button
        
        // Check the link (this should complete in ~1 second with our timeout)
        $checkStart = microtime(true);
        $healthResult = checkUrlHealth($link['url']);
        $checkTime = microtime(true) - $checkStart;
        
        // Log if check took too long
        if ($checkTime > 1.5) {
            error_log("Slow link check for {$link['url']}: " . number_format($checkTime, 2) . "s");
        }
        
        // Update database in background (non-blocking)
        // Don't wait for DB update - return result immediately
        updateLinkHealth($link['id'], $healthResult);
        
        $totalTime = microtime(true) - $startTime;
        
        sendJSON([
            'success' => true,
            'linkId' => $link['id'],
            'health' => [
                'status' => $healthResult['status'],
                'httpCode' => $healthResult['http_code'],
                'error' => $healthResult['error'],
                'serverLatency' => $healthResult['server_latency'],
                'checkedAt' => time()
            ]
        ]);
    } catch (PDOException $e) {
        error_log('Single link check database error: ' . $e->getMessage());
        // Return health result if we have it, even if DB failed
        if ($healthResult && $link) {
            sendJSON([
                'success' => true,
                'linkId' => $link['id'],
                'health' => [
                    'status' => $healthResult['status'],
                    'httpCode' => $healthResult['http_code'],
                    'error' => $healthResult['error'],
                    'serverLatency' => $healthResult['server_latency'],
                    'checkedAt' => time()
                ]
            ]);
        } else {
            sendJSON(['error' => 'Database error. Please try again.'], 500);
        }
    } catch (Exception $e) {
        error_log('Single link check failed: ' . $e->getMessage());
        // Still return health result if we have it
        if ($healthResult && $link) {
            sendJSON([
                'success' => true,
                'linkId' => $link['id'],
                'health' => [
                    'status' => $healthResult['status'],
                    'httpCode' => $healthResult['http_code'],
                    'error' => $healthResult['error'],
                    'serverLatency' => $healthResult['server_latency'],
                    'checkedAt' => time()
                ]
            ]);
        } else {
            sendJSON(['error' => 'Failed to check link: ' . $e->getMessage()], 500);
        }
    }
}

/**
 * POST /api/linkhealth.php/check-tile - Check all links in a tile
 */
function handleCheckTileLinks() {
    try {
        $data = getJSONInput();
        
        if (!isset($data['tileId'])) {
            sendJSON(['error' => 'Tile ID is required'], 400);
            return;
        }
        
        // Check if force re-check is requested (default to true for "Check Links" button)
        $force = isset($data['force']) ? (bool)$data['force'] : true;
        
        $db = getDB();
        // Set busy timeout to handle concurrent access
        $db->exec('PRAGMA busy_timeout = 3000');
        
        // Get all links for this tile, including last health check info
        $stmt = $db->prepare('
            SELECT l.id, l.url, l.health_status, l.health_http_code, l.health_error, l.health_checked_at
            FROM links l
            JOIN sections s ON l.section_id = s.id
            WHERE s.tile_id = ?
        ');
        $stmt->execute([$data['tileId']]);
        $links = $stmt->fetchAll();
        
        if (empty($links)) {
            sendJSON(['success' => true, 'checked' => 0, 'results' => []]);
            return;
        }
        
        $results = [];
        $now = time();
        $tileMaxAge = 300; // 5 minutes
        
        // Separate links that need checking from those that don't
        // Use array structure to handle duplicate URLs properly
        $linksToCheck = [];
        $urlToLinkIds = []; // Map URL to array of link IDs (handles duplicates)
        
        foreach ($links as $link) {
            $lastChecked = isset($link['health_checked_at']) ? (int)$link['health_checked_at'] : null;
            $currentStatus = $link['health_status'] ?? null;
            
            // If force is true, check all links regardless of when they were last checked
            if ($force) {
                // Force mode: check all links to ensure fresh results
                // Add to check queue
                if (!isset($urlToLinkIds[$link['url']])) {
                    $urlToLinkIds[$link['url']] = [];
                    $linksToCheck[] = $link['url'];
                }
                $urlToLinkIds[$link['url']][] = $link['id'];
            } else {
                // Non-force mode: skip recently checked links
                if ($lastChecked !== null && ($now - $lastChecked) < $tileMaxAge && !empty($currentStatus)) {
                    // Recently checked - return existing health info
                    $results[$link['id']] = [
                        'status' => $currentStatus,
                        'httpCode' => $link['health_http_code'] ? (int)$link['health_http_code'] : null,
                        'error' => $link['health_error'],
                        'checkedAt' => $lastChecked
                    ];
                } else {
                    // Needs a fresh check - add to batch
                    if (!isset($urlToLinkIds[$link['url']])) {
                        $urlToLinkIds[$link['url']] = [];
                        $linksToCheck[] = $link['url'];
                    }
                    $urlToLinkIds[$link['url']][] = $link['id'];
                }
            }
        }
        
        // Check all URLs in parallel (much faster!)
        if (!empty($linksToCheck)) {
            $healthResults = checkUrlsParallel($linksToCheck, 5); // Check 5 at a time
            
            // Prepare batch update
            $batchUpdates = [];
            foreach ($healthResults as $url => $healthResult) {
                // Handle multiple links with the same URL
                if (isset($urlToLinkIds[$url])) {
                    foreach ($urlToLinkIds[$url] as $linkId) {
                        $batchUpdates[$linkId] = $healthResult;
                        
                        $results[$linkId] = [
                            'status' => $healthResult['status'],
                            'httpCode' => $healthResult['http_code'],
                            'error' => $healthResult['error'],
                            'serverLatency' => $healthResult['server_latency'],
                            'checkedAt' => $now
                        ];
                    }
                }
            }
            
            // Batch update database (faster than individual updates)
            updateLinkHealthBatch($batchUpdates);
        }
        
        sendJSON([
            'success' => true,
            'checked' => count($links),
            'results' => $results
        ]);
    } catch (PDOException $e) {
        error_log('Tile link check database error: ' . $e->getMessage());
        sendJSON(['error' => 'Database error. Please try again.'], 500);
    } catch (Exception $e) {
        error_log('Tile link check failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to check tile links: ' . $e->getMessage()], 500);
    }
}

/**
 * POST /api/linkhealth.php/check-all - Check all links (admin only)
 */
function handleCheckAllLinks() {
    requireAuth(); // Require authentication for bulk check
    
    $data = getJSONInput();
    $forceRecheck = $data['force'] ?? false;
    $maxAge = $data['maxAge'] ?? 3600; // Default: recheck if older than 1 hour
    
    $db = getDB();
    
    // Get links that need checking
    if ($forceRecheck) {
        $stmt = $db->prepare('SELECT id, url FROM links');
        $stmt->execute();
    } else {
        // Only check links that haven't been checked recently
        $cutoff = time() - $maxAge;
        $stmt = $db->prepare('SELECT id, url FROM links WHERE health_checked_at IS NULL OR health_checked_at < ?');
        $stmt->execute([$cutoff]);
    }
    
    $links = $stmt->fetchAll();
    
    if (empty($links)) {
        sendJSON(['success' => true, 'checked' => 0, 'message' => 'All links are up to date']);
        return;
    }
    
    // Prepare URLs for parallel checking
    // Use array structure to handle duplicate URLs properly
    $urls = [];
    $urlToLinkIds = []; // Map URL to array of link IDs (handles duplicates)
    foreach ($links as $link) {
        if (!isset($urlToLinkIds[$link['url']])) {
            $urlToLinkIds[$link['url']] = [];
            $urls[] = $link['url'];
        }
        $urlToLinkIds[$link['url']][] = $link['id'];
    }
    
    // Check all URLs in parallel (process in batches of 10 for very large sets)
    $batchSize = 10;
    $allHealthResults = [];
    
    for ($i = 0; $i < count($urls); $i += $batchSize) {
        $batch = array_slice($urls, $i, $batchSize);
        $batchResults = checkUrlsParallel($batch, 5);
        $allHealthResults = array_merge($allHealthResults, $batchResults);
    }
    
    // Prepare batch update
    $batchUpdates = [];
    $results = [
        'healthy' => 0,
        'broken' => 0,
        'timeout' => 0,
        'unknown' => 0,
        'restricted' => 0
    ];
    
    foreach ($allHealthResults as $url => $healthResult) {
        // Handle multiple links with the same URL
        if (isset($urlToLinkIds[$url])) {
            foreach ($urlToLinkIds[$url] as $linkId) {
                $batchUpdates[$linkId] = $healthResult;
                
                $status = $healthResult['status'];
                if (isset($results[$status])) {
                    $results[$status]++;
                } else {
                    $results['unknown']++;
                }
            }
        }
    }
    
    // Batch update database (much faster than individual updates)
    updateLinkHealthBatch($batchUpdates);
    
    sendJSON([
        'success' => true,
        'checked' => count($links),
        'results' => $results
    ]);
}


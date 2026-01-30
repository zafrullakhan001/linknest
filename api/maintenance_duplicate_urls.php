<?php
/**
 * Duplicate URLs Report API
 * Finds links that share the same URL. Admin only. Read-only.
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

    // Find URLs that appear more than once
    $duplicateRows = $db->query("
        SELECT url, COUNT(*) AS count
        FROM links
        WHERE url IS NOT NULL AND TRIM(url) != ''
        GROUP BY url
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    $totalDuplicateUrls = count($duplicateRows);
    $totalDuplicateLinks = 0;
    $duplicateUrlsList = [];
    foreach ($duplicateRows as $row) {
        $totalDuplicateLinks += (int) $row['count'];
        $duplicateUrlsList[] = $row['url'];
    }

    // Limit to first 100 URLs for detail fetch
    $duplicateUrlsList = array_slice($duplicateUrlsList, 0, 100);
    $truncated = $totalDuplicateUrls > 100;

    $duplicates = [];
    if (!empty($duplicateUrlsList)) {
        $placeholders = implode(',', array_fill(0, count($duplicateUrlsList), '?'));
        $stmt = $db->prepare("
            SELECT l.url, l.id AS link_id, t.id AS tile_id, t.title AS tile_title, t.user_id, u.username
            FROM links l
            JOIN sections s ON s.id = l.section_id
            JOIN tiles t ON t.id = s.tile_id
            LEFT JOIN users u ON u.id = t.user_id
            WHERE l.url IN ({$placeholders})
            ORDER BY l.url, COALESCE(u.username, ''), t.title
        ");
        $stmt->execute($duplicateUrlsList);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Group by url -> by username -> tiles (unique tile_id + title)
        $byUrl = [];
        foreach ($rows as $r) {
            $url = $r['url'];
            $username = $r['username'] ?? 'Unknown';
            $tileId = $r['tile_id'];
            $tileTitle = $r['tile_title'] ?? 'Untitled';
            if (!isset($byUrl[$url])) {
                $byUrl[$url] = ['count' => 0, 'by_user' => []];
            }
            $byUrl[$url]['count'] = ($byUrl[$url]['count'] ?? 0) + 1;
            if (!isset($byUrl[$url]['by_user'][$username])) {
                $byUrl[$url]['by_user'][$username] = ['username' => $username, 'tiles' => []];
            }
            $tiles = &$byUrl[$url]['by_user'][$username]['tiles'];
            $found = false;
            foreach ($tiles as $t) {
                if ($t['tile_id'] === $tileId) {
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                $tiles[] = ['tile_id' => $tileId, 'tile_title' => $tileTitle];
            }
        }
        foreach ($byUrl as $url => $data) {
            $duplicates[] = [
                'url' => $url,
                'count' => $data['count'],
                'by_user' => array_values($data['by_user']),
            ];
        }
        // Sort by count descending
        usort($duplicates, function ($a, $b) {
            return $b['count'] - $a['count'];
        });
    }

    echo json_encode([
        'success' => true,
        'duplicate_urls_count' => $totalDuplicateUrls,
        'duplicate_links_count' => $totalDuplicateLinks,
        'duplicates' => $duplicates,
        'truncated' => $truncated,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Report failed: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

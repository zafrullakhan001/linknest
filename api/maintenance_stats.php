<?php
/**
 * Tile & Link Statistics API
 * Returns counts for tiles, links, sections, tabs, users, categories. Admin only.
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

    $filterUserId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : null;
    $filterByUser = ($filterUserId > 0);

    // User list for dropdown (id, username, is_admin for impersonation button)
    $usersList = $db->query('SELECT id, username, is_admin FROM users ORDER BY username ASC')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($usersList as &$u) {
        $u['is_admin'] = !empty($u['is_admin']);
    }
    unset($u);

    $stats = [];

    if (!$filterByUser) {
        // Global stats (all users)
        $tables = [
            'tiles' => 'tiles',
            'links' => 'links',
            'sections' => 'sections',
            'tabs' => 'tabs',
            'users' => 'users',
            'categories' => 'category_arrangements',
        ];
        foreach ($tables as $key => $table) {
            try {
                if ($key === 'categories') {
                    $stmt = $db->query('SELECT COUNT(DISTINCT category_name) FROM category_arrangements');
                } else {
                    $stmt = $db->query("SELECT COUNT(*) FROM {$table}");
                }
                $stats[$key] = (int) $stmt->fetchColumn();
            } catch (PDOException $e) {
                $stats[$key] = 0;
            }
        }
        try {
            $top = $db->query("SELECT \"group\" AS name, COUNT(*) AS count FROM tiles WHERE \"group\" IS NOT NULL AND \"group\" != '' GROUP BY \"group\" ORDER BY count DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
            $stats['top_categories'] = $top;
        } catch (PDOException $e) {
            $stats['top_categories'] = [];
        }
        try {
            $linkStats = $db->query("
                SELECT
                    COUNT(DISTINCT t.id) AS tiles_with_links,
                    COALESCE(SUM(cnt.c), 0) AS total_links,
                    COALESCE(ROUND(AVG(cnt.c), 1), 0) AS avg_links_per_tile
                FROM tiles t
                LEFT JOIN (
                    SELECT s.tile_id, COUNT(l.id) AS c
                    FROM sections s
                    LEFT JOIN links l ON l.section_id = s.id
                    GROUP BY s.tile_id
                ) cnt ON cnt.tile_id = t.id
            ")->fetch(PDO::FETCH_ASSOC);
            $stats['tiles_with_links'] = (int) ($linkStats['tiles_with_links'] ?? 0);
            $stats['total_links'] = (int) ($linkStats['total_links'] ?? 0);
            $stats['avg_links_per_tile'] = (float) ($linkStats['avg_links_per_tile'] ?? 0);
        } catch (PDOException $e) {
            $stats['tiles_with_links'] = 0;
            $stats['total_links'] = (int) ($stats['links'] ?? 0);
            $stats['avg_links_per_tile'] = 0;
        }
    } else {
        // Filter by user_id: only tiles owned by this user (and their links/sections/tabs)
        $uid = (int) $filterUserId;
        try {
            $stmt = $db->prepare('SELECT COUNT(*) FROM tiles WHERE user_id = ?');
            $stmt->execute([$uid]);
            $stats['tiles'] = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            $stats['tiles'] = 0;
        }
        try {
            $stmt = $db->prepare('SELECT COUNT(*) FROM sections WHERE tile_id IN (SELECT id FROM tiles WHERE user_id = ?)');
            $stmt->execute([$uid]);
            $stats['sections'] = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            $stats['sections'] = 0;
        }
        try {
            $stmt = $db->prepare('SELECT COUNT(*) FROM tabs WHERE tile_id IN (SELECT id FROM tiles WHERE user_id = ?)');
            $stmt->execute([$uid]);
            $stats['tabs'] = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            $stats['tabs'] = 0;
        }
        try {
            $stmt = $db->prepare('SELECT COUNT(*) FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id IN (SELECT id FROM tiles WHERE user_id = ?))');
            $stmt->execute([$uid]);
            $stats['links'] = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            $stats['links'] = 0;
        }
        $stats['users'] = 1;
        try {
            $stmt = $db->prepare("SELECT COUNT(DISTINCT \"group\") FROM tiles WHERE user_id = ? AND \"group\" IS NOT NULL AND \"group\" != ''");
            $stmt->execute([$uid]);
            $stats['categories'] = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            $stats['categories'] = 0;
        }
        try {
            $stmt = $db->prepare("SELECT \"group\" AS name, COUNT(*) AS count FROM tiles WHERE user_id = ? AND \"group\" IS NOT NULL AND \"group\" != '' GROUP BY \"group\" ORDER BY count DESC LIMIT 10");
            $stmt->execute([$uid]);
            $stats['top_categories'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            $stats['top_categories'] = [];
        }
        try {
            $stmt = $db->prepare("
                SELECT
                    COUNT(DISTINCT t.id) AS tiles_with_links,
                    COALESCE(SUM(cnt.c), 0) AS total_links,
                    COALESCE(ROUND(AVG(cnt.c), 1), 0) AS avg_links_per_tile
                FROM tiles t
                LEFT JOIN (
                    SELECT s.tile_id, COUNT(l.id) AS c
                    FROM sections s
                    LEFT JOIN links l ON l.section_id = s.id
                    GROUP BY s.tile_id
                ) cnt ON cnt.tile_id = t.id
                WHERE t.user_id = ?
            ");
            $stmt->execute([$uid]);
            $linkStats = $stmt->fetch(PDO::FETCH_ASSOC);
            $stats['tiles_with_links'] = (int) ($linkStats['tiles_with_links'] ?? 0);
            $stats['total_links'] = (int) ($linkStats['total_links'] ?? 0);
            $stats['avg_links_per_tile'] = (float) ($linkStats['avg_links_per_tile'] ?? 0);
        } catch (PDOException $e) {
            $stats['tiles_with_links'] = 0;
            $stats['total_links'] = (int) ($stats['links'] ?? 0);
            $stats['avg_links_per_tile'] = 0;
        }
    }

    // Per-user stats for heat map (only when not filtering by one user)
    $by_user = [];
    if (!$filterByUser) {
        try {
            $by_user = $db->query("
                SELECT
                    u.id AS user_id,
                    u.username,
                    (SELECT COUNT(*) FROM tiles t WHERE t.user_id = u.id) AS tiles,
                    (SELECT COUNT(*) FROM sections s WHERE s.tile_id IN (SELECT id FROM tiles WHERE user_id = u.id)) AS sections,
                    (SELECT COUNT(*) FROM tabs t WHERE t.tile_id IN (SELECT id FROM tiles WHERE user_id = u.id)) AS tabs,
                    (SELECT COUNT(*) FROM links l WHERE l.section_id IN (SELECT id FROM sections WHERE tile_id IN (SELECT id FROM tiles WHERE user_id = u.id))) AS links
                FROM users u
                ORDER BY tiles DESC, links DESC
            ")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($by_user as &$row) {
                $row['tiles'] = (int) $row['tiles'];
                $row['sections'] = (int) $row['sections'];
                $row['tabs'] = (int) $row['tabs'];
                $row['links'] = (int) $row['links'];
            }
            unset($row);
        } catch (PDOException $e) {
            $by_user = [];
        }
    }

    $filteredByUsername = null;
    if ($filterByUser) {
        foreach ($usersList as $u) {
            if ((int) $u['id'] === $filterUserId) {
                $filteredByUsername = $u['username'];
                break;
            }
        }
    }

    echo json_encode([
        'success' => true,
        'stats' => $stats,
        'users' => $usersList,
        'by_user' => $by_user,
        'filtered_by_user_id' => $filterByUser ? $filterUserId : null,
        'filtered_by_username' => $filteredByUsername,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Stats failed: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

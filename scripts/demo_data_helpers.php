<?php
/**
 * Shared helpers for LinkNest demo data generation scripts.
 * Compatible with PHP 8+ and current SQLite schema (v74+).
 */

declare(strict_types=1);

/**
 * Require CLI execution and an explicit --yes / --confirm flag.
 * Destructive seed scripts must not be runnable via the web server.
 */
function demoDataRequireCliConfirmation(string $scriptLabel): void
{
    if (PHP_SAPI !== 'cli') {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo "This script can only be run from the command line.\n";
        echo "Usage: php scripts/" . basename($_SERVER['SCRIPT_FILENAME'] ?? 'generate_demo_data.php') . " --yes\n";
        exit(1);
    }

    global $argv;
    $args = $argv ?? [];
    $confirmed = in_array('--yes', $args, true) || in_array('--confirm', $args, true);

    if (!$confirmed) {
        fwrite(STDERR, "WARNING: {$scriptLabel} DELETES existing tiles, links, monitors, and related data.\n");
        fwrite(STDERR, "Backup your database first, then re-run with --yes to proceed.\n");
        fwrite(STDERR, "Example: php " . ($args[0] ?? 'scripts/generate_demo_data.php') . " --yes\n");
        exit(1);
    }
}

/**
 * Tables cleared before reseeding demo content (FK-safe order; missing tables are skipped).
 *
 * @return list<string>
 */
function demoDataTablesToClear(): array
{
    return [
        'monitor_logs',
        'user_monitor_permissions',
        'monitor_notification_logs',
        'monitor_notification_recipients',
        'monitor_notification_rules',
        'email_outbox',
        'monitors',
        'user_link_favorites',
        'user_tile_favorites',
        'user_tile_permissions',
        'tile_share_invitations',
        'tile_visits',
        'tile_versions',
        'tile_messages',
        'rich_text_content',
        'links',
        'sections',
        'tabs',
        'tile_arrangements',
        'category_arrangements',
        'tiles',
    ];
}

/**
 * Clear demo-related tables. Continues if a table is missing.
 */
function demoDataClearTables(PDO $db): void
{
    echo "Clearing existing data...\n";

    foreach (demoDataTablesToClear() as $table) {
        try {
            $db->exec("DELETE FROM {$table}");
            echo "  Cleared {$table}\n";
        } catch (PDOException $e) {
            echo "  Warning: Could not clear {$table}: " . $e->getMessage() . "\n";
        }
    }

    try {
        $db->exec('DELETE FROM sqlite_sequence WHERE name = "monitors"');
    } catch (PDOException $e) {
        // Sequence row may not exist yet
    }
}

/**
 * Seed global category order for the five demo groups.
 *
 * @param list<string> $categories
 */
function demoDataSeedCategoryArrangements(PDO $db, array $categories = [
    'Main',
    'Development',
    'Infrastructure',
    'Collaboration',
    'Resources',
]): void
{
    echo "Creating category arrangements...\n";

    $stmt = $db->prepare('
        INSERT INTO category_arrangements (user_id, category_name, position)
        VALUES (0, ?, ?)
    ');

    foreach ($categories as $position => $name) {
        $stmt->execute([$name, $position]);
    }

    echo '  Categories: ' . count($categories) . "\n";
}

/**
 * Insert tabs/sections with prepared statements (visibility + published defaults).
 *
 * @param array<string, array<string, list<array{id: string, title: string}>>> $tileStructure
 * @return array<string, true>
 */
function demoDataCreateTabsAndSections(PDO $db, array $tileStructure): array
{
    $tabStmt = $db->prepare('
        INSERT INTO tabs (id, tile_id, title, position, visibility, published)
        VALUES (?, ?, ?, 0, \'public\', 1)
    ');
    $sectionStmt = $db->prepare('
        INSERT INTO sections (id, tile_id, tab_id, title, position, visibility, published)
        VALUES (?, ?, ?, ?, ?, \'public\', 1)
    ');

    $tabSectionMap = [];
    foreach ($tileStructure as $tileId => $tabs) {
        foreach ($tabs as $tabTitle => $sections) {
            $tabId = 'tab_' . $tileId . '_' . strtolower(str_replace(' ', '_', $tabTitle));
            $tabStmt->execute([$tabId, $tileId, $tabTitle]);

            foreach ($sections as $pos => $sec) {
                $sectionStmt->execute([$sec['id'], $tileId, $tabId, $sec['title'], $pos]);
                $tabSectionMap[$sec['id']] = true;
            }
        }
    }

    return $tabSectionMap;
}

/**
 * App-tab IDs allowed for demo roles (aligned with api/roles.php $validTabIds).
 * Public is intentionally omitted so role users cannot see the public tab.
 *
 * @return list<string>
 */
function demoDataAllowedAppTabs(): array
{
    return [
        'public',
        'your-apps',
        'favorites',
        'private',
        'scheduled',
        'expired',
        'archive',
        'recycle-bin',
        'monitoring',
    ];
}

/**
 * Demo tile visibility buckets (how spaces appear in the UI).
 *
 * - public         → Public tab (guests + everyone)
 * - authenticated  → Your Apps → Authenticated (all signed-in users)
 * - private        → Your Apps → Your Assigned Apps when granted via roles
 *                    (not listed on Public; role access unlocks them)
 *
 * @return array<string, 'public'|'authenticated'|'private'>
 */
function demoDataTileVisibilityMap(): array
{
    return [
        // —— Public / guest showcase ——
        'tile_dashboard' => 'public',
        'tile_analytics' => 'public',
        'tile_customer_portal' => 'public',
        'tile_calendar' => 'public',
        'tile_documentation' => 'public',
        'tile_training' => 'public',
        'tile_library' => 'public',
        'tile_support' => 'public',

        // —— Authenticated (every signed-in user) ——
        'tile_hr_portal' => 'authenticated',
        'tile_communication' => 'authenticated',
        'tile_project_mgmt' => 'authenticated',
        'tile_file_sharing' => 'authenticated',
        'tile_whiteboard' => 'authenticated',

        // —— Role-assigned only (Your Assigned Apps) ——
        'tile_finance' => 'private',
        'tile_dev_tools' => 'private',
        'tile_code_repos' => 'private',
        'tile_cicd' => 'private',
        'tile_testing' => 'private',
        'tile_api_gateway' => 'private',
        'tile_cloud_services' => 'private',
        'tile_servers' => 'private',
        'tile_databases' => 'private',
        'tile_networking' => 'private',
        'tile_security' => 'private',
        'tile_forms' => 'private',
    ];
}

function demoDataResolveTileVisibility(string $tileId): string
{
    $map = demoDataTileVisibilityMap();
    return $map[$tileId] ?? 'public';
}

/**
 * Role → tile IDs for Your Assigned Apps (private bucket only).
 *
 * @return array<string, list<string>>
 */
function demoDataRoleTileAssignments(): array
{
    return [
        'Manager' => [
            'tile_finance', 'tile_forms', 'tile_cloud_services', 'tile_servers', 'tile_databases',
        ],
        'Developer' => [
            'tile_dev_tools', 'tile_code_repos', 'tile_cicd', 'tile_testing', 'tile_api_gateway',
            'tile_cloud_services', 'tile_servers', 'tile_databases', 'tile_networking', 'tile_security',
        ],
        'Designer' => [
            'tile_dev_tools', 'tile_code_repos', 'tile_cicd', 'tile_testing', 'tile_api_gateway', 'tile_forms',
        ],
        'Support' => [
            'tile_forms', 'tile_servers', 'tile_networking', 'tile_security', 'tile_api_gateway',
        ],
        'Viewer' => [
            'tile_finance', 'tile_forms',
        ],
        'Editor' => [
            'tile_finance', 'tile_forms', 'tile_cicd', 'tile_testing', 'tile_dev_tools',
        ],
        'HR' => [
            'tile_finance', 'tile_forms',
        ],
        'Finance' => [
            'tile_finance', 'tile_forms', 'tile_databases',
        ],
        'Guest' => [
            'tile_forms',
        ],
        'Auditor' => [
            'tile_finance', 'tile_forms', 'tile_security', 'tile_databases', 'tile_code_repos', 'tile_servers',
        ],
    ];
}

/**
 * Human-readable summary of demo visibility buckets (for CLI + docs).
 *
 * @return array{public: int, authenticated: int, private: int}
 */
function demoDataVisibilityCounts(): array
{
    $counts = ['public' => 0, 'authenticated' => 0, 'private' => 0];
    foreach (demoDataTileVisibilityMap() as $visibility) {
        if (isset($counts[$visibility])) {
            $counts[$visibility]++;
        }
    }
    return $counts;
}


/**
 * Demo user notes (role / org context for admins).
 *
 * @return array<string, string> email => notes
 */
function demoDataUserNotesByEmail(): array
{
    return [
        'demo1@demo.local' => 'Manager — oversees team operations and project delivery. Demo role for leadership viewing Finance + infrastructure spaces in Your Assigned Apps.',
        'demo2@demo.local' => 'Developer — software engineer. Full Development and Infrastructure toolset in Your Assigned Apps (repos, CI/CD, cloud, servers).',
        'demo3@demo.local' => 'Designer — UI/UX. Assigned design/engineering spaces: repositories, CI/CD, testing, API management, and forms.',
        'demo4@demo.local' => 'Support — IT helpdesk / customer support. Assigned forms, servers, networking, security, and API spaces.',
        'demo5@demo.local' => 'Viewer — read-oriented staff. Minimal assigned access (Finance + Forms) plus shared Authenticated spaces.',
        'demo6@demo.local' => 'Editor — content and process updates. Assigned Finance, Forms, CI/CD, testing, and development tools.',
        'demo7@demo.local' => 'HR — human resources. Assigned Finance and Forms; also sees shared Authenticated staff spaces (HR Portal, collaboration).',
        'demo8@demo.local' => 'Finance — accounting and budgeting. Assigned Finance Center, Forms, and Databases.',
        'demo9@demo.local' => 'Guest role — limited access. Your Assigned Apps is minimal (Forms only); use to demo sparse role grants.',
        'demo10@demo.local' => 'Auditor — compliance and review. Assigned Finance, Forms, Security, Databases, Code Repositories, and Servers.',
    ];
}

/**
 * Map each shared demo tile to a demo user email (owner).
 * Used by the maintenance heat map, which counts tiles/links/sections/tabs by tiles.user_id.
 *
 * @return array<string, string> tile_id => owner email
 */
function demoDataTileOwnerEmails(): array
{
    return [
        'tile_dashboard' => 'demo1@demo.local',
        'tile_analytics' => 'demo1@demo.local',
        'tile_hr_portal' => 'demo1@demo.local',
        'tile_finance' => 'demo2@demo.local',
        'tile_customer_portal' => 'demo2@demo.local',
        'tile_dev_tools' => 'demo2@demo.local',
        'tile_code_repos' => 'demo3@demo.local',
        'tile_cicd' => 'demo3@demo.local',
        'tile_testing' => 'demo3@demo.local',
        'tile_api_gateway' => 'demo4@demo.local',
        'tile_cloud_services' => 'demo4@demo.local',
        'tile_servers' => 'demo4@demo.local',
        'tile_databases' => 'demo5@demo.local',
        'tile_networking' => 'demo5@demo.local',
        'tile_security' => 'demo5@demo.local',
        'tile_communication' => 'demo6@demo.local',
        'tile_project_mgmt' => 'demo6@demo.local',
        'tile_file_sharing' => 'demo7@demo.local',
        'tile_whiteboard' => 'demo7@demo.local',
        'tile_calendar' => 'demo8@demo.local',
        'tile_documentation' => 'demo8@demo.local',
        'tile_training' => 'demo9@demo.local',
        'tile_library' => 'demo9@demo.local',
        'tile_forms' => 'demo10@demo.local',
        'tile_support' => 'demo10@demo.local',
    ];
}

/**
 * Resolve tile owner user id from the demo owner map.
 *
 * @param array<string, int> $userIdsByEmail email => user id
 */
function demoDataResolveTileOwnerId(string $tileId, array $userIdsByEmail, int $fallbackUserId): int
{
    $owners = demoDataTileOwnerEmails();
    $email = $owners[$tileId] ?? null;
    if ($email !== null && isset($userIdsByEmail[$email])) {
        return (int) $userIdsByEmail[$email];
    }
    return $fallbackUserId;
}

/**
 * Grant each demo user edit rights on tiles they own, and view rights on their role tile set.
 *
 * @param array<string, int> $roleIds
 * @param array<string, int> $userIdsByEmail
 * @param array<string, list<string>> $roleTiles role name => tile ids
 * @param list<array{email: string, role: string}> $demoUsers
 */
function demoDataAssignUserTilePermissions(
    PDO $db,
    array $roleIds,
    array $userIdsByEmail,
    array $roleTiles,
    array $demoUsers,
    int $currentTime
): void {
    echo "Assigning per-user tile permissions (owned spaces + role access)...\n";

    $deleteStmt = $db->prepare('DELETE FROM user_tile_permissions WHERE user_id = ?');
    $insertStmt = $db->prepare('
        INSERT INTO user_tile_permissions (
            user_id, tile_id, can_view, can_edit, can_delete,
            can_add_links, can_add_sections, can_add_tabs, can_edit_links,
            can_delete_links, can_delete_sections, can_delete_tabs,
            can_change_visibility, can_change_browser, can_clone_tile,
            can_view_tile_info, can_edit_tile, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?, 1, 1, 1, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ');

    $owners = demoDataTileOwnerEmails();
    $ownedByUser = [];
    foreach ($owners as $tileId => $email) {
        if (!isset($userIdsByEmail[$email])) {
            continue;
        }
        $uid = $userIdsByEmail[$email];
        $ownedByUser[$uid][$tileId] = true;
    }

    foreach ($demoUsers as $u) {
        $uid = $userIdsByEmail[$u['email']] ?? null;
        if ($uid === null) {
            continue;
        }
        $deleteStmt->execute([$uid]);

        $roleName = $u['role'];
        $tileSet = $roleTiles[$roleName] ?? [];
        $permTiles = [];
        foreach ($tileSet as $tileId) {
            $permTiles[$tileId] = true;
        }
        foreach (array_keys($ownedByUser[$uid] ?? []) as $tileId) {
            $permTiles[$tileId] = true;
        }

        foreach (array_keys($permTiles) as $tileId) {
            $isOwner = isset($ownedByUser[$uid][$tileId]);
            $canEdit = $isOwner ? 1 : 0;
            $canDelete = $isOwner ? 1 : 0;
            $insertStmt->execute([
                $uid,
                $tileId,
                $canEdit,
                $canDelete,
                $isOwner ? 1 : 0, // can_delete_links
                $isOwner ? 1 : 0, // can_delete_sections
                $isOwner ? 1 : 0, // can_delete_tabs
                $isOwner ? 1 : 0, // can_change_visibility
                $isOwner ? 1 : 0, // can_change_browser
                $isOwner ? 1 : 0, // can_clone_tile
                $canEdit,         // can_edit_tile
                $currentTime,
                $currentTime,
            ]);
        }
    }

    echo "  Per-user tile permissions assigned.\n";
}

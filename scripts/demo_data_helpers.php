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

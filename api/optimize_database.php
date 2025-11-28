<?php
/**
 * Database Optimization Script
 * 
 * This script creates indexes and optimizes the database for better performance.
 * Run this script once to optimize your database.
 * 
 * Usage: php optimize_database.php
 * Or access via web: http://your-domain/api/optimize_database.php
 */

require_once __DIR__ . '/config.php';

// Set execution time limit for optimization
set_time_limit(60);

header('Content-Type: application/json; charset=utf-8');

try {
    $db = getDB();
    
    // Enable WAL mode for better concurrent access
    $db->exec('PRAGMA journal_mode = WAL');
    
    // Set page size for better performance (if not already set)
    $db->exec('PRAGMA page_size = 4096');
    
    // Enable foreign keys
    $db->exec('PRAGMA foreign_keys = ON');
    
    // Set synchronous mode to NORMAL for better performance (WAL mode makes this safe)
    $db->exec('PRAGMA synchronous = NORMAL');
    
    // Set cache size to 10MB for better performance
    $db->exec('PRAGMA cache_size = -10000'); // Negative value = KB, so -10000 = 10MB
    
    // Set temp_store to memory for better performance
    $db->exec('PRAGMA temp_store = MEMORY');
    
    // Begin transaction for all index creation
    $db->beginTransaction();
    
    $indexesCreated = [];
    $indexesSkipped = [];
    $errors = [];
    
    // ============================================
    // USERS TABLE INDEXES
    // ============================================
    
    // Index on is_approved (used in WHERE is_approved = 0/1 queries)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved)');
        $indexesCreated[] = 'idx_users_is_approved';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_users_is_approved: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_users_is_approved';
        }
    }
    
    // Index on is_admin (used in WHERE is_admin = 1 queries)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin)');
        $indexesCreated[] = 'idx_users_is_admin';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_users_is_admin: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_users_is_admin';
        }
    }
    
    // Composite index on is_approved and is_admin (for queries filtering both)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_approved_admin ON users(is_approved, is_admin)');
        $indexesCreated[] = 'idx_users_approved_admin';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_users_approved_admin: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_users_approved_admin';
        }
    }
    
    // Index on created_at (used in ORDER BY created_at DESC queries)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)');
        $indexesCreated[] = 'idx_users_created_at';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_users_created_at: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_users_created_at';
        }
    }
    
    // ============================================
    // TILES TABLE INDEXES
    // ============================================
    
    // Index on user_id (foreign key, used in WHERE user_id = ? queries)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tiles_user_id ON tiles(user_id)');
        $indexesCreated[] = 'idx_tiles_user_id';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_tiles_user_id: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_tiles_user_id';
        }
    }
    
    // Index on position (used in ORDER BY position ASC queries - most common query)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tiles_position ON tiles(position ASC)');
        $indexesCreated[] = 'idx_tiles_position';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_tiles_position: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_tiles_position';
        }
    }
    
    // ============================================
    // SECTIONS TABLE INDEXES
    // ============================================
    
    // Index on tile_id (foreign key, used in WHERE tile_id = ? queries - very common)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_sections_tile_id ON sections(tile_id)');
        $indexesCreated[] = 'idx_sections_tile_id';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_sections_tile_id: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_sections_tile_id';
        }
    }
    
    // ============================================
    // LINKS TABLE INDEXES
    // ============================================
    
    // Index on section_id (foreign key, used in WHERE section_id = ? queries - very common)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_section_id ON links(section_id)');
        $indexesCreated[] = 'idx_links_section_id';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_links_section_id: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_links_section_id';
        }
    }
    
    // Index on health_checked_at (used in WHERE health_checked_at IS NULL OR health_checked_at < ? queries)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_health_checked_at ON links(health_checked_at)');
        $indexesCreated[] = 'idx_links_health_checked_at';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_links_health_checked_at: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_links_health_checked_at';
        }
    }
    
    // Index on health_status (used in health statistics queries)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_health_status ON links(health_status)');
        $indexesCreated[] = 'idx_links_health_status';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_links_health_status: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_links_health_status';
        }
    }
    
    // Composite index for health queries (status and checked_at together)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_health_composite ON links(health_status, health_checked_at)');
        $indexesCreated[] = 'idx_links_health_composite';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_links_health_composite: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_links_health_composite';
        }
    }
    
    // ============================================
    // TILE_ARRANGEMENTS TABLE INDEXES
    // ============================================
    
    // Index on user_id (used in WHERE user_id = 0 queries)
    // Note: Composite primary key already covers (user_id, tile_id), but separate index helps
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_arrangements_user_id ON tile_arrangements(user_id)');
        $indexesCreated[] = 'idx_tile_arrangements_user_id';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_tile_arrangements_user_id: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_tile_arrangements_user_id';
        }
    }
    
    // Index on position for ordering
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_arrangements_position ON tile_arrangements(user_id, position)');
        $indexesCreated[] = 'idx_tile_arrangements_position';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_tile_arrangements_position: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_tile_arrangements_position';
        }
    }
    
    // ============================================
    // CATEGORY_ARRANGEMENTS TABLE INDEXES
    // ============================================
    
    // Index on user_id (used in WHERE user_id = 0 queries)
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_category_arrangements_user_id ON category_arrangements(user_id)');
        $indexesCreated[] = 'idx_category_arrangements_user_id';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_category_arrangements_user_id: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_category_arrangements_user_id';
        }
    }
    
    // Index on position for ordering
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_category_arrangements_position ON category_arrangements(user_id, position)');
        $indexesCreated[] = 'idx_category_arrangements_position';
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = 'idx_category_arrangements_position: ' . $e->getMessage();
        } else {
            $indexesSkipped[] = 'idx_category_arrangements_position';
        }
    }
    
    // Commit all index creations
    $db->commit();
    
    // Analyze the database to update statistics for query planner
    $db->exec('ANALYZE');
    
    // Get database statistics
    $stats = [
        'page_count' => $db->query('PRAGMA page_count')->fetchColumn(),
        'page_size' => $db->query('PRAGMA page_size')->fetchColumn(),
        'cache_size' => $db->query('PRAGMA cache_size')->fetchColumn(),
        'journal_mode' => $db->query('PRAGMA journal_mode')->fetchColumn(),
        'synchronous' => $db->query('PRAGMA synchronous')->fetchColumn(),
    ];
    
    // Get all indexes
    $allIndexes = $db->query("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    
    $result = [
        'success' => true,
        'message' => 'Database optimization completed successfully',
        'indexes_created' => count($indexesCreated),
        'indexes_skipped' => count($indexesSkipped),
        'indexes_list' => $indexesCreated,
        'indexes_skipped_list' => $indexesSkipped,
        'total_indexes' => count($allIndexes),
        'all_indexes' => $allIndexes,
        'database_stats' => $stats,
        'errors' => $errors
    ];
    
    if (!empty($errors)) {
        $result['warning'] = 'Some indexes had errors (see errors array)';
    }
    
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
} catch (PDOException $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database optimization failed: ' . $e->getMessage(),
        'code' => $e->getCode()
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Optimization failed: ' . $e->getMessage()
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}















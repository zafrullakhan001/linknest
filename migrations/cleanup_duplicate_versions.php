<?php
/**
 * Cleanup Script - Remove Duplicate Versions
 * This script removes duplicate versions from the database
 * keeping only the oldest version when duplicates are found
 */

require_once __DIR__ . '/../api/config.php';

try {
    $db = getDB();
    
    echo "Starting duplicate version cleanup...\n\n";
    
    // Get all tiles that have versions
    $stmt = $db->query("SELECT DISTINCT tile_id FROM tile_versions WHERE is_temp = 0 ORDER BY tile_id");
    $tileIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $totalDuplicatesRemoved = 0;
    $tilesProcessed = 0;
    
    foreach ($tileIds as $tileId) {
        echo "Processing tile: $tileId\n";
        
        // Get all versions for this tile (excluding temp, ordered by version number)
        $stmt = $db->prepare('SELECT id, version_number, tile_data, is_locked FROM tile_versions WHERE tile_id = ? AND is_temp = 0 ORDER BY version_number ASC');
        $stmt->execute([$tileId]);
        $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($versions) < 2) {
            echo "  - Only 1 version, skipping\n";
            continue;
        }
        
        $duplicatesToDelete = [];
        $seenData = [];
        
        // Track which data we've seen (keeping the first occurrence)
        foreach ($versions as $version) {
            $data = json_decode($version['tile_data'], true);
            $normalizedData = normalizeForComparison($data);
            $dataHash = md5(serialize($normalizedData));
            
            if (isset($seenData[$dataHash])) {
                // This is a duplicate - mark for deletion (unless locked)
                if (!$version['is_locked']) {
                    $duplicatesToDelete[] = $version['id'];
                    echo "  - Found duplicate: v{$version['version_number']} (ID: {$version['id']})\n";
                } else {
                    echo "  - Found duplicate but LOCKED: v{$version['version_number']} (ID: {$version['id']})\n";
                }
            } else {
                // First time seeing this data
                $seenData[$dataHash] = $version['id'];
            }
        }
        
        // Delete duplicates
        if (!empty($duplicatesToDelete)) {
            $placeholders = implode(',', array_fill(0, count($duplicatesToDelete), '?'));
            $delStmt = $db->prepare("DELETE FROM tile_versions WHERE id IN ($placeholders)");
            $delStmt->execute($duplicatesToDelete);
            
            $deleted = $delStmt->rowCount();
            $totalDuplicatesRemoved += $deleted;
            echo "  ✓ Removed $deleted duplicate version(s)\n";
        } else {
            echo "  - No duplicates found\n";
        }
        
        $tilesProcessed++;
        echo "\n";
    }
    
    echo "=====================================\n";
    echo "Cleanup completed!\n";
    echo "Tiles processed: $tilesProcessed\n";
    echo "Total duplicates removed: $totalDuplicatesRemoved\n";
    echo "=====================================\n";
    
} catch (Exception $e) {
    echo "ERROR: Cleanup failed: " . $e->getMessage() . "\n";
    exit(1);
}

// Helper function (copied from tiles.php for standalone execution)
function normalizeForComparison($data) {
    if (is_array($data)) {
        $excludeKeys = [
            'createdAt', 'created_at',
            'updatedAt', 'updated_at',
            'deletedAt', 'deleted_at',
            'archivedAt', 'archived_at',
            'user_id', 'userId',
            'canView', 'can_view',
            'canEdit', 'can_edit',
            'canDelete', 'can_delete',
            'hasRoleAccess', 'has_role_access',
            'isFavorite', 'is_favorite',
            'health'
        ];

        $result = [];
        foreach ($data as $k => $v) {
            if (in_array($k, $excludeKeys)) continue;

            if (is_array($v)) {
                $child = normalizeForComparison($v);
                $result[$k] = $child;
            } elseif (!is_null($v) && $v !== '') {
                if (is_bool($v)) {
                    $result[$k] = $v ? "1" : "0";
                } else {
                    $result[$k] = (string)$v;
                }
            }
        }
        ksort($result);
        return $result;
    }
    return (string)$data;
}

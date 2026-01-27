<?php
/**
 * Portable database helpers for LinkNest (Doctrine DBAL).
 * Use these instead of driver-specific SQL (INSERT OR IGNORE, PRAGMA, lastInsertId).
 */

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Platforms\MySQLPlatform;
use Doctrine\DBAL\Platforms\PostgreSQLPlatform;
use Doctrine\DBAL\Platforms\SQLServerPlatform;
use Doctrine\DBAL\Platforms\SqlitePlatform;

/**
 * Resolve to the real DBAL Connection (in case getDB() returns a wrapper).
 * Only unwraps our app wrapper; stops at the main DBAL Connection (do not unwrap to driver PDO).
 * @param Connection|object $conn
 */
function _conn($conn): Connection
{
    while (method_exists($conn, 'getWrappedConnection')) {
        $next = $conn->getWrappedConnection();
        if ($next instanceof Connection) {
            $conn = $next;
        } else {
            break;
        }
    }
    return $conn;
}

/**
 * Insert a row, ignoring duplicate key errors (no update).
 * @param Connection|object $conn
 */
function dbInsertIgnore($conn, string $table, array $data): void
{
    $conn = _conn($conn);
    $platform = $conn->getDatabasePlatform();
    $quotedTable = $conn->quoteIdentifier($table);
    $columns = array_keys($data);
    $quotedColumns = array_map([$conn, 'quoteIdentifier'], $columns);
    $placeholders = array_fill(0, count($columns), '?');
    $sql = sprintf(
        'INSERT INTO %s (%s) VALUES (%s)',
        $quotedTable,
        implode(', ', $quotedColumns),
        implode(', ', $placeholders)
    );

    if ($platform instanceof SqlitePlatform) {
        $sql = str_replace('INSERT INTO ', 'INSERT OR IGNORE INTO ', $sql);
        $conn->executeStatement($sql, array_values($data));
        return;
    }
    if ($platform instanceof MySQLPlatform) {
        $conn->executeStatement('INSERT IGNORE INTO ' . $quotedTable . ' (' . implode(', ', $quotedColumns) . ') VALUES (' . implode(', ', $placeholders) . ')', array_values($data));
        return;
    }
    if ($platform instanceof PostgreSQLPlatform) {
        $uniqueCols = inferUniqueColumnsForInsertIgnore($table, $columns);
        if ($uniqueCols !== []) {
            $conflictList = implode(', ', array_map([$conn, 'quoteIdentifier'], $uniqueCols));
            $sql .= ' ON CONFLICT (' . $conflictList . ') DO NOTHING';
        }
        $conn->executeStatement($sql, array_values($data));
        return;
    }
    if ($platform instanceof SQLServerPlatform) {
        try {
            $conn->executeStatement($sql, array_values($data));
        } catch (\Throwable $e) {
            if (strpos($e->getMessage(), 'Duplicate') === false && stripos($e->getMessage(), 'unique') === false) {
                throw $e;
            }
        }
        return;
    }
    $conn->executeStatement($sql, array_values($data));
}

/**
 * Upsert: insert or on conflict update.
 * @param Connection|object $conn
 */
function dbUpsert($conn, string $table, array $data, array $uniqueKeys): void
{
    $conn = _conn($conn);
    $platform = $conn->getDatabasePlatform();
    $quotedTable = $conn->quoteIdentifier($table);
    $columns = array_keys($data);
    $quotedColumns = array_map([$conn, 'quoteIdentifier'], $columns);
    $placeholders = array_fill(0, count($columns), '?');
    $values = array_values($data);

    if ($platform instanceof SqlitePlatform) {
        $sql = sprintf(
            'INSERT OR REPLACE INTO %s (%s) VALUES (%s)',
            $quotedTable,
            implode(', ', $quotedColumns),
            implode(', ', $placeholders)
        );
        $conn->executeStatement($sql, $values);
        return;
    }
    if ($platform instanceof MySQLPlatform) {
        $updateParts = [];
        foreach ($columns as $col) {
            if (!in_array($col, $uniqueKeys, true)) {
                $updateParts[] = $conn->quoteIdentifier($col) . ' = VALUES(' . $conn->quoteIdentifier($col) . ')';
            }
        }
        if ($updateParts === []) {
            $conn->executeStatement(sprintf('INSERT IGNORE INTO %s (%s) VALUES (%s)', $quotedTable, implode(', ', $quotedColumns), implode(', ', $placeholders)), $values);
            return;
        }
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s',
            $quotedTable,
            implode(', ', $quotedColumns),
            implode(', ', $placeholders),
            implode(', ', $updateParts)
        );
        $conn->executeStatement($sql, $values);
        return;
    }
    if ($platform instanceof PostgreSQLPlatform) {
        $conflictList = implode(', ', array_map([$conn, 'quoteIdentifier'], $uniqueKeys));
        $updateParts = [];
        foreach ($columns as $col) {
            if (!in_array($col, $uniqueKeys, true)) {
                $updateParts[] = $conn->quoteIdentifier($col) . ' = EXCLUDED.' . $conn->quoteIdentifier($col);
            }
        }
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s',
            $quotedTable,
            implode(', ', $quotedColumns),
            implode(', ', $placeholders),
            $conflictList,
            implode(', ', $updateParts)
        );
        $conn->executeStatement($sql, $values);
        return;
    }
    if ($platform instanceof SQLServerPlatform) {
        try {
            $conn->executeStatement(sprintf('INSERT INTO %s (%s) VALUES (%s)', $quotedTable, implode(', ', $quotedColumns), implode(', ', $placeholders)), $values);
        } catch (\Throwable $e) {
            if (strpos($e->getMessage(), 'Duplicate') !== false || stripos($e->getMessage(), 'unique') !== false) {
                $updateCols = array_diff($columns, $uniqueKeys);
                $setParts = array_map(function ($c) use ($conn) {
                    return $conn->quoteIdentifier($c) . ' = ?';
                }, $updateCols);
                $whereParts = array_map(function ($c) use ($conn) {
                    return $conn->quoteIdentifier($c) . ' = ?';
                }, $uniqueKeys);
                $updateParams = array_values(array_intersect_key($data, array_flip($updateCols)));
                $whereParams = array_values(array_intersect_key($data, array_flip($uniqueKeys)));
                $conn->executeStatement(
                    'UPDATE ' . $quotedTable . ' SET ' . implode(', ', $setParts) . ' WHERE ' . implode(' AND ', $whereParts),
                    array_merge($updateParams, $whereParams)
                );
            } else {
                throw $e;
            }
        }
        return;
    }
    $conn->executeStatement(sprintf('INSERT INTO %s (%s) VALUES (%s)', $quotedTable, implode(', ', $quotedColumns), implode(', ', $placeholders)), $values);
}

/**
 * Last insert ID in a portable way (PostgreSQL needs sequence name).
 * @param Connection|object $conn
 */
function dbLastInsertId($conn, ?string $table = null)
{
    $conn = _conn($conn);
    $platform = $conn->getDatabasePlatform();
    if ($platform instanceof PostgreSQLPlatform && $table !== null) {
        $seq = $table . '_id_seq';
        return $conn->lastInsertId($seq);
    }
    return $conn->lastInsertId();
}

/**
 * Check if a table exists.
 * @param Connection|object $conn
 */
function tableExists($conn, string $table): bool
{
    $conn = _conn($conn);
    $sm = method_exists($conn, 'createSchemaManager') ? $conn->createSchemaManager() : $conn->getSchemaManager();
    return $sm->tablesExist([$table]);
}

/**
 * Get column names for a table. Returns array of ['name' => colName] to mirror PRAGMA table_info shape.
 * @param Connection|object $conn
 */
function getTableColumns($conn, string $table): array
{
    $conn = _conn($conn);
    $sm = method_exists($conn, 'createSchemaManager') ? $conn->createSchemaManager() : $conn->getSchemaManager();
    $columns = $sm->listTableColumns($table);
    $result = [];
    foreach ($columns as $col) {
        $result[] = ['name' => $col->getName()];
    }
    return $result;
}

/**
 * Infer unique column(s) for INSERT OR IGNORE / ON CONFLICT for known tables.
 */
function inferUniqueColumnsForInsertIgnore(string $table, array $columns): array
{
    $known = [
        'settings' => ['key'],
        'addon_status' => ['addon_name'],
        'user_roles' => ['user_id', 'role_id'],
        'group_roles' => ['group_id', 'role_id'],
        'user_tile_favorites' => ['user_id', 'tile_id'],
        'user_group_members' => ['user_id', 'group_id'],
    ];
    return $known[$table] ?? (isset($columns[0]) ? [$columns[0]] : []);
}

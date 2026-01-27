<?php
/**
 * Database configuration for LinkNest.
 * Reads from getenv() so you can use .env or server/env vars.
 * Used by api/config.php to build the Doctrine DBAL connection.
 *
 * Supported drivers: pdo_sqlite, pdo_mysql, pdo_pgsql, pdo_sqlsrv
 */
return (function (): array {
    $driver = getenv('DB_DRIVER') ?: 'pdo_sqlite';
    $baseDir = dirname(__DIR__);

    if ($driver === 'pdo_sqlite') {
        $path = getenv('DB_PATH') ?: ($baseDir . '/data/linknest.db');
        return [
            'driver' => 'pdo_sqlite',
            'path' => $path,
        ];
    }

    return [
        'driver' => $driver,
        'host' => getenv('DB_HOST') ?: 'localhost',
        'port' => (int) (getenv('DB_PORT') ?: (
            $driver === 'pdo_pgsql' ? 5432 : ($driver === 'pdo_sqlsrv' ? 1433 : 3306)
        )),
        'dbname' => getenv('DB_NAME') ?: 'linknest',
        'user' => getenv('DB_USER') ?: '',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset' => $driver === 'pdo_mysql' ? (getenv('DB_CHARSET') ?: 'utf8mb4') : null,
    ];
})();

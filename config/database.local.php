<?php
/**
 * Local database override – MariaDB on localhost.
 * This file is ignored by git (*.local). Edit for your environment.
 */
return [
    'driver'   => 'pdo_mysql',
    'host'     => 'localhost',
    'port'     => 3306,
    'dbname'   => 'linknest',
    'user'     => 'root',
    'password' => 'Tiger123!',
    'charset'  => 'utf8mb4',
];

# Database configuration (multi-database)

LinkNest uses **Doctrine DBAL** so you can run the app against SQLite, MySQL, MariaDB, PostgreSQL, or SQL Server by changing configuration only.

## Quick start

1. **Install dependencies** (required once):
   ```bash
   composer require doctrine/dbal
   ```
2. **Configure** the driver and credentials (see below).
3. **Run the app** – schema is created automatically if the database is empty.

**Optional:** To create the database and tables manually (e.g. for provisioning), use the standalone SQL schema files in `docs/schemas/`:
- **MariaDB/MySQL:** `docs/schemas/schema-mariadb.sql`
- **PostgreSQL:** `docs/schemas/schema-postgresql.sql`
- **SQL Server:** `docs/schemas/schema-sqlserver.sql`

See `docs/schemas/README.md` for usage.

## Configuration

Set these in your environment (e.g. `.env`) or in `config/database.php`.

### SQLite (default)

- `DB_DRIVER=pdo_sqlite` (or leave unset)
- `DB_PATH` – path to the database file (default: `data/linknest.db`)

Example:
```env
DB_DRIVER=pdo_sqlite
DB_PATH=/var/www/linknest/data/linknest.db
```

### MySQL / MariaDB

- `DB_DRIVER=pdo_mysql`
- `DB_HOST` – default `localhost`
- `DB_PORT` – default `3306`
- `DB_NAME` – database name (default `linknest`)
- `DB_USER` – username
- `DB_PASSWORD` – password
- `DB_CHARSET` – optional, default `utf8mb4`

Example:
```env
DB_DRIVER=pdo_mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=linknest
DB_USER=linknest
DB_PASSWORD=secret
```

### PostgreSQL

- `DB_DRIVER=pdo_pgsql`
- `DB_HOST` – default `localhost`
- `DB_PORT` – default `5432`
- `DB_NAME` – database name (default `linknest`)
- `DB_USER` – username
- `DB_PASSWORD` – password

Example:
```env
DB_DRIVER=pdo_pgsql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=linknest
DB_USER=linknest
DB_PASSWORD=secret
```

### SQL Server

- `DB_DRIVER=pdo_sqlsrv`
- `DB_HOST` – server host
- `DB_PORT` – default `1433`
- `DB_NAME` – database name
- `DB_USER` – username
- `DB_PASSWORD` – password

Ensure the `pdo_sqlsrv` PHP extension is installed.

## PHP extensions

- **SQLite:** `pdo_sqlite`
- **MySQL/MariaDB:** `pdo_mysql`
- **PostgreSQL:** `pdo_pgsql`
- **SQL Server:** `pdo_sqlsrv`

The app checks for the extension that matches `DB_DRIVER` and returns a clear error if it is missing.

## Troubleshooting Composer / SSL

If `composer require doctrine/dbal` or `composer update` fails with **SSL certificate problem (curl error 60)**:

1. **Update the CA bundle** used by PHP:
   - Download [cacert.pem](https://curl.se/ca/cacert.pem) and save it to your PHP directory (e.g. `C:\xampp\php\cacert.pem`).
   - In `php.ini`, set `curl.cainfo` and `openssl.cafile` to that path (use forward slashes, e.g. `C:/xampp/php/cacert.pem`).
2. **Or install manually**: Doctrine DBAL and its runtime dependencies (doctrine/deprecations, doctrine/event-manager) can be placed under `vendor/doctrine/` and the project’s `vendor/autoload.php` already includes autoloading for them when present.

## Backup, restore, and clone

The built-in **backup/restore** UI and **clone** feature are currently implemented for **SQLite** (file-based). Support for dumping/restoring MySQL, PostgreSQL, or SQL Server can be added in a later version (e.g. via `pg_dump`, `mysqldump`, or native tools).

## Analytics database

The **Performance Analytics** add-on uses a **separate** PostgreSQL database (configurable under Admin → Addons). That setting is independent of the main app database described here.

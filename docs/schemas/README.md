# LinkNest database schemas

Standalone SQL schema files for creating the LinkNest database by hand. Use these when you want to provision an empty database before pointing the app at it, or to compare with the Doctrine schema.

| File | Database |
|------|----------|
| `schema-mariadb.sql` | MariaDB 10.2+ / MySQL 5.7+ |
| `schema-postgresql.sql` | PostgreSQL 12+ |
| `schema-sqlserver.sql` | SQL Server 2016+ / Azure SQL Database |

## Quick start

1. **Create an empty database** in your chosen engine.
2. **Run the corresponding `.sql` file** (e.g. with `mysql`, `psql`, or SSMS).
   - **PowerShell (Windows):** `<` redirection doesn't work; use:
     ```powershell
     Get-Content .\schema-mariadb.sql -Raw | mysql -u root -p linknest
     ```
     or: `cmd /c "mysql -u root -p linknest < schema-mariadb.sql"`
3. **Configure the app** via environment variables (see [DATABASE_CONFIGURATION.md](../DATABASE_CONFIGURATION.md)).
4. **Start the app** — it will connect and can create the default admin user and seed data on first run if the tables are empty.

## Migrating data from SQLite to MariaDB

1. Create the MariaDB database and run `schema-mariadb.sql` (schema only).
2. From the project root, export data from SQLite:
   ```bash
   php scripts/export_sqlite_to_mariadb.php [path/to/linknest.db] [path/to/output.sql]
   ```
   Default: reads `data/linknest.db`, writes `data/linknest_data_mariadb.sql`.
3. Import the data into MariaDB:
   - **Cmd / Bash:** `mysql -u user -p linknest < data/linknest_data_mariadb.sql`
   - **PowerShell:**  
     `Get-Content .\data\linknest_data_mariadb.sql -Raw | mysql -u user -p linknest`  
     or: `cmd /c "mysql -u user -p linknest < data\linknest_data_mariadb.sql"`
4. Point the app at MariaDB using `DB_DRIVER=pdo_mysql` and the relevant env vars.

## Notes

- The app can also **create tables itself** using Doctrine DBAL when you point it at an empty database; you don’t have to run these scripts. These files are for manual setup or reference.
- Reserved words are quoted per engine: `` `group` `` (MariaDB), `"group"` (PostgreSQL), `[group]` (SQL Server).
- Indexes and foreign keys match what the app expects and what `api/config.php` creates for SQLite.

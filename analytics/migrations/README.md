# Analytics Database Migrations

This directory contains SQL migration scripts for the Performance Analytics PostgreSQL database.

## How to Run Migrations

### Using psql command line:

```bash
psql -h <host> -p <port> -U <username> -d <database> -f add_username_column.sql
```

### Example with default settings:

```bash
psql -h localhost -p 5433 -U postgres -d linknest_analytics -f add_username_column.sql
```

### Using pgAdmin or other GUI tools:

1. Connect to your PostgreSQL database
2. Open the migration file
3. Execute the SQL commands

## Available Migrations

### add_username_column.sql
- **Purpose**: Adds username column to performance_metrics table
- **Required**: Yes, for username tracking in analytics
- **Date**: January 2026
- **Description**: Adds username VARCHAR(255) column and creates an index for efficient username-based queries. This allows administrators to drill down and identify which users are experiencing performance issues with specific URLs.

### add_ip_indexes.sql
- **Purpose**: Adds indexes for IP-based queries and anonymous user tracking
- **Required**: Yes, for efficient IP address queries
- **Date**: January 2026
- **Description**: Creates two indexes: one for general IP queries and one specifically for anonymous users (is_authenticated = FALSE). This significantly improves performance when tracking anonymous/public users by their IP addresses.

## Migration Order

Run migrations in the following order:
1. `add_username_column.sql` - First time setup for username tracking
2. `add_ip_indexes.sql` - Add IP address indexes for anonymous user tracking

## Rollback

### Rollback add_username_column.sql

If you need to remove the username column:

```sql
-- Remove the index first
DROP INDEX IF EXISTS idx_perf_username_time;

-- Remove the column
ALTER TABLE performance_metrics DROP COLUMN IF EXISTS username;
```

### Rollback add_ip_indexes.sql

If you need to remove the IP indexes:

```sql
-- Remove both IP indexes
DROP INDEX IF EXISTS idx_perf_ip_time;
DROP INDEX IF EXISTS idx_perf_anonymous;
```

## Notes

- All migrations are idempotent (safe to run multiple times)
- Migrations use `IF NOT EXISTS` clauses where applicable
- Always backup your database before running migrations
- Test migrations in a development environment first

#!/usr/bin/env bash
# Restore Linknest Analytics PostgreSQL database from a backup file
# Uses: postgres/postgres, database: analytics (default), port 5433
#
# For Plain SQL backups (.sql): recreates database if -d and runs psql -f
# For Custom format (.dump): uses pg_restore
#
# Run: ./analytics/restore-analytics-backup.sh /path/to/analytics_backup_20260125-120000.sql
# Or:  ./analytics/restore-analytics-backup.sh -d /path/to/backup.sql  # drop database first
# Env: PGHOST, PGPORT, PGUSER, PGPASSWORD, DB_NAME

set -e
DROP_DB=""
while [ $# -gt 0 ]; do
    case "$1" in
        -d|--drop) DROP_DB=1; shift ;;
        *) BACKUP_FILE="$1"; shift ;;
    esac
done

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "Usage: $0 [-d|--drop] <backup.sql or backup.dump>"
    echo "  -d  Drop and recreate database before restore"
    exit 1
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
DB_NAME="${DB_NAME:-analytics}"

if [ "${BACKUP_FILE%.dump}" != "$BACKUP_FILE" ]; then
    FORMAT="custom"
else
    FORMAT="plain"
fi

echo "=== PostgreSQL Analytics Restore ==="
echo "Backup: $BACKUP_FILE"
echo "Host: $PGHOST:$PGPORT  User: $PGUSER  Database: $DB_NAME  Format: $FORMAT"
[ -n "$DROP_DB" ] && echo "Drop database before restore: Yes"
echo ""

if [ -n "$DROP_DB" ]; then
    echo "Dropping database '$DB_NAME'..."
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";"
    echo "Database recreated."
fi

if [ "$FORMAT" = "custom" ]; then
    echo "Restoring with pg_restore..."
    pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" --no-owner --no-acl "$BACKUP_FILE" 2>/dev/null || true
else
    EXISTS=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || true)
    if [ -z "$EXISTS" ]; then
        echo "Creating database '$DB_NAME'..."
        createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DB_NAME"
    fi
    echo "Restoring with psql..."
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -f "$BACKUP_FILE" -v ON_ERROR_STOP=1
fi

echo ""
echo "Restore completed successfully."

unset PGPASSWORD

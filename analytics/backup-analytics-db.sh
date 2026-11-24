#!/usr/bin/env bash
# Backup Linknest Analytics PostgreSQL database
# Uses: postgres/postgres, database: analytics (default), port 5433
#
# Output: Plain SQL by default (portable). Set FORMAT=custom for pg_restore.
# Run: ./analytics/backup-analytics-db.sh
# Or:  PGHOST=localhost PGPORT=5433 DB_NAME=analytics ./analytics/backup-analytics-db.sh
# Or:  OUTPUT_DIR=/var/backups ./analytics/backup-analytics-db.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
DB_NAME="${DB_NAME:-analytics}"
OUTPUT_DIR="${OUTPUT_DIR:-$SCRIPT_DIR}"
# Plain = .sql (portable); custom = .dump (for pg_restore)
FORMAT="${FORMAT:-plain}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
if [ "$FORMAT" = "custom" ]; then
    EXT="dump"
else
    EXT="sql"
fi
FILE_NAME="analytics_backup_${TIMESTAMP}.${EXT}"
FILE_PATH="${OUTPUT_DIR}/${FILE_NAME}"

echo "=== PostgreSQL Analytics Backup ==="
echo "Host: $PGHOST:$PGPORT  User: $PGUSER  Database: $DB_NAME  Format: $FORMAT"
echo "Output: $FILE_PATH"
echo ""

if [ "$FORMAT" = "custom" ]; then
    pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -F c -f "$FILE_PATH"
else
    pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -F p -f "$FILE_PATH"
fi

SIZE=$(stat -c%s "$FILE_PATH" 2>/dev/null || stat -f%z "$FILE_PATH" 2>/dev/null)
echo "Backup completed successfully."
echo "File: $FILE_PATH ($(( SIZE / 1024 )) KB)"
echo ""
echo "To restore: ./analytics/restore-analytics-backup.sh \"$FILE_PATH\""
echo ""

unset PGPASSWORD

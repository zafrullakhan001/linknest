#!/usr/bin/env bash
# Copy SQLite + uploads between the host project and the running LinkNest container.
# Usage:
#   ./docker-sync-database.sh              # host -> Docker
#   ./docker-sync-database.sh out          # Docker -> host
#   ./docker-sync-database.sh in --db-only
#   ./docker-sync-database.sh in --uploads-only
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
CONTAINER="${CONTAINER:-linknest}"
DIRECTION="${1:-in}"
shift || true
DB_ONLY=0
UP_ONLY=0
SKIP_REWRITE=0
HOST_BASE="${HOST_BASE_PATH:-/linknest}"

while [ $# -gt 0 ]; do
  case "$1" in
    --db-only|--database-only) DB_ONLY=1 ;;
    --uploads-only) UP_ONLY=1 ;;
    --skip-path-rewrite) SKIP_REWRITE=1 ;;
    --host-base-path) HOST_BASE="${2:-}"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

DIRECTION="$(echo "$DIRECTION" | tr '[:upper:]' '[:lower:]')"
HOST_DB="$ROOT/data/linknest.db"
HOST_UP="$ROOT/uploads"
CTR_DB="/var/www/html/data/linknest.db"
CTR_UP="/var/www/html/uploads"

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "[error] Container $CONTAINER is not running." >&2
  exit 1
fi

do_db=1
do_up=1
[ "$UP_ONLY" = 1 ] && do_db=0
[ "$DB_ONLY" = 1 ] && do_up=0

rewrite_in() {
  docker exec "$CONTAINER" sqlite3 "$CTR_DB" \
    "UPDATE tiles SET emoji_image = substr(emoji_image, instr(emoji_image, '/uploads/')) WHERE emoji_image LIKE '%/uploads/%' AND emoji_image NOT LIKE '/uploads/%';"
  docker exec "$CONTAINER" sqlite3 "$CTR_DB" \
    "UPDATE tiles SET header_image = substr(header_image, instr(header_image, '/uploads/')) WHERE header_image LIKE '%/uploads/%' AND header_image NOT LIKE '/uploads/%';"
  docker exec "$CONTAINER" sqlite3 "$CTR_DB" \
    "UPDATE settings SET value = substr(value, instr(value, '/uploads/')) WHERE typeof(value)='text' AND value LIKE '%/uploads/%' AND value NOT LIKE '/uploads/%' AND length(value) < 512;"
}

if [ "$DIRECTION" = "in" ]; then
  if [ "$do_db" = 1 ]; then
    [ -f "$HOST_DB" ] || { echo "[error] Missing $HOST_DB" >&2; exit 1; }
    echo "[sync] Host DB -> $CONTAINER"
    docker exec "$CONTAINER" sqlite3 "$CTR_DB" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
    docker cp "$HOST_DB" "$CONTAINER:/tmp/linknest.db.in"
    docker exec -u root "$CONTAINER" sh -c "cp /tmp/linknest.db.in $CTR_DB && chown www-data:www-data $CTR_DB && chmod 644 $CTR_DB && rm -f /tmp/linknest.db.in ${CTR_DB}-wal ${CTR_DB}-shm"
  fi
  if [ "$do_up" = 1 ]; then
    [ -d "$HOST_UP" ] || { echo "[error] Missing $HOST_UP" >&2; exit 1; }
    echo "[sync] Host uploads -> $CONTAINER"
    docker exec -u root "$CONTAINER" sh -c "mkdir -p /tmp/uploads.in $CTR_UP"
    docker cp "$HOST_UP/." "$CONTAINER:/tmp/uploads.in"
    docker exec -u root "$CONTAINER" sh -c "cp -a /tmp/uploads.in/. $CTR_UP/ && chown -R www-data:www-data $CTR_UP && rm -rf /tmp/uploads.in"
  fi
  if [ "$do_db" = 1 ] && [ "$SKIP_REWRITE" = 0 ]; then
    echo "[sync] Rewriting upload URLs to /uploads for Docker"
    rewrite_in
  fi
  docker restart "$CONTAINER" >/dev/null
  echo "[ok] Host data is inside Docker. Refresh https://localhost:8443 (Ctrl+F5)."
  exit 0
fi

if [ "$DIRECTION" != "out" ]; then
  echo "Usage: $0 [in|out] [--db-only] [--uploads-only] [--skip-path-rewrite] [--host-base-path /linknest]" >&2
  exit 1
fi

mkdir -p "$ROOT/data" "$HOST_UP"
if [ "$do_db" = 1 ]; then
  echo "[sync] $CONTAINER DB -> host"
  docker exec "$CONTAINER" sqlite3 "$CTR_DB" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
  if [ -f "$HOST_DB" ]; then
    cp "$HOST_DB" "$ROOT/data/linknest.db.hostbak-$(date +%Y%m%d-%H%M%S)"
  fi
  docker cp "$CONTAINER:$CTR_DB" "$HOST_DB"
fi
if [ "$do_up" = 1 ]; then
  echo "[sync] $CONTAINER uploads -> host"
  docker cp "$CONTAINER:$CTR_UP/." "$HOST_UP"
fi
echo "[ok] Docker data is on the host. Refresh the XAMPP site (Ctrl+F5)."

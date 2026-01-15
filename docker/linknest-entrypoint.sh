#!/usr/bin/env bash
set -u

# LinkNest container entrypoint:
# - Starts cron daemon for scheduled tasks (database backups)
# - Starts a lightweight Python worker loop (monitor_runner + email_sender)
# - Then execs Apache in the foreground (PID 1)
#
# Environment variables (optional):
# - LINKNEST_WORKERS_ENABLED: "1" (default) to run python workers, "0" to disable
# - LINKNEST_WORKER_INTERVAL_SECONDS: loop interval seconds (default 60)
# - LINKNEST_DB_PATH: SQLite DB path (default /var/www/html/data/linknest.db)
# - LINKNEST_WORKER_MAX_WORKERS: monitor_runner --max-workers (default 10)
# - LINKNEST_EMAIL_LIMIT: email_sender --limit (default 50)

ENABLED="${LINKNEST_WORKERS_ENABLED:-1}"
INTERVAL="${LINKNEST_WORKER_INTERVAL_SECONDS:-60}"
DB_PATH="${LINKNEST_DB_PATH:-/var/www/html/data/linknest.db}"
MAX_WORKERS="${LINKNEST_WORKER_MAX_WORKERS:-10}"
EMAIL_LIMIT="${LINKNEST_EMAIL_LIMIT:-50}"

# Set timezone from environment variable or detect from system
# TZ can be set in docker-compose.yml (e.g., TZ=America/New_York)
# If not set, try to detect from mounted /etc/timezone or use UTC as fallback
if [ -n "${TZ:-}" ]; then
    echo "[ENTRYPOINT] Setting timezone from TZ environment variable: ${TZ}"
    ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime
    echo "${TZ}" > /etc/timezone
    echo "date.timezone=${TZ}" > /usr/local/etc/php/conf.d/timezone.ini
elif [ -f /etc/timezone ]; then
    TZ=$(cat /etc/timezone)
    echo "[ENTRYPOINT] Setting timezone from /etc/timezone: ${TZ}"
    ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime 2>/dev/null || true
elif [ -f /etc/localtime ]; then
    echo "[ENTRYPOINT] Using timezone from /etc/localtime"
else
    echo "[ENTRYPOINT] No timezone configured, using UTC (set TZ environment variable to override)"
    export TZ=UTC
fi

# Display current timezone
echo "[ENTRYPOINT] Current timezone: $(cat /etc/timezone 2>/dev/null || echo 'UTC')"
echo "[ENTRYPOINT] Current time: $(date)"

# Ensure backups directory exists with proper permissions
BACKUPS_DIR="/var/www/html/data/backups"
if [ ! -d "$BACKUPS_DIR" ]; then
    mkdir -p "$BACKUPS_DIR"
    chown www-data:www-data "$BACKUPS_DIR"
    chmod 755 "$BACKUPS_DIR"
    echo "[ENTRYPOINT] Created backups directory: $BACKUPS_DIR"
fi

# Start cron daemon for scheduled tasks (database backups at 3:00 AM daily)
echo "[ENTRYPOINT] Starting cron daemon for scheduled backups..."
# Start cron in the background
cron

# Display cron job status
echo "[ENTRYPOINT] Cron job configured: Daily database snapshot at 3:00 AM"
echo "[ENTRYPOINT] Backup location: $BACKUPS_DIR"
echo "[ENTRYPOINT] Old backups (>30 days) are automatically removed by snapshot.php"

worker_loop() {
  echo "[WORKER] LinkNest workers enabled=${ENABLED} interval=${INTERVAL}s db=${DB_PATH}"
  while true; do
    # Run checks (queues emails into email_outbox)
    if command -v python3 >/dev/null 2>&1; then
      python3 /var/www/html/scripts/monitor_runner.py --db "${DB_PATH}" --max-workers "${MAX_WORKERS}" || true
      # Send queued emails
      python3 /var/www/html/scripts/email_sender.py --db "${DB_PATH}" --limit "${EMAIL_LIMIT}" || true
    else
      echo "[WORKER] python3 not found; workers disabled"
      break
    fi
    sleep "${INTERVAL}"
  done
}

if [ "${ENABLED}" = "1" ] || [ "${ENABLED}" = "true" ] || [ "${ENABLED}" = "yes" ]; then
  worker_loop &
else
  echo "[WORKER] LinkNest workers disabled via LINKNEST_WORKERS_ENABLED=${ENABLED}"
fi

exec apache2-foreground


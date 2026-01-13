#!/usr/bin/env bash
set -u

# LinkNest container entrypoint:
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


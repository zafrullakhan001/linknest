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
    ln -sf "/usr/share/zoneinfo/${TZ}" /etc/localtime 2>/dev/null || true
    if [ -w /etc/timezone ] || [ ! -e /etc/timezone ]; then
        echo "${TZ}" > /etc/timezone 2>/dev/null || true
    fi
    echo "date.timezone=${TZ}" > /usr/local/etc/php/conf.d/timezone.ini
    export TZ
elif [ -f /etc/timezone ]; then
    TZ=$(cat /etc/timezone)
    echo "[ENTRYPOINT] Setting timezone from /etc/timezone: ${TZ}"
    ln -sf "/usr/share/zoneinfo/${TZ}" /etc/localtime 2>/dev/null || true
    export TZ
elif [ -f /etc/localtime ]; then
    echo "[ENTRYPOINT] Using timezone from /etc/localtime"
else
    echo "[ENTRYPOINT] No timezone configured, using UTC (set TZ environment variable to override)"
    export TZ=UTC
fi

# Display current timezone
echo "[ENTRYPOINT] Current timezone: $(cat /etc/timezone 2>/dev/null || echo 'UTC')"
echo "[ENTRYPOINT] Current time: $(date)"

# Isolate Docker login cookies from host XAMPP on the same machine (LNSESSdocker, path /).
# Keeps an existing system token if data/install_identity.php already exists.
echo "[ENTRYPOINT] Writing Docker install identity (session cookie isolation)..."
mkdir -p /var/www/html/data /var/www/html/data/sessions
if php /var/www/html/scripts/write-install-identity.php /var/www/html docker http://localhost:8090/; then
    echo "[ENTRYPOINT] Docker install identity ready"
else
    echo "[ENTRYPOINT] WARNING: Could not write install identity"
fi
chown -R www-data:www-data /var/www/html/data/sessions /var/www/html/data/install_identity.php 2>/dev/null || true

# Ensure backups directory exists with proper permissions
BACKUPS_DIR="/var/www/html/data/backups"
if [ ! -d "$BACKUPS_DIR" ]; then
    mkdir -p "$BACKUPS_DIR"
    chown www-data:www-data "$BACKUPS_DIR"
    chmod 755 "$BACKUPS_DIR"
    echo "[ENTRYPOINT] Created backups directory: $BACKUPS_DIR"
fi

# SSH gateway runtime dir (ttyd session state + logs)
SSH_GW_DIR="/var/www/html/data/ssh_gateway"
mkdir -p "$SSH_GW_DIR"
chown www-data:www-data "$SSH_GW_DIR"
chmod 755 "$SSH_GW_DIR"

# VNC gateway runtime dir (websockify session state + logs)
VNC_GW_DIR="/var/www/html/data/vnc_gateway"
mkdir -p "$VNC_GW_DIR"
chown www-data:www-data "$VNC_GW_DIR"
chmod 755 "$VNC_GW_DIR"

# If this container's DB was copied from Windows XAMPP, clear stale Windows exe paths
# so Linux auto-detect (/usr/local/bin/ttyd, /usr/bin/ssh, python3 + websockify) can work.
if [ -f "${DB_PATH}" ] && command -v sqlite3 >/dev/null 2>&1; then
  echo "[ENTRYPOINT] Normalizing SSH/VNC gateway paths for Linux/Docker..."
  sqlite3 "${DB_PATH}" "UPDATE settings SET value='' WHERE key='ssh_gateway_ttyd_path' AND (lower(value) LIKE '%.exe' OR value LIKE '%\\%' OR value GLOB '[A-Za-z]:*');" 2>/dev/null || true
  sqlite3 "${DB_PATH}" "UPDATE settings SET value='' WHERE key='ssh_gateway_ssh_path' AND (lower(value) LIKE '%.exe' OR value LIKE '%\\%' OR value GLOB '[A-Za-z]:*');" 2>/dev/null || true
  sqlite3 "${DB_PATH}" "UPDATE settings SET value='' WHERE key='vnc_gateway_python_path' AND (lower(value) LIKE '%.exe' OR value LIKE '%\\%' OR value GLOB '[A-Za-z]:*');" 2>/dev/null || true
  sqlite3 "${DB_PATH}" "UPDATE settings SET value='' WHERE key='vnc_gateway_websockify_path' AND (lower(value) LIKE '%.cmd' OR lower(value) LIKE '%.exe' OR value LIKE '%\\%' OR value GLOB '[A-Za-z]:*');" 2>/dev/null || true
  # Loopback DISPLAY is wrong inside Docker — use host.docker.internal for VcXsrv on the host
  X11_DISPLAY_DOCKER="${SSH_GATEWAY_X11_DISPLAY:-host.docker.internal:0.0}"
  sqlite3 "${DB_PATH}" "UPDATE settings SET value='${X11_DISPLAY_DOCKER}' WHERE key='ssh_gateway_x11_display' AND (value='' OR value LIKE '127.0.0.1%' OR lower(value) LIKE 'localhost%' OR value LIKE '::1%');" 2>/dev/null || true
  # Ensure the setting exists even if never configured on Windows
  HAS_X11="$(sqlite3 "${DB_PATH}" "SELECT COUNT(1) FROM settings WHERE key='ssh_gateway_x11_display';" 2>/dev/null || echo 0)"
  if [ "${HAS_X11}" = "0" ]; then
    NOW="$(date +%s)"
    sqlite3 "${DB_PATH}" "INSERT INTO settings (key, value, updated_at) VALUES ('ssh_gateway_x11_display', '${X11_DISPLAY_DOCKER}', ${NOW});" 2>/dev/null || true
  fi
  echo "[ENTRYPOINT] SSH X11 DISPLAY for Docker: ${X11_DISPLAY_DOCKER}"
  echo "[ENTRYPOINT] Normalizing XAMPP /linknest/uploads URLs to /uploads for Docker root..."
  sqlite3 "${DB_PATH}" "UPDATE tiles SET emoji_image = substr(emoji_image, instr(emoji_image, '/uploads/')) WHERE emoji_image LIKE '%/uploads/%' AND emoji_image NOT LIKE '/uploads/%';" 2>/dev/null || true
  sqlite3 "${DB_PATH}" "UPDATE tiles SET header_image = substr(header_image, instr(header_image, '/uploads/')) WHERE header_image LIKE '%/uploads/%' AND header_image NOT LIKE '/uploads/%';" 2>/dev/null || true
  sqlite3 "${DB_PATH}" "UPDATE settings SET value = substr(value, instr(value, '/uploads/')) WHERE typeof(value)='text' AND value LIKE '%/uploads/%' AND value NOT LIKE '/uploads/%' AND length(value) < 512;" 2>/dev/null || true
fi

if command -v ttyd >/dev/null 2>&1; then
  echo "[ENTRYPOINT] ttyd available: $(command -v ttyd) ($(ttyd --version 2>&1 | head -n1))"
else
  echo "[ENTRYPOINT] WARNING: ttyd not found — SSH Terminal Easy mode will not work"
fi
if command -v ssh >/dev/null 2>&1; then
  echo "[ENTRYPOINT] OpenSSH client available: $(command -v ssh)"
fi
if python3 -c "import websockify" >/dev/null 2>&1; then
  echo "[ENTRYPOINT] websockify available (python3 -m websockify); VNC ports ${VNC_GATEWAY_PORT_MIN:-18881}-${VNC_GATEWAY_PORT_MAX:-18980}"
else
  echo "[ENTRYPOINT] WARNING: websockify not found — VNC Viewer Easy mode will not work"
fi

# Do not write .pyc as root — those files block in-app updates (www-data cannot overwrite them).
export PYTHONDONTWRITEBYTECODE=1
rm -rf /var/www/html/scripts/__pycache__ 2>/dev/null || true

# npm behind SSL inspection (same as image build). Survives App Updates overwriting updater_lib.php.
mkdir -p /usr/local/etc /var/www/.npm
printf 'strict-ssl=false\n' > /usr/local/etc/npmrc
printf 'strict-ssl=false\n' > /var/www/.npmrc
chown www-data:www-data /var/www/.npmrc /var/www/.npm 2>/dev/null || true
export npm_config_strict_ssl=false
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Start cron daemon for scheduled tasks (database backups at 2:00 AM and 3:00 AM daily)
echo "[ENTRYPOINT] Starting cron daemon for scheduled backups..."
# Start cron in the background
cron

# Display cron job status
echo "[ENTRYPOINT] Cron jobs configured:"
echo "[ENTRYPOINT]   - Daily database export at 2:00 AM (export_database.php)"
echo "[ENTRYPOINT]   - Daily database snapshot at 3:00 AM (snapshot.php)"
echo "[ENTRYPOINT] Backup location: $BACKUPS_DIR"
echo "[ENTRYPOINT] Old backups (>30 days) are automatically removed by both scripts"

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


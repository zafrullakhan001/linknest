#!/usr/bin/env bash
# Step 20 — PHP-FPM pool for the app (own user, own socket).
. "$(dirname "$0")/env.sh"

log "step 20 · php-fpm pool"
[ "$EDGE" = "nginx" ] || die "this deployer supports the nginx edge only (EDGE=$EDGE)"
command -v nginx >/dev/null 2>&1 || die "nginx is not installed: apt-get install -y nginx"
command -v "$FPM_BIN" >/dev/null 2>&1 || die "$FPM_BIN not found: apt-get install -y php${PHP_VER}-fpm"

POOL_DIR="/etc/php/$PHP_VER/fpm/pool.d"
POOL_FILE="$POOL_DIR/$POOL.conf"
[ -d "$POOL_DIR" ] || die "missing $POOL_DIR"

render "$(dirname "$0")/templates/linknest-fpm.conf" "/tmp/$POOL.conf.new"
if [ -f "$POOL_FILE" ]; then
  cp -a "$POOL_FILE" "$POOL_FILE.bak.$(date +%s)"
  info "replacing existing pool config (backup kept)"
else
  info "creating new pool config"
fi
install -m 644 -o root -g root "/tmp/$POOL.conf.new" "$POOL_FILE"

"$FPM_BIN" -t || die "php-fpm configuration test failed"
systemctl reload "$SERVICE"
sleep 2
systemctl is-active "$SERVICE" >/dev/null || die "$SERVICE did not come back after reload"

if [ -S "$FPM_SOCKET" ]; then
  ok "socket ready: $FPM_SOCKET"
else
  warn "socket $FPM_SOCKET not present yet (created on the first request)"
fi
info "pool: $POOL_FILE   children=$MAX_CHILDREN memory_limit=$MEMORY_LIMIT"
ok "step 20 complete"

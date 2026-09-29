#!/usr/bin/env bash
# Step 10 — application user, code tree, ownership and permissions.
. "$(dirname "$0")/env.sh"

log "step 10 · application user + code"
info "mode=$DEPLOY_MODE  root=$APP_ROOT  user=$APP_USER  php=$PHP_VER  edge=$EDGE"

# ---------------------------------------------------------------- service acct
if id "$APP_USER" >/dev/null 2>&1; then
  ok "user $APP_USER already exists"
else
  useradd -m -d "$HOME_DIR" -s /bin/bash "$APP_USER"
  ok "created user $APP_USER"
fi
# the web server (www-data) must be able to traverse the home directory
chmod 755 "$HOME_DIR"
install -d -m 700 "$HOME_DIR/.ssh"
if [ -s /root/.ssh/authorized_keys ] && [ ! -s "$HOME_DIR/.ssh/authorized_keys" ]; then
  cp /root/.ssh/authorized_keys "$HOME_DIR/.ssh/authorized_keys"
  chown -R "$APP_USER:$APP_USER" "$HOME_DIR/.ssh"
  chmod 600 "$HOME_DIR/.ssh/authorized_keys"
  ok "installed root's SSH key for $APP_USER"
fi
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$SESSIONS_DIR"

# ------------------------------------------------------------------- extract
[ -n "$TARBALL" ] && [ -f "$TARBALL" ] || die "bundle not found: TARBALL='$TARBALL'"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$TARBALL" -C "$TMP"
SRC="$TMP/htdocs"
[ -d "$SRC" ] || die "bundle does not contain htdocs/"
install -d -m 755 "$APP_ROOT"

if [ "$DEPLOY_MODE" = "update" ]; then
  [ -f "$APP_ROOT/api/index.php" ] || die "update mode requested but $APP_ROOT/api/index.php is missing"
  info "update mode: replacing code only (data/ and uploads/ are preserved)"
  for d in api dist docs scripts vendor config land migrations monitorv2 analytics mcp; do
    [ -e "$SRC/$d" ] || continue
    rm -rf "$APP_ROOT/$d"
    cp -a "$SRC/$d" "$APP_ROOT/"
  done
  for f in "$SRC"/*.php "$SRC"/*.json "$SRC"/*.txt "$SRC"/.htaccess; do
    [ -e "$f" ] || continue
    cp -a "$f" "$APP_ROOT/"
  done
  mkdir -p "$APP_ROOT/data/backups" "$APP_ROOT/data/exports" "$APP_ROOT/data/tmp" "$APP_ROOT/logs"
  rm -f "$APP_ROOT"/data/cache/*.json 2>/dev/null || true
else
  info "fresh mode: installing the full tree (code + database + uploads)"
  cp -a "$SRC/." "$APP_ROOT/"
fi

# ------------------------------------------------- ownership + permissions
chown -R "$APP_USER:$APP_USER" "$APP_ROOT"
find "$APP_ROOT" -type d -exec chmod 755 {} +
find "$APP_ROOT" -type f -exec chmod 644 {} +
chmod 700 "$APP_ROOT/data" "$APP_ROOT/logs"
for d in cache backups exports tmp; do
  [ -d "$APP_ROOT/data/$d" ] && chmod 700 "$APP_ROOT/data/$d"
done
for f in "$APP_ROOT/data/linknest.db" "$APP_ROOT/data/.encryption_key"; do
  [ -f "$f" ] && chmod 600 "$f"
done
[ -f "$APP_ROOT/api/config.php" ] || die "install incomplete: api/config.php is missing"

# ---------------------------------------------------------------- sanity
info "size: $(du -sh "$APP_ROOT" | cut -f1)"
if [ -f "$APP_ROOT/data/linknest.db" ]; then
  sudo -u "$APP_USER" "$PHP_BIN" -d display_errors=0 -r \
    "\$d = new PDO('sqlite:$APP_ROOT/data/linknest.db'); echo '  db: integrity=' . \$d->query('PRAGMA integrity_check')->fetchColumn() . ' schema=' . \$d->query('PRAGMA user_version')->fetchColumn() . ' spaces=' . \$d->query('SELECT COUNT(*) FROM tiles')->fetchColumn() . PHP_EOL;" \
    2>/dev/null || warn "could not read the database as $APP_USER"
  [ -f "$APP_ROOT/data/.encryption_key" ] || warn "data/.encryption_key missing — encrypted settings (SMTP/SAML/LDAP passwords) cannot be decrypted"
fi
ok "step 10 complete"

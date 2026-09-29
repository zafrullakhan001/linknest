#!/usr/bin/env bash
# Step 50 — point LinkNest at the local OpenLDAP (settings + caches + FPM reload).
. "$(dirname "$0")/env.sh"

if [ "$OPENLDAP" != "yes" ]; then
  log "step 50 · LinkNest ⇄ OpenLDAP — skipped (OPENLDAP=$OPENLDAP)"
  exit 0
fi

log "step 50 · wiring LinkNest to OpenLDAP"
SVC_PW_FILE="$DEPLOY_DIR/openldap-linknest-service-password.txt"
[ -s "$SVC_PW_FILE" ] || die "missing $SVC_PW_FILE (run step 40 first)"

HELPER_DIR="$HOME_DIR/ldap-setup"
install -d -m 755 -o root -g root "$HELPER_DIR"
install -m 644 -o root -g root "$(dirname "$0")/linknest-ldap-settings.php" "$HELPER_DIR/linknest-ldap-settings.php"

cat "$SVC_PW_FILE" | sudo -u "$APP_USER" "$PHP_BIN" -d display_errors=0 \
  "$HELPER_DIR/linknest-ldap-settings.php" \
  "$LDAP_BASE_DN" "$LDAP_DOMAIN" "$LDAP_HOST" "$LDAP_PORT" "$LDAP_SERVICE_DN" "$APP_ROOT" \
  || die "could not apply the LDAP settings"

rm -f "$APP_ROOT"/data/cache/*.json 2>/dev/null || true
systemctl reload "$SERVICE"
sleep 2
systemctl is-active "$SERVICE" >/dev/null || die "$SERVICE is not active after reload"
ok "step 50 complete — LinkNest now authenticates against $LDAP_HOST:$LDAP_PORT"

#!/usr/bin/env bash
# Step 90 — post-deploy verification (app, edge, PHP, OpenLDAP, regressions).
. "$(dirname "$0")/env.sh"

log "step 90 · verification"
pass=0; fail=0
chk() {
  if [ "$2" = "$3" ]; then ok "$1 ($3)"; pass=$((pass+1));
  else warn "$1 — expected $2, got $3"; fail=$((fail+1)); fi
}
BASE="https://$DOMAIN"
code() { curl -s -k -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || true; }

# ------------------------------------------------------------------- app
chk "http -> 301 redirect" 301 "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/ 2>/dev/null || true)"
chk "https root"           200 "$(code "$BASE/")"
chk "api/settings"         200 "$(code "$BASE/api/settings")"
ASSET="$(grep -o '/assets/js/index-[A-Za-z0-9_-]*\.js' "$APP_ROOT/dist/index.html" 2>/dev/null | head -1 || true)"
[ -n "$ASSET" ] && chk "spa bundle $ASSET" 200 "$(code "$BASE$ASSET")"
chk "spa deep-link fallback" 200 "$(code "$BASE/some/unknown/route")"

# ------------------------------------------------------------- protection
chk "php in uploads blocked" 403 "$(code "$BASE/uploads/x.php")"
chk "data/ blocked"          403 "$(code "$BASE/data/linknest.db")"
chk "config/ blocked"        403 "$(code "$BASE/config/SamlConfig.php")"
chk "dotfile blocked"        403 "$(code "$BASE/.env")"
if [ "$(curl -s -k "$BASE/api/config.php" 2>/dev/null | grep -c '<?php' || true)" = "0" ]; then
  ok "api/config.php is executed, not served as source"
else
  warn "api/config.php appears to be served as source"
  fail=$((fail+1))
fi

# --------------------------------------------------------------- data/tests
UP="$(ls "$APP_ROOT/uploads" 2>/dev/null | grep -Ei '\.(png|jpe?g)$' | head -1 || true)"
[ -n "$UP" ] && chk "legacy /linknest/uploads alias" 200 "$(code "$BASE/linknest/uploads/$UP")"
chk "api/auth/me"        200 "$(code "$BASE/api/auth/me")"
chk "bad login rejected" 401 "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
                              --data-binary '{"username":"__nope__","password":"__nope__"}')"

# ---------------------------------------------------------------- services
for s in nginx "$SERVICE"; do
  if systemctl list-unit-files "$s.service" >/dev/null 2>&1; then
    info "$s = $(systemctl is-active "$s" 2>/dev/null || true)"
  fi
done
if nginx -t >/dev/null 2>&1; then ok "nginx configuration valid"; else warn "nginx configuration INVALID"; fail=$((fail+1)); fi
info "memory: $(free -m | awk '/^Mem:/{print $3" MB used / "$2" MB total, "$7" MB available"}')"
FREE_MB="$(free -m | awk '/^Mem:/{print $7}')"
[ "${FREE_MB:-9999}" -lt 150 ] && warn "only ${FREE_MB} MB RAM available — consider lowering pm.max_children ($MAX_CHILDREN)"

# ---------------------------------------------------------------- OpenLDAP
if [ "$OPENLDAP" = "yes" ] && systemctl is-active slapd >/dev/null 2>&1; then
  LISTENER="$(ss -tlnp 2>/dev/null | grep ":$LDAP_PORT " | awk '{print $4}' | head -1 || true)"
  ok "slapd active on ${LISTENER:-?}"
  case "$LISTENER" in
    0.0.0.0:*|"[::]:"*) warn "slapd is exposed on all interfaces"; fail=$((fail+1)) ;;
  esac
  SVC_PW_FILE="$DEPLOY_DIR/openldap-linknest-service-password.txt"
  if [ -s "$SVC_PW_FILE" ] && ldapwhoami -x -H "ldap://$LDAP_HOST:$LDAP_PORT" \
        -D "$LDAP_SERVICE_DN" -w "$(cat "$SVC_PW_FILE")" >/dev/null 2>&1; then
    ok "service bind works ($LDAP_SERVICE_DN)"
  else
    warn "service bind failed"
    fail=$((fail+1))
  fi
  info "directory: $(ldapsearch -x -H "ldap://$LDAP_HOST:$LDAP_PORT" -D "$LDAP_SERVICE_DN" \
        -w "$(cat "$SVC_PW_FILE" 2>/dev/null)" -b "ou=people,$LDAP_BASE_DN" '(uid=*)' dn 2>/dev/null \
        | grep -c '^dn:' || true) user(s)"
  CSV="$DEPLOY_DIR/openldap-user-passwords.csv"
  if [ -s "$CSV" ]; then
    U="$(awk -F, 'NR>1{print $1; exit}' "$CSV")"
    P="$(awk -F, -v U="$U" '$1==U{print $2}' "$CSV")"
    C="$(curl -s -k -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
          -H 'Content-Type: application/json' --data-binary "{\"username\":\"$U\",\"password\":\"$P\"}" 2>/dev/null || true)"
    info "LDAP login '$U' -> $C   (200 ok · 403 pending admin approval · 401 bad password)"
  fi
else
  if [ "$OPENLDAP" = "yes" ]; then warn "slapd is not active"; fail=$((fail+1)); else info "OpenLDAP skipped by request"; fi
fi

printf '\n  RESULT: %s passed, %s failed\n' "$pass" "$fail"
printf '  URL:      %s\n' "$BASE"
printf '  app root: %s\n' "$APP_ROOT"
[ "$OPENLDAP" = "yes" ] && printf '  add user: %s/openldap-add-user.sh <username> "<Display Name>"\n' "$DEPLOY_DIR"
[ "$fail" -eq 0 ] || printf '  NOTE:     review the warnings above\n'

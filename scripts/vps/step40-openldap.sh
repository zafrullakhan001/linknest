#!/usr/bin/env bash
# Step 40 — OpenLDAP: install (if needed), harden, provision the LinkNest tree.
# Idempotent: re-running only repairs what is missing.
. "$(dirname "$0")/env.sh"

if [ "$OPENLDAP" != "yes" ]; then
  log "step 40 · OpenLDAP — skipped (OPENLDAP=$OPENLDAP)"
  exit 0
fi

log "step 40 · OpenLDAP (slapd)"
ADMIN_PW_FILE="$DEPLOY_DIR/openldap-admin-password.txt"
SVC_PW_FILE="$DEPLOY_DIR/openldap-linknest-service-password.txt"
PROVISION="$DEPLOY_DIR/openldap-provision-linknest.sh"
[ -f "$PROVISION" ] || die "missing $PROVISION"

ensure_pw_file() { if [ ! -s "$1" ]; then umask 077; openssl rand -hex 12 > "$1"; chmod 600 "$1"; fi; }

FRESH_PW=no
if [ ! -s "$ADMIN_PW_FILE" ]; then ensure_pw_file "$ADMIN_PW_FILE"; FRESH_PW=yes; fi
ADMIN_PW="$(cat "$ADMIN_PW_FILE")"

# ---------------------------------------------------------------- install
if dpkg -s slapd >/dev/null 2>&1; then
  ok "slapd already installed"
else
  info "installing slapd + ldap-utils (non-interactive)"
  command -v debconf-set-selections >/dev/null 2>&1 || die "debconf is required for a non-interactive slapd install"
  export DEBIAN_FRONTEND=noninteractive
  cat > /tmp/slapd.preseed <<EOF
slapd shared/organization string $LDAP_ORG
slapd slapd/domain string $LDAP_DOMAIN
slapd slapd/backend select MDB
slapd slapd/password1 password $ADMIN_PW
slapd slapd/password2 password $ADMIN_PW
slapd slapd/no_configuration boolean false
slapd slapd/invalid_config boolean false
slapd slapd/allow_ldap_v2 boolean false
EOF
  debconf-set-selections /tmp/slapd.preseed
  apt-get update -qq
  apt-get install -y -qq slapd ldap-utils >"$DEPLOY_DIR/apt-slapd.log" 2>&1 \
    || { tail -30 "$DEPLOY_DIR/apt-slapd.log"; die "slapd installation failed"; }
  ok "slapd installed"
fi
systemctl enable --now slapd >/dev/null 2>&1 || true

# ------------------------------------------------- suffix safety + root pw
SUFFIX="$(ldapsearch -Y EXTERNAL -H ldapi:/// -b cn=config '(olcSuffix=*)' olcSuffix 2>/dev/null | awk '/^olcSuffix:/{print $2; exit}')"
DB_DN="$(ldapsearch -Y EXTERNAL -H ldapi:/// -b cn=config '(olcDatabase=mdb)' dn 2>/dev/null | awk '/^dn: olcDatabase/{print $2; exit}')"
[ -n "$DB_DN" ] || die "could not locate the slapd MDB database in cn=config"
if [ -n "$SUFFIX" ] && [ "$SUFFIX" != "$LDAP_BASE_DN" ]; then
  die "this slapd serves '$SUFFIX' but LDAP_BASE_DN is '$LDAP_BASE_DN' — refusing to touch an unrelated directory (set -LdapBaseDn, or remove slapd first)"
fi
if [ "$FRESH_PW" = yes ]; then
  HASH="$(slappasswd -s "$ADMIN_PW")"
  ldapmodify -Y EXTERNAL -H ldapi:/// >/dev/null <<LDIF
dn: $DB_DN
changetype: modify
replace: olcRootPW
olcRootPW: $HASH
LDIF
  warn "an existing slapd had no stored admin password — root DN password set to the value in $ADMIN_PW_FILE"
fi

# ------------------------------------------------------- loopback-only bind
WANT_SVC="SLAPD_SERVICES=\"ldap://$LDAP_HOST:$LDAP_PORT/ ldapi:///\""
if [ "$(grep '^SLAPD_SERVICES' /etc/default/slapd || true)" = "$WANT_SVC" ]; then
  ok "listener already restricted to $LDAP_HOST:$LDAP_PORT"
else
  cp -a /etc/default/slapd "$DEPLOY_DIR/default-slapd.bak.$(date +%s)"
  sed -i "s|^SLAPD_SERVICES=.*|$WANT_SVC|" /etc/default/slapd
  systemctl restart slapd
  sleep 2
  ok "listener restricted to $LDAP_HOST:$LDAP_PORT (slapd restarted)"
fi
systemctl is-active slapd >/dev/null || die "slapd is not running — check journalctl -u slapd"

# ------------------------------------------------------- memberof overlay
if ldapsearch -Y EXTERNAL -H ldapi:/// -b cn=config '(olcModuleLoad=memberof.la)' dn 2>/dev/null | grep -q '^dn:'; then
  ok "memberof module already loaded"
elif ldapmodify -Y EXTERNAL -H ldapi:/// >/tmp/ln-mod.err 2>&1 <<'LDIF'
dn: cn=module{0},cn=config
changetype: modify
add: olcModuleLoad
olcModuleLoad: memberof.la
LDIF
then
  ok "memberof.la loaded"
elif grep -qi 'already exists' /tmp/ln-mod.err; then
  ok "memberof module already loaded"
else
  cat /tmp/ln-mod.err
  die "could not load the memberof module"
fi
if ldapsearch -Y EXTERNAL -H ldapi:/// -b "$DB_DN" '(objectClass=olcMemberOf)' dn 2>/dev/null | grep -q '^dn:'; then
  ok "memberof overlay already configured"
elif ldapmodify -Y EXTERNAL -H ldapi:/// >/tmp/ln-ov.err 2>&1 <<LDIF
dn: olcOverlay=memberof,$DB_DN
changetype: add
objectClass: olcOverlayConfig
objectClass: olcMemberOf
olcOverlay: memberof
olcMemberOfDangling: ignore
olcMemberOfRefInt: FALSE
olcMemberOfGroupOC: groupOfNames
olcMemberOfMemberAD: member
olcMemberOfMemberOfAD: memberOf
LDIF
then
  ok "memberof overlay added"
elif grep -qi 'already exists' /tmp/ln-ov.err; then
  ok "memberof overlay already configured"
else
  cat /tmp/ln-ov.err
  die "could not add the memberof overlay"
fi

# ------------------------------------------------------------------- ACLs
if ldapsearch -Y EXTERNAL -H ldapi:/// -b "$DB_DN" olcAccess 2>/dev/null | grep -q "cn=linknest,ou=services,$LDAP_BASE_DN"; then
  ok "ACLs already limited to the service account"
elif ldapmodify -Y EXTERNAL -H ldapi:/// >/tmp/ln-acl.err 2>&1 <<LDIF
dn: $DB_DN
changetype: modify
replace: olcAccess
olcAccess: {0}to attrs=userPassword,shadowLastChange by self write by anonymous auth by * none
olcAccess: {1}to * by dn.exact="$LDAP_SERVICE_DN" read by * none
LDIF
then
  ok "ACLs set: anonymous denied, service account read-only"
else
  cat /tmp/ln-acl.err
  die "could not apply the slapd ACLs"
fi

# ------------------------------------------------------------------ provision
ensure_pw_file "$SVC_PW_FILE"
if [ -n "${LDAP_SERVICE_PASSWORD:-}" ]; then
  umask 077; printf '%s' "$LDAP_SERVICE_PASSWORD" > "$SVC_PW_FILE"; chmod 600 "$SVC_PW_FILE"
fi
SVC_PW="$(cat "$SVC_PW_FILE")"
BASE_DN="$LDAP_BASE_DN" LDAP_URI="ldap://$LDAP_HOST:$LDAP_PORT" \
  bash "$PROVISION" "$ADMIN_PW" "$SVC_PW" | sed 's/^/  /'

# --------------------------------------------------------------------- check
echo -n "  external exposure of $LDAP_PORT: "
if ss -tlnp | grep -qE "0\.0\.0\.0:$LDAP_PORT |\[::\]:$LDAP_PORT "; then
  warn "slapd is listening on all interfaces — expected $LDAP_HOST only"
else
  ok "loopback only"
fi
ok "step 40 complete (admin password: $ADMIN_PW_FILE, service password: $SVC_PW_FILE)"

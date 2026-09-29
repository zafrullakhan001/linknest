#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# openldap-provision-linknest.sh
#
# Creates (or repairs) the LinkNest directory skeleton in a local OpenLDAP
# server: the OUs, and the read-only service bind account that LinkNest uses.
#
# Usage:
#   sudo bash scripts/openldap-provision-linknest.sh <admin-password> [service-password]
#
#   <admin-password>    password of cn=admin,<base> (the slapd root DN)
#   [service-password]  optional; generated and printed when omitted
#
# Base DN / URI can be overridden:
#   BASE_DN=dc=example,dc=com LDAP_URI=ldap://127.0.0.1:389 bash scripts/openldap-provision-linknest.sh ...
#
# Groups (cn=linknest-users / cn=linknest-admins) are created on demand by
# scripts/openldap-add-user.sh, because groupOfNames requires a member.
# ---------------------------------------------------------------------------
set -euo pipefail

BASE_DN="${BASE_DN:-dc=oneflorida,dc=org}"
LDAP_URI="${LDAP_URI:-ldap://127.0.0.1:389}"
ADMIN_DN="${ADMIN_DN:-cn=admin,${BASE_DN}}"
ADMIN_PASS="${1:-}"
SERVICE_PASS="${2:-}"

if [ -z "$ADMIN_PASS" ]; then
  echo "usage: $0 <admin-password> [service-password]" >&2
  exit 2
fi
if ! command -v ldapsearch >/dev/null 2>&1; then
  echo "ldap-utils is required (apt-get install -y ldap-utils)" >&2
  exit 1
fi

CREDS=(-x -H "$LDAP_URI" -D "$ADMIN_DN" -w "$ADMIN_PASS")

echo "== connectivity / bind test =="
ldapwhoami "${CREDS[@]}"

echo "== base entry =="
ldapsearch "${CREDS[@]}" -b "$BASE_DN" -s base dn >/dev/null

echo "== organizational units =="
for ou in people groups services; do
  if ldapsearch "${CREDS[@]}" -b "ou=$ou,$BASE_DN" -s base dn >/dev/null 2>&1; then
    echo "  ou=$ou already present"
  else
    ldapadd "${CREDS[@]}" >/dev/null <<LDIF
dn: ou=$ou,$BASE_DN
objectClass: organizationalUnit
ou: $ou
LDIF
    echo "  created ou=$ou"
  fi
done

echo "== service bind account =="
if [ -z "$SERVICE_PASS" ]; then
  SERVICE_PASS="$(openssl rand -hex 16)"
  echo "  generated service password: $SERVICE_PASS"
fi
SVC_HASH="$(slappasswd -s "$SERVICE_PASS")"
SVC_DN="cn=linknest,ou=services,$BASE_DN"
if ldapsearch "${CREDS[@]}" -b "$SVC_DN" -s base dn >/dev/null 2>&1; then
  ldapmodify "${CREDS[@]}" >/dev/null <<LDIF
dn: $SVC_DN
changetype: modify
replace: userPassword
userPassword: $SVC_HASH
LDIF
  echo "  existing service account -> password updated"
else
  ldapadd "${CREDS[@]}" >/dev/null <<LDIF
dn: $SVC_DN
objectClass: organizationalRole
objectClass: simpleSecurityObject
cn: linknest
description: LinkNest service bind account
userPassword: $SVC_HASH
LDIF
  echo "  service account created"
fi

echo "== summary =="
echo "  base DN        : $BASE_DN"
echo "  admin DN       : $ADMIN_DN"
echo "  service bind DN: $SVC_DN"
echo "  service unix pw: $SERVICE_PASS   (store it, e.g. LinkNest Admin -> LDAP -> Bind Password)"
echo "  next           : add users with scripts/openldap-add-user.sh <username> \"<Display Name>\""
ldapsearch "${CREDS[@]}" -b "$BASE_DN" "(objectClass=*)" dn 2>/dev/null | grep -c '^dn:' | sed 's/^/  entries now: /'

#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# openldap-add-user.sh — add (or reset) a LinkNest user in the local OpenLDAP
#
# Usage:
#   ./openldap-add-user.sh <username> "<Display Name>" [email] [password]
#
#   username      login id, stored as uid (lowercased). e.g. jdoe
#   Display Name  shown in LinkNest (cn / displayName). Quote it if it has spaces
#   email         optional, defaults to <username>@oneflorida.org
#   password      optional; when omitted a random one is generated and saved
#
# Examples:
#   ./openldap-add-user.sh jdoe "John Doe"
#   ./openldap-add-user.sh jdoe "John Doe" john.doe@oneflorida.org
#   ./openldap-add-user.sh jdoe "John Doe" john.doe@oneflorida.org 'MyPassw0rd!'
#
# Existing users are updated (password / displayName / mail reset).
# Generated credentials are recorded in openldap-user-passwords.csv (root-only).
# ---------------------------------------------------------------------------
set -euo pipefail

BASE="dc=oneflorida,dc=org"
URI="ldap://127.0.0.1:389"
OUT=/root/linknest-deploy
CSV="$OUT/openldap-user-passwords.csv"
ADMIN_PASS="$(cat "$OUT/openldap-admin-password.txt")"
CREDS=(-x -H "$URI" -D "cn=admin,$BASE" -w "$ADMIN_PASS")

USERNAME="${1:-}"; DISPLAY="${2:-}"; EMAIL="${3:-}"; PASSWORD="${4:-}"
if [ -z "$USERNAME" ] || [ -z "$DISPLAY" ]; then
  echo "usage: $(basename "$0") <username> \"<Display Name>\" [email] [password]" >&2
  exit 2
fi
USERNAME="$(printf '%s' "$USERNAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9._-')"
[ -n "$USERNAME" ] || { echo "invalid username" >&2; exit 2; }
EMAIL="${EMAIL:-$USERNAME@oneflorida.org}"
GEN=0
if [ -z "$PASSWORD" ]; then PASSWORD="$(openssl rand -hex 8)"; GEN=1; fi
HASH="$(slappasswd -s "$PASSWORD")"
SURNAME="$(printf '%s' "$DISPLAY" | awk '{print $NF}')"
DN="uid=$USERNAME,ou=people,$BASE"

if ldapsearch "${CREDS[@]}" -b "$DN" -s base dn >/dev/null 2>&1; then
  ACTION="updated (password/displayName/mail reset)"
  ldapmodify "${CREDS[@]}" >/dev/null <<LDIF
dn: $DN
changetype: modify
replace: userPassword
userPassword: $HASH
-
replace: displayName
displayName: $DISPLAY
-
replace: cn
cn: $DISPLAY
-
replace: mail
mail: $EMAIL
LDIF
else
  ACTION="created"
  ldapadd "${CREDS[@]}" >/dev/null <<LDIF
dn: $DN
objectClass: inetOrgPerson
uid: $USERNAME
cn: $DISPLAY
sn: $SURNAME
displayName: $DISPLAY
mail: $EMAIL
userPassword: $HASH
LDIF
  GRP_DN="cn=linknest-users,ou=groups,$BASE"
  if ldapsearch "${CREDS[@]}" -b "$GRP_DN" -s base dn >/dev/null 2>&1; then
    if ! ldapsearch "${CREDS[@]}" -b "$GRP_DN" "(member=$DN)" dn 2>/dev/null | grep -q '^dn:'; then
      ldapmodify "${CREDS[@]}" >/dev/null <<LDIF
dn: $GRP_DN
changetype: modify
add: member
member: $DN
LDIF
    fi
  else
    # groupOfNames requires at least one member, so create it with this user
    ldapadd "${CREDS[@]}" >/dev/null <<LDIF
dn: $GRP_DN
objectClass: groupOfNames
cn: linknest-users
member: $DN
LDIF
  fi
fi

# record credentials
if [ -f "$CSV" ]; then
  (grep -v "^$USERNAME," "$CSV" || true) > "$CSV.tmp"
else
  printf 'username,password,dn\n' > "$CSV.tmp"
fi
printf '%s,%s,%s\n' "$USERNAME" "$PASSWORD" "$DN" >> "$CSV.tmp"
mv "$CSV.tmp" "$CSV"
chmod 600 "$CSV"

# prove the credentials work
if ldapwhoami -x -H "$URI" -D "$DN" -w "$PASSWORD" >/dev/null 2>&1; then
  BIND="OK"
else
  BIND="FAILED"
fi

echo "-----------------------------------------------"
echo " action    : $ACTION"
echo " username  : $USERNAME"
echo " display   : $DISPLAY"
echo " email     : $EMAIL"
echo " dn        : $DN"
if [ "$GEN" = "1" ]; then echo " password  : $PASSWORD   (generated)";
else echo " password  : (as supplied)"; fi
echo " bind test : $BIND"
echo " recorded  : $CSV"
echo " sign in   : https://linknest.198-251-72-41.nip.io/"
echo " note      : an admin must approve the account once (Admin -> Users) the"
echo "             first time the user signs in, otherwise they see"
echo "             'pending admin approval'."
echo "-----------------------------------------------"

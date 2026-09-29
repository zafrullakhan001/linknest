#!/usr/bin/env bash
# Shared environment + helpers for the LinkNest VPS deploy steps.
# Reads /root/linknest-deploy/deploy.env (written by scripts/deploy-vps-linknest.ps1)
# and derives everything else. Sourced by every step*.sh.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/root/linknest-deploy}"
ENV_FILE="$DEPLOY_DIR/deploy.env"
[ -f "$ENV_FILE" ] || { echo "FATAL: $ENV_FILE missing"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# ---- derived defaults ------------------------------------------------------
# PHP_VER may come from deploy.env; ignore it when it does not exist here
if [ -n "${PHP_VER:-}" ] && [ ! -d "/etc/php/$PHP_VER/fpm" ]; then
  printf '  [warn] PHP_VER=%s from deploy.env is not installed here — auto-detecting\n' "$PHP_VER" >&2
  PHP_VER=""
fi
if [ -z "${PHP_VER:-}" ]; then
  PHP_VER="$(ls -d /etc/php/*/fpm 2>/dev/null | sed 's#^/etc/php/##; s#/fpm$##' | sort -V | tail -1 || true)"
fi
[ -n "${PHP_VER:-}" ] || { echo "FATAL: no /etc/php/*/fpm found — is PHP-FPM installed?" >&2; exit 1; }
APP_USER="${APP_USER:-linknest}"
HOME_DIR="/home/$APP_USER"
APP_ROOT="${APP_ROOT:-$HOME_DIR/htdocs}"
SESSIONS_DIR="${SESSIONS_DIR:-$HOME_DIR/sessions}"
POOL="${POOL:-linknest}"
FPM_SOCKET="${FPM_SOCKET:-/run/php/${POOL}-fpm.sock}"
SITE="${SITE:-linknest}"
SERVICE="php${PHP_VER}-fpm"
FPM_BIN="/usr/sbin/php-fpm${PHP_VER}"
PHP_BIN="/usr/bin/php${PHP_VER}"
MAX_CHILDREN="${MAX_CHILDREN:-3}"
MEMORY_LIMIT="${MEMORY_LIMIT:-384M}"
DEPLOY_MODE="${DEPLOY_MODE:-auto}"
TARBALL="${TARBALL:-}"
OPENLDAP="${OPENLDAP:-yes}"
LDAP_HOST="${LDAP_HOST:-127.0.0.1}"
LDAP_PORT="${LDAP_PORT:-389}"
LDAP_BASE_DN="${LDAP_BASE_DN:-dc=oneflorida,dc=org}"
LDAP_DOMAIN="${LDAP_DOMAIN:-oneflorida.org}"
LDAP_ORG="${LDAP_ORG:-$LDAP_DOMAIN}"
LDAP_SERVICE_DN="${LDAP_SERVICE_DN:-cn=linknest,ou=services,$LDAP_BASE_DN}"
EDGE="${EDGE:-nginx}"

log()  { printf '\n=== %s ===\n' "$*"; }
ok()   { printf '  [ok]   %s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '  [warn] %s\n' "$*"; }
die()  { printf '  [FAIL] %s\n' "$*" >&2; exit 1; }

esc() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; }

# render <template> <dest> — substitutes __VARS__ placeholders
render() {
  local tpl="$1" dest="$2"
  sed -e "s|__DOMAIN__|$(esc "$DOMAIN")|g" \
      -e "s|__APP_ROOT__|$(esc "$APP_ROOT")|g" \
      -e "s|__APP_USER__|$(esc "$APP_USER")|g" \
      -e "s|__HOME_DIR__|$(esc "$HOME_DIR")|g" \
      -e "s|__SESSIONS_DIR__|$(esc "$SESSIONS_DIR")|g" \
      -e "s|__POOL__|$(esc "$POOL")|g" \
      -e "s|__SITE__|$(esc "$SITE")|g" \
      -e "s|__FPM_SOCKET__|$(esc "$FPM_SOCKET")|g" \
      -e "s|__PHP_VER__|$(esc "$PHP_VER")|g" \
      -e "s|__MAX_CHILDREN__|$(esc "$MAX_CHILDREN")|g" \
      -e "s|__MEMORY_LIMIT__|$(esc "$MEMORY_LIMIT")|g" \
      "$tpl" > "$dest"
}

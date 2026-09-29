#!/usr/bin/env bash
# Remote host facts for the deployer (one KEY=VALUE per line).
# Usage: facts.sh <app_root> <domain> <app_user>
APP_ROOT="${1:-/home/linknest/htdocs}"
DOMAIN="${2:-}"
APP_USER="${3:-linknest}"

# shellcheck disable=SC1091
. /etc/os-release 2>/dev/null || true

echo "os=${PRETTY_NAME:-unknown}"
echo "kernel=$(uname -r)"
echo "nginx=$(command -v nginx >/dev/null 2>&1 && echo yes || echo no)"
echo "php=$(ls -d /etc/php/*/fpm 2>/dev/null | sed 's#^/etc/php/##; s#/fpm$##' | sort -V | tail -1)"
echo "php_bin=$(command -v "php$(ls -d /etc/php/*/fpm 2>/dev/null | sed 's#^/etc/php/##; s#/fpm$##' | sort -V | tail -1)" >/dev/null 2>&1 && echo yes || echo no)"
echo "certbot=$(command -v certbot >/dev/null 2>&1 && echo yes || echo no)"
echo "slapd=$(dpkg -s slapd >/dev/null 2>&1 && echo yes || echo no)"
echo "php_fpm_active=$(systemctl is-active "php$(ls -d /etc/php/*/fpm 2>/dev/null | sed 's#^/etc/php/##; s#/fpm$##' | sort -V | tail -1)-fpm" 2>/dev/null || echo unknown)"
echo "disk_avail=$(df -h / | awk 'NR==2{print $4}')"
echo "mem_avail_mb=$(free -m | awk '/^Mem:/{print $7}')"
echo "app_installed=$([ -f "$APP_ROOT/api/index.php" ] && echo yes || echo no)"
if [ -n "$DOMAIN" ] && [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then echo "cert=yes"; else echo "cert=no"; fi
echo "user=$(id -u "$APP_USER" >/dev/null 2>&1 && echo yes || echo no)"

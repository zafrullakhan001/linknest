#!/usr/bin/env bash
# Step 30 — nginx site + Let's Encrypt certificate.
#   phase A: HTTP-only vhost (so the ACME challenge is reachable)
#   phase B: full HTTPS vhost
# Re-running is safe: an existing certificate is reused and renewed by certbot's timer.
. "$(dirname "$0")/env.sh"

log "step 30 · nginx site + TLS"
[ "$EDGE" = "nginx" ] || die "this deployer supports the nginx edge only (EDGE=$EDGE)"
command -v nginx >/dev/null 2>&1 || die "nginx is not installed"
command -v certbot >/dev/null 2>&1 || die "certbot is not installed: apt-get install -y certbot"

AVAIL="/etc/nginx/sites-available/$SITE"
ENABLED="/etc/nginx/sites-enabled/$SITE"
ACME_DIR="$APP_ROOT/.well-known/acme-challenge"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_ROOT/.well-known" "$ACME_DIR"

# ---------------------------------------------------------- phase A (HTTP)
cat > "/tmp/$SITE.http.conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location ^~ /.well-known/acme-challenge/ {
        root $APP_ROOT;
        default_type "text/plain";
        allow all;
    }

    location / {
        default_type "text/plain";
        return 200 "LinkNest: deployment in progress\n";
    }
}
EOF
[ -e "$AVAIL" ] && cp -a "$AVAIL" "$AVAIL.bak.$(date +%s)"
install -m 644 "/tmp/$SITE.http.conf" "$AVAIL"
ln -sfn "$AVAIL" "$ENABLED"
nginx -t || die "nginx rejected the phase-A config"
systemctl reload nginx
ok "phase A vhost active (ACME reachable over HTTP)"

# ------------------------------------------------------------ certificate
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  ok "certificate for $DOMAIN already exists (renewed automatically)"
else
  EMAIL_ARGS=()
  if [ -n "${LE_EMAIL:-}" ]; then
    EMAIL_ARGS=(-m "$LE_EMAIL")
  else
    EXISTING="$( (grep -ho 'mailto:[^"]*' /etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory/*/regr.json 2>/dev/null || true) | head -1 | sed 's/^mailto://' || true)"
    if [ -n "$EXISTING" ]; then
      EMAIL_ARGS=(-m "$EXISTING")
      info "reusing ACME account contact: $EXISTING"
    fi
  fi
  if [ ${#EMAIL_ARGS[@]} -eq 0 ]; then
    die "no ACME account contact found — pass -LeEmail you@example.com to this deployer"
  fi
  info "requesting certificate for $DOMAIN"
  certbot certonly --webroot -w "$APP_ROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring "${EMAIL_ARGS[@]}" \
    || die "certbot failed (is $DOMAIN pointing at this server?)"
fi

# ---------------------------------------------------------- phase B (HTTPS)
render "$(dirname "$0")/templates/nginx-linknest.conf" "/tmp/$SITE.conf.new"
install -m 644 "/tmp/$SITE.conf.new" "$AVAIL"
nginx -t || die "nginx rejected the final config (see /tmp/$SITE.conf.new)"
systemctl reload nginx
systemctl is-active nginx >/dev/null || die "nginx is not running"

echo -n "  probe: http="
curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/ || true
echo -n "  https="
curl -s -k -o /dev/null -w '%{http_code}\n' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true
info "site config: $AVAIL"
ok "step 30 complete"

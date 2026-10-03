#!/usr/bin/env bash
# Einmalige Einrichtung von chaoslauncher.duckdns.org auf dem Server (nginx + Let's Encrypt).
# Ausführen auf dem Server:  sudo bash deploy-server.sh
set -euo pipefail
DOMAIN=chaoslauncher.duckdns.org
ROOT=/var/www/chaoslauncher
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$ROOT/download" "$ROOT/assets" /var/www/certbot
chown -R nginx:nginx "$ROOT"
if command -v semanage >/dev/null 2>&1; then
  semanage fcontext -a -t httpd_sys_content_t "$ROOT(/.*)?" 2>/dev/null || true
  restorecon -R "$ROOT"
fi
cp "$HERE/nginx-chaoslauncher.conf" /etc/nginx/conf.d/chaoslauncher.conf
nginx -t && systemctl reload nginx
echo "-- nginx: $DOMAIN eingerichtet (HTTP)"

CERTBOT=$(command -v certbot || echo /home/opc/.local/bin/certbot)
if [ -x "$CERTBOT" ]; then
  if "$CERTBOT" --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect >/tmp/certbot-chaoslauncher.log 2>&1; then
    echo "-- Zertifikat ausgestellt, HTTPS aktiv"
  else
    echo "!! Zertifikat fehlgeschlagen (Port 80/443 von außen erreichbar? Oracle Security List!)"; tail -5 /tmp/certbot-chaoslauncher.log
  fi
else
  echo "!! certbot nicht gefunden"
fi
nginx -t && systemctl reload nginx
echo "Fertig: https://$DOMAIN"

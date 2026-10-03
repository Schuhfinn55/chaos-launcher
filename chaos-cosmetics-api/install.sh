#!/usr/bin/env bash
# ============================================================
# Chaos Cosmetics API – Installation auf dem Minecraft-Server (Linux)
#
#   curl -fsSL <URL>/install.sh | sudo bash
#   oder:  sudo bash install.sh
#
# Installiert Node.js (falls nötig), legt /opt/chaos-cosmetics-api an,
# richtet einen systemd-Dienst ein, öffnet Port 8787 in der lokalen
# Firewall (iptables/ufw) und startet den Dienst. Getestet für
# Ubuntu/Debian (auch Oracle Cloud Ubuntu-Images).
# ============================================================
set -euo pipefail

PORT="${PORT:-8787}"
PUBLIC_URL="${PUBLIC_URL:-http://chaoscraftsmp.duckdns.org:${PORT}}"
TARGET=/opt/chaos-cosmetics-api
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root ausführen: sudo bash install.sh"; exit 1
fi

echo "== Chaos Cosmetics API installieren (Port $PORT, öffentlich $PUBLIC_URL)"

# 1. Node.js
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "-- Node.js 20 wird installiert …"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg >/dev/null
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  elif command -v dnf >/dev/null 2>&1; then
    dnf module enable -y nodejs:20 >/dev/null 2>&1 || true
    dnf install -y nodejs >/dev/null
  else
    echo "Paketmanager nicht erkannt – bitte Node.js ≥ 18 manuell installieren."; exit 1
  fi
fi
echo "-- Node $(node -v)"

# 2. Dateien
mkdir -p "$TARGET/data"
if [ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/server.js" ]; then
  cp "$SRC_DIR/server.js" "$TARGET/server.js"
  [ -f "$SRC_DIR/package.json" ] && cp "$SRC_DIR/package.json" "$TARGET/package.json"
elif [ -f ./server.js ]; then
  cp ./server.js "$TARGET/server.js"
  [ -f ./package.json ] && cp ./package.json "$TARGET/package.json"
else
  echo "server.js nicht gefunden – bitte neben install.sh ablegen."; exit 1
fi
[ -f "$TARGET/package.json" ] || echo '{"name":"chaos-cosmetics-api","type":"commonjs","private":true}' > "$TARGET/package.json"
id -u chaoscosmetics >/dev/null 2>&1 || useradd --system --home "$TARGET" --shell /usr/sbin/nologin chaoscosmetics
chown -R chaoscosmetics:chaoscosmetics "$TARGET"

# 3. systemd-Dienst
cat > /etc/systemd/system/chaos-cosmetics.service <<EOF
[Unit]
Description=Chaos Cosmetics API (Capes, Hüte, Effekte für Chaos Launcher)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=chaoscosmetics
WorkingDirectory=$TARGET
Environment=PORT=$PORT
Environment=PUBLIC_URL=$PUBLIC_URL
Environment=DATA_DIR=$TARGET/data
ExecStart=$(command -v node) $TARGET/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now chaos-cosmetics >/dev/null
systemctl restart chaos-cosmetics

# 4. Firewall (lokal)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp >/dev/null && echo "-- ufw: Port $PORT freigegeben"
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null && firewall-cmd --reload >/dev/null && echo "-- firewalld: Port $PORT freigegeben"
elif command -v iptables >/dev/null 2>&1; then
  if ! iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT >/dev/null 2>&1; then
    iptables -I INPUT 5 -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT
    echo "-- iptables: Port $PORT freigegeben"
    command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
  fi
fi

sleep 1
echo
if curl -fsS "http://127.0.0.1:$PORT/v1/version" >/dev/null 2>&1; then
  echo "== Läuft: $(curl -fsS "http://127.0.0.1:$PORT/v1/version")"
else
  echo "!! Dienst antwortet nicht – Log: journalctl -u chaos-cosmetics -n 50"
fi
echo
echo "Falls der Server bei Oracle Cloud / AWS / Hetzner Cloud liegt: zusätzlich in der"
echo "Web-Konsole eine Ingress-Regel für TCP $PORT anlegen (Oracle: VCN → Security List),"
echo "genau wie für den Minecraft-Port 25565."
echo "Test von außen:  curl $PUBLIC_URL/v1/version"

# Chaos Cosmetics API

**Standard (gehostet):** `https://chaos-cosmetics-api.chaoscraft.workers.dev` – Cloudflare Worker in `worker/` (KV-Speicher, kostenlos). Deploy: `cd worker && npx wrangler login && npx wrangler deploy`. Der Node-Server unten ist die Alternative für einen eigenen Server.


Kleiner Server (Node.js ≥ 18, keine Abhängigkeiten), über den sich Chaos-Spieler gegenseitig **Capes, Hüte und Effekte** sehen. Launcher und Chaos Client nutzen dieselbe Schnittstelle.

## Auf dem Minecraft-Server installieren (Ubuntu/Debian, z. B. Oracle Cloud) – 1 Befehl

Den Ordner `chaos-cosmetics-api` per SCP/SFTP auf den Server kopieren, dann:

```bash
cd chaos-cosmetics-api && sudo bash install.sh
```

Das Skript installiert Node.js (falls nötig), richtet den systemd-Dienst `chaos-cosmetics` ein, öffnet Port 8787 in der lokalen Firewall und startet den Dienst. Bei Cloud-Anbietern zusätzlich in der Web-Konsole eine Ingress-Regel für **TCP 8787** anlegen (Oracle Cloud: VCN → Security List → Ingress Rules; genauso wie für 25565). Prüfen: `curl http://chaoscraftsmp.duckdns.org:8787/v1/version`.

Alle Chaos Launcher ab 2.1.0 nutzen diese Adresse automatisch – niemand muss etwas eintragen.

## Manuell starten

```bash
cd chaos-cosmetics-api
PORT=8787 PUBLIC_URL=https://cosmetics.chaoscraftsmp.duckdns.org node server.js
```

Daten liegen in `./data` (`players.json`, `capes.json`, `capes/*.png`). Unter Windows: `set PORT=8787 && set PUBLIC_URL=https://… && node server.js`.

## HTTPS (nötig für Launcher & Client)

Der Launcher akzeptiert nur `https://`-Adressen (Ausnahme: `http://localhost` und private LAN-IPs zum Testen). Am einfachsten mit **Caddy** als Reverse-Proxy auf derselben Maschine wie der Minecraft-Server:

```
cosmetics.chaoscraftsmp.duckdns.org {
    reverse_proxy 127.0.0.1:8787
}
```

Caddy holt das Zertifikat automatisch (Port 80/443 müssen erreichbar sein, DuckDNS-Subdomain auf die Server-IP zeigen). Alternativ nginx + certbot.

Als Dienst dauerhaft laufen lassen: `pm2 start server.js --name chaos-cosmetics` oder ein systemd-Service / Windows-Aufgabenplanung.

## Im Launcher eintragen

Einstellungen → Cosmetics → **Chaos-Cosmetics-API**: `https://cosmetics.chaoscraftsmp.duckdns.org`. Danach:

- Der Launcher synchronisiert Cape, Hut und Effekt automatisch beim Ändern und vor jedem Spielstart.
- Der Chaos Client fragt für jeden sichtbaren Spieler die API ab (mit lokalem Cache) und rendert dessen Cape, Hut und Effekt.
- Spieler ohne Chaos Client sehen weiterhin normales Minecraft.

## Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/v1/version` | `{apiVersion, cosmeticsVersion, players, capes}` |
| POST | `/v1/auth/challenge` `{uuid,name}` | → `{serverId}` |
| POST | `/v1/auth/verify` `{uuid,name,serverId}` | prüft `hasJoined` bei Mojang → `{token,expiresAt}` (24 h) |
| GET | `/v1/cosmetics/{uuid}` | `{uuid,name,activeCape,hat,effect,visibility,cosmeticsVersion,updatedAt}` |
| POST | `/v1/cosmetics/bulk` `{uuids:[…]}` | bis zu 200 Spieler auf einmal |
| PUT | `/v1/cosmetics/{uuid}` (Bearer) | `{activeCape, hat, effect, visibility}` – nur eigene UUID |
| POST | `/v1/capes` (Bearer) | multipart `file`+`name` oder JSON `{name,dataBase64}` → `RemoteCape` |
| GET | `/v1/capes/{id}/texture` | PNG |

## Sicherheit

- Kein Microsoft-Token verlässt den Launcher: Die Anmeldung läuft über den Mojang-Join-Handshake (`join` beim Launcher, `hasJoined` beim Server).
- Nur PNG mit gültigen Cape-Maßen (64×32 … 2048×1024, Seitenverhältnis 2:1), max. 4 MB, max. 50 Capes pro Spieler.
- Hut-/Effekt-IDs werden bereinigt (a–z, 0–9, `-`, `_`), Schreibzugriffe nur mit Token für die eigene UUID, Rate-Limit 120 Anfragen/Minute/IP.

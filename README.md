# 🔥 Chaos Launcher

Der **Minecraft-Client-Launcher für ChaoscraftSMP** – gebaut mit **Tauri 2 (Rust) + React + TypeScript**. Rot/Schwarz, schnell, mit Profilen, Mod-Manager, Cosmetics (eigene Capes ingame), Serverstatus, News, Updates und Microsoft-Login.

![Chaos Launcher](src-tauri/icons/icon.png)

## ✨ Funktionen

| Bereich | Umfang |
|---|---|
| **Home** | Spielerprofil mit 3D-Skin + Cape, ausgewähltes Profil, großer SPIELEN-Button, zuletzt verwendete Profile, Serverstatus, News, Chaoscraft-Bereich, Download-/Update-Status, Launcher- & Client-Version |
| **Startprüfung** | Launcher-Version → Client-Version → Profil → fehlende Dateien, mit Fortschrittsanzeige |
| **Microsoft-Login** | Device-Code-Flow (kein Passwortfeld), mehrere Accounts: hinzufügen, wechseln, entfernen, Sitzung erneuern. Tokens werden mit Windows DPAPI verschlüsselt gespeichert und nie ans Frontend gegeben |
| **Profile** | Wizard: Version → Loader → Details. Vanilla, Fabric, Forge, NeoForge, Quilt. Eigene RAM-Min/Max, JVM-/Spiel-Argumente, Auflösung, Vollbild, Java-Pfad, Spielverzeichnis, Direktverbindung. Erstellen, bearbeiten, duplizieren, löschen, exportieren/importieren. Vorlagen: Vanilla, PvP, SMP, Modded, Lunar-style PvP, Shaders, Bauen |
| **Versionen** | Alle Releases gruppiert (1.21.x, 1.20.x …), Snapshots optional. Loader-Versionen pro MC-Version mit Verfügbarkeitsprüfung. Forge/NeoForge werden headless über den Installer eingerichtet |
| **Mod-Manager** | Tabs Installiert · Durchsuchen · Updates. Modrinth + CurseForge, Kategorien, Sortierung, Versionsauswahl mit Release/Beta, MC-Version, Loader, Abhängigkeiten (werden automatisch mitinstalliert), inkompatible Mods markiert, aktivieren/deaktivieren/entfernen, Update-Prüfung, eigene .jar/.zip |
| **Cosmetics** | Skins (Upload, Vorschau, auf Mojang-Account anwenden), **Meine Capes** (hochladen, Format-Prüfung 64×32 & Vielfache, umbenennen, aktivieren/deaktivieren, löschen, Chaos-Vorlagen), Hüte & Effekte als vorbereitete Kategorien. 3D-Vorschau: drehen, zoomen, Cape an/aus, Idle/Geh-/Laufanimation |
| **Capes ingame** | Der gebündelte **Chaos Client** (Fabric-Mod) rendert das aktive Cape am Spieler (Mixin auf `PlayerListEntry.getSkinTextures`). Andere Chaos-Spieler sehen es über die Chaos-Cosmetics-API; Spieler ohne Chaos-Client sehen normales Minecraft. Ingame kann das Cape aus der Bibliothek gewechselt werden – der Launcher übernimmt die Wahl |
| **Chaos Client (ingame)** | **RIGHT SHIFT** (frei belegbar) oder `/chaos` öffnet das CHAOS-Menü: Modul-Suche, 15 Kategorien, HUD-Editor mit Snap, FPS/CPS/Keystrokes/Koordinaten/Armor/Effekte/Scoreboard/Tablist, Crosshair-Editor, Damage Indicator, Waypoints, Zoom, Fullbright, Free Look, Performance Center (LOW/BALANCED/HIGH/CUSTOM), Cosmetics & Emotes, Social, Server-Schnellmenü, Chat-Filter/Highlights, Music Player, Notifications, Keybind-Manager, Client-Profile mit Import/Export, Chaos Theme, ESC-Menü-Buttons. Details: `../onyx-visuals/README.md` |
| **Server** | ChaoscraftSMP-Status (Server List Ping: online, Spieler, Max, Ping, Version, MOTD), eigene Server, Direktverbindung beim Start |
| **Chaoscraft** | Eigener Bereich mit Status, Profil, News, Events und **CHAOSCRAFT SPIELEN**: legt das Profil an, installiert die Mods und startet |
| **News** | Eingebaute News + externe JSON-Quelle (konfigurierbar), Kategorien, Detailansicht |
| **Einstellungen** | Allgemein (Sprache, Startverhalten, Animationen, Benachrichtigungen), Darstellung (Dark/Light, Akzentfarbe, Transparenz, UI-Skalierung, Hintergründe), Minecraft (Standardversion/-profil, RAM mit System-RAM-Anzeige, JVM, Java-Erkennung & -Download, Vollbild, Auflösung), Cosmetics, **Chaos Client** (Menütaste, Client-Update mit SHA-256-Prüfung, Sync mit dem Ingame-Menü, Open-Source-Lizenzen), Launcher (Auto-Update, Kanal, Download-Limit, Cache, Reparatur, Logs), Discord Rich Presence, Chaoscraft (Server-Adresse, News-URL) |
| **Fehlerbehandlung** | Strukturierte Fehler mit Grund, Aktionen (Reparieren, Java installieren, Anmelden, Logs, Profil zurücksetzen) und ausklappbaren Details. ErrorBoundary im UI. Crash-Analyse |
| **Extras (aus dem Onyx Launcher erhalten)** | Client-Module (Ingame-Menü), Welten (Backup/Löschen), Freunde, Musik, Kino |

## 🚀 Entwicklung

Voraussetzungen: Node.js ≥ 20, Rust ≥ 1.77, MSVC Build Tools, Java 21 (für die Mod).

```bash
npm install
npm run tauri dev      # Launcher mit Hot-Reload
npm run tauri build    # Installer unter src-tauri/target/release/bundle/nsis/
```

Nur Frontend (Mock-Daten): `npm run dev` → http://localhost:1420

### Chaos Client (Fabric-Mod)

Quelle: `../onyx-visuals` (Package `com.chaoscraft.client`, Mod-ID `chaosclient`, Version 2.0.0, MC 1.21.11).

```bash
cd ../onyx-visuals && ./gradlew build
cd ../onyx-launcher && bash sync-client.sh   # kopiert die JAR nach src-tauri/resources/chaos-client.jar
```

Die JAR wird beim Start jedes Fabric-/Quilt-Profils automatisch in `mods/` gelegt, wenn die MC-Version zur Mod passt (laut `fabric.mod.json`).

**Client-Updates:** Der Launcher prüft die GitHub-Releases auf `chaos-client-<version>.jar` (+ `.sha256` oder `SHA256SUMS`). Eine neuere JAR wird nur nach SHA-256-Prüfung und Kontrolle der Mod-ID (`chaosclient`) unter `%APPDATA%\chaos-launcher\client\` abgelegt und hat dann Vorrang vor der gebündelten. Module, HUD-Layouts, Profile und Keybinds des Clients liegen im Spielprofil (`config/chaosclient/`) und werden nie angefasst.

**Launcher ↔ Client:** Beim Start schreibt der Launcher `chaos-client/shared.json` (Version, Menütaste, Musikordner, Profil, Account-Name/UUID, Chaoscraft-Adresse, Server, Freunde – keine Tokens) und `chaos-cosmetics/` (aktives Cape, Cape-Bibliothek, Capes anderer Spieler). Der Client schreibt `chaos-cosmetics/ingame-state.json`, wenn ingame das Cape gewechselt wird; der Launcher übernimmt das beim nächsten Öffnen der Cosmetics oder sofort über *Einstellungen › Chaos Client › Synchronisieren*.

## 📁 Struktur

```
src/
├─ app.css, App.tsx            Shell, Routing, Theme-Anwendung, Startprüfung
├─ components/                 Sidebar, Topbar, Logo, LaunchPanel, ErrorDialog, StartupOverlay, ui/
├─ features/
│  ├─ home/ play/ profiles/ mods/ cosmetics/ servers/ chaoscraft/ news/ settings/ accounts/
│  └─ ingame/ worlds/ friends/ music/ cinema/      (Extras)
├─ lib/
│  ├─ api/        launcher.ts, mods.ts, cosmetics.ts, servers.ts, news.ts
│  ├─ config/     branding.ts, chaoscraft.ts
│  ├─ i18n/       t(), de/en
│  └─ bridge.ts, useLauncher.ts, themes.ts, utils.ts
├─ stores/        useStore.ts (Profile, Accounts, Settings, Cosmetics, Status), toastStore.ts
└─ types/         index.ts (spiegelt models.rs)

src-tauri/src/
├─ lib.rs                      Einstieg, Datenmigration, Command-Registrierung
├─ models.rs                   Datenmodelle inkl. LaunchError
├─ storage.rs / secure.rs      JSON-Persistenz, DPAPI-Verschlüsselung
├─ auth.rs                     Microsoft → Xbox → XSTS → Minecraft
├─ launch.rs                   Download-/Start-Pipeline
├─ forge.rs / modloader.rs     Forge, NeoForge, Fabric, Quilt
├─ integrity.rs                Prüfung & Reparatur
├─ mod_search.rs               Modrinth & CurseForge
├─ cosmetics.rs / cosmetics_api.rs
├─ servers.rs / news.rs / discord.rs / system.rs / java.rs / updater.rs / versions.rs
└─ commands/                   accounts, instances, mods, cosmetics, media, worlds, servers_news, system, launching
```

## 🔌 Chaos-Cosmetics-API (Schnittstelle)

Optional; Basis-URL in den Einstellungen. Ohne API funktionieren Capes lokal (eigener PC, alle Accounts).

| Endpunkt | Zweck |
|---|---|
| `GET /v1/version` | `{ apiVersion, cosmeticsVersion }` |
| `POST /v1/auth/challenge` `{uuid,name}` → `{serverId}` | Start des Mojang-Join-Handshakes |
| `POST /v1/auth/verify` `{uuid,name,serverId}` → `{token,expiresAt}` | API prüft `hasJoined` bei Mojang |
| `GET /v1/cosmetics/{uuid}` | `{ uuid, name, activeCape:{id,url,sha1,version,kind}, visibility, cosmeticsVersion }` |
| `PUT /v1/cosmetics/{uuid}` (Bearer) `{activeCape, visibility}` | Aktives Cape setzen |
| `POST /v1/capes` (Bearer, multipart `file`, `name`) → `RemoteCape` | Cape hochladen |

Der Microsoft-/Minecraft-Token wird ausschließlich an `sessionserver.mojang.com` gesendet.

## 🗂 Daten

`%APPDATA%\chaos-launcher\` – `instances.json`, `accounts.json` (Tokens verschlüsselt), `settings.json`, `cosmetics.json`, `servers.json`, `friends.json`, `cosmetics/capes/`, `client/` (heruntergeladene Chaos-Client-JAR), `mod-cache/`, `media/music/`, `java/`, `logs/`, `instances/<Profil>/`. Ein vorhandener `onyx-launcher`-Ordner wird beim ersten Start automatisch übernommen.

## 🎨 Branding

| Farbe | Hex | Verwendung |
|---|---|---|
| Hintergrund | `#09090b` / `#111114` | App / Panels |
| Dunkelrot | `#8f1b22` | Hauptfarbe |
| Chaos-Rot | `#e11d2e` | Akzent |
| Glow | `#ff5c6c` | Hover, Highlights |
| Schrift | `#f4f1f2` / `#a69fa2` | Text / gedimmt |

Logo: aufgebrochener roter Ring („C“) mit Riss auf schwarzer Kachel (`src/components/Logo.tsx`, `src-tauri/icons/`).

## 📜 Lizenzen

Launcher und Chaos Client sind eigenständige Entwicklungen. Verwendete Open-Source-Komponenten (Tauri, React, skinview3d, Fabric Loader/API, Mixin, Gson u. a.) und ihre Lizenzen: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) – ebenfalls einsehbar unter *Einstellungen › Chaos Client › Open Source & Lizenzen*. Minecraft ist eine Marke von Mojang Studios / Microsoft; dieses Projekt ist inoffiziell.

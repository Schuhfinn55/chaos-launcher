# 💎 Onyx Launcher

Ein eigener **Minecraft-Launcher** mit Fokus auf Performance, gebaut mit **Tauri (Rust) + React + TypeScript**. Im Onyx-SMP-Branding (animierter Cyan-Kristall-Gradient auf dunklem Hintergrund).

![Onyx Launcher](src-tauri/icons/icon.png)

## ✨ Features

| Feature | Status |
|---|---|
| 🔍 **Mod-Suche** (Modrinth live + CurseForge mit API-Key) | ✅ |
| 📦 **Eigene Mods** per Drag&Drop / Datei-Auswahl | ✅ |
| 🎮 **Minecraft herunterladen & starten** (Vanilla-Versionen) | ⚙️ Versionen & Launch-Stub |
| 🧩 **Modloader**: Fabric / Forge / NeoForge / Quilt (Auswahl) | ⚙️ UI fertig, Auto-Install folgt |
| 🗂️ **Instanz-/Modpack-Verwaltung** (Profile, Mods pro Instanz) | ✅ |
| 👤 **Microsoft-/Minecraft-Account-Login** | ⚙️ UI fertig, OAuth-Flow folgt |
| 🛠️ **Einstellungen** (RAM, Java, CurseForge-Key, Pfade) | ✅ |
| 👥 **Freunde-Liste** (lokal) | ✅ |
| 🎯 **Ingame-Mod-Menu** (kuratierte, **faire** PVP-Mods) | ✅ |

### Über das Ingame-Mod-Menu (wichtig!)

Der Onyx Launcher enthält **bewusst keine Cheats** wie KillAura, Reach, Anti-Knockback etc. (wie NoRisk/Wurst). Solche Mods verletzen die Regeln praktisch aller Server und führen zu Account-Banns. Stattdessen findest du hier kuratierte, **legitime** Mods, mit denen du dein Können fair verbesserst:

- ⚡ **Performance**: Sodium, Lithium, FerriteCore, EntityCulling, ImmediatelyFast
- 📊 **HUD-Anzeigen**: CPS, FPS, Koordinaten, Rüstung (rein informativ)
- ✨ **Shader**: Iris + Complementary
- 🎨 **Resourcepacks**: Fresh Animations u. a.
- 🛠️ **Werkzeuge**: Mod Menu, Replay Mod, WorldEdit CUI

## 🚀 Installation (als Nutzer)

Lade den Installer herunter und führe ihn aus:

```
src-tauri\target\release\bundle\nsis\Onyx Launcher_1.0.0_x64-setup.exe
```

Oder starte die App direkt ohne Installation:

```
src-tauri\target\release\onyx-launcher.exe
```

> **Hinweis:** Auf Windows wird **WebView2** (Runtime) benötigt – ist auf Windows 10/11 normalerweise vorinstalliert.

## 🛠️ Entwicklung

### Voraussetzungen

- **Node.js** ≥ 20 (getestet mit v24)
- **Rust** ≥ 1.77 (`rustup`)
- **Visual Studio C++ Build Tools** (MSVC) – für das Rust-Linking unter Windows

### Dev-Modus (Frontend mit Hot-Reload)

```bash
cd onyx-launcher
npm install
npm run tauri dev
```

> Tipp: Auch ohne Rust startet das reine Frontend mit `npm run dev` – dann laufen Mock-Daten, sodass du das UI sofort im Browser unter `http://localhost:1420` siehst.

### Produktions-Build

```bash
npm run tauri build
```

Erzeugt:
- `src-tauri/target/release/onyx-launcher.exe` (die App, ~15 MB)
- `src-tauri/target/release/bundle/nsis/Onyx Launcher_1.0.0_x64-setup.exe` (Installer)

## ⚙️ Einrichtung als Nutzer

1. **Mods suchen**: Reiter *Mods* → Suchbegriff eingeben (Modrinth läuft sofort).
2. **CurseForge aktivieren**: Reiter *Einstellungen* → CurseForge-API-Key eintragen (kostenlos unter [console.curseforge.com](https://console.curseforge.com) beantragen).
3. **Instanz erstellen**: Reiter *Instanzen* → *+ Neue Instanz* (Name, MC-Version, Modloader).
4. **Account**: Reiter *Accounts* → *Mit Microsoft anmelden*.
5. **Spielen**: Reiter *Spielen* → großen Button drücken.

## 📁 Projektstruktur

```
onyx-launcher/
├─ src/                       # React-Frontend
│  ├─ components/             # Sidebar, Topbar, ModCard, ...
│  ├─ features/               # play, instances, mods, ingame, friends, accounts, settings
│  ├─ stores/                 # Zustand-State
│  ├─ lib/                    # bridge (Tauri), curated (Mod-Katalog), utils
│  ├─ styles/theme.css        # Onyx-Cyan-Theme
│  └─ types/                  # TS-Typen
└─ src-tauri/                 # Rust-Backend
   └─ src/
      ├─ models.rs            # Geteilte Datenstrukturen
      ├─ mod_search.rs        # Modrinth- & CurseForge-API
      ├─ versions.rs          # Minecraft-Versionsmanifest
      ├─ storage.rs           # JSON-Persistenz
      ├─ commands.rs          # Tauri-Commands (vom Frontend aufrufbar)
      └─ lib.rs / main.rs     # Einstiegspunkte
```

## 🗺️ Roadmap (noch nicht implementiert)

Diese Teile haben eine fertige UI, aber das Backend muss noch vervollständigt werden:

- [ ] **Vollständiger Launch**: Download-Pipeline (Libraries, Assets, client.jar), Java-Start mit JVM-Args
- [ ] **Microsoft-OAuth-Flow** (Azure-App-Registrierung nötig) → Xbox Live → XSTS → Mojang-Token
- [ ] **Modloader-Auto-Installation** (Fabric/Quilt via meta-Server, Forge via installer.jar)
- [ ] **Java-Auto-Download** (Adoptium Temurin)
- [ ] **Mod-Version-Auswahl & Download** (konkrete Datei je nach MC-Version/Loader)

Die relevanten API-Endpunkte sind im Code dokumentiert (`mod_search.rs`, `versions.rs`).

## 🎨 Branding

Übernommen aus dem Onyx-SMP (`onyx-tabboard/AnimationManager.java`):

| Farbe | Hex | Verwendung |
|---|---|---|
| tiefster Hintergrund | `#06141A` | App-Hintergrund |
| Onyx-Cyan | `#22D3EE` | Hauptfarbe / Akzent |
| Cyan-Glow | `#7DD3FC` → `#CFFAFE` | Hover / Highlights |
| Struktur | `#143447` | Rahmen, Trennlinien |

Logo: animierter Cyan-zu-Weiß-Gradient (CSS `background-clip: text`), Prefix `[Onyx]`.

---

**Onyx SMP** · v1.0.0 ·公平 spielen, fair gewinnen. 💎

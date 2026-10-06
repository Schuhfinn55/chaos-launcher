# Code-Signierung – damit Browser und Windows den Chaos Launcher als sicher einstufen

## Warum die Warnungen kommen

- **Chrome/Edge beim Download** („Diese Datei wird nicht häufig heruntergeladen“ / „kann deinem Gerät schaden“):
  Reputationsprüfung (Google Safe Browsing / Microsoft SmartScreen). Neue, **unsignierte** EXE-/MSI-Dateien gelten als unbekannt.
- **Windows beim Start des Setups** („Der Computer wurde durch Windows geschützt“, Unbekannter Herausgeber):
  SmartScreen. Verschwindet nur mit einer gültigen **Code-Signatur** (OV/EV-Zertifikat) oder nach sehr vielen Downloads derselben Datei
  (jede neue Version beginnt wieder bei null).

Die Website selbst ist korrekt per HTTPS ausgeliefert; am Hosting liegt es nicht.

## Was hilft (nach Aufwand/Kosten sortiert)

| Option | Kosten | Wirkung | Hinweise |
|---|---|---|---|
| **SignPath Foundation** (kostenlose Signierung für Open-Source) | 0 € | OV-Signatur, Warnungen deutlich weniger; Reputation baut sich pro Herausgeber auf | Antrag unter https://signpath.org/apply – Projekt muss öffentlich auf GitHub sein (ist es), Builds müssen über CI laufen (GitHub Actions nötig). Vorlage unten. |
| **Certum Open Source Code Signing** | ca. 70–90 €/Jahr + Kartenleser/Token | OV-Signatur | Für Privatpersonen möglich (Ausweisprüfung), europäischer Anbieter. |
| **Sectigo / SSL.com / GlobalSign OV** | 200–400 €/Jahr | OV-Signatur | Hardware-Token (seit 2023 Pflicht). |
| **EV-Zertifikat** | 300–600 €/Jahr | **Sofort** volle SmartScreen-Reputation | Nur für eingetragene Unternehmen. |
| **Azure Trusted Signing** | ca. 10 $/Monat | Wie OV, Microsoft-eigen | Für Einzelpersonen derzeit nur USA/Kanada; Firmen: 3 Jahre nachweisbare Historie. |
| Nichts tun | 0 € | Warnungen bleiben; werden mit vielen Downloads pro Version schwächer | – |

**Empfehlung:** SignPath beantragen (kostenlos), parallel die Hinweise auf der Website lassen.

## So ist der Build vorbereitet

`src-tauri/tauri.conf.json` ruft für jede EXE/MSI `scripts/sign.ps1` auf (als Zeichenkette mit **absolutem Pfad**, weil der NSIS-Schritt in einem anderen Arbeitsverzeichnis läuft – auf einem anderen Rechner den Pfad in `bundle.windows.signCommand` anpassen). Ohne Zertifikat passiert nichts.
Mit Zertifikat genügt eine Umgebungsvariable (neue Konsole öffnen, dann `npm run tauri build`):

```powershell
# Zertifikat im Windows-Speicher (Token/PFX importiert):
setx CHAOS_SIGN_THUMBPRINT 0123456789ABCDEF0123456789ABCDEF01234567
# oder PFX-Datei:
setx CHAOS_SIGN_PFX D:\keys\chaos.pfx
setx CHAOS_SIGN_PFX_PASSWORD geheim
# oder eigener Befehl (SignPath/Trusted Signing), {file} = zu signierende Datei:
setx CHAOS_SIGN_COMMAND "signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /dlib ... {file}"
```

Prüfen: `signtool verify /pa /v "Chaos Launcher_x.y.z_x64-setup.exe"` oder Rechtsklick → Eigenschaften → Digitale Signaturen.

## Zusätzlich sinnvoll

- **Microsoft-Dateiprüfung einreichen** (hilft gegen Defender-Fehlalarme, Microsoft-Konto nötig):
  https://www.microsoft.com/wdsi/filesubmission → „Software developer“ → Setup-EXE hochladen.
- **VirusTotal**: Setup-EXE unter https://www.virustotal.com hochladen; die Website verlinkt den Hash-Bericht automatisch.
- Jede Version einmal selbst herunterladen/ausführen bringt nichts für die Reputation – es zählen viele verschiedene Nutzer.

## Vorlage SignPath-Antrag (Englisch, einfach einfügen)

```
Project: Chaos Launcher (https://github.com/Schuhfinn55/chaos-launcher) and Chaos Client (https://github.com/Schuhfinn55/chaos-client)
License: MIT
Description: Free, open-source Minecraft launcher for the ChaoscraftSMP community (Windows, Tauri 2 + React + Rust) with an
accompanying Fabric mod ("Chaos Client"). Features: profiles, mod manager (Modrinth/CurseForge), cosmetics (capes, hats, wings),
import from other launchers, auto-updates. Website: https://chaos-launcher.chaoscraft.workers.dev
Why signing: Users get SmartScreen / browser warnings for the unsigned NSIS/MSI installers. We would like to sign the
installer (.exe), MSI and the launcher binary.
Build: GitHub Actions (public workflow in the repository), artifacts: ChaosLauncher-<version>-setup.exe, ChaosLauncher-<version>.msi
Maintainer: Fabian (GitHub: Schuhfinn55)
```

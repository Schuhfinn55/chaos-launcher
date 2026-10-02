/* ============================================================
 * Chaos Launcher - Minimale Internationalisierung
 *
 * `t("key")` liefert den Text in der aktiven Sprache. Deutsch ist
 * die Standardsprache; Englisch deckt Navigation, Home, Status und
 * Fehlerdialoge ab. Die Sprache kommt aus den Einstellungen.
 * ============================================================ */

export type Language = "de" | "en";

let current: Language = "de";
const listeners = new Set<() => void>();

export function setLanguage(lang: Language) {
  if (lang === current) return;
  current = lang;
  listeners.forEach((l) => l());
}
export function getLanguage(): Language {
  return current;
}
export function onLanguageChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const DICT: Record<string, { de: string; en: string }> = {
  "nav.home": { de: "Home", en: "Home" },
  "nav.play": { de: "Spielen", en: "Play" },
  "nav.profiles": { de: "Profile", en: "Profiles" },
  "nav.mods": { de: "Mods", en: "Mods" },
  "nav.cosmetics": { de: "Cosmetics", en: "Cosmetics" },
  "nav.servers": { de: "Server", en: "Servers" },
  "nav.news": { de: "News", en: "News" },
  "nav.settings": { de: "Einstellungen", en: "Settings" },
  "nav.extras": { de: "Extras", en: "Extras" },
  "nav.ingame": { de: "Client-Module", en: "Client modules" },
  "nav.music": { de: "Musik", en: "Music" },
  "nav.cinema": { de: "Kino", en: "Cinema" },
  "nav.friends": { de: "Freunde", en: "Friends" },
  "nav.worlds": { de: "Welten", en: "Worlds" },
  "nav.accounts": { de: "Minecraft-Account", en: "Minecraft account" },
  "nav.notLoggedIn": { de: "Nicht angemeldet", en: "Not signed in" },

  "home.welcome": { de: "Willkommen zurück", en: "Welcome back" },
  "home.play": { de: "SPIELEN", en: "PLAY" },
  "home.running": { de: "LÄUFT", en: "RUNNING" },
  "home.starting": { de: "STARTET …", en: "STARTING …" },
  "home.stop": { de: "Stoppen", en: "Stop" },
  "home.cancel": { de: "Abbrechen", en: "Cancel" },
  "home.selectedProfile": { de: "Ausgewähltes Profil", en: "Selected profile" },
  "home.recent": { de: "Zuletzt verwendet", en: "Recently used" },
  "home.serverStatus": { de: "Serverstatus", en: "Server status" },
  "home.news": { de: "News & Updates", en: "News & updates" },
  "home.updates": { de: "Download & Update", en: "Download & update" },
  "home.clientVersion": { de: "Client-Version", en: "Client version" },
  "home.launcherVersion": { de: "Launcher-Version", en: "Launcher version" },
  "home.noProfile": { de: "Kein Profil ausgewählt", en: "No profile selected" },
  "home.createProfile": { de: "Profil erstellen", en: "Create profile" },
  "home.login": { de: "Mit Microsoft anmelden", en: "Sign in with Microsoft" },
  "home.noAccount": { de: "Kein Account", en: "No account" },
  "home.playChaoscraft": { de: "CHAOSCRAFT SPIELEN", en: "PLAY CHAOSCRAFT" },

  "status.online": { de: "ONLINE", en: "ONLINE" },
  "status.offline": { de: "OFFLINE", en: "OFFLINE" },
  "status.checking": { de: "Prüfe …", en: "Checking …" },
  "status.players": { de: "Spieler", en: "Players" },
  "status.ping": { de: "Ping", en: "Ping" },
  "status.version": { de: "Version", en: "Version" },
  "status.ip": { de: "Server-IP", en: "Server IP" },
  "status.copy": { de: "Kopieren", en: "Copy" },
  "status.copied": { de: "Kopiert", en: "Copied" },

  "startup.launcher": { de: "Launcher-Version", en: "Launcher version" },
  "startup.client": { de: "Client-Version", en: "Client version" },
  "startup.profile": { de: "Profil", en: "Profile" },
  "startup.files": { de: "Spieldateien", en: "Game files" },
  "startup.ready": { de: "Bereit", en: "Ready" },
  "startup.updateAvailable": { de: "Update verfügbar", en: "Update available" },
  "startup.upToDate": { de: "Aktuell", en: "Up to date" },
  "startup.installed": { de: "Installiert", en: "Installed" },
  "startup.missing": { de: "Dateien fehlen", en: "Files missing" },
  "startup.notInstalled": { de: "Noch nicht installiert", en: "Not installed yet" },

  "common.save": { de: "Speichern", en: "Save" },
  "common.cancel": { de: "Abbrechen", en: "Cancel" },
  "common.delete": { de: "Löschen", en: "Delete" },
  "common.edit": { de: "Bearbeiten", en: "Edit" },
  "common.duplicate": { de: "Duplizieren", en: "Duplicate" },
  "common.create": { de: "Erstellen", en: "Create" },
  "common.details": { de: "Details", en: "Details" },
  "common.repair": { de: "Reparieren", en: "Repair" },
  "common.close": { de: "Schließen", en: "Close" },
  "common.retry": { de: "Erneut versuchen", en: "Retry" },
  "common.loading": { de: "Lädt …", en: "Loading …" },
  "common.install": { de: "Installieren", en: "Install" },
  "common.installed": { de: "Installiert", en: "Installed" },
  "common.remove": { de: "Entfernen", en: "Remove" },
  "common.update": { de: "Aktualisieren", en: "Update" },
  "common.active": { de: "Aktiv", en: "Active" },
  "common.apply": { de: "Anwenden", en: "Apply" },
  "common.search": { de: "Suchen", en: "Search" },
  "common.all": { de: "Alle", en: "All" },
  "common.openLogs": { de: "Logs öffnen", en: "Open logs" },

  "error.launchFailed": { de: "Minecraft konnte nicht gestartet werden.", en: "Minecraft could not be started." },
  "error.reason": { de: "Grund", en: "Reason" },
  "error.resetProfile": { de: "Profil zurücksetzen", en: "Reset profile" },
  "error.openCrash": { de: "Crash-Report öffnen", en: "Open crash report" },
  "error.technical": { de: "Technische Details", en: "Technical details" },
};

/** Übersetzt einen Schlüssel. Unbekannte Schlüssel werden zurückgegeben. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  let text = entry ? entry[current] : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

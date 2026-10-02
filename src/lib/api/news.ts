/* ============================================================
 * Chaos Launcher - News-Quelle
 *
 * Eingebaute News + optionale externe Quelle (Einstellungen →
 * Chaoscraft → News-URL). Externe Einträge werden vor den
 * eingebauten angezeigt; angepinnte zuerst.
 * ============================================================ */

import { invoke } from "@/lib/bridge";
import type { NewsItem } from "@/types";
import { APP_VERSION } from "@/lib/config/branding";

/** Eingebaute News (Fallback, wenn keine Quelle konfiguriert ist). */
export const BUILTIN_NEWS: NewsItem[] = [
  {
    id: "launcher-2.0",
    title: `Chaos Launcher ${APP_VERSION} ist da`,
    summary:
      "Neues Design in Rot/Schwarz, Home-Seite mit Serverstatus, vollständiges Profil-System mit Fabric, Forge und NeoForge, Mod-Manager mit Updates und Abhängigkeiten, Cosmetics mit eigenen Capes.",
    body:
      "Der Launcher wurde komplett überarbeitet: Microsoft-Login mit mehreren Accounts, verschlüsselte Token-Speicherung, Serverstatus für ChaoscraftSMP, News-Feed, Update-System mit Prüfsummen, Java-Verwaltung und ein Cosmetics-System, mit dem eigene Capes hochgeladen und ingame getragen werden können.",
    category: "launcher",
    date: "2026-10-02",
    pinned: true,
  },
  {
    id: "capes-ingame",
    title: "Eigene Capes jetzt ingame sichtbar",
    summary:
      "Lade unter Cosmetics → Meine Capes ein 64×32-PNG hoch, aktiviere es und starte ein Fabric-Profil. Der Chaos-Client rendert dein Cape direkt am Spieler.",
    category: "update",
    date: "2026-10-02",
  },
  {
    id: "chaoscraft-smp",
    title: "ChaoscraftSMP Saison läuft",
    summary:
      "Erstelle mit einem Klick das Chaoscraft-Profil (Fabric 1.21.11 mit Performance-Mods) und tritt dem Server direkt aus dem Launcher bei.",
    category: "server",
    date: "2026-10-01",
  },
  {
    id: "mods-updates",
    title: "Mod-Updates automatisch erkennen",
    summary:
      "Der Mod-Manager prüft installierte Modrinth-Mods auf neue Versionen und markiert inkompatible Dateien für deine Minecraft-Version.",
    category: "mods",
    date: "2026-09-30",
  },
];

/** Lädt externe News (sofern konfiguriert) und ergänzt die eingebauten. */
export async function loadNews(force = false): Promise<{ items: NewsItem[]; remote: boolean; error?: string }> {
  let remote: NewsItem[] = [];
  let error: string | undefined;
  try {
    remote = await invoke<NewsItem[]>("fetch_news", { force });
  } catch (e) {
    error = String(e);
  }
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const n of [...remote, ...BUILTIN_NEWS]) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    merged.push(n);
  }
  merged.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return parseDate(b.date) - parseDate(a.date);
  });
  return { items: merged, remote: remote.length > 0, error };
}

export function parseDate(d: string): number {
  if (!d) return 0;
  if (/^\d{10,13}$/.test(d)) return Number(d.length === 10 ? d + "000" : d);
  const t = Date.parse(d);
  return Number.isNaN(t) ? 0 : t;
}

export function formatNewsDate(d: string): string {
  const t = parseDate(d);
  if (!t) return "";
  return new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export const NEWS_CATEGORY_META: Record<string, { label: string; icon: string }> = {
  update: { label: "Update", icon: "⬆" },
  server: { label: "Server", icon: "🟢" },
  mods: { label: "Mods", icon: "🧩" },
  event: { label: "Event", icon: "🎉" },
  launcher: { label: "Launcher", icon: "🚀" },
  info: { label: "Info", icon: "ℹ" },
};

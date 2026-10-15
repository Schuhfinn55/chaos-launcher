/* ============================================================
 * Chaos Launcher - Globale Suche (Strg+K)
 *
 * Findet alles im Launcher: Seiten, Cosmetics-Tabs, einzelne Hüte, Wings,
 * Effekte, Emotes, Capes, Client-Module, Einstellungs-Bereiche und
 * Aktionen (Discord, Account wechseln …). Pfeiltasten + Enter navigieren.
 * ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CHAOS_HATS } from "@/lib/builtinHats";
import { CHAOS_WINGS } from "@/lib/builtinWings";
import { CHAOS_EFFECTS } from "@/lib/builtinEffects";
import { CHAOS_EMOTES } from "@/lib/builtinEmotes";
import { CHAOS_CAPES } from "@/lib/builtinCapes";
import { ONYX_MODULES } from "@/lib/modules";
import { DISCORD_URL, YOUTUBE_URL } from "@/lib/config/branding";
import { openUrl } from "@/lib/api/launcher";
import "./CommandPalette.css";

export const OPEN_SEARCH_EVENT = "chaos:open-search";
export function openSearch() { window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT)); }

interface Entry {
  id: string;
  title: string;
  subtitle: string;
  group: string;
  icon: string;
  keywords: string;
  run: (navigate: (to: string) => void) => void;
}

function buildIndex(): Entry[] {
  const go = (to: string) => (nav: (t: string) => void) => nav(to);
  const e: Entry[] = [];
  const page = (id: string, title: string, subtitle: string, icon: string, to: string, keywords = "") => e.push({ id, title, subtitle, group: "Seiten", icon, keywords, run: go(to) });
  page("home", "Home", "Startseite mit Profil und Spielen-Button", "🏠", "/home", "start dashboard");
  page("play", "Spielen", "Minecraft starten, laufende Instanzen", "▶", "/play", "launch starten minecraft");
  page("profiles", "Profile", "Instanzen anlegen, Versionen, Mods, Import aus anderen Launchern", "🗂", "/profiles", "instanz version fabric forge import norisk prism");
  page("mods", "Mods", "Mods suchen und installieren (Modrinth)", "🧩", "/mods", "modrinth shader resourcepack");
  page("worlds", "Welten", "Singleplayer-Welten verwalten", "🌍", "/worlds", "saves backup");
  page("friends", "Freunde", "Freundesliste, Online-Status, Mitspielen", "👥", "/friends", "freunde party online");
  page("servers", "Server", "Serverliste, Chaoscraft SMP", "🖥", "/servers", "ip beitreten");
  page("chaoscraft", "Chaoscraft", "Chaoscraft SMP – Infos und Beitritt", "🔥", "/chaoscraft", "smp server");
  page("news", "News", "Neuigkeiten und Updates", "📰", "/news", "changelog");
  page("ingame", "Client-Module", "Chaos-Client-Module an/aus und einstellen", "✸", "/ingame", "module hud pvp");
  page("music", "Musik", "Chaos Musik – eigene MP3/WAV/OGG", "🎵", "/music", "player mp3");
  page("cinema", "Kino", "Trailer und Videos", "🎬", "/cinema", "video trailer");
  page("accounts", "Minecraft-Account", "Anmelden, Accounts wechseln", "👤", "/accounts", "login microsoft wechseln");
  page("settings", "Einstellungen", "Launcher, Darstellung, Minecraft, Discord", "⚙", "/settings", "optionen ram java sprache");

  const cos = (id: string, title: string, subtitle: string, icon: string, kind: string, keywords = "") => e.push({ id, title, subtitle, group: "Cosmetics", icon, keywords, run: go(`/cosmetics?kind=${kind}`) });
  cos("cos-skin", "Skins", "Skins verwalten und anwenden", "🧍", "skin", "skin hochladen");
  cos("cos-cape", "Meine Capes", "Eigene Capes, Vorlagen, legendäre Capes", "🧥", "cape", "cape umhang animiert");
  cos("cos-hat", "Hüte", "Hüte mit Vorschau auf deinem Kopf", "🎩", "hat", "hut krone");
  cos("cos-wings", "Wings", "Animierte Flügel, legendäre Wings", "🪽", "wings", "flügel");
  cos("cos-emote", "Emotes", "Emotes mit 3D-Vorschau, Emote-Rad belegen", "🕺", "emote", "emote rad tanz");
  cos("cos-effect", "Effekte", "Partikel- und Aura-Effekte", "✨", "effect", "partikel aura");
  cos("codes", "Code einlösen", "Legendäre Items freischalten", "🔑", "hat", "code einlösen legendär freischalten");

  for (const h of CHAOS_HATS) e.push({ id: "hat-" + h.id, title: h.name, subtitle: (h.exclusive ? "Legendärer Hut · " : "Hut · ") + h.description, group: "Hüte", icon: h.icon, keywords: "hut", run: go("/cosmetics?kind=hat") });
  for (const w of CHAOS_WINGS) e.push({ id: "wings-" + w.id, title: w.name, subtitle: (w.exclusive ? "Legendäre Wings · " : "Wings · ") + w.description, group: "Wings", icon: w.icon, keywords: "wings flügel", run: go("/cosmetics?kind=wings") });
  for (const f of CHAOS_EFFECTS) e.push({ id: "effect-" + f.id, title: f.name, subtitle: (f.exclusive ? "Legendärer Effekt · " : "Effekt · ") + f.description, group: "Effekte", icon: f.icon, keywords: "effekt partikel", run: go("/cosmetics?kind=effect") });
  for (const m of CHAOS_EMOTES) e.push({ id: "emote-" + m.id, title: m.name, subtitle: (m.exclusive ? "Legendäres Emote · " : "Emote · ") + m.description, group: "Emotes", icon: m.icon, keywords: "emote", run: go("/cosmetics?kind=emote") });
  for (const c of CHAOS_CAPES) e.push({ id: "cape-" + c.id, title: c.name, subtitle: (c.exclusive ? "Legendäres Cape · " : "Cape-Vorlage · ") + c.description, group: "Capes", icon: "🧥", keywords: "cape", run: go("/cosmetics?kind=cape") });
  for (const m of ONYX_MODULES) e.push({ id: "mod-" + m.id, title: m.title, subtitle: "Client-Modul · " + m.description, group: "Client-Module", icon: m.icon || "✸", keywords: m.category, run: go(`/ingame?q=${encodeURIComponent(m.title)}`) });

  const set = (id: string, title: string, subtitle: string, tab: string, keywords = "") => e.push({ id, title, subtitle, group: "Einstellungen", icon: "⚙", keywords, run: go(`/settings?tab=${tab}`) });
  set("set-general", "Allgemein", "Sprache, Start, Verhalten", "general", "sprache language");
  set("set-display", "Darstellung", "Theme, Akzentfarbe, Animationen, Skalierung", "display", "theme farbe dunkel hell");
  set("set-minecraft", "Minecraft-Einstellungen", "RAM, Java, Fenster, Auflösung", "minecraft", "ram java speicher");
  set("set-cosmetics", "Cosmetics-Einstellungen", "Sichtbarkeit, API, Capes anderer Spieler", "cosmetics", "api sichtbar");
  set("set-client", "Chaos Client", "Client-Version, Menütaste, Updates", "client", "client version taste");
  set("set-launcher", "Launcher-Update", "Version, Update suchen", "launcher", "update version");
  set("set-discord", "Discord", "Rich Presence", "discord", "rpc status");
  set("set-chaoscraft", "Chaoscraft-Einstellungen", "Server-Adresse, Profil", "chaoscraft", "server");
  set("set-codes", "Codes verwalten (Admin)", "Codes für legendäre Items anlegen", "cosmetics", "admin code anlegen");

  e.push({ id: "act-discord", title: "Discord öffnen", subtitle: "Chaos-Discord im Browser", group: "Aktionen", icon: "💬", keywords: "discord community", run: () => openUrl(DISCORD_URL) });
  e.push({ id: "act-youtube", title: "YouTube öffnen", subtitle: "Chaos-Kanal im Browser", group: "Aktionen", icon: "▶", keywords: "youtube video", run: () => openUrl(YOUTUBE_URL) });
  return e;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function score(entry: Entry, q: string): number {
  const t = norm(entry.title), s = norm(entry.subtitle), k = norm(entry.keywords), g = norm(entry.group);
  if (!q) return entry.group === "Seiten" || entry.group === "Cosmetics" ? 1 : 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  if (k.includes(q) || g.includes(q)) return 40;
  if (s.includes(q)) return 25;
  // alle Wörter irgendwo?
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => (t + " " + s + " " + k).includes(w))) return 20;
  return 0;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const index = useMemo(buildIndex, []);

  useEffect(() => {
    const onOpen = () => { setOpen(true); setQ(""); setSel(0); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); onOpen(); }
      else if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 10); }, [open]);

  const results = useMemo(() => {
    const nq = norm(q.trim());
    const scored = index.map((e) => ({ e, s: score(e, nq) })).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title));
    return scored.slice(0, nq ? 40 : 22).map((x) => x.e);
  }, [q, index]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const run = (e: Entry) => { setOpen(false); e.run((to) => navigate(to)); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && results[sel]) { e.preventDefault(); run(results[sel]); }
  };

  let lastGroup = "";
  return (
    <div className="chaos-palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="chaos-palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="chaos-palette-input">
          <span className="chaos-palette-glass">🔍</span>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Alles finden: Seiten, Hüte, Emotes, Module, Einstellungen …" spellCheck={false} />
          <kbd>Esc</kbd>
        </div>
        <div className="chaos-palette-list" ref={listRef}>
          {results.length === 0 && <div className="chaos-palette-empty">Nichts gefunden für „{q}“</div>}
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? <div key={"g" + r.group + i} className="chaos-palette-group">{r.group}</div> : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {head}
                <button data-i={i} className={"chaos-palette-item" + (i === sel ? " active" : "")} onMouseEnter={() => setSel(i)} onClick={() => run(r)}>
                  <span className="chaos-palette-icon">{r.icon}</span>
                  <span className="chaos-palette-text">
                    <strong>{r.title}</strong>
                    <small>{r.subtitle}</small>
                  </span>
                  {i === sel && <kbd>↵</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="chaos-palette-foot"><kbd>↑</kbd><kbd>↓</kbd> wählen · <kbd>↵</kbd> öffnen · <kbd>Strg</kbd>+<kbd>K</kbd> jederzeit</div>
      </div>
    </div>
  );
}

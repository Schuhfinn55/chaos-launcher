/* ============================================================
 * Chaos Launcher - Einstellungen
 * Kategorien: Allgemein · Darstellung · Minecraft · Cosmetics ·
 * Launcher · Discord · Chaoscraft. Alles wird lokal gespeichert.
 * ============================================================ */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHead, Toggle } from "@/components/ui";
import ImageCropper from "@/components/ImageCropper";
import { useInstanceStore, useSettingsStore, useStatusStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { invoke, listen } from "@/lib/bridge";
import { BUILTIN_THEMES } from "@/lib/themes";
import { uid } from "@/lib/utils";
import { CHAOSCRAFT } from "@/lib/config/chaoscraft";
import { checkForUpdates, clearCache, detectJava, downloadJava, getCacheInfo, getMemoryInfo, getVersionsDetailed, installUpdate, openPath, repairInstance, formatBytes } from "@/lib/api/launcher";
import { clearCache as clearCosmeticsCache, cacheSize as cosmeticsCacheSize } from "@/lib/api/cosmetics";
import type { CacheInfo, CustomTheme, JavaInfo, MemoryInfo, Settings, UpdateInfo, VersionInfo } from "@/types";
import "./SettingsPage.css";

type Cat = "general" | "display" | "minecraft" | "cosmetics" | "launcher" | "discord" | "chaoscraft";
const CATS: { id: Cat; label: string; icon: string }[] = [
  { id: "general", label: "Allgemein", icon: "⚙" },
  { id: "display", label: "Darstellung", icon: "🎨" },
  { id: "minecraft", label: "Minecraft", icon: "⛏" },
  { id: "cosmetics", label: "Cosmetics", icon: "🧥" },
  { id: "launcher", label: "Launcher", icon: "🚀" },
  { id: "discord", label: "Discord", icon: "💬" },
  { id: "chaoscraft", label: "Chaoscraft", icon: "🔥" },
];
const ACCENTS = ["", "#e11d2e", "#ff3b4e", "#b91c1c", "#f97316", "#fcd34d", "#4ade80", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6"];

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState<Cat>((params.get("tab") as Cat) || "general");
  useEffect(() => {
    const t = params.get("tab") as Cat | null;
    if (t && CATS.some((c) => c.id === t)) setCat(t);
  }, [params]);

  if (!settings) {
    return (
      <div className="onyx-content onyx-loading">
        <div className="onyx-spinner" />
      </div>
    );
  }
  const set = (patch: Partial<Settings>) => void save(patch);

  return (
    <div className="onyx-content">
      <PageHead title="Einstellungen" subtitle="Alle Einstellungen werden lokal gespeichert und sofort übernommen." />
      <div className="chaos-settings">
        <nav className="chaos-settings-nav">
          {CATS.map((c) => (
            <button key={c.id} className={"chaos-settings-nav-item" + (cat === c.id ? " active" : "")} onClick={() => { setCat(c.id); setParams({ tab: c.id }); }}>
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </nav>
        <div className="chaos-settings-body">
          {cat === "general" && <General s={settings} set={set} />}
          {cat === "display" && <Display s={settings} set={set} />}
          {cat === "minecraft" && <MinecraftCat s={settings} set={set} />}
          {cat === "cosmetics" && <Cosmetics s={settings} set={set} />}
          {cat === "launcher" && <Launcher s={settings} set={set} />}
          {cat === "discord" && <Discord s={settings} set={set} />}
          {cat === "chaoscraft" && <Chaoscraft s={settings} set={set} />}
        </div>
      </div>
    </div>
  );
}

type P = { s: Settings; set: (p: Partial<Settings>) => void };

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="chaos-settings-section">
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
      <div className="chaos-settings-section-body">{children}</div>
    </section>
  );
}

/* ---------------- Allgemein ---------------- */
function General({ s, set }: P) {
  return (
    <>
      <Section title="Sprache">
        <select className="onyx-select" value={s.language ?? "de"} onChange={(e) => set({ language: e.target.value as "de" | "en" })}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
        <p className="chaos-faint" style={{ fontSize: 12, marginTop: 6 }}>
          Navigation, Home und Statusmeldungen werden übersetzt.
        </p>
      </Section>
      <Section title="Startverhalten">
        <Toggle checked={s.autoSelectLastInstance !== false} onChange={(v) => set({ autoSelectLastInstance: v })} label="Zuletzt verwendetes Profil automatisch auswählen" />
        <div className="chaos-field" style={{ marginTop: 10 }}>
          <span>Launcher beim Spielstart</span>
          <select className="onyx-select" value={s.launchBehavior ?? "keep"} onChange={(e) => set({ launchBehavior: e.target.value as "keep" })}>
            <option value="keep">Geöffnet lassen</option>
            <option value="minimize">Minimieren</option>
            <option value="close">Schließen</option>
          </select>
        </div>
      </Section>
      <Section title="Animationen & Benachrichtigungen">
        <Toggle checked={s.animations !== false} onChange={(v) => set({ animations: v })} label="Animationen" description="Seitenwechsel, Hover- und Button-Effekte. Deaktivieren spart Leistung auf schwächeren PCs." />
        <Toggle checked={s.notifications !== false} onChange={(v) => set({ notifications: v })} label="Benachrichtigungen" description="Hinweise zu Starts, Downloads und Updates." />
      </Section>
      <Section title="Tutorial">
        <button
          className="chaos-btn"
          onClick={() => {
            localStorage.removeItem("chaos.tutorialDone");
            localStorage.removeItem("onyx.tutorialDone");
            window.location.reload();
          }}
        >
          📖 Tutorial erneut anzeigen
        </button>
      </Section>
    </>
  );
}

/* ---------------- Darstellung ---------------- */
function Display({ s, set }: P) {
  const [cropper, setCropper] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <Section title="Modus">
        <Toggle checked={s.darkMode !== false} onChange={(v) => set({ darkMode: v })} label="Dark Mode" description="Empfohlen. Light Mode hellt Panels und Hintergrund auf." />
      </Section>
      <Section title="Akzentfarbe" desc="Standard ist Chaos-Rot. Die Farbe wirkt auf Buttons, Glows, Badges und den Schriftzug.">
        <div className="chaos-color-row">
          {ACCENTS.map((c) => (
            <button key={c || "default"} className={"chaos-color-dot" + ((s.accentColor ?? "") === c ? " selected" : "")} style={{ background: c || "linear-gradient(135deg,#8f1b22,#e11d2e,#ff5c6c)" }} onClick={() => set({ accentColor: c })} title={c || "Chaos-Rot (Standard)"} />
          ))}
          <input type="color" value={s.accentColor || "#e11d2e"} onChange={(e) => set({ accentColor: e.target.value })} className="chaos-color-input" title="Eigene Farbe" />
        </div>
      </Section>
      <Section title="Transparenz & Skalierung">
        <div className="chaos-field">
          <span>
            Panel-Transparenz: <strong>{s.panelTransparency ?? 0}%</strong>
          </span>
          <input type="range" className="chaos-range" min={0} max={60} step={5} value={s.panelTransparency ?? 0} onChange={(e) => set({ panelTransparency: Number(e.target.value) })} />
        </div>
        <div className="chaos-field" style={{ marginTop: 10 }}>
          <span>
            UI-Skalierung: <strong>{s.uiScale ?? 100}%</strong>
          </span>
          <input type="range" className="chaos-range" min={80} max={140} step={5} value={s.uiScale ?? 100} onChange={(e) => set({ uiScale: Number(e.target.value) })} />
        </div>
      </Section>
      <Section title="Hintergrund" desc="Vorgefertigte Hintergründe, Live-Themes oder eigenes Bild/GIF/Video.">
        <div className="chaos-theme-grid">
          {BUILTIN_THEMES.map((t) => (
            <button key={t.id} className={"chaos-theme-card" + (s.theme === t.id ? " active" : "")} onClick={() => set({ theme: t.id })}>
              <div className="chaos-theme-preview" style={{ background: t.preview }} />
              <span>{t.name}</span>
            </button>
          ))}
          {s.customThemes?.map((t) => (
            <button key={t.id} className={"chaos-theme-card" + (s.theme === t.id ? " active" : "")} onClick={() => set({ theme: t.id })}>
              {t.mediaType === "video" ? <div className="chaos-theme-preview" style={{ background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>🎬</div> : t.mediaType === "gif" ? <div className="chaos-theme-preview" style={{ background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>🎞️</div> : <div className="chaos-theme-preview" style={{ backgroundImage: `url(${t.imageDataUrl})`, backgroundSize: "cover" }} />}
              <span>{t.name}</span>
              <em
                className="chaos-theme-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = (s.customThemes ?? []).filter((c) => c.id !== t.id);
                  if (t.mediaFileName) invoke("delete_media_file", { fileName: t.mediaFileName }).catch(() => {});
                  set({ customThemes: next, theme: s.theme === t.id ? "chaos" : s.theme });
                }}
              >
                ✕
              </em>
            </button>
          ))}
        </div>
        <input
          type="file"
          id="chaos-theme-upload"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const lower = file.name.toLowerCase();
            if (/\.(mp4|webm|gif)$/.test(lower)) {
              setMsg("Speichere Datei …");
              try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = "";
                for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)) as unknown as number[]);
                const mediaFileName = `${Date.now()}_${file.name}`;
                await invoke("save_media_file", { fileName: mediaFileName, dataBase64: btoa(binary) });
                const isVideo = !lower.endsWith(".gif");
                const theme: CustomTheme = { id: uid(), name: (isVideo ? "Video " : "GIF ") + new Date().toLocaleTimeString("de-DE").slice(0, 5), imageDataUrl: "", accent: "#e11d2e", mediaType: isVideo ? "video" : "gif", videoMuted: true, videoVolume: 50, mediaFileName };
                set({ customThemes: [...(s.customThemes ?? []), theme], theme: theme.id });
                setMsg(null);
                toast.success("Hintergrund hinzugefügt");
              } catch (err) {
                setMsg(null);
                toast.error("Speichern fehlgeschlagen", String(err));
              }
            } else {
              const r = new FileReader();
              r.onload = () => setCropper(String(r.result));
              r.readAsDataURL(file);
            }
            e.target.value = "";
          }}
        />
        <button className="chaos-btn" style={{ marginTop: 12 }} onClick={() => document.getElementById("chaos-theme-upload")?.click()}>
          + Eigenen Hintergrund hochladen
        </button>
        {msg && <span className="chaos-muted" style={{ fontSize: 12, marginLeft: 10 }}>{msg}</span>}
      </Section>
      {cropper && (
        <ImageCropper
          imageSrc={cropper}
          aspectRatio={16 / 9}
          onConfirm={(url) => {
            const theme: CustomTheme = { id: uid(), name: "Hintergrund " + new Date().toLocaleTimeString("de-DE").slice(0, 5), imageDataUrl: url, accent: "#e11d2e" };
            set({ customThemes: [...(s.customThemes ?? []), theme], theme: theme.id });
            setCropper(null);
          }}
          onCancel={() => setCropper(null)}
        />
      )}
    </>
  );
}

/* ---------------- Minecraft ---------------- */
function MinecraftCat({ s, set }: P) {
  const instances = useInstanceStore((x) => x.instances);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [mem, setMem] = useState<MemoryInfo | null>(null);
  const [javas, setJavas] = useState<JavaInfo[] | null>(null);
  const [javaBusy, setJavaBusy] = useState<string | null>(null);
  useEffect(() => {
    getVersionsDetailed().then((v) => setVersions(v.filter((x) => x.kind === "release"))).catch(() => {});
    getMemoryInfo().then(setMem).catch(() => {});
    detectJava().then(setJavas).catch(() => setJavas([]));
    let un: (() => void) | null = null;
    listen<{ message: string; done?: boolean }>("java://progress", (p) => setJavaBusy(p.done ? null : p.message)).then((u) => (un = u));
    return () => {
      if (un) un();
    };
  }, []);
  const sliderMax = mem?.sliderMaxMb ?? 16384;
  const installJava = async (v: number) => {
    setJavaBusy(`Lade Java ${v} …`);
    try {
      await downloadJava(v);
      toast.success(`Java ${v} installiert`);
      setJavas(await detectJava());
    } catch (e) {
      toast.error("Java-Download fehlgeschlagen", String(e));
    } finally {
      setJavaBusy(null);
    }
  };
  return (
    <>
      <Section title="Standardwerte für neue Profile">
        <div className="chaos-field-row">
          <label className="chaos-field">
            <span>Standard-Minecraft-Version</span>
            <select className="onyx-select" value={s.defaultMcVersion ?? ""} onChange={(e) => set({ defaultMcVersion: e.target.value })}>
              <option value="">Neueste Release</option>
              {versions.slice(0, 60).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <label className="chaos-field">
            <span>Standard-Profil beim Start</span>
            <select className="onyx-select" value={s.defaultInstanceId ?? ""} onChange={(e) => set({ defaultInstanceId: e.target.value })}>
              <option value="">Zuletzt gespielt</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>
      <Section title="Arbeitsspeicher" desc={mem ? `Dein PC hat ${(mem.totalMb / 1024).toFixed(0)} GB RAM (${(mem.availableMb / 1024).toFixed(1)} GB frei). Empfohlen: ${(mem.recommendedMaxMb / 1024).toFixed(0)} GB.` : undefined}>
        <div className="chaos-field">
          <span>
            Maximaler RAM: <strong style={{ color: "var(--chaos-accent-light)" }}>{(s.defaultRamMb / 1024).toFixed(1)} GB</strong>
          </span>
          <input type="range" className="chaos-range" min={1024} max={sliderMax} step={512} value={Math.min(s.defaultRamMb, sliderMax)} onChange={(e) => set({ defaultRamMb: Number(e.target.value), defaultMinRamMb: Math.min(s.defaultMinRamMb ?? 2048, Number(e.target.value)) })} />
          <div className="chaos-ram-scale">
            <span>1 GB</span>
            <span>{(sliderMax / 1024).toFixed(0)} GB</span>
          </div>
        </div>
        <div className="chaos-field" style={{ marginTop: 10 }}>
          <span>
            Minimaler RAM: <strong style={{ color: "var(--chaos-accent-light)" }}>{((s.defaultMinRamMb ?? 2048) / 1024).toFixed(1)} GB</strong>
          </span>
          <input type="range" className="chaos-range" min={512} max={s.defaultRamMb} step={512} value={Math.min(s.defaultMinRamMb ?? 2048, s.defaultRamMb)} onChange={(e) => set({ defaultMinRamMb: Number(e.target.value) })} />
        </div>
        {mem && s.defaultRamMb > mem.totalMb * 0.85 && <div className="onyx-toast onyx-toast-warn" style={{ marginTop: 10 }}>Zu viel RAM für Minecraft lässt Windows und Grafiktreiber kaum Luft. Empfohlen: höchstens {(mem.recommendedMaxMb / 1024).toFixed(0)} GB.</div>}
      </Section>
      <Section title="Java" desc="Der Launcher erkennt die benötigte Java-Version automatisch (1.21+ → Java 21, 1.18–1.20.4 → Java 17, älter → Java 8) und kann sie installieren.">
        {javas === null ? (
          <span className="chaos-muted">Suche Java-Installationen …</span>
        ) : javas.length === 0 ? (
          <div className="onyx-toast onyx-toast-warn">Java nicht gefunden.</div>
        ) : (
          <ul className="chaos-java-list">
            {javas.map((j) => (
              <li key={j.path}>
                <span className="chaos-badge chaos-badge-accent">Java {j.version}</span>
                <span className="chaos-mono chaos-truncate" title={j.path}>
                  {j.path}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="chaos-row chaos-wrap" style={{ gap: 8, marginTop: 10 }}>
          {[21, 17, 8].map((v) => (
            <button key={v} className="chaos-btn chaos-btn-sm" disabled={!!javaBusy} onClick={() => installJava(v)}>
              ⬇ Java {v} installieren
            </button>
          ))}
          <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => detectJava().then(setJavas)}>
            ↻ Neu suchen
          </button>
        </div>
        {javaBusy && (
          <div className="onyx-toast onyx-toast-info chaos-row" style={{ marginTop: 10 }}>
            <span className="onyx-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {javaBusy}
          </div>
        )}
        <label className="chaos-field" style={{ marginTop: 12 }}>
          <span>Standard-Java-Pfad (leer = automatisch)</span>
          <input className="chaos-input chaos-mono" value={s.defaultJavaPath ?? ""} onChange={(e) => set({ defaultJavaPath: e.target.value })} placeholder="C:\Program Files\Java\jdk-21\bin\javaw.exe" />
        </label>
      </Section>
      <Section title="JVM-Argumente" desc="Werden an alle Profile angehängt (RAM-Flags werden ignoriert und über die Regler gesteuert).">
        <textarea className="chaos-input chaos-mono" rows={3} value={s.customJvmArgs ?? ""} onChange={(e) => set({ customJvmArgs: e.target.value })} placeholder="-XX:+UseZGC -Dfml.ignoreInvalidMinecraftCertificates=true" />
      </Section>
      <Section title="Anzeige">
        <Toggle checked={!!s.fullscreen} onChange={(v) => set({ fullscreen: v })} label="Vollbild" description="Minecraft startet im Vollbildmodus (Profile können das überschreiben)." />
        <div className="chaos-field-row" style={{ marginTop: 10 }}>
          <label className="chaos-field">
            <span>Breite (0 = Standard)</span>
            <input className="chaos-input" type="number" value={s.resolutionWidth ?? 0} onChange={(e) => set({ resolutionWidth: Number(e.target.value) })} />
          </label>
          <label className="chaos-field">
            <span>Höhe (0 = Standard)</span>
            <input className="chaos-input" type="number" value={s.resolutionHeight ?? 0} onChange={(e) => set({ resolutionHeight: Number(e.target.value) })} />
          </label>
        </div>
      </Section>
    </>
  );
}

/* ---------------- Cosmetics ---------------- */
function Cosmetics({ s, set }: P) {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    cosmeticsCacheSize().then(setSize).catch(() => {});
  }, []);
  return (
    <>
      <Section title="Cosmetics">
        <Toggle checked={s.cosmeticsEnabled !== false} onChange={(v) => set({ cosmeticsEnabled: v })} label="Cosmetics aktivieren" description="Exportiert Capes & Co. beim Start in das Profil, damit der Chaos-Client sie rendert." />
        <Toggle checked={s.showCapes !== false} onChange={(v) => set({ showCapes: v })} label="Capes anzeigen" description="Eigenes Cape ingame rendern." />
        <Toggle checked={s.showOtherCapes !== false} onChange={(v) => set({ showOtherCapes: v })} label="Fremde Capes anzeigen" description="Capes anderer Chaos-Launcher-Spieler über die Cosmetics-API laden." />
        <Toggle checked={s.autoLoadCapes !== false} onChange={(v) => set({ autoLoadCapes: v })} label="Eigene Capes automatisch laden" description="Aktives Cape beim Start automatisch bereitstellen." />
      </Section>
      <Section title="Chaos-Cosmetics-API" desc="Optional. Über die API sehen sich Chaos-Spieler gegenseitig. Die Anmeldung läuft über den Mojang-Session-Handshake – dein Microsoft-Token wird nie an die API gesendet.">
        <input className="chaos-input chaos-mono" value={s.cosmeticsApiUrl ?? ""} onChange={(e) => set({ cosmeticsApiUrl: e.target.value })} placeholder="https://cosmetics.chaoscraftsmp.de" />
      </Section>
      <Section title="Cache">
        <div className="chaos-row" style={{ gap: 10 }}>
          <span className="chaos-muted" style={{ fontSize: 13 }}>
            Cosmetics-Cache: {size === null ? "…" : formatBytes(size)}
          </span>
          <button
            className="chaos-btn chaos-btn-sm"
            onClick={async () => {
              const freed = await clearCosmeticsCache();
              setSize(0);
              toast.success("Cosmetics-Cache geleert", formatBytes(freed));
            }}
          >
            Cache löschen
          </button>
        </div>
      </Section>
    </>
  );
}

/* ---------------- Launcher ---------------- */
function Launcher({ s, set }: P) {
  const update = useStatusStore((x) => x.update);
  const setUpdate = useStatusStore((x) => x.setUpdate);
  const appInfo = useStatusStore((x) => x.appInfo);
  const instances = useInstanceStore((x) => x.instances);
  const activeId = useInstanceStore((x) => x.activeId);
  const [cache, setCache] = useState<CacheInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [updProgress, setUpdProgress] = useState<{ message: string; done: number; total: number } | null>(null);
  useEffect(() => {
    getCacheInfo().then(setCache).catch(() => {});
    let un: (() => void) | null = null;
    listen<{ message: string; done: number; total: number }>("update://progress", setUpdProgress).then((u) => (un = u));
    return () => {
      if (un) un();
    };
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const u = await checkForUpdates(s.updateChannel);
      setUpdate(u);
      toast[u ? "info" : "success"](u ? `Update v${u.version} verfügbar` : "Launcher ist aktuell", u ? undefined : `v${appInfo?.version}`);
    } catch (e) {
      toast.error("Update-Prüfung fehlgeschlagen", String(e));
    } finally {
      setChecking(false);
    }
  };
  const install = async (u: UpdateInfo) => {
    setInstalling("Lade Update …");
    try {
      const msg = await installUpdate(u);
      toast.info("Update", msg);
    } catch (e) {
      toast.error("Update fehlgeschlagen", String(e));
    } finally {
      setInstalling(null);
      setUpdProgress(null);
    }
  };
  const clear = async (kind: string) => {
    try {
      const freed = await clearCache(kind);
      toast.success("Cache geleert", formatBytes(freed));
      setCache(await getCacheInfo());
    } catch (e) {
      toast.error("Fehler", String(e));
    }
  };

  return (
    <>
      <Section title="Updates">
        <Toggle checked={s.autoUpdate !== false} onChange={(v) => set({ autoUpdate: v })} label="Automatisch nach Updates suchen" description="Beim Start prüfen. Installiert wird nur mit gültiger SHA-256-Prüfsumme." />
        <div className="chaos-field" style={{ marginTop: 10 }}>
          <span>Update-Kanal</span>
          <select className="onyx-select" value={s.updateChannel ?? "stable"} onChange={(e) => set({ updateChannel: e.target.value as "stable" })}>
            <option value="stable">Stabil</option>
            <option value="beta">Beta</option>
          </select>
        </div>
        <div className="chaos-row chaos-wrap" style={{ gap: 8, marginTop: 12 }}>
          <span className="chaos-badge">Installiert: v{appInfo?.version}</span>
          {update && <span className="chaos-badge chaos-badge-warning">Verfügbar: v{update.version}{update.prerelease ? " (Beta)" : ""}</span>}
          <button className="chaos-btn chaos-btn-sm" disabled={checking} onClick={check}>
            {checking ? "Prüfe …" : "Jetzt prüfen"}
          </button>
          {update && (
            <button className="chaos-btn chaos-btn-sm chaos-btn-primary" disabled={!!installing} onClick={() => install(update)}>
              {installing ? "…" : update.verifiable ? "Update installieren" : "Download-Seite öffnen"}
            </button>
          )}
        </div>
        {update && !update.verifiable && <p className="chaos-faint" style={{ fontSize: 12, marginTop: 8 }}>Für dieses Release liegt keine Prüfsumme vor – der Launcher öffnet die Download-Seite, statt eine unverifizierte Datei auszuführen.</p>}
        {updProgress && (
          <div style={{ marginTop: 10 }}>
            <div className="chaos-progress">
              <div className="chaos-progress-fill" style={{ width: `${updProgress.total ? (updProgress.done / updProgress.total) * 100 : 30}%` }} />
            </div>
            <span className="chaos-faint" style={{ fontSize: 12 }}>
              {updProgress.message}
            </span>
          </div>
        )}
        {update?.releaseNotes && (
          <details style={{ marginTop: 10 }}>
            <summary className="chaos-muted" style={{ cursor: "pointer", fontSize: 12 }}>
              Release-Notes
            </summary>
            <pre className="chaos-release-notes">{update.releaseNotes}</pre>
          </details>
        )}
      </Section>
      <Section title="Downloads">
        <div className="chaos-field">
          <span>
            Gleichzeitige Downloads: <strong>{s.downloadLimit ?? 32}</strong>
          </span>
          <input type="range" className="chaos-range" min={4} max={64} step={4} value={s.downloadLimit ?? 32} onChange={(e) => set({ downloadLimit: Number(e.target.value) })} />
          <span className="chaos-faint" style={{ fontSize: 12 }}>
            Niedrigere Werte schonen langsame Verbindungen.
          </span>
        </div>
        <label className="chaos-field" style={{ marginTop: 12 }}>
          <span>Profilverzeichnis (leer = Standard)</span>
          <div className="chaos-row">
            <input className="chaos-input chaos-mono" value={s.instancesDir} onChange={(e) => set({ instancesDir: e.target.value })} placeholder={appInfo ? `${appInfo.dataDir}\\instances` : ""} />
            <button
              className="chaos-btn"
              onClick={async () => {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const dir = await open({ directory: true, multiple: false });
                if (typeof dir === "string") set({ instancesDir: dir });
              }}
            >
              Durchsuchen
            </button>
          </div>
        </label>
        <label className="chaos-field" style={{ marginTop: 12 }}>
          <span>CurseForge-API-Key (optional, für CurseForge-Suche & -Downloads)</span>
          <input className="chaos-input" type="password" value={s.curseforgeApiKey} onChange={(e) => set({ curseforgeApiKey: e.target.value })} placeholder="$2a$10$… bleibt nur lokal" />
        </label>
      </Section>
      <Section title="Cache & Wartung">
        {cache && (
          <ul className="chaos-cache-list">
            <li>
              <span>Mod-Cache</span>
              <strong>{formatBytes(cache.modCacheBytes)}</strong>
              <button className="chaos-btn chaos-btn-sm" onClick={() => clear("mods")}>
                Ungenutzte löschen
              </button>
            </li>
            <li>
              <span>Installer (Forge/NeoForge)</span>
              <strong>{formatBytes(cache.installersBytes)}</strong>
              <button className="chaos-btn chaos-btn-sm" onClick={() => clear("installers")}>
                Löschen
              </button>
            </li>
            <li>
              <span>Logs</span>
              <strong>{formatBytes(cache.logsBytes)}</strong>
              <button className="chaos-btn chaos-btn-sm" onClick={() => clear("logs")}>
                Löschen
              </button>
            </li>
            <li>
              <span>Cosmetics-Cache</span>
              <strong>{formatBytes(cache.cosmeticsCacheBytes)}</strong>
              <button className="chaos-btn chaos-btn-sm" onClick={() => clear("cosmetics")}>
                Löschen
              </button>
            </li>
          </ul>
        )}
        <div className="chaos-row chaos-wrap" style={{ gap: 8, marginTop: 12 }}>
          <button
            className="chaos-btn"
            disabled={!activeId}
            onClick={async () => {
              if (!activeId) return;
              try {
                const r = await repairInstance(activeId);
                toast.success("Spieldateien geprüft", `${r.verifiedFiles} geprüft, ${r.removedFiles} beschädigte entfernt.`);
              } catch (e) {
                toast.error("Reparatur fehlgeschlagen", String(e));
              }
            }}
          >
            🔧 Spieldateien reparieren ({instances.find((i) => i.id === activeId)?.name ?? "kein Profil"})
          </button>
          <button className="chaos-btn" onClick={() => openPath("logs")}>
            📄 Logs öffnen
          </button>
          <button className="chaos-btn chaos-btn-ghost" onClick={() => openPath("data")}>
            Datenordner
          </button>
        </div>
        {appInfo && (
          <p className="chaos-faint chaos-mono" style={{ fontSize: 11, marginTop: 10 }}>
            {appInfo.dataDir}
            {appInfo.migratedFromOnyx ? " · Daten vom Onyx Launcher übernommen" : ""}
          </p>
        )}
      </Section>
    </>
  );
}

/* ---------------- Discord ---------------- */
function Discord({ s, set }: P) {
  return (
    <>
      <Section title="Discord Rich Presence" desc="Zeigt in Discord an, dass du den Chaos Launcher nutzt bzw. welches Profil du spielst.">
        <Toggle checked={s.discordRpc !== false} onChange={(v) => set({ discordRpc: v })} label="Rich Presence aktivieren" />
        <Toggle checked={s.discordShowState !== false} onChange={(v) => set({ discordShowState: v })} label="Spielstatus anzeigen" description="Profilname und Minecraft-Version in Discord anzeigen." />
      </Section>
      <Section title="Profil verbinden" desc="Rich Presence braucht eine Discord-Application-ID (discord.com/developers → New Application). Lade dort ein Bild mit dem Namen „logo“ hoch.">
        <input className="chaos-input chaos-mono" value={s.discordAppId ?? ""} onChange={(e) => set({ discordAppId: e.target.value.trim() })} placeholder="Application ID, z.B. 1234567890123456789" />
        {!s.discordAppId && <p className="chaos-faint" style={{ fontSize: 12, marginTop: 6 }}>Ohne ID bleibt Rich Presence deaktiviert.</p>}
      </Section>
    </>
  );
}

/* ---------------- Chaoscraft ---------------- */
function Chaoscraft({ s, set }: P) {
  return (
    <>
      <Section title="Server-Adresse" desc={`Standard: ${CHAOSCRAFT.defaultAddress}. Eine eigene Adresse überschreibt den Standard für Status, Direktverbindung und das Chaoscraft-Profil.`}>
        <input className="chaos-input chaos-mono" value={s.chaoscraftServer ?? ""} onChange={(e) => set({ chaoscraftServer: e.target.value.trim() })} placeholder={CHAOSCRAFT.defaultAddress} />
      </Section>
      <Section title="News-Quelle" desc="Externe JSON-Quelle (HTTPS) für News & Events auf Home, News und der Chaoscraft-Seite. Format: Liste von { id, title, summary, body, category, date, url, image, pinned }.">
        <input className="chaos-input chaos-mono" value={s.newsUrl ?? ""} onChange={(e) => set({ newsUrl: e.target.value.trim() })} placeholder="https://chaoscraftsmp.de/news.json" />
      </Section>
    </>
  );
}

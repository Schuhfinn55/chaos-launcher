/* ============================================================
 * Chaos Launcher - Profile aus anderen Launchern übernehmen
 *
 * Findet installierte Launcher automatisch (NoRisk Client, Minecraft
 * Launcher, Prism/PolyMC/MultiMC, CurseForge App, Modrinth App,
 * GDLauncher, ATLauncher), zeigt deren Profile mit Inhalt und importiert
 * ausgewählte Profile inklusive Mods, Konfigs, Spieleinstellungen,
 * Servern, Welten, Resourcepacks und Shadern.
 * ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { Modal, Toggle } from "@/components/ui";
import { toast } from "@/stores/toastStore";
import { listen } from "@/lib/bridge";
import { importForeignProfile, scanForeignLaunchers } from "@/lib/api/launcher";
import { formatPlaytime } from "@/lib/utils";
import type { ForeignLauncher, ForeignProfile, ImportOptions, ImportResult } from "@/types";
import "./ImportLaunchersDialog.css";

const LAUNCHER_ICON: Record<string, string> = { norisk: "🛡", official: "⛏", prism: "🔷", polymc: "🔷", multimc: "🔷", curseforge: "🔥", modrinth: "🟢", gdlauncher: "🟣", atlauncher: "🅰" };

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (lastInstanceId: string | null) => Promise<void> | void;
}

export default function ImportLaunchersDialog({ open, onClose, onImported }: Props) {
  const [launchers, setLaunchers] = useState<ForeignLauncher[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opts, setOpts] = useState<ImportOptions>({ mods: true, config: true, options: true, servers: true, saves: false, resourcepacks: true, shaderpacks: true, screenshots: false });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ message: string; step: number; total: number } | null>(null);
  const [current, setCurrent] = useState<string>("");
  const [done, setDone] = useState<{ name: string; result?: ImportResult; error?: string }[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const scan = async () => {
    setLaunchers(null);
    setError(null);
    try {
      const found = await scanForeignLaunchers();
      setLaunchers(found);
    } catch (e) {
      setError(String(e));
      setLaunchers([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setDone([]);
    setProgress(null);
    scan();
    let un: (() => void) | null = null;
    listen<{ message: string; step: number; total: number }>("import://progress", setProgress).then((u) => (un = u));
    return () => { un?.(); };
  }, [open]);

  const all = useMemo(() => (launchers ?? []).flatMap((l) => l.profiles), [launchers]);
  const selectedProfiles = all.filter((p) => selected.has(p.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectLauncher = (l: ForeignLauncher, on: boolean) => setSelected((s) => { const n = new Set(s); l.profiles.forEach((p) => (on ? n.add(p.id) : n.delete(p.id))); return n; });

  const totalMods = selectedProfiles.reduce((a, p) => a + p.mods.length, 0);
  const totalMb = selectedProfiles.reduce((a, p) => a + p.sizeMb, 0);

  const run = async () => {
    if (selectedProfiles.length === 0) return;
    setRunning(true);
    setDone([]);
    let lastId: string | null = null;
    const results: { name: string; result?: ImportResult; error?: string }[] = [];
    for (const p of selectedProfiles) {
      setCurrent(p.name);
      try {
        const r = await importForeignProfile(p, { ...opts, name: null });
        results.push({ name: p.name, result: r });
        if (r.instance) lastId = r.instance.id;
      } catch (e) {
        results.push({ name: p.name, error: String(e) });
      }
      setDone([...results]);
    }
    setRunning(false);
    setCurrent("");
    setProgress(null);
    const ok = results.filter((r) => r.result).length;
    toast[ok > 0 ? "success" : "error"](ok > 0 ? `${ok} Profil${ok === 1 ? "" : "e"} importiert` : "Import fehlgeschlagen", ok > 0 ? "Mods werden beim ersten Start automatisch geladen." : results[0]?.error);
    await onImported(lastId);
  };

  return (
    <Modal open={open} onClose={running ? () => {} : onClose} title="Aus anderem Launcher übernehmen" width={860}
      hint="Gefundene Launcher und Profile auf diesem PC. Wähle aus, was übernommen werden soll – jedes Profil wird ein eigenes Chaos-Profil mit allen Mods und Einstellungen. Die Originale bleiben unverändert.">
      <div className="chaos-imp">
        {/* Inhalte */}
        <div className="chaos-imp-opts">
          <span className="chaos-section-title">Was übernehmen?</span>
          <div className="chaos-imp-opt-grid">
            <Toggle checked={opts.mods} onChange={(v) => setOpts({ ...opts, mods: v })} label="Mods" description="Mit Quelle (Modrinth/CurseForge) für spätere Updates" />
            <Toggle checked={opts.config} onChange={(v) => setOpts({ ...opts, config: v })} label="Mod-Konfigurationen" description="config/, Xaero, Schematics …" />
            <Toggle checked={opts.options} onChange={(v) => setOpts({ ...opts, options: v })} label="Spieleinstellungen" description="options.txt: Tasten, Grafik, Sound, Hotbar" />
            <Toggle checked={opts.servers} onChange={(v) => setOpts({ ...opts, servers: v })} label="Serverliste" description="servers.dat" />
            <Toggle checked={opts.resourcepacks} onChange={(v) => setOpts({ ...opts, resourcepacks: v })} label="Resourcepacks" />
            <Toggle checked={opts.shaderpacks} onChange={(v) => setOpts({ ...opts, shaderpacks: v })} label="Shader" />
            <Toggle checked={opts.saves} onChange={(v) => setOpts({ ...opts, saves: v })} label="Welten" description="Kann groß sein – wird kopiert, Original bleibt" />
            <Toggle checked={opts.screenshots} onChange={(v) => setOpts({ ...opts, screenshots: v })} label="Screenshots" />
          </div>
        </div>

        {/* Launcher */}
        <div className="chaos-imp-list">
          <div className="chaos-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span className="chaos-section-title">Gefundene Launcher {launchers ? `(${launchers.length})` : ""}</span>
            <div className="chaos-row" style={{ gap: 6 }}>
              <button className="chaos-btn chaos-btn-sm" disabled={!launchers || running} onClick={() => setSelected(new Set(all.map((p) => p.id)))}>Alle wählen</button>
              <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" disabled={running} onClick={() => setSelected(new Set())}>Keine</button>
              <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" disabled={running} onClick={scan}>↻ Neu suchen</button>
            </div>
          </div>
          {launchers === null && <div className="chaos-imp-empty"><span className="chaos-skeleton block" style={{ width: "100%", height: 60 }} /> Suche nach Launchern (NoRisk, Minecraft Launcher, Prism, CurseForge, Modrinth, GDLauncher, ATLauncher) …</div>}
          {error && <div className="onyx-toast onyx-toast-warn">{error}</div>}
          {launchers && launchers.length === 0 && <div className="chaos-imp-empty">Keine anderen Launcher mit Profilen gefunden.</div>}
          {launchers?.map((l) => {
            const allSel = l.profiles.length > 0 && l.profiles.every((p) => selected.has(p.id));
            const isCollapsed = collapsed.has(l.id);
            return (
              <div key={l.id} className="chaos-imp-launcher">
                <div className="chaos-imp-launcher-head" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}>
                  <span className="chaos-imp-ic">{LAUNCHER_ICON[l.id] ?? "🧩"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{l.name}</strong> <span className="chaos-faint" style={{ fontSize: 12 }}>· {l.profiles.length} Profil{l.profiles.length === 1 ? "" : "e"}</span>
                    <div className="chaos-faint chaos-mono" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.path}</div>
                    {l.note && <div className="chaos-faint" style={{ fontSize: 11 }}>{l.note}</div>}
                  </div>
                  <label className="chaos-row" style={{ gap: 6, fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={allSel} disabled={running || l.profiles.length === 0} onChange={(e) => selectLauncher(l, e.target.checked)} /> alle
                  </label>
                  <span className="chaos-imp-chev">{isCollapsed ? "▸" : "▾"}</span>
                </div>
                {!isCollapsed && (
                  <div className="chaos-imp-profiles">
                    {l.profiles.map((p) => <ProfileRow key={p.id} p={p} checked={selected.has(p.id)} disabled={running} onToggle={() => toggle(p.id)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Fortschritt / Ergebnis */}
        {(running || done.length > 0) && (
          <div className="chaos-imp-result">
            {running && (
              <>
                <div className="chaos-progress"><div className="chaos-progress-fill" style={{ width: `${progress && progress.total ? (progress.step / progress.total) * 100 : 15}%`, transition: "width .3s" }} /></div>
                <span className="chaos-faint" style={{ fontSize: 12 }}>{current ? `${current}: ` : ""}{progress?.message ?? "Starte …"} ({done.length + 1}/{selectedProfiles.length})</span>
              </>
            )}
            {done.map((d, i) => (
              <div key={i} className={"chaos-imp-done " + (d.error ? "err" : "ok")}>
                <span>{d.error ? "✕" : "✓"}</span>
                <div>
                  <strong>{d.result?.instance?.name ?? d.name}</strong>
                  <span className="chaos-faint" style={{ fontSize: 12 }}>
                    {d.error ? d.error : `${d.result?.modsImported ?? 0} Mods${d.result?.modsIdentified ? ` (${d.result.modsIdentified} bei Modrinth erkannt)` : ""} · ${d.result?.filesCopied ?? 0} Dateien`}
                    {d.result?.warnings?.length ? ` · ${d.result.warnings.length} Hinweis${d.result.warnings.length === 1 ? "" : "e"}: ${d.result.warnings.slice(0, 2).join("; ")}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chaos-modal-actions" style={{ justifyContent: "space-between" }}>
        <span className="chaos-faint" style={{ fontSize: 12 }}>
          {selectedProfiles.length > 0 ? `${selectedProfiles.length} Profil${selectedProfiles.length === 1 ? "" : "e"} · ${totalMods} Mods · ca. ${totalMb} MB` : "Nichts ausgewählt"}
        </span>
        <div className="chaos-row" style={{ gap: 8 }}>
          <button className="chaos-btn" disabled={running} onClick={onClose}>{done.length > 0 ? "Schließen" : "Abbrechen"}</button>
          <button className="chaos-btn chaos-btn-primary" disabled={running || selectedProfiles.length === 0} onClick={run}>
            {running ? "Importiere …" : `${selectedProfiles.length > 1 ? `${selectedProfiles.length} Profile` : "Profil"} übernehmen`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProfileRow({ p, checked, disabled, onToggle }: { p: ForeignProfile; checked: boolean; disabled: boolean; onToggle: () => void }) {
  const [showMods, setShowMods] = useState(false);
  const srcCounts = p.mods.reduce((a, m) => { a[m.source] = (a[m.source] ?? 0) + 1; return a; }, {} as Record<string, number>);
  return (
    <div className={"chaos-imp-profile" + (checked ? " sel" : "")}>
      <label className="chaos-imp-profile-main">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="chaos-row chaos-wrap" style={{ gap: 6, alignItems: "center" }}>
            <strong>{p.name}</strong>
            <span className="chaos-badge chaos-badge-accent">{p.mcVersion || "Version?"}</span>
            <span className="chaos-badge">{p.loader}{p.loaderVersion ? ` ${p.loaderVersion}` : ""}</span>
            {p.ramMb > 0 && <span className="chaos-badge">{(p.ramMb / 1024).toFixed(1)} GB RAM</span>}
            {p.playtimeSeconds > 0 && <span className="chaos-badge">{formatPlaytime(p.playtimeSeconds)}</span>}
            {p.note && <span className="chaos-faint" style={{ fontSize: 11 }}>{p.note}</span>}
          </div>
          <div className="chaos-imp-contents">
            <span className={p.mods.length ? "" : "off"}>📦 {p.mods.length} Mods{p.mods.length ? ` (${Object.entries(srcCounts).map(([k, v]) => `${v} ${k === "modrinth" ? "Modrinth" : k === "curseforge" ? "CurseForge" : "lokal"}`).join(", ")})` : ""}</span>
            <span className={p.configFiles ? "" : "off"}>⚙ {p.configFiles} Konfigs</span>
            <span className={p.hasOptions ? "" : "off"}>🎮 Einstellungen</span>
            <span className={p.hasServers ? "" : "off"}>🌐 Server</span>
            <span className={p.saves ? "" : "off"}>🗺 {p.saves} Welten</span>
            <span className={p.resourcepacks ? "" : "off"}>🎨 {p.resourcepacks} RP</span>
            <span className={p.shaderpacks ? "" : "off"}>✨ {p.shaderpacks} Shader</span>
            <span className="chaos-faint">~{p.sizeMb} MB</span>
          </div>
        </div>
      </label>
      {p.mods.length > 0 && (
        <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => setShowMods((v) => !v)}>{showMods ? "Mods ausblenden" : "Mods anzeigen"}</button>
      )}
      {showMods && (
        <ul className="chaos-imp-mods">
          {p.mods.map((m) => (
            <li key={m.fileName} className={m.enabled ? "" : "off"}>
              <span className={"chaos-imp-src " + m.source}>{m.source === "modrinth" ? "MR" : m.source === "curseforge" ? "CF" : "JAR"}</span>
              {m.displayName} <span className="chaos-faint">{m.version}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

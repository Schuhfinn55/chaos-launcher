/* ============================================================
 * Chaos Launcher - Profile
 *
 * Vollständiges Profil-System: erstellen (Version → Loader →
 * Details), bearbeiten, duplizieren, löschen, starten. Jedes
 * Profil hat ein eigenes Spielverzeichnis.
 * ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog, Empty, Modal, PageHead, Tabs, Toggle } from "@/components/ui";
import LaunchPanel from "@/components/LaunchPanel";
import { useInstanceStore, useSettingsStore, useStatusStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { uid, formatDate, formatPlaytime } from "@/lib/utils";
import { checkAllInstances, deleteInstanceFiles, duplicateInstance, getLoaderVersions, getMemoryInfo, getVersionsDetailed, loaderSupports, openInstanceFolder, requiredJava, formatBytes } from "@/lib/api/launcher";
import { installSlugList } from "@/lib/api/mods";
import { AUTO_MODS } from "@/lib/autoMods";
import { INSTANCE_PRESETS, type InstancePreset } from "@/lib/instancePresets";
import { invoke } from "@/lib/bridge";
import type { Instance, LoaderVersion, MemoryInfo, ModLoader, VersionInfo } from "@/types";
import "./ProfilesPage.css";

const LOADERS: { value: ModLoader; label: string; desc: string }[] = [
  { value: "vanilla", label: "Vanilla", desc: "Pures Minecraft ohne Mods." },
  { value: "fabric", label: "Fabric", desc: "Leicht & schnell. Empfohlen für Chaoscraft und Performance-Mods." },
  { value: "forge", label: "Forge", desc: "Klassischer Loader für große Mod-Packs." },
  { value: "neoforge", label: "NeoForge", desc: "Moderner Forge-Nachfolger für 1.20.2+." },
  { value: "quilt", label: "Quilt", desc: "Fabric-kompatibler Loader." },
];
const COLORS = ["#e11d2e", "#ff5c6c", "#8f1b22", "#f97316", "#fcd34d", "#4ade80", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6"];

const guessJava = (v: string) => (v.startsWith("1.2") || /^\d{2}/.test(v) ? 21 : v.startsWith("1.1") && Number(v.split(".")[1]) >= 17 ? 17 : 8);

export default function ProfilesPage() {
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const setActive = useInstanceStore((s) => s.setActive);
  const add = useInstanceStore((s) => s.add);
  const update = useInstanceStore((s) => s.update);
  const remove = useInstanceStore((s) => s.remove);
  const reload = useInstanceStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);
  const statusMap = useStatusStore((s) => s.instanceStatus);
  const setStatus = useStatusStore((s) => s.setInstanceStatus);

  const [wizard, setWizard] = useState(false);
  const [edit, setEdit] = useState<Instance | null>(null);
  const [del, setDel] = useState<Instance | null>(null);
  const [delFiles, setDelFiles] = useState(false);
  const [presetDialog, setPresetDialog] = useState<InstancePreset | null>(null);
  const [launchFor, setLaunchFor] = useState<Instance | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    checkAllInstances().then((all) => all.forEach(setStatus)).catch(() => {});
  }, [instances.length, setStatus]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = [...instances].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
    return q ? list.filter((i) => i.name.toLowerCase().includes(q) || i.mcVersion.includes(q) || i.loader.includes(q)) : list;
  }, [instances, filter]);

  const doDuplicate = async (inst: Instance) => {
    try {
      await duplicateInstance(inst.id, `${inst.name} (Kopie)`);
      await reload();
      toast.success("Profil dupliziert", `${inst.name} (Kopie)`);
    } catch (e) {
      toast.error("Duplizieren fehlgeschlagen", String(e));
    }
  };
  const doDelete = async () => {
    if (!del) return;
    try {
      if (delFiles) await deleteInstanceFiles(del.id);
      await remove(del.id);
      toast.success("Profil gelöscht", del.name);
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    } finally {
      setDel(null);
      setDelFiles(false);
    }
  };
  const exportProfile = async (inst: Instance) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const file = await save({ filters: [{ name: "Chaos-Profil", extensions: ["json"] }], defaultPath: `${inst.name}.chaos.json` });
      if (!file) return;
      const json = await invoke<string>("export_profile", { instanceId: inst.id });
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(file, json);
      toast.success("Profil exportiert", file);
    } catch (e) {
      toast.error("Export fehlgeschlagen", String(e));
    }
  };
  const importProfile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({ multiple: false, filters: [{ name: "Chaos-/Onyx-Profil", extensions: ["json"] }] });
      if (typeof file !== "string") return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const json = await readTextFile(file);
      const inst = await invoke<Instance>("import_profile", { profileJson: json });
      await reload();
      setActive(inst.id);
      toast.success("Profil importiert", inst.name);
    } catch (e) {
      toast.error("Import fehlgeschlagen", String(e));
    }
  };

  /** Preset mit gewählter Version erstellen. */
  const createFromPreset = async (preset: InstancePreset, version: string) => {
    setPresetDialog(null);
    setBusy(`Erstelle "${preset.name}" …`);
    const inst: Instance = {
      id: uid(),
      name: `${preset.name} (${version})`,
      mcVersion: version,
      loader: preset.loader,
      iconColor: preset.color,
      mods: [],
      createdAt: Date.now(),
      ramMb: settings?.defaultRamMb ?? 4096,
      minRamMb: settings?.defaultMinRamMb ?? 2048,
      javaVersion: guessJava(version),
      preset: preset.id,
      description: preset.description,
    };
    await add(inst);
    setActive(inst.id);
    if (preset.mods.length > 0) {
      const r = await installSlugList(inst.id, preset.mods, (s) => setBusy(s));
      if (r.failed.length) toast.warning(`${r.added} Mods installiert`, `Fehlgeschlagen: ${r.failed.join(", ")}`);
      else toast.success(`"${preset.name}" bereit`, `${r.added} Mods installiert.`);
    } else {
      toast.success(`"${preset.name}" erstellt`);
    }
    setBusy("");
  };

  return (
    <div className="onyx-content">
      <PageHead
        title="Profile"
        subtitle="Jedes Profil hat eigene Minecraft-Version, Loader, Mods, Resourcepacks, Shader, Einstellungen, RAM und Spielverzeichnis – vollständig getrennt."
        actions={
          <>
            <input className="chaos-input" style={{ width: 200 }} placeholder="Profile filtern …" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="chaos-btn" onClick={importProfile}>
              ⬇ Import
            </button>
            <button className="chaos-btn chaos-btn-primary" onClick={() => setWizard(true)}>
              + Neues Profil
            </button>
          </>
        }
      />

      {busy && (
        <div className="onyx-toast onyx-toast-info chaos-row" style={{ marginBottom: 14 }}>
          <span className="onyx-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {busy}
        </div>
      )}

      {/* Presets */}
      <span className="chaos-section-title">Vorlagen</span>
      <div className="chaos-preset-row">
        {INSTANCE_PRESETS.map((p) => (
          <button key={p.id} className="chaos-card hoverable chaos-preset" style={{ ["--c" as string]: p.color }} onClick={() => setPresetDialog(p)} disabled={!!busy}>
            <span className="chaos-preset-icon">{p.icon}</span>
            <strong>{p.name}</strong>
            <span className="chaos-faint" style={{ fontSize: 11 }}>
              {p.loader === "vanilla" ? "Vanilla" : "Fabric"} · {p.mods.length} Mods
            </span>
          </button>
        ))}
      </div>

      <span className="chaos-section-title" style={{ marginTop: 22 }}>
        Deine Profile ({instances.length})
      </span>
      {shown.length === 0 ? (
        <Empty
          icon="📦"
          title={instances.length === 0 ? "Noch keine Profile" : "Keine Treffer"}
          hint={instances.length === 0 ? "Erstelle ein Profil oder wähle oben eine Vorlage." : "Anderen Filter versuchen."}
          action={instances.length === 0 ? <button className="chaos-btn chaos-btn-primary" onClick={() => setWizard(true)}>+ Neues Profil</button> : undefined}
        />
      ) : (
        <div className="chaos-profiles-grid">
          {shown.map((inst) => {
            const st = statusMap[inst.id];
            const isActive = inst.id === activeId;
            return (
              <article key={inst.id} className={"chaos-card chaos-profile" + (isActive ? " active" : "")} style={{ ["--c" as string]: inst.iconColor }}>
                <div className="chaos-profile-stripe" />
                <header className="chaos-profile-head">
                  <div className="chaos-col" style={{ gap: 4, minWidth: 0 }}>
                    <h3 className="chaos-truncate">{inst.name}</h3>
                    <div className="chaos-row chaos-wrap" style={{ gap: 6 }}>
                      <span className="chaos-badge chaos-badge-accent">{inst.mcVersion}</span>
                      <span className="chaos-badge" style={{ textTransform: "capitalize" }}>
                        {inst.loader}
                        {inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}
                      </span>
                      {st && (
                        <span className={"chaos-badge " + (st.installed ? "chaos-badge-success" : st.neverInstalled ? "" : "chaos-badge-warning")} title={st.problems.join(", ")}>
                          {st.installed ? "installiert" : st.neverInstalled ? "nicht installiert" : "unvollständig"}
                        </span>
                      )}
                    </div>
                  </div>
                  {isActive ? (
                    <span className="chaos-badge chaos-badge-accent">Aktiv</span>
                  ) : (
                    <button className="chaos-btn chaos-btn-sm" onClick={() => setActive(inst.id)}>
                      Auswählen
                    </button>
                  )}
                </header>
                <ul className="chaos-profile-facts">
                  <li>
                    <span>Mods</span>
                    <strong>{inst.mods.filter((m) => m.enabled).length}</strong>
                  </li>
                  <li>
                    <span>RAM</span>
                    <strong>{(inst.ramMb / 1024).toFixed(inst.ramMb % 1024 ? 1 : 0)} GB</strong>
                  </li>
                  <li>
                    <span>Spielzeit</span>
                    <strong>{inst.playTimeSeconds ? formatPlaytime(inst.playTimeSeconds) : "—"}</strong>
                  </li>
                  <li>
                    <span>Größe</span>
                    <strong>{st ? formatBytes(st.sizeBytes) : "…"}</strong>
                  </li>
                </ul>
                {inst.description && <p className="chaos-profile-desc">{inst.description}</p>}
                <footer className="chaos-profile-actions">
                  <button className="chaos-btn chaos-btn-primary chaos-btn-sm" onClick={() => { setActive(inst.id); setLaunchFor(inst); }}>
                    ▶ Starten
                  </button>
                  <button className="chaos-btn chaos-btn-sm" onClick={() => setEdit(inst)}>
                    Bearbeiten
                  </button>
                  <button className="chaos-btn chaos-btn-sm" onClick={() => { setActive(inst.id); navigate("/mods"); }}>
                    Mods
                  </button>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => doDuplicate(inst)} title="Duplizieren">
                    ⧉
                  </button>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => { setActive(inst.id); navigate("/worlds"); }} title="Welten">
                    🌍
                  </button>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => openInstanceFolder(inst.id)} title="Ordner öffnen">
                    📁
                  </button>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => exportProfile(inst)} title="Exportieren">
                    ⬆
                  </button>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-danger" onClick={() => setDel(inst)} title="Löschen">
                    ✕
                  </button>
                </footer>
                <span className="chaos-profile-created">erstellt {formatDate(inst.createdAt)}</span>
              </article>
            );
          })}
        </div>
      )}

      {/* Start-Dialog */}
      <Modal open={!!launchFor} onClose={() => setLaunchFor(null)} title={launchFor?.name} hint={launchFor ? `Minecraft ${launchFor.mcVersion} · ${launchFor.loader}` : ""} width={620}>
        {launchFor && <LaunchPanel instance={instances.find((i) => i.id === launchFor.id) ?? launchFor} size="hero" onLaunched={() => setTimeout(() => setLaunchFor(null), 1500)} />}
      </Modal>

      {/* Löschen */}
      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        title={`"${del?.name}" löschen?`}
        width={460}
        actions={
          <>
            <button className="chaos-btn" onClick={() => setDel(null)}>
              Abbrechen
            </button>
            <button className="chaos-btn chaos-btn-danger" onClick={doDelete}>
              Löschen
            </button>
          </>
        }
      >
        <p className="chaos-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Das Profil wird aus der Liste entfernt. Mods im Cache bleiben erhalten.
        </p>
        <div style={{ marginTop: 12 }}>
          <Toggle checked={delFiles} onChange={setDelFiles} label="Spielverzeichnis mit löschen" description="Entfernt auch Welten, Screenshots und Einstellungen dieses Profils unwiderruflich." />
        </div>
      </Modal>

      {/* Preset-Version */}
      {presetDialog && <PresetVersionDialog preset={presetDialog} onClose={() => setPresetDialog(null)} onCreate={createFromPreset} />}

      {/* Wizard */}
      {wizard && (
        <CreateWizard
          onClose={() => setWizard(false)}
          onCreated={async (inst, withAutoMods) => {
            await add(inst);
            setActive(inst.id);
            setWizard(false);
            if (withAutoMods && (inst.loader === "fabric" || inst.loader === "quilt")) {
              setBusy(`Installiere Standard-Mods für ${inst.name} …`);
              const r = await installSlugList(inst.id, AUTO_MODS.map((m) => ({ slug: m.slug, title: m.title, projectType: m.projectType })), (s) => setBusy(s));
              setBusy("");
              if (r.failed.length) toast.warning(`${r.added} Mods installiert`, `Fehlgeschlagen: ${r.failed.join(", ")}`);
              else toast.success("Profil bereit", `${r.added} Standard-Mods installiert.`);
            } else {
              toast.success("Profil erstellt", inst.name);
            }
          }}
        />
      )}

      {/* Bearbeiten */}
      {edit && (
        <EditDialog
          instance={instances.find((i) => i.id === edit.id) ?? edit}
          onClose={() => setEdit(null)}
          onSave={async (patch) => {
            await update(edit.id, patch);
            setEdit(null);
            toast.success("Profil gespeichert");
          }}
        />
      )}
    </div>
  );
}

/* ============================ Preset-Dialog ============================ */
function PresetVersionDialog({ preset, onClose, onCreate }: { preset: InstancePreset; onClose: () => void; onCreate: (p: InstancePreset, v: string) => void }) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersionsDetailed()
      .then((v) => {
        const rel = v.filter((x) => x.kind === "release");
        setVersions(rel);
        setVersion(rel[0]?.id ?? "");
      })
      .catch(() => {});
  }, []);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${preset.icon} ${preset.name}`}
      hint={preset.description}
      width={480}
      actions={
        <>
          <button className="chaos-btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="chaos-btn chaos-btn-primary" disabled={!version} onClick={() => onCreate(preset, version)}>
            Erstellen (MC {version || "—"})
          </button>
        </>
      }
    >
      <label className="chaos-field">
        <span>Minecraft-Version</span>
        <select className="onyx-select" value={version} onChange={(e) => setVersion(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id}
              {v.latestRelease ? " (neueste)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div style={{ marginTop: 14 }}>
        <span className="chaos-faint" style={{ fontSize: 12 }}>
          Mods ({preset.mods.length}):
        </span>
        <div className="chaos-row chaos-wrap" style={{ gap: 6, marginTop: 6 }}>
          {preset.mods.length === 0 ? <span className="chaos-badge">Keine (Vanilla)</span> : preset.mods.map((m) => <span key={m.slug} className="chaos-badge chaos-badge-accent">{m.title}</span>)}
        </div>
      </div>
    </Modal>
  );
}

/* ============================ Wizard ============================ */
function CreateWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (inst: Instance, autoMods: boolean) => Promise<void> }) {
  const settings = useSettingsStore((s) => s.settings);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [vFilter, setVFilter] = useState("");
  const [mcVersion, setMcVersion] = useState(settings?.defaultMcVersion ?? "");
  const [loader, setLoader] = useState<ModLoader>("fabric");
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loaderVersion, setLoaderVersion] = useState("");
  const [support, setSupport] = useState<Record<string, boolean | null>>({});
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [ram, setRam] = useState(settings?.defaultRamMb ?? 4096);
  const [autoMods, setAutoMods] = useState(true);
  const [mem, setMem] = useState<MemoryInfo | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getVersionsDetailed().then(setVersions).catch(() => toast.error("Versionen konnten nicht geladen werden"));
    getMemoryInfo().then(setMem).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mcVersion) return;
    setSupport({});
    (["fabric", "forge", "neoforge", "quilt"] as ModLoader[]).forEach((l) => {
      loaderSupports(l, mcVersion).then((ok) => setSupport((s) => ({ ...s, [l]: ok }))).catch(() => setSupport((s) => ({ ...s, [l]: null })));
    });
  }, [mcVersion]);

  useEffect(() => {
    if (!mcVersion || loader === "vanilla") {
      setLoaderVersions([]);
      setLoaderVersion("");
      return;
    }
    setLoaderVersions([]);
    getLoaderVersions(loader, mcVersion)
      .then((lv) => {
        setLoaderVersions(lv);
        setLoaderVersion(lv.find((x) => x.recommended)?.version ?? lv[0]?.version ?? "");
      })
      .catch(() => setLoaderVersions([]));
  }, [loader, mcVersion]);

  const groups = useMemo(() => {
    const q = vFilter.trim();
    const list = versions.filter((v) => (showSnapshots || v.kind === "release") && (!q || v.id.includes(q)));
    const map = new Map<string, VersionInfo[]>();
    for (const v of list) {
      const g = v.kind === "release" ? v.group : "Snapshots & Sonstige";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(v);
    }
    return [...map.entries()];
  }, [versions, showSnapshots, vFilter]);

  const sliderMax = mem?.sliderMaxMb ?? 16384;

  const create = async () => {
    setCreating(true);
    let javaV = guessJava(mcVersion);
    try {
      javaV = await requiredJava(mcVersion);
    } catch {
      /* Heuristik */
    }
    const inst: Instance = {
      id: uid(),
      name: name.trim() || `${LOADERS.find((l) => l.value === loader)?.label} ${mcVersion}`,
      mcVersion,
      loader,
      loaderVersion: loaderVersion || undefined,
      iconColor: color,
      mods: [],
      createdAt: Date.now(),
      ramMb: ram,
      minRamMb: Math.min(settings?.defaultMinRamMb ?? 2048, ram),
      javaVersion: javaV,
      fullscreen: settings?.fullscreen ?? false,
      resolutionWidth: settings?.resolutionWidth ?? 0,
      resolutionHeight: settings?.resolutionHeight ?? 0,
    };
    await onCreated(inst, autoMods && loader !== "vanilla");
    setCreating(false);
  };

  return (
    <Modal open onClose={onClose} width={720}>
      <div className="chaos-wizard-head">
        <h3>Neues Profil</h3>
        <div className="chaos-wizard-steps">
          {[1, 2, 3].map((s) => (
            <span key={s} className={"chaos-wizard-step" + (step === s ? " active" : step > s ? " done" : "")}>
              {s}. {s === 1 ? "Version" : s === 2 ? "Loader" : "Details"}
            </span>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="chaos-wizard-body">
          <div className="chaos-row" style={{ gap: 10, marginBottom: 12 }}>
            <input className="chaos-input" placeholder="Version suchen, z.B. 1.21" value={vFilter} onChange={(e) => setVFilter(e.target.value)} />
            <Toggle checked={showSnapshots} onChange={setShowSnapshots} />
            <span className="chaos-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              Snapshots
            </span>
          </div>
          <div className="chaos-version-groups">
            {groups.length === 0 && <p className="chaos-faint">Lade Versionen …</p>}
            {groups.map(([g, list]) => (
              <div key={g} className="chaos-version-group">
                <span className="chaos-version-group-title">{g}</span>
                <div className="chaos-version-chips">
                  {list.map((v) => (
                    <button key={v.id} className={"chaos-version-chip" + (mcVersion === v.id ? " active" : "") + (v.kind !== "release" ? " snap" : "")} onClick={() => setMcVersion(v.id)} title={v.releaseTime}>
                      {v.id}
                      {v.latestRelease && <em>neu</em>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="chaos-wizard-body">
          <div className="chaos-loader-grid">
            {LOADERS.map((l) => {
              const sup = l.value === "vanilla" ? true : support[l.value];
              return (
                <button key={l.value} className={"chaos-loader-card" + (loader === l.value ? " active" : "") + (sup === false ? " unavailable" : "")} onClick={() => sup !== false && setLoader(l.value)} disabled={sup === false}>
                  <strong>{l.label}</strong>
                  <span>{l.desc}</span>
                  <em>{sup === undefined ? "prüfe …" : sup === false ? `nicht für ${mcVersion}` : sup === null ? "unbekannt" : "verfügbar"}</em>
                </button>
              );
            })}
          </div>
          {loader !== "vanilla" && (
            <label className="chaos-field" style={{ marginTop: 14 }}>
              <span>{LOADERS.find((l) => l.value === loader)?.label}-Version</span>
              <select className="onyx-select" value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
                {loaderVersions.length === 0 && <option value="">lade …</option>}
                {loaderVersions.slice(0, 40).map((lv) => (
                  <option key={lv.version} value={lv.version}>
                    {lv.version}
                    {lv.recommended ? " (empfohlen)" : lv.stable ? "" : " (beta)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="chaos-wizard-body chaos-col" style={{ gap: 14 }}>
          <label className="chaos-field">
            <span>Name</span>
            <input className="chaos-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${LOADERS.find((l) => l.value === loader)?.label} ${mcVersion}`} autoFocus />
          </label>
          <div className="chaos-field">
            <span>Farbe</span>
            <div className="chaos-color-row">
              {COLORS.map((c) => (
                <button key={c} className={"chaos-color-dot" + (c === color ? " selected" : "")} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <div className="chaos-field">
            <span>
              Maximaler RAM: <strong style={{ color: "var(--chaos-accent-light)" }}>{(ram / 1024).toFixed(1)} GB</strong>
              {mem && <span className="chaos-faint"> · PC hat {(mem.totalMb / 1024).toFixed(0)} GB, empfohlen {(mem.recommendedMaxMb / 1024).toFixed(0)} GB</span>}
            </span>
            <input type="range" className="chaos-range" min={1024} max={sliderMax} step={512} value={Math.min(ram, sliderMax)} onChange={(e) => setRam(Number(e.target.value))} />
          </div>
          {loader !== "vanilla" && (
            <Toggle checked={autoMods} onChange={setAutoMods} label="Standard-Mods automatisch installieren" description="Fabric API, Sodium, Lithium, FerriteCore, EntityCulling, ImmediatelyFast, ModernFix, Mod Menu, AppleSkin." />
          )}
          <div className="chaos-wizard-summary">
            <span className="chaos-badge chaos-badge-accent">Minecraft {mcVersion}</span>
            <span className="chaos-badge" style={{ textTransform: "capitalize" }}>
              {loader} {loaderVersion}
            </span>
            <span className="chaos-badge">Java {guessJava(mcVersion)}+</span>
          </div>
        </div>
      )}

      <div className="chaos-modal-actions" style={{ justifyContent: "space-between" }}>
        <button className="chaos-btn chaos-btn-ghost" onClick={onClose}>
          Abbrechen
        </button>
        <div className="chaos-row">
          {step > 1 && (
            <button className="chaos-btn" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
              ← Zurück
            </button>
          )}
          {step < 3 ? (
            <button className="chaos-btn chaos-btn-primary" disabled={(step === 1 && !mcVersion) || (step === 2 && loader !== "vanilla" && !loaderVersion)} onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
              Weiter →
            </button>
          ) : (
            <button className="chaos-btn chaos-btn-primary" disabled={creating} onClick={create}>
              {creating ? "Erstelle …" : "Profil erstellen"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ============================ Bearbeiten ============================ */
function EditDialog({ instance, onClose, onSave }: { instance: Instance; onClose: () => void; onSave: (patch: Partial<Instance>) => Promise<void> }) {
  const [tab, setTab] = useState<"general" | "java" | "game">("general");
  const [form, setForm] = useState<Instance>({ ...instance });
  const [mem, setMem] = useState<MemoryInfo | null>(null);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  useEffect(() => {
    getMemoryInfo().then(setMem).catch(() => {});
    if (form.loader !== "vanilla") getLoaderVersions(form.loader, form.mcVersion).then(setLoaderVersions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = <K extends keyof Instance>(k: K, v: Instance[K]) => setForm((f) => ({ ...f, [k]: v }));
  const sliderMax = mem?.sliderMaxMb ?? 16384;
  const minRam = form.minRamMb ?? 0;

  return (
    <Modal open onClose={onClose} title={`Profil bearbeiten – ${instance.name}`} width={680}>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "general", label: "Allgemein" },
          { id: "java", label: "RAM & Java" },
          { id: "game", label: "Spiel" },
        ]}
      />
      <div className="chaos-col" style={{ gap: 14, marginTop: 16 }}>
        {tab === "general" && (
          <>
            <label className="chaos-field">
              <span>Name</span>
              <input className="chaos-input" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="chaos-field">
              <span>Beschreibung</span>
              <input className="chaos-input" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Wofür ist dieses Profil?" />
            </label>
            <div className="chaos-field">
              <span>Farbe</span>
              <div className="chaos-color-row">
                {COLORS.map((c) => (
                  <button key={c} className={"chaos-color-dot" + (c === form.iconColor ? " selected" : "")} style={{ background: c }} onClick={() => set("iconColor", c)} />
                ))}
              </div>
            </div>
            <div className="chaos-field-row">
              <label className="chaos-field">
                <span>Minecraft-Version</span>
                <input className="chaos-input" value={form.mcVersion} disabled title="Die Version lässt sich nach dem Erstellen nicht ändern – dupliziere das Profil mit neuer Version." />
              </label>
              <label className="chaos-field">
                <span>Loader-Version</span>
                {form.loader === "vanilla" ? (
                  <input className="chaos-input" value="Vanilla" disabled />
                ) : (
                  <select className="onyx-select" value={form.loaderVersion ?? ""} onChange={(e) => set("loaderVersion", e.target.value)}>
                    <option value="">automatisch (neueste)</option>
                    {loaderVersions.slice(0, 40).map((lv) => (
                      <option key={lv.version} value={lv.version}>
                        {lv.version}
                        {lv.recommended ? " (empfohlen)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>
            <label className="chaos-field">
              <span>Direkt mit Server verbinden (optional)</span>
              <input className="chaos-input" value={form.quickServer ?? ""} onChange={(e) => set("quickServer", e.target.value)} placeholder="play.beispiel.de" />
            </label>
          </>
        )}
        {tab === "java" && (
          <>
            <div className="chaos-field">
              <span>
                Maximaler RAM: <strong style={{ color: "var(--chaos-accent-light)" }}>{(form.ramMb / 1024).toFixed(1)} GB</strong>
                {mem && <span className="chaos-faint"> · verfügbar {(mem.totalMb / 1024).toFixed(0)} GB</span>}
              </span>
              <input type="range" className="chaos-range" min={1024} max={sliderMax} step={512} value={Math.min(form.ramMb, sliderMax)} onChange={(e) => set("ramMb", Number(e.target.value))} />
            </div>
            <div className="chaos-field">
              <span>
                Minimaler RAM: <strong style={{ color: "var(--chaos-accent-light)" }}>{minRam ? `${(minRam / 1024).toFixed(1)} GB` : "automatisch"}</strong>
              </span>
              <input type="range" className="chaos-range" min={0} max={form.ramMb} step={512} value={Math.min(minRam, form.ramMb)} onChange={(e) => set("minRamMb", Number(e.target.value))} />
            </div>
            {mem && form.ramMb > mem.totalMb * 0.85 && <div className="onyx-toast onyx-toast-warn">So viel RAM lässt dem System kaum Luft – empfohlen sind höchstens {(mem.recommendedMaxMb / 1024).toFixed(0)} GB.</div>}
            <label className="chaos-field">
              <span>Java-Pfad (leer = automatisch passende Version)</span>
              <input className="chaos-input chaos-mono" value={form.javaPath ?? ""} onChange={(e) => set("javaPath", e.target.value)} placeholder="C:\…\bin\javaw.exe" />
            </label>
            <label className="chaos-field">
              <span>JVM-Argumente (zusätzlich)</span>
              <textarea className="chaos-input chaos-mono" rows={3} value={form.jvmArgs ?? ""} onChange={(e) => set("jvmArgs", e.target.value)} placeholder="-XX:+UseZGC" />
            </label>
          </>
        )}
        {tab === "game" && (
          <>
            <div className="chaos-field-row">
              <label className="chaos-field">
                <span>Breite</span>
                <input className="chaos-input" type="number" value={form.resolutionWidth ?? 0} onChange={(e) => set("resolutionWidth", Number(e.target.value))} placeholder="0 = Standard" />
              </label>
              <label className="chaos-field">
                <span>Höhe</span>
                <input className="chaos-input" type="number" value={form.resolutionHeight ?? 0} onChange={(e) => set("resolutionHeight", Number(e.target.value))} placeholder="0 = Standard" />
              </label>
            </div>
            <Toggle checked={!!form.fullscreen} onChange={(v) => set("fullscreen", v)} label="Vollbild" description="Minecraft startet im Vollbildmodus." />
            <label className="chaos-field">
              <span>Spiel-Argumente (zusätzlich)</span>
              <input className="chaos-input chaos-mono" value={form.gameArgs ?? ""} onChange={(e) => set("gameArgs", e.target.value)} placeholder="--demo" />
            </label>
            <label className="chaos-field">
              <span>Eigenes Spielverzeichnis (leer = Standard)</span>
              <input className="chaos-input chaos-mono" value={form.gameDir ?? ""} onChange={(e) => set("gameDir", e.target.value)} placeholder="D:\Minecraft\MeinProfil" />
            </label>
          </>
        )}
      </div>
      <div className="chaos-modal-actions">
        <button className="chaos-btn" onClick={onClose}>
          Abbrechen
        </button>
        <button
          className="chaos-btn chaos-btn-primary"
          onClick={() =>
            onSave({
              name: form.name.trim() || instance.name,
              description: form.description,
              iconColor: form.iconColor,
              loaderVersion: form.loaderVersion || undefined,
              quickServer: form.quickServer?.trim() ?? "",
              ramMb: form.ramMb,
              minRamMb: form.minRamMb ?? 0,
              javaPath: form.javaPath?.trim() ?? "",
              jvmArgs: form.jvmArgs ?? "",
              resolutionWidth: form.resolutionWidth ?? 0,
              resolutionHeight: form.resolutionHeight ?? 0,
              fullscreen: !!form.fullscreen,
              gameArgs: form.gameArgs ?? "",
              gameDir: form.gameDir?.trim() ?? "",
            })
          }
        >
          Speichern
        </button>
      </div>
    </Modal>
  );
}

export { ConfirmDialog };

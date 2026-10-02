/* ============================================================
 * Chaos Launcher - Mod-Manager
 *
 * Tabs: Installiert · Durchsuchen · Updates. Jede Mod als Karte mit
 * Version, MC-Version, Loader und Abhängigkeiten. Installation mit
 * Versionsauswahl und automatischer Abhängigkeitsauflösung.
 * ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ModCard from "@/components/ModCard";
import { ConfirmDialog, Empty, Modal, PageHead, Skeleton, Tabs, Toggle } from "@/components/ui";
import { useInstanceStore, useSettingsStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { invoke } from "@/lib/bridge";
import { uid, formatDate } from "@/lib/utils";
import { checkModUpdates, getModVersions, getProjects, installFileToInstance, isCompatible, searchMods } from "@/lib/api/mods";
import { formatBytes } from "@/lib/api/launcher";
import type { Instance, InstanceMod, Mod, ModFile, ModUpdate, ProjectType } from "@/types";
import "./ModsPage.css";

type Tab = "installed" | "browse" | "updates";

const TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: "mod", label: "Mods" },
  { value: "shader", label: "Shader" },
  { value: "resourcepack", label: "Resourcepacks" },
];
const CATEGORY_OPTIONS = [
  { value: "", label: "Alle Kategorien" },
  { value: "optimization", label: "⚡ Performance" },
  { value: "utility", label: "🛠️ Werkzeug" },
  { value: "adventure", label: "🗺️ Abenteuer" },
  { value: "magic", label: "🔮 Magie" },
  { value: "technology", label: "⚙️ Technik" },
  { value: "decoration", label: "🎨 Deko" },
  { value: "storage", label: "📦 Lager" },
  { value: "food", label: "🍖 Essen" },
  { value: "mobs", label: "👾 Mobs" },
  { value: "equipment", label: "🛡️ Ausrüstung" },
  { value: "worldgen", label: "🌍 Weltgenerierung" },
  { value: "library", label: "📚 Bibliothek" },
];
const SORT_OPTIONS = [
  { value: "relevance", label: "Relevanz" },
  { value: "downloads", label: "Downloads" },
  { value: "follows", label: "Follower" },
  { value: "newest", label: "Neueste" },
  { value: "updated", label: "Zuletzt aktualisiert" },
];

export default function ModsPage() {
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const setActive = useInstanceStore((s) => s.setActive);
  const update = useInstanceStore((s) => s.update);
  const settings = useSettingsStore((s) => s.settings);
  const instance = instances.find((i) => i.id === activeId) ?? null;

  const [tab, setTab] = useState<Tab>("browse");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ProjectType>("mod");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState<"modrinth" | "curseforge" | "all">("all");
  const [sort, setSort] = useState("relevance");
  const [onlyCompatible, setOnlyCompatible] = useState(true);
  const [results, setResults] = useState<Mod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionDialog, setVersionDialog] = useState<{ mod: Mod; files: ModFile[] | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [updates, setUpdates] = useState<ModUpdate[] | null>(null);
  const [removeMod, setRemoveMod] = useState<InstanceMod | null>(null);
  const [installedMeta, setInstalledMeta] = useState<Record<string, Mod>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  // Suche (debounced, race-sicher)
  useEffect(() => {
    if (tab !== "browse") return;
    const id = ++requestId.current;
    setResults(null);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const r = await searchMods({
          query: query.trim(),
          source,
          projectType: type,
          category,
          mcVersion: onlyCompatible && instance ? instance.mcVersion : "",
          loader: onlyCompatible && instance && type === "mod" && instance.loader !== "vanilla" ? instance.loader : "",
          sort: sort as "relevance",
        });
        if (id === requestId.current) setResults(r);
      } catch (e) {
        if (id === requestId.current) {
          setError(String(e));
          setResults([]);
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [tab, query, type, category, source, sort, onlyCompatible, instance?.mcVersion, instance?.loader, instance]);

  // Metadaten (Icons) für installierte Mods nachladen
  useEffect(() => {
    if (!instance) return;
    const ids = instance.mods.filter((m) => m.projectId && m.source === "modrinth" && !installedMeta[m.projectId]).map((m) => m.projectId!) as string[];
    if (ids.length === 0) return;
    getProjects([...new Set(ids)])
      .then((list) => setInstalledMeta((m) => ({ ...m, ...Object.fromEntries(list.map((p) => [p.id, p])) })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, instance?.mods.length]);

  const loadUpdates = useCallback(async () => {
    if (!instance) return;
    setUpdates(null);
    try {
      setUpdates(await checkModUpdates(instance.id));
    } catch (e) {
      toast.error("Update-Prüfung fehlgeschlagen", String(e));
      setUpdates([]);
    }
  }, [instance]);
  useEffect(() => {
    if (tab === "updates") void loadUpdates();
  }, [tab, loadUpdates]);

  const installedProjectIds = useMemo(() => new Set((instance?.mods ?? []).map((m) => m.projectId).filter(Boolean)), [instance]);

  /** Öffnet die Versionsauswahl für eine Mod. */
  const openVersions = async (mod: Mod) => {
    if (!instance) {
      toast.warning("Kein Profil", "Wähle oben ein Profil aus.");
      return;
    }
    if (mod.projectType === "mod" && instance.loader === "vanilla") {
      toast.warning("Vanilla-Profil", "Mods brauchen einen Modloader (Fabric/Forge/NeoForge/Quilt).");
      return;
    }
    setVersionDialog({ mod, files: null });
    try {
      const files = await getModVersions(mod.id, instance.mcVersion, instance.loader, mod.source);
      setVersionDialog({ mod, files });
    } catch (e) {
      toast.error("Versionen konnten nicht geladen werden", String(e));
      setVersionDialog(null);
    }
  };

  const install = async (mod: Mod, file: ModFile) => {
    if (!instance) return;
    setVersionDialog(null);
    setBusy(`Installiere ${mod.title} …`);
    const r = await installFileToInstance(instance.id, mod, file, (s) => setBusy(s));
    setBusy(null);
    if (r.failed.length) toast.warning(`${mod.title} installiert`, `Probleme: ${r.failed.join(", ")}`);
    else toast.success(`${mod.title} installiert`, r.dependencies.length ? `+ Abhängigkeiten: ${r.dependencies.join(", ")}` : undefined);
  };

  const applyUpdate = async (u: ModUpdate) => {
    if (!instance) return;
    const m = instance.mods.find((x) => x.id === u.modId);
    if (!m) return;
    setBusy(`Aktualisiere ${u.title} …`);
    const r = await installFileToInstance(instance.id, { title: m.title, source: m.source, projectType: m.projectType ?? "mod", iconUrl: m.iconUrl }, u.latest, (s) => setBusy(s));
    setBusy(null);
    if (r.failed.length) toast.warning("Update mit Problemen", r.failed.join(", "));
    else toast.success(`${u.title} aktualisiert`, u.latest.versionNumber);
    setUpdates((list) => (list ?? []).filter((x) => x.modId !== u.modId));
  };

  const toggleMod = (m: InstanceMod) => instance && update(instance.id, { mods: instance.mods.map((x) => (x.id === m.id ? { ...x, enabled: !x.enabled } : x)) });
  const doRemove = async () => {
    if (!instance || !removeMod) return;
    await update(instance.id, { mods: instance.mods.filter((x) => x.id !== removeMod.id) });
    invoke("remove_mod_file", { fileName: removeMod.fileName }).catch(() => {});
    toast.success("Entfernt", removeMod.title);
    setRemoveMod(null);
  };

  /** Lokale Dateien (.jar/.zip) importieren. */
  const handleLocalFiles = async (files: FileList | null) => {
    if (!files || !instance) return;
    for (const f of Array.from(files)) {
      const lower = f.name.toLowerCase();
      if (!lower.endsWith(".jar") && !lower.endsWith(".zip")) {
        toast.warning("Übersprungen", `${f.name} ist keine .jar/.zip-Datei.`);
        continue;
      }
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        let binary = "";
        for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)) as unknown as number[]);
        await invoke("save_local_mod", { fileName: f.name, dataBase64: btoa(binary) });
        const pt: ProjectType = lower.endsWith(".jar") ? "mod" : type === "shader" ? "shader" : "resourcepack";
        const entry: InstanceMod = { id: uid(), title: f.name.replace(/\.(jar|zip)$/i, ""), source: "local", fileName: f.name, enabled: true, projectType: pt, installedAt: Date.now() };
        const cur = useInstanceStore.getState().instances.find((i) => i.id === instance.id)!;
        await update(instance.id, { mods: [...cur.mods.filter((m) => m.fileName !== f.name), entry] });
        toast.success("Importiert", f.name);
      } catch (e) {
        toast.error("Import fehlgeschlagen", String(e));
      }
    }
  };

  const installed = instance?.mods ?? [];
  const installedSorted = useMemo(() => [...installed].sort((a, b) => (a.projectType ?? "mod").localeCompare(b.projectType ?? "mod") || a.title.localeCompare(b.title)), [installed]);

  return (
    <div className="onyx-content">
      <PageHead
        title="Mods"
        subtitle="Durchsuche Modrinth und CurseForge, installiere Mods, Shader und Resourcepacks pro Profil – mit Versionsauswahl, Abhängigkeiten und Updates."
        actions={
          <>
            <select className="onyx-select" value={instance?.id ?? ""} onChange={(e) => setActive(e.target.value)} title="Profil">
              {instances.length === 0 && <option value="">Kein Profil</option>}
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.mcVersion} · {i.loader}
                </option>
              ))}
            </select>
            <button className="chaos-btn" onClick={() => fileInput.current?.click()} disabled={!instance}>
              + Eigene Datei
            </button>
          </>
        }
      />
      <input ref={fileInput} type="file" accept=".jar,.zip" multiple style={{ display: "none" }} onChange={(e) => handleLocalFiles(e.target.files)} />

      {!instance && (
        <Empty icon="📦" title="Kein Profil ausgewählt" hint="Erstelle oder wähle ein Profil, um Mods zu verwalten." action={<button className="chaos-btn chaos-btn-primary" onClick={() => navigate("/profiles")}>Zu den Profilen</button>} />
      )}

      {instance && (
        <>
          <div className="chaos-row" style={{ justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { id: "installed", label: "Installiert", badge: installed.length },
                { id: "browse", label: "Durchsuchen" },
                { id: "updates", label: "Updates", badge: updates?.length || undefined },
              ]}
            />
            <span className="chaos-badge chaos-badge-accent">
              {instance.name} · {instance.mcVersion} · {instance.loader}
            </span>
          </div>
          {busy && (
            <div className="onyx-toast onyx-toast-info chaos-row" style={{ marginBottom: 14 }}>
              <span className="onyx-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {busy}
            </div>
          )}

          {/* ---------- Installiert ---------- */}
          {tab === "installed" &&
            (installedSorted.length === 0 ? (
              <Empty icon="🧩" title="Noch keine Mods in diesem Profil" hint="Wechsle zu „Durchsuchen“ oder importiere eigene Dateien." action={<button className="chaos-btn chaos-btn-primary" onClick={() => setTab("browse")}>Mods durchsuchen</button>} />
            ) : (
              <div className="chaos-installed-list">
                {installedSorted.map((m) => {
                  const meta = m.projectId ? installedMeta[m.projectId] : undefined;
                  const compatible = isCompatible({ gameVersions: m.gameVersions ?? [], loaders: m.loaders ?? [] }, instance, m.projectType ?? "mod");
                  const upd = updates?.find((u) => u.modId === m.id);
                  const depTitles = (m.dependencies ?? []).map((d) => installed.find((x) => x.projectId === d)?.title ?? installedMeta[d]?.title ?? d);
                  return (
                    <div key={m.id} className={"chaos-card chaos-installed" + (m.enabled ? "" : " disabled") + (compatible ? "" : " incompatible")}>
                      <div className="chaos-installed-icon">{meta?.iconUrl || m.iconUrl ? <img src={meta?.iconUrl || m.iconUrl} alt="" /> : <span>{m.title.charAt(0).toUpperCase()}</span>}</div>
                      <div className="chaos-col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                        <div className="chaos-row chaos-wrap" style={{ gap: 6 }}>
                          <strong className="chaos-truncate">{m.title}</strong>
                          <span className="chaos-badge">{m.projectType === "shader" ? "Shader" : m.projectType === "resourcepack" ? "Resourcepack" : "Mod"}</span>
                          {m.versionNumber && <span className="chaos-badge chaos-badge-accent">{m.versionNumber}</span>}
                          {(m.gameVersions?.length ?? 0) > 0 && <span className="chaos-badge">MC {m.gameVersions!.slice(0, 3).join(", ")}{m.gameVersions!.length > 3 ? " …" : ""}</span>}
                          {(m.loaders?.length ?? 0) > 0 && <span className="chaos-badge" style={{ textTransform: "capitalize" }}>{m.loaders!.join(", ")}</span>}
                          {!compatible && <span className="chaos-badge chaos-badge-danger">⚠ inkompatibel mit {instance.mcVersion}</span>}
                          {upd && <span className="chaos-badge chaos-badge-warning">Update: {upd.latest.versionNumber}</span>}
                          {m.source === "local" && <span className="chaos-badge">lokal</span>}
                        </div>
                        <span className="chaos-faint chaos-truncate" style={{ fontSize: 11 }}>
                          {m.fileName}
                          {m.installedAt ? ` · installiert ${formatDate(m.installedAt)}` : ""}
                          {depTitles.length > 0 ? ` · benötigt: ${depTitles.join(", ")}` : ""}
                        </span>
                      </div>
                      {upd && (
                        <button className="chaos-btn chaos-btn-primary chaos-btn-sm" onClick={() => applyUpdate(upd)}>
                          Update
                        </button>
                      )}
                      <Toggle checked={m.enabled} onChange={() => toggleMod(m)} />
                      <button className="chaos-btn chaos-btn-sm chaos-btn-danger" onClick={() => setRemoveMod(m)} title="Entfernen">
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}

          {/* ---------- Durchsuchen ---------- */}
          {tab === "browse" && (
            <>
              <div className="chaos-mods-toolbar">
                <input className="chaos-input" style={{ maxWidth: 360 }} placeholder="Mods, Shader, Resourcepacks suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
                <select className="onyx-select" value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select className="onyx-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select className="onyx-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select className="onyx-select" value={source} onChange={(e) => setSource(e.target.value as "modrinth")}>
                  <option value="all">Modrinth + CurseForge</option>
                  <option value="modrinth">Nur Modrinth</option>
                  <option value="curseforge">Nur CurseForge</option>
                </select>
                <label className="chaos-row" style={{ gap: 8, fontSize: 12, whiteSpace: "nowrap" }}>
                  <Toggle checked={onlyCompatible} onChange={setOnlyCompatible} /> nur passend zu {instance.mcVersion}
                </label>
              </div>
              {error && <div className="onyx-toast onyx-toast-warn" style={{ marginBottom: 14 }}>{error}</div>}
              {results === null ? (
                <div className="onyx-grid">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="chaos-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      <Skeleton kind="title" />
                      <Skeleton kind="text" />
                      <Skeleton kind="text" style={{ width: "60%" }} />
                    </div>
                  ))}
                </div>
              ) : results.length === 0 ? (
                <Empty icon="🔍" title="Keine Treffer" hint="Anderen Suchbegriff oder Filter versuchen." />
              ) : (
                <div className="onyx-grid">
                  {results.map((mod) => (
                    <ModCard key={`${mod.source}-${mod.id}`} mod={mod} instance={instance} added={installedProjectIds.has(mod.id)} onAdd={openVersions} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ---------- Updates ---------- */}
          {tab === "updates" && (
            <>
              <div className="chaos-row" style={{ marginBottom: 14, gap: 10 }}>
                <button className="chaos-btn" onClick={loadUpdates}>
                  ↻ Erneut prüfen
                </button>
                {updates && updates.length > 1 && (
                  <button
                    className="chaos-btn chaos-btn-primary"
                    onClick={async () => {
                      for (const u of updates) await applyUpdate(u);
                    }}
                  >
                    Alle aktualisieren ({updates.length})
                  </button>
                )}
              </div>
              {updates === null ? (
                <div className="chaos-col" style={{ gap: 10 }}>
                  <Skeleton kind="block" />
                  <Skeleton kind="block" />
                </div>
              ) : updates.length === 0 ? (
                <Empty icon="✅" title="Alle Mods sind aktuell" hint="Geprüft werden Modrinth-Mods passend zu Version und Loader des Profils." />
              ) : (
                <div className="chaos-installed-list">
                  {updates.map((u) => (
                    <div key={u.modId} className="chaos-card chaos-installed">
                      <div className="chaos-col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                        <strong>{u.title}</strong>
                        <span className="chaos-faint" style={{ fontSize: 12 }}>
                          {u.currentVersion || "unbekannt"} → <strong style={{ color: "var(--chaos-success)" }}>{u.latest.versionNumber}</strong> · {formatBytes(u.latest.sizeBytes)} · {u.latest.datePublished.slice(0, 10)}
                        </span>
                      </div>
                      <button className="chaos-btn chaos-btn-primary chaos-btn-sm" onClick={() => applyUpdate(u)}>
                        Aktualisieren
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Versionsauswahl */}
      <Modal open={!!versionDialog} onClose={() => setVersionDialog(null)} title={versionDialog ? `${versionDialog.mod.title} – Version wählen` : ""} hint={instance ? `Für ${instance.name} (${instance.mcVersion}, ${instance.loader}). Benötigte Abhängigkeiten werden automatisch mitinstalliert.` : ""} width={640}>
        {versionDialog && (versionDialog.files === null ? (
          <div className="chaos-col" style={{ gap: 8 }}>
            <Skeleton kind="block" />
            <Skeleton kind="block" />
          </div>
        ) : versionDialog.files.length === 0 ? (
          <Empty title="Keine Dateien gefunden" hint="Für diese Mod gibt es keine Version für dein Profil." />
        ) : (
          <VersionList files={versionDialog.files} instance={instance!} projectType={versionDialog.mod.projectType} onPick={(f) => install(versionDialog.mod, f)} />
        ))}
      </Modal>

      <ConfirmDialog open={!!removeMod} title={`"${removeMod?.title}" entfernen?`} message="Die Mod wird aus dem Profil entfernt. Andere Profile sind nicht betroffen." confirmLabel="Entfernen" danger onConfirm={doRemove} onCancel={() => setRemoveMod(null)} />
    </div>
  );
}

function VersionList({ files, instance, projectType, onPick }: { files: ModFile[]; instance: Instance; projectType: ProjectType; onPick: (f: ModFile) => void }) {
  const [showAll, setShowAll] = useState(false);
  const compatible = files.filter((f) => isCompatible(f, instance, projectType));
  const list = showAll ? files : compatible.length > 0 ? compatible : files;
  return (
    <div className="chaos-col" style={{ gap: 8 }}>
      {list.slice(0, 30).map((f) => {
        const ok = isCompatible(f, instance, projectType);
        const required = f.dependencies.filter((d) => d.dependencyType === "required").length;
        return (
          <button key={f.versionId + f.fileName} className={"chaos-version-item" + (ok ? "" : " incompatible")} onClick={() => onPick(f)}>
            <div className="chaos-col" style={{ gap: 3, minWidth: 0, flex: 1 }}>
              <div className="chaos-row chaos-wrap" style={{ gap: 6 }}>
                <strong>{f.versionNumber || f.versionName}</strong>
                <span className={"chaos-badge " + (f.versionType === "release" ? "chaos-badge-success" : f.versionType === "beta" ? "chaos-badge-warning" : "chaos-badge-danger")}>{f.versionType}</span>
                {f.primary && <span className="chaos-badge chaos-badge-accent">empfohlen</span>}
                {!ok && <span className="chaos-badge chaos-badge-danger">inkompatibel</span>}
              </div>
              <span className="chaos-faint chaos-truncate" style={{ fontSize: 11 }}>
                {f.fileName} · {formatBytes(f.sizeBytes)} · {f.datePublished.slice(0, 10)}
              </span>
              <span className="chaos-faint" style={{ fontSize: 11 }}>
                MC {f.gameVersions.slice(0, 6).join(", ")}
                {f.gameVersions.length > 6 ? " …" : ""} · {f.loaders.join(", ") || "—"}
                {required > 0 ? ` · ${required} Abhängigkeit${required > 1 ? "en" : ""}` : ""}
              </span>
            </div>
            <span className="chaos-btn chaos-btn-primary chaos-btn-sm">Installieren</span>
          </button>
        );
      })}
      {!showAll && compatible.length > 0 && compatible.length < files.length && (
        <button className="chaos-btn chaos-btn-ghost chaos-btn-sm" onClick={() => setShowAll(true)}>
          Auch {files.length - compatible.length} inkompatible Versionen anzeigen
        </button>
      )}
    </div>
  );
}

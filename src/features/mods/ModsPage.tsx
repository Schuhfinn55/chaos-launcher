/* ============================================================
 * Onyx Launcher - Mod-Suche
 *
 * Durchsucht Modrinth (live) und CurseForge (sofern API-Key
 * hinterlegt). Eigene Mods lassen sich per Drag&Drop oder
 * Datei-Auswahl hinzufügen.
 * ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Mod } from "@/types";
import { invoke } from "@/lib/bridge";
import ModCard from "@/components/ModCard";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { useInstanceStore } from "@/stores/useStore";
import { uid } from "@/lib/utils";
import type { Instance } from "@/types";

const SOURCE_OPTIONS = [
  { value: "all", label: "Alle Quellen" },
  { value: "modrinth", label: "Modrinth" },
  { value: "curseforge", label: "CurseForge" },
  { value: "local", label: "Eigene Mods" },
];

const TYPE_OPTIONS = [
  { value: "mod", label: "Mods" },
  { value: "shader", label: "Shader" },
  { value: "resourcepack", label: "Resourcepacks" },
  { value: "modpack", label: "Modpacks" },
];

/** Kategorie-Filter (facets für Modrinth). */
const CATEGORY_OPTIONS = [
  { value: "", label: "Alle Kategorien" },
  { value: "performance", label: "⚡ Performance" },
  { value: "optimization", label: "🚀 Optimierung" },
  { value: "magic", label: "🔮 Magie" },
  { value: "technology", label: "⚙️ Technik" },
  { value: "adventure", label: "🗺️ Abenteuer" },
  { value: "utility", label: "🛠️ Werkzeug" },
  { value: "decoration", label: "🎨 Deko" },
  { value: "storage", label: "📦 Lager" },
  { value: "food", label: "🍖 Essen" },
  { value: "mobs", label: "👾 Mobs" },
  { value: "armor", label: "🛡️ Rüstung" },
  { value: "weapons", label: "⚔️ Waffen" },
  { value: "education", label: "📚 Bildung" },
];

export default function ModsPage() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("modrinth");
  const [projectType, setProjectType] = useState("mod");
  const [category, setCategory] = useState("");
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMods, setLocalMods] = useState<Mod[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Debounce für die Live-Suche
  useEffect(() => {
    if (source === "local") return;
    const term = query.trim();
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        // Bei leerer Suche: leeres Query senden -> Modrinth liefert
        // die beliebtesten Mods (sortiert nach Downloads).
        const result = await invoke<Mod[]>("search_mods", {
          query: term,
          source,
          projectType,
          category,
        });
        setMods(result);
      } catch (e) {
        setError(String(e));
        setMods([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, source, projectType, category]);

  // Lokale Mods aus dem localStorage-ähnlichen Speicher laden
  useEffect(() => {
    if (source !== "local") return;
    const raw = localStorage.getItem("onyx.localMods");
    setLocalMods(raw ? JSON.parse(raw) : []);
  }, [source]);

  const handleLocalFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const raw = localStorage.getItem("onyx.localMods");
    const existing: Mod[] = raw ? JSON.parse(raw) : [];
    const fileArr = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".jar")
    );
    const newMods: Mod[] = [];
    let importOk = 0;
    let importFail = 0;

    for (const f of fileArr) {
      try {
        // Datei als ArrayBuffer lesen und base64-kodieren, dann ans
        // Backend schicken, das sie im Mod-Cache ablegt.
        const arrayBuffer = await f.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // Base64 manuell kodieren (große Dateien)
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
        }
        const base64 = btoa(binary);
        await invoke<string>("save_local_mod", {
          fileName: f.name,
          dataBase64: base64,
        });
        importOk++;
        newMods.push({
          id: uid(),
          source: "local" as const,
          title: f.name.replace(/\.jar$/i, ""),
          description: "Selbst hinzugefügter Mod (lokal).",
          author: "Du",
          downloads: 0,
          categories: ["local"],
          projectType: "mod" as const,
          localFileName: f.name,
          localPath: f.name,
        });
      } catch (e) {
        importFail++;
        console.error("Mod-Import fehlgeschlagen:", f.name, e);
      }
    }

    const merged = [...existing, ...newMods];
    localStorage.setItem("onyx.localMods", JSON.stringify(merged));
    setLocalMods(merged);

    if (importFail > 0) {
      setNotice(
        `${importOk} Mod(s) importiert, ${importFail} fehlgeschlagen. Klicke "Hinzufügen" und wähle ein Profil.`
      );
    } else {
      setNotice(
        `${importOk} Mod(s) importiert und gespeichert. Klicke "Hinzufügen" und wähle ein Profil.`
      );
    }
    setTimeout(() => setNotice(null), 5000);
  }, []);

  const removeLocalMod = (id: string) => {
    const next = localMods.filter((m) => m.id !== id);
    localStorage.setItem("onyx.localMods", JSON.stringify(next));
    setLocalMods(next);
  };

  const instances = useInstanceStore((s) => s.instances);
  const activeInstance = instances.find(
    (i) => i.id === useInstanceStore.getState().activeId
  );
  const update = useInstanceStore((s) => s.update);

  const [downloadingMod, setDownloadingMod] = useState<string | null>(null);
  // Profil-Auswahl-Dialog: zeigt alle Profile, man wählt das Ziel
  const [profilePicker, setProfilePicker] = useState<Mod | null>(null);
  // Versions-Auswahl-Dialog (nach Profil-Auswahl)
  const [versionDialog, setVersionDialog] = useState<{
    mod: Mod;
    instance: Instance;
    files: Array<{
      fileName: string;
      url: string;
      sha1: string;
      primary: boolean;
      sizeBytes: number;
      versionType?: string;
    }>;
  } | null>(null);

  const handleAdd = (mod: Mod) => {
    // Profil-Auswahl-Dialog öffnen
    setProfilePicker(mod);
  };

  /** Nach Profil-Auswahl: Versionen laden oder lokale Mod sofort zuweisen. */
  const handleProfileSelected = async (mod: Mod, instance: Instance) => {
    setProfilePicker(null);

    // Lokale Mod: sofort hinzufügen
    if (mod.source === "local") {
      const target = instances.find((i) => i.id === instance.id);
      if (!target) return;
      update(instance.id, {
        mods: [
          ...target.mods,
          {
            id: uid(),
            title: mod.title,
            source: mod.source,
            fileName: mod.localFileName ?? `${mod.slug ?? mod.id}.jar`,
            enabled: true,
            projectType: mod.projectType,
          },
        ],
      });
      setNotice(`✓ "${mod.title}" zu "${instance.name}" hinzugefügt.`);
      setTimeout(() => setNotice(null), 4000);
      return;
    }

    // Online-Mod: Versionen für dieses Profil suchen
    setDownloadingMod(mod.title);
    setNotice(`Suche Versionen für "${mod.title}" (${instance.mcVersion}, ${instance.loader}) …`);
    try {
      const files = await invoke<
        Array<{
          fileName: string;
          url: string;
          sha1: string;
          primary: boolean;
          sizeBytes: number;
          versionType?: string;
        }>
      >("get_mod_versions", {
        projectId: mod.id,
        mcVersion: instance.mcVersion,
        loader: instance.loader,
      });

      if (!files || files.length === 0) {
        setNotice(
          `Keine Version für "${mod.title}" (MC ${instance.mcVersion}, ${instance.loader}) gefunden.`
        );
        setTimeout(() => setNotice(null), 5000);
        setDownloadingMod(null);
        return;
      }

      setVersionDialog({ mod, instance, files });
      setDownloadingMod(null);
      setNotice(null);
    } catch (e) {
      setNotice(`Fehler: ${String(e)}`);
      setTimeout(() => setNotice(null), 5000);
      setDownloadingMod(null);
    }
  };

  /** Lädt eine ausgewählte Version herunter und fügt sie zum Profil hinzu. */
  const downloadSelectedVersion = async (
    mod: Mod,
    instance: Instance,
    file: { fileName: string; url: string; sha1: string }
  ) => {
    setVersionDialog(null);
    setDownloadingMod(mod.title);
    setNotice(`Lade "${file.fileName}" herunter …`);
    try {
      await invoke<string>("download_mod_version", {
        url: file.url,
        fileName: file.fileName,
        sha1: file.sha1,
      });
      const target = instances.find((i) => i.id === instance.id);
      if (!target) return;
      update(instance.id, {
        mods: [
          ...target.mods,
          {
            id: uid(),
            title: mod.title,
            source: mod.source,
            fileName: file.fileName,
            enabled: true,
            projectType: mod.projectType,
          },
        ],
      });
      setNotice(`✓ "${mod.title}" zu "${instance.name}" hinzugefügt.`);
      setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setNotice(`Download fehlgeschlagen: ${String(e)}`);
      setTimeout(() => setNotice(null), 5000);
    } finally {
      setDownloadingMod(null);
    }
  };

  const displayMods = source === "local" ? localMods : mods;
  const isAdded = (mod: Mod) =>
    activeInstance?.mods.some((m) => m.title === mod.title) ?? false;

  return (
    <div className="onyx-content">
      <PageHeader
        title="Mods"
        subtitle="Durchsuche Modrinth und CurseForge, oder füge eigene .jar-Dateien hinzu."
        actions={
          <button
            className="onyx-btn onyx-btn-primary"
            onClick={() => fileInput.current?.click()}
          >
            + Eigene Mods hinzufügen
          </button>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept=".jar"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleLocalFiles(e.target.files)}
      />

      {notice && <div className="onyx-toast onyx-toast-info" style={{ marginBottom: 14 }}>{notice}</div>}
      {error && <div className="onyx-toast onyx-toast-warn" style={{ marginBottom: 14 }}>{error}</div>}
      {source === "curseforge" && (
        <div className="onyx-toast onyx-toast-warn" style={{ marginBottom: 14 }}>
          <strong>CurseForge:</strong> Um CurseForge zu nutzen, brauchst du einen eigenen API-Key
          (kostenlos auf console.curseforge.com). Trage ihn in den Einstellungen ein.
          <strong> Modrinth hat fast alle Mods und braucht keinen Key!</strong>
        </div>
      )}
      {activeInstance && (
        <div className="onyx-toast" style={{ marginBottom: 14 }}>
          <span className="onyx-prefix"><strong>[Onyx]</strong></span>{" "}
          Aktives Profil: <strong>{activeInstance.name}</strong> ·{" "}
          {activeInstance.mcVersion} · {activeInstance.loader}
        </div>
      )}

      <div className="onyx-toolbar">
        <input
          className="onyx-input"
          placeholder={source === "local" ? "Lokale Mods (keine Suche)" : "Mods, Shader, Resourcepacks suchen …"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={source === "local"}
        />
        <select
          className="onyx-select"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {source !== "local" && (
          <>
            <select
              className="onyx-select"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="onyx-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Drag&Drop-Bereich nur für lokale Mods */}
      {source === "local" && (
        <div
          className={"onyx-dropzone" + (dragOver ? " over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleLocalFiles(e.dataTransfer.files);
          }}
        >
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5">
            <path d="M19 13v6H5v-6H3v8h18v-8zM11 4h2v8.6l3.3-3.3 1.4 1.4L12 16.6 6.3 10.7l1.4-1.4L11 12.6z" />
          </svg>
          <p>.jar-Dateien hierher ziehen oder klicken zum Auswählen</p>
        </div>
      )}

      {loading ? (
        <div className="onyx-loading"><div className="onyx-spinner" /></div>
      ) : displayMods.length === 0 ? (
        <EmptyState
          title={source === "local" ? "Noch keine eigenen Mods" : "Suche nach Mods"}
          hint={source === "local" ? "Ziehe .jar-Dateien hierher." : "Gib oben einen Suchbegriff ein."}
        />
      ) : (
        <div className="onyx-grid">
          {displayMods.map((mod) =>
            mod.source === "local" ? (
              <LocalModCard key={mod.id} mod={mod} onAdd={handleAdd} onRemove={removeLocalMod} />
            ) : (
              <ModCard
                key={mod.id}
                mod={mod}
                onAdd={handleAdd}
                added={isAdded(mod)}
              />
            )
          )}
        </div>
      )}

      <ModDropzoneStyles />

      {/* Profil-Auswahl-Dialog (welches Profil?) */}
      {profilePicker && (
        <div className="onyx-version-overlay" onClick={() => setProfilePicker(null)}>
          <div className="onyx-version-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>"{profilePicker.title}" zu Profil hinzufügen</h3>
            <p className="onyx-version-hint">Wähle das Ziel-Profil:</p>
            <div className="onyx-version-list">
              {instances.length === 0 ? (
                <p className="onyx-version-hint">Keine Profile vorhanden. Erstelle zuerst eines.</p>
              ) : (
                instances.map((inst) => (
                  <button
                    key={inst.id}
                    className="onyx-version-item"
                    onClick={() => handleProfileSelected(profilePicker, inst)}
                  >
                    <div className="onyx-version-item-info">
                      <strong>{inst.name}</strong>
                      <span>
                        {inst.mcVersion} · {inst.loader} · {inst.mods.length} Mods
                      </span>
                    </div>
                    <span className="onyx-version-dl">Hinzufügen</span>
                  </button>
                ))
              )}
            </div>
            <button className="onyx-btn" onClick={() => setProfilePicker(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* Versions-Auswahl-Dialog */}
      {versionDialog && (
        <div className="onyx-version-overlay" onClick={() => setVersionDialog(null)}>
          <div className="onyx-version-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{versionDialog.mod.title} – Version wählen</h3>
            <p className="onyx-version-hint">
              Für {versionDialog.instance.name} ({versionDialog.instance.mcVersion}, {versionDialog.instance.loader})
            </p>
            <div className="onyx-version-list">
              {versionDialog.files.map((f, idx) => (
                <button
                  key={idx}
                  className={"onyx-version-item" + (f.primary ? " primary" : "")}
                  onClick={() => downloadSelectedVersion(versionDialog.mod, versionDialog.instance, f)}
                >
                  <div className="onyx-version-item-info">
                    <strong>{f.fileName}</strong>
                    <span>
                      {(f.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      {f.versionType ? ` · ${f.versionType}` : ""}
                      {f.primary ? " · ⭐ Empfohlen" : ""}
                    </span>
                  </div>
                  <span className="onyx-version-dl">Download</span>
                </button>
              ))}
            </div>
            <button className="onyx-btn" onClick={() => setVersionDialog(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Lokale Styles für die Dropzone (inline, weil nur hier genutzt). */
function ModDropzoneStyles() {
  return <style>{`
    .onyx-dropzone {
      border: 2px dashed var(--onyx-border-light);
      border-radius: var(--onyx-radius);
      padding: 36px;
      text-align: center;
      color: var(--onyx-text-dim);
      margin-bottom: 18px;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .onyx-dropzone.over {
      border-color: var(--onyx-cyan);
      background: rgba(34, 211, 238, 0.06);
    }
    .onyx-dropzone p { font-size: 13px; }
  `}</style>;
}

/* Karten-Variante für lokal hinzugefügte Mods (mit Entfernen-Button). */
function LocalModCard({ mod, onAdd, onRemove }: { mod: Mod; onAdd: (mod: Mod) => void; onRemove: (id: string) => void }) {
  return (
    <div className="onyx-card onyx-modcard">
      <div className="onyx-modcard-top">
        <div className="onyx-modcard-icon">
          <span className="onyx-modcard-icon-fallback">
            {mod.title.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="onyx-modcard-meta">
          <h3 className="onyx-modcard-title" title={mod.title}>{mod.title}</h3>
          <span className="onyx-modcard-author">lokale Datei</span>
        </div>
        <span className="onyx-badge onyx-badge-cyan onyx-modcard-source">Lokal</span>
      </div>
      <p className="onyx-modcard-desc">{mod.localFileName}</p>
      <div className="onyx-modcard-bottom">
        <span className="onyx-modcard-dl">lokale Mod</span>
        <button
          className="onyx-btn onyx-btn-primary"
          onClick={() => onAdd(mod)}
        >
          + Hinzufügen
        </button>
        <button
          className="onyx-btn onyx-btn-danger"
          onClick={() => onRemove(mod.id)}
        >
          Entfernen
        </button>
      </div>
    </div>
  );
}

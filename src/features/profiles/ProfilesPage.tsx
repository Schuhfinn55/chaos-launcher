/* ============================================================
 * Onyx Launcher - Profil-/Modpack-Verwaltung
 *
 * Hier werden Profile erstellt, konfiguriert (MC-Version,
 * Modloader, RAM) und gelöscht. Mods werden pro Profil
 * verwaltet (an-/abstellen).
 * ============================================================ */

import { useEffect, useState } from "react";
import type { Instance, ModLoader } from "@/types";
import { useInstanceStore, useSettingsStore } from "@/stores/useStore";
import { invoke } from "@/lib/bridge";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { uid, formatDate, formatPlaytime } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { installAutoMods } from "@/lib/autoMods";
import { INSTANCE_PRESETS, installPresetMods, type InstancePreset } from "@/lib/instancePresets";
import "./InstancesPage.css";

const LOADERS: { value: ModLoader; label: string }[] = [
  { value: "vanilla", label: "Vanilla" },
  { value: "fabric", label: "Fabric" },
  { value: "forge", label: "Forge" },
  { value: "neoforge", label: "NeoForge" },
  { value: "quilt", label: "Quilt" },
];

const ICON_COLORS = ["#22d3ee", "#0891b2", "#a78bfa", "#4ade80", "#fcd34d", "#f87171"];

export default function InstancesPage() {
  const instances = useInstanceStore((s) => s.instances);
  const add = useInstanceStore((s) => s.add);
  const update = useInstanceStore((s) => s.update);
  const remove = useInstanceStore((s) => s.remove);
  const setActive = useInstanceStore((s) => s.setActive);
  const activeId = useInstanceStore((s) => s.activeId);
  const settings = useSettingsStore((s) => s.settings);
  const navigate = useNavigate();

  const [versions, setVersions] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState<string>("");
  // Preset-Versions-Auswahl Dialog
  const [presetDialog, setPresetDialog] = useState<InstancePreset | null>(null);
  const [presetVersion, setPresetVersion] = useState("");

  // Formular-Zustand
  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState("");
  const [loader, setLoader] = useState<ModLoader>("fabric");
  const [color, setColor] = useState(ICON_COLORS[0]);

  useEffect(() => {
    invoke<string[]>("get_versions")
      .then(setVersions)
      .catch(() => setVersions([]));
  }, []);

  /** Öffnet den Versions-Dialog für ein Preset. */
  const openPresetDialog = (preset: InstancePreset) => {
    setPresetDialog(preset);
    setPresetVersion(versions[0] ?? "");
  };

  /** Erstellt ein Profil aus einem Preset mit gewählter Version. */
  const createPresetInstance = async (preset: InstancePreset, version: string) => {
    if (!version) {
      setCreateStatus("Bitte eine Minecraft-Version auswählen.");
      setTimeout(() => setCreateStatus(""), 4000);
      return;
    }
    setCreating(true);
    setPresetDialog(null);
    setShowPresets(false);
    setCreateStatus(`Erstelle "${preset.name}"-Profil für MC ${version} …`);

    const ramMb = settings?.defaultRamMb ?? 4096;
    const instance: Instance = {
      id: uid(),
      name: `${preset.name} (${version})`,
      mcVersion: version,
      loader: preset.loader,
      iconColor: preset.color,
      mods: [],
      createdAt: Date.now(),
      ramMb,
      javaVersion: version.startsWith("1.20") || version.startsWith("1.21") || version.startsWith("2") ? 21 : 17,
    };
    await add(instance);
    setActive(instance.id);

    // Preset-Mods installieren
    if (preset.mods.length > 0) {
      setCreateStatus(`Lade ${preset.mods.length} Mods für "${preset.name}" (MC ${version}) …`);
      try {
        const result = await installPresetMods(instance.id, version, preset.loader, preset.mods);
        if (result.failed.length > 0) {
          setCreateStatus(
            `✓ ${result.added}/${preset.mods.length} Mods installiert. Fehlgeschlagen: ${result.failed.join(", ")}`
          );
        } else {
          setCreateStatus(`✓ "${preset.name}" bereit! ${result.added} Mods installiert.`);
        }
      } catch (e) {
        setCreateStatus(`Preset-Mods fehlgeschlagen: ${String(e)}`);
      }
    } else {
      setCreateStatus(`✓ "${preset.name}" erstellt (Vanilla, MC ${version}).`);
    }
    setCreating(false);
    setTimeout(() => setCreateStatus(""), 8000);
  };

  const createInstance = async () => {
    if (!name.trim() || !mcVersion) return;
    setCreating(true);
    const ramMb = settings?.defaultRamMb ?? 4096;
    const instance: Instance = {
      id: uid(),
      name: name.trim(),
      mcVersion,
      loader,
      iconColor: color,
      mods: [],
      createdAt: Date.now(),
      ramMb,
      javaVersion: mcVersion.startsWith("1.20") || mcVersion.startsWith("1.21") || mcVersion.startsWith("2") ? 21 : 17,
    };
    await add(instance);
    setActive(instance.id);
    setShowCreate(false);
    setName("");
    setMcVersion("");
    setLoader("fabric");
    setColor(ICON_COLORS[0]);

    // Standard-Mods automatisch laden (nur Fabric/Quilt)
    if (loader !== "vanilla" && loader !== "forge" && loader !== "neoforge") {
      setCreateStatus(`Lade Standard-Mods für ${instance.name} …`);
      try {
        const result = await installAutoMods(instance.id, mcVersion, loader);
        if (result.failed.length > 0) {
          setCreateStatus(
            `✓ ${result.added} Mods installiert. Fehlgeschlagen: ${result.failed.join(", ")}`
          );
        } else {
          setCreateStatus(`✓ ${result.added} Standard-Mods automatisch installiert!`);
        }
      } catch (e) {
        setCreateStatus(`Auto-Mods fehlgeschlagen: ${String(e)}`);
      }
    } else {
      setCreateStatus("Profil erstellt (Vanilla – keine Mods).");
    }
    setCreating(false);
    setTimeout(() => setCreateStatus(""), 8000);
  };

  const toggleMod = (inst: Instance, modId: string) => {
    update(inst.id, {
      mods: inst.mods.map((m) =>
        m.id === modId ? { ...m, enabled: !m.enabled } : m
      ),
    });
  };

  const removeMod = (inst: Instance, modId: string) => {
    update(inst.id, { mods: inst.mods.filter((m) => m.id !== modId) });
  };

  return (
    <div className="onyx-content">
      <PageHeader
        title="Profile"
        subtitle="Verwalte deine Minecraft-Profile mit eigenen Mods, Versionen und Einstellungen."
        actions={
          <>
            <button className="onyx-btn" onClick={async () => {
              try {
                const { open, save } = await import("@tauri-apps/plugin-dialog");
                const file = await save({
                  filters: [{ name: "Onyx-Profil", extensions: ["json"] }],
                  defaultPath: "onyx-profil.json",
                });
                if (!file) return;
                const inst = instances.find((i) => i.id === activeId) ?? instances[0];
                if (!inst) return;
                const json = await invoke<string>("export_profile", { instanceId: inst.id });
                // In Datei schreiben
                const { writeTextFile } = await import("@tauri-apps/plugin-fs").catch(() => ({ writeTextFile: null }));
                if (writeTextFile) {
                  await writeTextFile(file, json);
                }
                window.alert("Profil exportiert: " + file);
              } catch (e) {
                window.alert("Export fehlgeschlagen: " + String(e));
              }
            }}>
              ⬆ Export
            </button>
            <button className="onyx-btn" onClick={async () => {
              try {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const file = await open({
                  multiple: false,
                  filters: [{ name: "Onyx-Profil", extensions: ["json"] }],
                });
                if (typeof file !== "string") return;
                const { readTextFile } = await import("@tauri-apps/plugin-fs").catch(() => ({ readTextFile: null }));
                let json = "";
                if (readTextFile) {
                  json = await readTextFile(file);
                }
                const result = await invoke("import_profile", { profileJson: json });
                window.alert("Profil importiert: " + (result as { name: string }).name);
                await useInstanceStore.getState().load();
              } catch (e) {
                window.alert("Import fehlgeschlagen: " + String(e));
              }
            }}>
              ⬇ Import
            </button>
            <button className="onyx-btn onyx-btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Abbrechen" : "+ Neues Profil"}
            </button>
            <button className="onyx-btn" onClick={() => setShowPresets((v) => !v)}>
              {showPresets ? "Abbrechen" : "⚡ Presets"}
            </button>
          </>
        }
      />

      {createStatus && (
        <div className="onyx-toast onyx-toast-info" style={{ marginBottom: 12 }}>
          {createStatus}
        </div>
      )}

      {/* Preset-Auswahl */}
      {showPresets && (
        <div className="onyx-card onyx-preset-panel">
          <h3>⚡ Vorgefertigte Profile</h3>
          <p className="onyx-preset-hint">
            Wähle ein fertiges Profil. Es wird mit der neuesten MC-Version erstellt und alle Mods werden automatisch installiert.
          </p>
          <div className="onyx-preset-grid">
            {INSTANCE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className="onyx-card onyx-preset-card"
                onClick={() => openPresetDialog(preset)}
                disabled={creating}
                style={{ borderColor: creating ? undefined : preset.color + "44" }}
              >
                <div className="onyx-preset-icon" style={{ background: preset.color + "22" }}>
                  {preset.icon}
                </div>
                <div className="onyx-preset-info">
                  <strong>{preset.name}</strong>
                  <span>{preset.description}</span>
                  <span className="onyx-preset-meta">
                    {preset.loader === "vanilla" ? "Vanilla" : "Fabric"} · {preset.mods.length} Mods
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="onyx-card onyx-inst-form">
          <h3>Neues Profil erstellen</h3>
          <div className="onyx-inst-form-grid">
            <label className="onyx-field">
              <span>Name</span>
              <input
                className="onyx-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Survival, SkyBlock, PvP …"
              />
            </label>
            <label className="onyx-field">
              <span>Minecraft-Version</span>
              <select className="onyx-select" value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
                <option value="">— wählen —</option>
                {versions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="onyx-field">
              <span>Modloader</span>
              <select
                className="onyx-select"
                value={loader}
                onChange={(e) => setLoader(e.target.value as ModLoader)}
              >
                {LOADERS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </label>
            <div className="onyx-field">
              <span>Farbe</span>
              <div className="onyx-color-row">
                {ICON_COLORS.map((c) => (
                  <button
                    key={c}
                    className={"onyx-color-dot" + (c === color ? " selected" : "")}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <button className="onyx-btn onyx-btn-primary" onClick={createInstance} disabled={!name.trim() || !mcVersion || creating}>
            {creating ? "Erstellt …" : "Profil erstellen"}
          </button>
        </div>
      )}

      {instances.length === 0 && !showCreate ? (
        <EmptyState
          title="Keine Profile"
          hint="Klicke auf '+ Neues Profil', um dein erstes Profil anzulegen."
        />
      ) : (
        <div className="onyx-inst-list">
          {instances.map((inst) => (
            <div key={inst.id} className={"onyx-card onyx-inst" + (inst.id === activeId ? " active" : "")}>
              <div className="onyx-inst-head">
                <div className="onyx-inst-icon" style={{ background: inst.iconColor }} />
                <div className="onyx-inst-headinfo">
                  <h3>{inst.name}</h3>
                  <span>
                    {inst.mcVersion} · <span style={{ textTransform: "capitalize" }}>{inst.loader}</span>
                    {inst.loaderVersion ? " " + inst.loaderVersion : ""} · {inst.ramMb} MB RAM · erstellt {formatDate(inst.createdAt)}
                    {inst.playTimeSeconds ? " · ⏱ " + formatPlaytime(inst.playTimeSeconds) : ""}
                  </span>
                </div>
                <div className="onyx-inst-actions">
                  <button className="onyx-btn" onClick={() => { setActive(inst.id); navigate("/worlds"); }} title="Welten verwalten">
                    🌍 Welten
                  </button>
                  <button className="onyx-btn" onClick={() => setActive(inst.id)} disabled={inst.id === activeId}>
                    {inst.id === activeId ? "Aktiv ✓" : "Aktivieren"}
                  </button>
                  <button className="onyx-btn onyx-btn-danger" onClick={() => remove(inst.id)}>
                    Löschen
                  </button>
                </div>
              </div>

              <div className="onyx-inst-mods">
                <div className="onyx-inst-mods-head">
                  <strong>Mods ({inst.mods.length})</strong>
                  <span className="onyx-inst-hint">Füge Mods im Reiter 'Mods' hinzu, nachdem du dieses Profil aktiviert hast.</span>
                </div>
                {inst.mods.length === 0 ? (
                  <p className="onyx-inst-nomods">Keine Mods in diesem Profil.</p>
                ) : (
                  <div className="onyx-inst-modlist">
                    {inst.mods.map((m) => (
                      <div key={m.id} className={"onyx-inst-mod" + (m.enabled ? "" : " disabled")}>
                        <span className="onyx-inst-modname">{m.title}</span>
                        <span className="onyx-badge">{m.source}</span>
                        <button className="onyx-btn" onClick={() => toggleMod(inst, m.id)}>
                          {m.enabled ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button className="onyx-btn onyx-btn-danger" onClick={() => removeMod(inst, m.id)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preset-Versions-Auswahl Dialog */}
      {presetDialog && (
        <div className="onyx-modal-overlay" onClick={() => setPresetDialog(null)}>
          <div className="onyx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="onyx-preset-modal-header">
              <span className="onyx-preset-modal-icon" style={{ background: presetDialog.color + "22" }}>
                {presetDialog.icon}
              </span>
              <div>
                <h3>{presetDialog.name}</h3>
                <p className="onyx-modal-hint">{presetDialog.description}</p>
              </div>
            </div>

            <label className="onyx-field" style={{ marginBottom: 16 }}>
              <span>Minecraft-Version wählen</span>
              <select
                className="onyx-select"
                value={presetVersion}
                onChange={(e) => setPresetVersion(e.target.value)}
              >
                <option value="">— Version wählen —</option>
                {versions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>

            <div className="onyx-preset-modal-mods">
              <strong>Mods ({presetDialog.mods.length}):</strong>
              <div className="onyx-preset-modal-modlist">
                {presetDialog.mods.length === 0 ? (
                  <span className="onyx-preset-modal-nomods">Keine Mods (Vanilla)</span>
                ) : (
                  presetDialog.mods.map((m) => (
                    <span key={m.slug} className="onyx-badge onyx-badge-cyan">{m.title}</span>
                  ))
                )}
              </div>
            </div>

            <div className="onyx-modal-actions">
              <button className="onyx-btn" onClick={() => setPresetDialog(null)}>Abbrechen</button>
              <button
                className="onyx-btn onyx-btn-primary"
                onClick={() => createPresetInstance(presetDialog, presetVersion)}
                disabled={!presetVersion || creating}
              >
                {creating ? "Erstellt …" : `Erstellen (MC ${presetVersion || "—"})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

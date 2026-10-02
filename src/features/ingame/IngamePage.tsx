/* ============================================================
 * Onyx Launcher - Ingame-Mod-Menu (NoRisk-Stil)
 *
 * Zentriertes, abgerundetes Panel mit Kategorie-Sidebar,
 * Mod-Raster mit Toggle-Switches und Einstellungs-Popouts.
 *
 * WICHTIG: Alle Module sind legitim und server-erlaubt.
 * KEINE Cheats (KillAura, Reach, Anti-Knockback etc.).
 * ============================================================ */

import { useMemo, useState } from "react";
import {
  ONYX_MODULES,
  MODULE_CATEGORIES,
  searchModules,
  type OnyxModule,
  type ModuleCategory,
} from "@/lib/modules";
import packageJson from "../../../package.json";

/** Die aktuelle Launcher-Version. */
const APP_VERSION = packageJson.version;
import { useModuleStore } from "@/stores/useStore";
import { useInstanceStore } from "@/stores/useStore";
import { invoke } from "@/lib/bridge";
import { uid } from "@/lib/utils";
import "./IngamePage.css";

type Tab = "mods" | "profile";

export default function IngamePage() {
  const [tab, setTab] = useState<Tab>("mods");
  const [cat, setCat] = useState<ModuleCategory>("display");
  const [query, setQuery] = useState("");
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: "info" | "error" | "ok" } | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const states = useModuleStore((s) => s.states);
  const setEnabled = useModuleStore((s) => s.setEnabled);
  const setInstalled = useModuleStore((s) => s.setInstalled);
  const setSetting = useModuleStore((s) => s.setSetting);
  const profiles = useModuleStore((s) => s.profiles);
  const activeProfileId = useModuleStore((s) => s.activeProfileId);
  const saveProfile = useModuleStore((s) => s.saveProfile);
  const loadProfile = useModuleStore((s) => s.loadProfile);
  const deleteProfile = useModuleStore((s) => s.deleteProfile);
  const resetAll = useModuleStore((s) => s.resetAll);

  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const activeInstance = instances.find((i) => i.id === activeId);
  const updateInstance = useInstanceStore((s) => s.update);

  const isSearching = query.trim().length > 0;
  const visibleModules = useMemo(
    () => (isSearching ? searchModules(query) : ONYX_MODULES.filter((m) => m.category === cat)),
    [isSearching, query, cat]
  );

  const activeCat = MODULE_CATEGORIES.find((c) => c.id === cat)!;
  const enabledCount = ONYX_MODULES.filter((m) => states[m.id]?.enabled).length;
  const installedCount = ONYX_MODULES.filter((m) => states[m.id]?.installed).length;

  const showNotice = (text: string, kind: "info" | "error" | "ok" = "info") => {
    setNotice({ text, kind });
    setTimeout(() => setNotice(null), kind === "error" ? 6000 : 3500);
  };

  /* ----- Modul als echte Mod installieren (wenn Slug vorhanden) ----- */
  const installMod = async (mod: OnyxModule) => {
    if (!mod.slug) {
      showNotice(`"${mod.title}" ist ein reines Konfigurations-Modul (kein Download nötig).`, "info");
      return;
    }
    if (!activeInstance) {
      showNotice("Wähle zuerst ein Profil unter 'Profile' aus.", "error");
      return;
    }
    if (activeInstance.loader === "vanilla") {
      showNotice(
        "Dieses Profil nutzt Vanilla – ohne Modloader können keine Mods geladen werden. Erstelle ein Fabric-Profil.",
        "error"
      );
      return;
    }
    setInstalling(mod.id);
    showNotice(`Suche "${mod.title}" auf Modrinth …`);
    const projectType = mod.projectType ?? "mod";
    try {
      const results = await invoke<
        Array<{ id: string; slug?: string; title: string }>
      >("search_mods", {
        query: mod.slug,
        source: "modrinth",
        projectType,
      });
      const project = results.find((r) => r.slug === mod.slug) ?? results[0];
      if (!project) {
        showNotice(`"${mod.title}" nicht auf Modrinth gefunden.`, "error");
        return;
      }
      const files = await invoke<
        Array<{ fileName: string; url: string; sha1: string; primary: boolean }>
      >("get_mod_versions", {
        projectId: project.id,
        mcVersion: activeInstance.mcVersion,
        loader: activeInstance.loader,
      });
      if (!files || files.length === 0) {
        showNotice(
          `Keine Version von "${mod.title}" für MC ${activeInstance.mcVersion} (${activeInstance.loader}) gefunden.`,
          "error"
        );
        return;
      }
      const file = files.find((f) => f.primary) ?? files[0];
      showNotice(`Lade "${file.fileName}" herunter …`);
      await invoke<string>("download_mod_version", {
        url: file.url,
        fileName: file.fileName,
        sha1: file.sha1,
      });
      // Zum Profil hinzufügen, falls noch nicht vorhanden
      if (!activeInstance.mods.some((m) => m.title === mod.title)) {
        updateInstance(activeInstance.id, {
          mods: [
            ...activeInstance.mods,
            {
              id: uid(),
              title: mod.title,
              source: "modrinth" as const,
              fileName: file.fileName,
              enabled: true,
              projectType,
            },
          ],
        });
      }
      setInstalled(mod.id, true);
      setEnabled(mod.id, true);
      showNotice(`✓ "${mod.title}" installiert und aktiviert.`, "ok");
    } catch (e) {
      showNotice(`Fehler bei "${mod.title}": ${String(e)}`, "error");
    } finally {
      setInstalling(null);
    }
  };

  /* ----- Toggle-Handler: echte Mods installieren, reine Config nur toggeln ----- */
  const handleToggle = (mod: OnyxModule, next: boolean) => {
    setEnabled(mod.id, next);
    if (next && mod.slug && !states[mod.id]?.installed) {
      // Automatisch installieren, wenn noch nicht vorhanden
      installMod(mod);
    }
  };

  /* ----- Profile-Dialog ----- */
  const [newProfileName, setNewProfileName] = useState("");

  return (
    <div className="onyx-content onyx-ingame-wrap">
      {/* Zentriertes NoRisk-Stil Panel */}
      <div className="onyx-norisk">
        {/* ---------- Header ---------- */}
        <div className="onyx-norisk-header">
          <div className="onyx-norisk-brand">
            <span className="onyx-norisk-bolt">⚡</span>
            <span className="onyx-logo-text onyx-norisk-logo">ONYX</span>
            <span className="onyx-norisk-version">v{APP_VERSION}</span>
          </div>

          <div className="onyx-norisk-tabs">
            <button
              className={"onyx-norisk-tab" + (tab === "mods" ? " active" : "")}
              onClick={() => setTab("mods")}
            >
              MODULE
            </button>
            <button
              className={"onyx-norisk-tab" + (tab === "profile" ? " active" : "")}
              onClick={() => setTab("profile")}
            >
              PROFILE
            </button>
          </div>

          <div className="onyx-norisk-search">
            <span className="onyx-norisk-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Module durchsuchen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="onyx-norisk-search-clear" onClick={() => setQuery("")}>✕</button>
            )}
          </div>
        </div>

        {/* ---------- Body: Sidebar + Hauptpanel ---------- */}
        <div className="onyx-norisk-body">
          {/* Sidebar (Kategorien) */}
          <aside className="onyx-norisk-sidebar">
            {MODULE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={
                  "onyx-norisk-cat" +
                  (c.id === cat && !isSearching ? " active" : "")
                }
                onClick={() => {
                  setCat(c.id);
                  setQuery("");
                }}
                title={c.label}
              >
                <span className="onyx-norisk-cat-icon">{c.icon}</span>
                <span className="onyx-norisk-cat-label">{c.label}</span>
                <span className="onyx-norisk-cat-count">
                  {ONYX_MODULES.filter(
                    (m) => m.category === c.id && states[m.id]?.enabled
                  ).length}
                </span>
              </button>
            ))}
          </aside>

          {/* Hauptpanel */}
          <main className="onyx-norisk-main">
            {notice && (
              <div className={"onyx-norisk-toast onyx-norisk-toast-" + notice.kind}>
                {notice.text}
              </div>
            )}

            {tab === "mods" ? (
              <>
                <div className="onyx-norisk-cathint">
                  <span className="onyx-norisk-cathint-icon">{activeCat.icon}</span>
                  <div>
                    <h3>{isSearching ? `Suche: "${query}"` : activeCat.label}</h3>
                    <p>{isSearching ? "Gefundene Module über alle Kategorien." : activeCat.hint}</p>
                  </div>
                </div>

                <div className="onyx-norisk-grid">
                  {visibleModules.map((mod) => {
                    const st = states[mod.id] ?? { enabled: false, settings: {} };
                    const isOpen = openSettings === mod.id;
                    const isInstall = installing === mod.id;
                    return (
                      <div
                        key={mod.id}
                        className={
                          "onyx-norisk-card" +
                          (st.enabled ? " on" : "") +
                          (isOpen ? " expanded" : "")
                        }
                      >
                        <div className="onyx-norisk-card-top">
                          <span className="onyx-norisk-card-icon">{mod.icon}</span>
                          <div className="onyx-norisk-card-meta">
                            <div className="onyx-norisk-card-title">{mod.title}</div>
                            <div className="onyx-norisk-card-desc">{mod.description}</div>
                          </div>
                          <label className="onyx-norisk-switch" title={st.enabled ? "Aktiv" : "Inaktiv"}>
                            <input
                              type="checkbox"
                              checked={st.enabled}
                              onChange={(e) => handleToggle(mod, e.target.checked)}
                              disabled={isInstall}
                            />
                            <span className="onyx-norisk-slider"></span>
                          </label>
                        </div>

                        {mod.hint && (
                          <p className="onyx-norisk-card-hint">
                            <span className="onyx-prefix"><strong>[Onyx]</strong></span> {mod.hint}
                          </p>
                        )}

                        {/* Status-Badges */}
                        <div className="onyx-norisk-card-badges">
                          {mod.slug ? (
                            st.installed ? (
                              <span className="onyx-badge onyx-badge-success">✓ Installiert</span>
                            ) : isInstall ? (
                              <span className="onyx-badge onyx-badge-warning">⏳ Installiere…</span>
                            ) : (
                              <span className="onyx-badge">Modrinth</span>
                            )
                          ) : (
                            <span className="onyx-badge onyx-badge-cyan">Konfiguration</span>
                          )}
                          {st.enabled && <span className="onyx-badge onyx-badge-cyan">Aktiv</span>}
                        </div>

                        {/* Einstellungs-Popout */}
                        {mod.settings && mod.settings.length > 0 && (
                          <>
                            <button
                              className={"onyx-norisk-gear" + (isOpen ? " open" : "")}
                              onClick={() => setOpenSettings(isOpen ? null : mod.id)}
                              disabled={!st.enabled}
                              title="Einstellungen"
                            >
                              ⚙ Einstellungen
                            </button>
                            {isOpen && st.enabled && (
                              <div className="onyx-norisk-settings">
                                {mod.settings.map((s) => {
                                  const val = st.settings[s.key] ?? s.default;
                                  return (
                                    <div key={s.key} className="onyx-norisk-setting">
                                      {s.type === "toggle" ? (
                                        <>
                                          <span className="onyx-norisk-setting-label">{s.label}</span>
                                          <label className="onyx-norisk-switch small">
                                            <input
                                              type="checkbox"
                                              checked={val as boolean}
                                              onChange={(e) => setSetting(mod.id, s.key, e.target.checked)}
                                            />
                                            <span className="onyx-norisk-slider"></span>
                                          </label>
                                        </>
                                      ) : (
                                        <>
                                          <span className="onyx-norisk-setting-label">
                                            {s.label}: <strong>{val}{s.suffix ?? ""}</strong>
                                          </span>
                                          <input
                                            type="range"
                                            min={s.min}
                                            max={s.max}
                                            step={s.step}
                                            value={val as number}
                                            onChange={(e) => setSetting(mod.id, s.key, Number(e.target.value))}
                                            className="onyx-norisk-range"
                                          />
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  {visibleModules.length === 0 && (
                    <div className="onyx-norisk-empty">
                      Keine Module gefunden.
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ---------- Profil-Tab ---------- */
              <div className="onyx-norisk-profile">
                <div className="onyx-norisk-profile-new">
                  <input
                    className="onyx-input"
                    type="text"
                    placeholder="Profilname (z.B. PvP-Setup)"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                  />
                  <button
                    className="onyx-btn onyx-btn-primary"
                    onClick={() => {
                      if (newProfileName.trim()) {
                        saveProfile(newProfileName.trim());
                        setNewProfileName("");
                        showNotice("✓ Profil gespeichert.", "ok");
                      }
                    }}
                  >
                    Als Profil speichern
                  </button>
                </div>

                <div className="onyx-norisk-profile-stats">
                  <div className="onyx-norisk-stat">
                    <span className="onyx-norisk-stat-num">{enabledCount}</span>
                    <span className="onyx-norisk-stat-label">Aktive Module</span>
                  </div>
                  <div className="onyx-norisk-stat">
                    <span className="onyx-norisk-stat-num">{installedCount}</span>
                    <span className="onyx-norisk-stat-label">Installierte Mods</span>
                  </div>
                  <div className="onyx-norisk-stat">
                    <span className="onyx-norisk-stat-num">{profiles.length}</span>
                    <span className="onyx-norisk-stat-label">Profile</span>
                  </div>
                </div>

                <div className="onyx-norisk-profile-list">
                  {profiles.length === 0 && (
                    <div className="onyx-norisk-empty">
                      Noch keine Profile gespeichert. Konfiguriere Module und speichere sie als Profil.
                    </div>
                  )}
                  {profiles.map((p) => (
                    <div
                      key={p.id}
                      className={
                        "onyx-norisk-profile-card" +
                        (activeProfileId === p.id ? " active" : "")
                      }
                    >
                      <div className="onyx-norisk-profile-info">
                        <h4>{p.name}</h4>
                        <span>
                          {Object.values(p.states).filter((s) => s.enabled).length} Module aktiv
                        </span>
                      </div>
                      <div className="onyx-norisk-profile-actions">
                        <button
                          className="onyx-btn onyx-btn-primary"
                          onClick={() => {
                            loadProfile(p.id);
                            showNotice(`✓ Profil "${p.name}" geladen.`, "ok");
                          }}
                        >
                          Laden
                        </button>
                        <button
                          className="onyx-btn onyx-btn-danger"
                          onClick={() => deleteProfile(p.id)}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="onyx-btn"
                  onClick={() => {
                    if (confirm("Wirklich alle Module zurücksetzen?")) {
                      resetAll();
                      showNotice("Alle Module zurückgesetzt.", "ok");
                    }
                  }}
                >
                  ↺ Alle Module zurücksetzen
                </button>
              </div>
            )}
          </main>
        </div>

        {/* ---------- Footer ---------- */}
        <div className="onyx-norisk-footer">
          <span className="onyx-norisk-footer-instance">
            {activeInstance ? (
              <>Profil: <strong>{activeInstance.name}</strong> · {activeInstance.mcVersion} · {activeInstance.loader}</>
            ) : (
              <span className="onyx-norisk-footer-warn">⚠ Kein Profil aktiv – Downloads deaktiviert</span>
            )}
          </span>
          <span className="onyx-norisk-footer-stats">
            <span className="onyx-badge onyx-badge-cyan">{enabledCount} aktiv</span>
            <span className="onyx-badge onyx-badge-success">{installedCount} installiert</span>
          </span>
        </div>
      </div>
    </div>
  );
}

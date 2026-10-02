/* ============================================================
 * Chaos Launcher - Welten-Verwaltung
 *
 * Zeigt alle Welten eines Profils an. Welten können gesichert
 * (Backup als ZIP), gelöscht oder geöffnet werden.
 * ============================================================ */

import { useState } from "react";
import { useInstanceStore } from "@/stores/useStore";
import { invoke } from "@/lib/bridge";
import { useNavigate } from "react-router-dom";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { formatDate, formatBytes } from "@/lib/utils";
import "./WorldsPage.css";

interface World {
  name: string;
  folder: string;
  lastPlayed: number;
  sizeBytes: number;
}

export default function WorldsPage() {
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const setActive = useInstanceStore((s) => s.setActive);
  const navigate = useNavigate();
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null;

  const loadWorlds = async () => {
    if (!active) return;
    setLoading(true);
    try {
      const result = await invoke<World[]>("list_worlds", { instanceId: active.id });
      setWorlds(result);
    } catch (e) {
      setMsg("Fehler beim Laden der Welten: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async (folder: string, name: string) => {
    setMsg("Erstelle Backup von '" + name + "' …");
    try {
      await invoke("backup_world", { worldFolder: folder });
      setMsg("✓ Backup von '" + name + "' erstellt!");
    } catch (e) {
      setMsg("Backup fehlgeschlagen: " + String(e));
    }
    setTimeout(() => setMsg(null), 3500);
  };

  const handleDelete = async (folder: string, name: string) => {
    if (!window.confirm("Welt '" + name + "' wirklich löschen? Dies kann nicht rückgängig gemacht werden!")) return;
    try {
      await invoke("delete_world", { worldFolder: folder });
      setWorlds((w) => w.filter((x) => x.folder !== folder));
      setMsg("✓ Welt '" + name + "' gelöscht.");
    } catch (e) {
      setMsg("Löschen fehlgeschlagen: " + String(e));
    }
    setTimeout(() => setMsg(null), 3500);
  };

  return (
    <div className="onyx-content">
      <PageHeader
        title="Welten"
        subtitle={"Verwalte die Welten des Profils: " + (active?.name ?? "—")}
        actions={
          <>
            <button className="onyx-btn" onClick={() => navigate("/instances")}>← Zurück</button>
            <button className="onyx-btn onyx-btn-primary" onClick={loadWorlds} disabled={!active || loading}>
              {loading ? "Lädt …" : "Welten laden"}
            </button>
          </>
        }
      />

      {msg && <div className="onyx-toast onyx-toast-info" style={{ marginBottom: 14 }}>{msg}</div>}

      {worlds.length === 0 && !loading ? (
        <EmptyState
          title="Keine Welten geladen"
          hint="Klicke auf 'Welten laden', um die Welten dieses Profils anzuzeigen. Du musst das Profil mindestens einmal gestartet haben, damit Welten existieren."
        />
      ) : (
        <div className="onyx-list">
          {worlds.map((w) => (
            <div key={w.folder} className="onyx-card onyx-world">
              <div className="onyx-world-icon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                  <path d="M2 12h20M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z" />
                </svg>
              </div>
              <div className="onyx-world-info">
                <strong>{w.name}</strong>
                <span>{formatDate(w.lastPlayed)} · {formatBytes(w.sizeBytes)}</span>
              </div>
              <button className="onyx-btn" onClick={() => handleBackup(w.folder, w.name)} title="Als ZIP sichern">
                💾 Backup
              </button>
              <button className="onyx-btn onyx-btn-danger" onClick={() => handleDelete(w.folder, w.name)} title="Löschen">
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

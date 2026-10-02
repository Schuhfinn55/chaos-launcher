/* ============================================================
 * Onyx Launcher - "Spielen"-Seite
 *
 * Zentrale Anlaufstelle: zeigt das aktive Profil groß an und
 * bietet den Start-Button. Beim Start wird der Download-
 * Fortschritt live angezeigt (Version, Libraries, Assets,
 * client.jar), damit man sieht, was passiert.
 * ============================================================ */

import { useEffect, useState } from "react";
import { useInstanceStore, useAccountStore } from "@/stores/useStore";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/PageHeader";
import CrashAnalyzer from "@/components/CrashAnalyzer";
import { invoke } from "@/lib/bridge";
import "./PlayPage.css";

/** Eine Fortschrittsmeldung vom Rust-Backend. */
interface Progress {
  phase: string;
  message: string;
  current: number;
  total: number;
}

/** Anzeige-Label pro Phase. */
const PHASE_LABELS: Record<string, string> = {
  init: "Vorbereitung",
  version: "Version",
  libraries: "Bibliotheken",
  assets: "Spieldateien",
  client: "Hauptdatei",
  launching: "Starte Minecraft",
};

/** Schätzt die Phase anhand der ID für den %-Balken. */
function phaseOrder(phase: string): number {
  return ["init", "version", "libraries", "assets", "client", "launching"].indexOf(phase);
}

export default function PlayPage() {
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const setActive = useInstanceStore((s) => s.setActive);
  const account = useAccountStore((s) => s.active);
  const navigate = useNavigate();

  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const [launchLog, setLaunchLog] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [phaseHistory, setPhaseHistory] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);

  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null;

  // Prüfe periodisch, ob Minecraft läuft
  useEffect(() => {
    const check = async () => {
      if (!active) return setRunning(false);
      try {
        const r = await invoke<boolean>("is_instance_running", { instanceId: active.id });
        setRunning(r);
      } catch {
        /* Dev-Modus */
      }
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [active?.id]);

  const handleStop = async () => {
    if (!active) return;
    setStopping(true);
    try {
      await invoke("stop_instance", { instanceId: active.id });
      setRunning(false);
      setLaunchMsg("Minecraft wurde beendet.");
    } catch (e) {
      setLaunchMsg("Stoppen fehlgeschlagen: " + String(e));
    } finally {
      setStopping(false);
    }
  };

  /** Stoppt Minecraft ODER bricht einen laufenden Download ab. */
  const handleStopOrCancel = async () => {
    if (!active) return;
    if (launching) {
      // Download läuft → Backend abbrechen + UI zurücksetzen
      setStopping(true);
      try {
        await invoke("cancel_launch");
      } catch {
        /* egal */
      }
      setLaunching(false);
      setProgress(null);
      setPhaseHistory("");
      setLaunchMsg("Download abgebrochen.");
    } else {
      await handleStop();
    }
    setStopping(false);
  };

  // Auf Fortschritts-Events aus dem Rust-Backend lauschen
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<Progress>("launch://progress", (event) => {
          const p = event.payload;
          setProgress(p);
          // Fortschritts-Historie für die Live-Log-Anzeige
          const label = PHASE_LABELS[p.phase] ?? p.phase;
          setPhaseHistory((prev) => prev + `[${label}] ${p.message}\n`);
        });
      } catch {
        // Im reinen Browser-Dev-Modus gibt es keine Events - egal
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleLaunch = async () => {
    if (!active) return;
    if (!account) {
      setLaunchMsg("Bitte zuerst unter 'Accounts' einloggen.");
      return;
    }
    setLaunching(true);
    setLaunchMsg("Starte Minecraft …");
    setLaunchLog(null);
    setProgress(null);
    setPhaseHistory("");
    try {
      await invoke("launch_instance", { instanceId: active.id });
      setRunning(true);
      setLaunchMsg("Minecraft wurde gestartet. Viel Spaß! 🎮");
      setProgress({
        phase: "done",
        message: "Fertig!",
        current: 1,
        total: 1,
      });
    } catch (e) {
      setLaunchMsg("Start fehlgeschlagen: " + String(e));
    } finally {
      setLaunching(false);
      // Immer das Launch-Log abholen (für Diagnose bei Crashs)
      try {
        const log = await invoke<string>("get_launch_log");
        setLaunchLog(log);
      } catch {
        /* Log optional */
      }
    }
  };

  // Fortschritts-Prozentsatz schätzen (0–100)
  const pct = (() => {
    if (!progress) return 0;
    if (progress.phase === "done") return 100;
    const order = phaseOrder(progress.phase);
    if (order < 0) return 0;
    // 5 echte Phasen + Start, grobe Gewichtung
    const baseWeight = order * 18; // init=0, version=18, lib=36, assets=54, client=72, launch=90
    if (progress.total > 0) {
      const within = Math.min(progress.current / progress.total, 1) * 16;
      return Math.min(baseWeight + within, 99);
    }
    return Math.min(baseWeight, 99);
  })();

  return (
    <div className="onyx-content onyx-play">
      <div className="onyx-play-hero">
        <div
          className="onyx-play-card"
          style={{ background: `linear-gradient(135deg, ${active?.iconColor ?? "#065f7a"}33, transparent)` }}
        >
          <h1 className="onyx-logo-text" style={{ fontSize: 42 }}>
            {active ? active.name : "Onyx Launcher"}
          </h1>
          <p className="onyx-play-subtitle">
            {active ? (
              <>
                Minecraft <strong>{active.mcVersion}</strong> ·{" "}
                <span style={{ textTransform: "capitalize" }}>{active.loader}</span>
                {active.loaderVersion ? " " + active.loaderVersion : ""} ·{" "}
                {active.mods.length} Mods
              </>
            ) : (
              "Erstelle ein Profil, um zu starten."
            )}
          </p>
        </div>

        <div className="onyx-play-buttons">
          <button
            className={"onyx-play-launch" + (launching ? " launching" : "")}
            onClick={handleLaunch}
            disabled={!active || launching || running}
          >
            {launching ? (
              <>
                <div className="onyx-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Lädt …
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Spielen
              </>
            )}
          </button>

          {(launching || running || stopping) && (
            <button
              className="onyx-play-stop"
              onClick={handleStopOrCancel}
              disabled={stopping}
            >
              {stopping ? (
                <>
                  <div className="onyx-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Stoppe …
                </>
              ) : launching ? (
                <>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                  Abbrechen
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                  Stoppen
                </>
              )}
            </button>
          )}
        </div>

        {/* Crash-Analyse Button (sichtbar wenn nicht laufend) */}
        {active && !launching && !running && (
          <CrashAnalyzer instanceId={active.id} instanceName={active.name} />
        )}

        {launchMsg && <p className="onyx-play-msg">{launchMsg}</p>}

        {/* Live-Download-Fortschritt */}
        {launching && progress && (
          <div className="onyx-progress-box">
            <div className="onyx-progress-header">
              <span className="onyx-progress-phase">
                {PHASE_LABELS[progress.phase] ?? progress.phase}
              </span>
              <span className="onyx-progress-count">
                {progress.total > 0
                  ? `${progress.current} / ${progress.total}`
                  : ""}
              </span>
            </div>
            <div className="onyx-progress-bar-bg">
              <div
                className="onyx-progress-bar-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="onyx-progress-message">{progress.message}</p>
            {phaseHistory && (
              <details className="onyx-play-log">
                <summary>Aktivität anzeigen</summary>
                <pre>{phaseHistory}</pre>
              </details>
            )}
          </div>
        )}

        {/* Launch-Log nach Abschluss (für Diagnose) */}
        {!launching && launchLog && (
          <details className="onyx-play-log">
            <summary>Launch-Log anzeigen</summary>
            <pre>{launchLog}</pre>
          </details>
        )}
      </div>

      {/* Profil-Auswahl */}
      <div className="onyx-play-instances">
        <h2 className="onyx-play-section-title">Deine Profile</h2>
        {instances.length === 0 ? (
          <div className="onyx-card" style={{ padding: 24 }}>
            <EmptyState
              title="Keine Profile vorhanden"
              hint="Erstelle dein erstes Profil, um Minecraft zu starten."
            />
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button className="onyx-btn onyx-btn-primary" onClick={() => navigate("/instances")}>
                Profil erstellen
              </button>
            </div>
          </div>
        ) : (
          <div className="onyx-grid">
            {instances.map((inst) => (
              <button
                key={inst.id}
                className={"onyx-card onyx-play-inst" + (inst.id === active?.id ? " selected" : "")}
                onClick={() => setActive(inst.id)}
              >
                <div className="onyx-play-inst-dot" style={{ background: inst.iconColor }} />
                <div className="onyx-play-inst-info">
                  <strong>{inst.name}</strong>
                  <span>{inst.mcVersion} · {inst.mods.length} Mods</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

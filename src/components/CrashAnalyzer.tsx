/* ============================================================
 * Chaos Launcher - Crash-Analyse-Bot
 *
 * Analysiert das Minecraft-Log eines Profils auf bekannte Crash-
 * Ursachen (Mixin-Fehler, Java-Probleme, Grafiktreiber, etc.)
 * und zeigt eine verständliche Lösung an.
 * ============================================================ */

import { useState } from "react";
import { invoke } from "@/lib/bridge";
import { disableCrashingMod, findInstalledMod } from "@/lib/crash";
import { openPath } from "@/lib/api/launcher";
import { useInstanceStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import type { CrashAnalysis } from "@/types";
import "./CrashAnalyzer.css";

export default function CrashAnalyzer({ instanceId, instanceName }: { instanceId: string; instanceName: string }) {
  const [analysis, setAnalysis] = useState<CrashAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const instance = useInstanceStore((s) => s.instances.find((i) => i.id === instanceId));
  const crashingMod = findInstalledMod(instance, analysis?.modName);

  const disable = async () => {
    if (!analysis?.modName) return;
    setDisabling(true);
    try {
      const mod = await disableCrashingMod(instanceId, analysis.modName);
      if (mod) toast.success(`"${mod.title}" deaktiviert`, "Starte Minecraft jetzt neu – die Mod wird nicht mehr geladen.");
      else toast.warning("Mod nicht gefunden", `"${analysis.modName}" ist nicht in der Mod-Liste. Entferne die Datei im Mods-Ordner.`);
    } catch (e) {
      toast.error("Deaktivieren fehlgeschlagen", String(e));
    } finally {
      setDisabling(false);
    }
  };

  const analyze = async () => {
    setLoading(true);
    setShow(true);
    try {
      const result = await invoke<CrashAnalysis>("analyze_crash", { instanceId });
      setAnalysis(result);
    } catch (e) {
      setAnalysis({
        crashed: false,
        cause: "Analyse fehlgeschlagen",
        explanation: "Das Log konnte nicht gelesen werden: " + String(e),
        solution: "Stelle sicher, dass das Profil mindestens einmal gestartet wurde.",
        modName: null,
        actions: [],
      });
    } finally {
      setLoading(false);
    }
  };

  if (!show) {
    return (
      <button className="onyx-btn" onClick={analyze} title="Minecraft-Log auf Fehler analysieren">
        🔍 Crash analysieren
      </button>
    );
  }

  return (
    <div className="onyx-crash-panel">
      <div className="onyx-crash-header">
        <h3>🔍 Crash-Analyse für "{instanceName}"</h3>
        <button className="onyx-crash-close" onClick={() => setShow(false)}>✕</button>
      </div>

      {loading && (
        <div className="onyx-crash-loading">
          <div className="onyx-crash-spinner">⏳</div>
          <p>Analysiere Minecraft-Log …</p>
        </div>
      )}

      {!loading && analysis && (
        <>
          {analysis.crashed ? (
            <div className="onyx-crash-result onyx-crash-error">
              <div className="onyx-crash-icon">💥</div>
              <div className="onyx-crash-cause">
                <strong>Crash erkannt!</strong>
                <span>{analysis.cause}</span>
              </div>
              {analysis.modName && (
                <div className="onyx-crash-mod">
                  <span className="onyx-badge onyx-badge-warning">
                    ⚠ Problematische Mod: {analysis.modName}
                  </span>
                </div>
              )}
              <div className="onyx-crash-section">
                <strong>📋 Was ist passiert?</strong>
                <p>{analysis.explanation}</p>
              </div>
              <div className="onyx-crash-section">
                <strong>💡 Lösung:</strong>
                <p>{analysis.solution}</p>
              </div>
              <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
                {analysis.modName && (
                  <button className="chaos-btn chaos-btn-primary chaos-btn-sm" disabled={disabling} onClick={disable}>
                    {disabling ? "…" : crashingMod ? `"${crashingMod.title}" deaktivieren` : "Mod deaktivieren"}
                  </button>
                )}
                <button className="chaos-btn chaos-btn-sm" onClick={() => openPath(`crash:${instanceId}`)}>Crash-Report öffnen</button>
              </div>
            </div>
          ) : (
            <div className="onyx-crash-result onyx-crash-ok">
              <div className="onyx-crash-icon">✅</div>
              <div className="onyx-crash-cause">
                <strong>Kein Crash gefunden</strong>
                <span>{analysis.cause}</span>
              </div>
              <p className="onyx-crash-section">{analysis.explanation}</p>
            </div>
          )}

          <button className="onyx-btn" onClick={analyze} style={{ marginTop: 12 }}>
            🔄 Erneut analysieren
          </button>
        </>
      )}
    </div>
  );
}

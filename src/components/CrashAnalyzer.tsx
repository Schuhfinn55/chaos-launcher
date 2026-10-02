/* ============================================================
 * Chaos Launcher - Crash-Analyse-Bot
 *
 * Analysiert das Minecraft-Log eines Profils auf bekannte Crash-
 * Ursachen (Mixin-Fehler, Java-Probleme, Grafiktreiber, etc.)
 * und zeigt eine verständliche Lösung an.
 * ============================================================ */

import { useState } from "react";
import { invoke } from "@/lib/bridge";
import "./CrashAnalyzer.css";

interface CrashAnalysis {
  crashed: boolean;
  cause: string;
  explanation: string;
  solution: string;
  modName: string | null;
}

export default function CrashAnalyzer({ instanceId, instanceName }: { instanceId: string; instanceName: string }) {
  const [analysis, setAnalysis] = useState<CrashAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

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

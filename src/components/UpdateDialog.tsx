/* ============================================================
 * Chaos Launcher - Großer Update-Dialog nach dem Start
 *
 * Erscheint, sobald die Startprüfung ein Launcher- oder Client-Update
 * gefunden hat: Version, Größe, Release-Notes, ein großer
 * „Jetzt aktualisieren“-Button mit Fortschritt, „Später“ blendet den
 * Dialog für diese Sitzung aus.
 * ============================================================ */

import { useEffect, useState } from "react";
import { useStatusStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { listen } from "@/lib/bridge";
import { getAppInfo, installClientUpdate, installUpdate, openUrl, formatBytes } from "@/lib/api/launcher";
import "./UpdateDialog.css";

interface Progress { message: string; done: number; total: number }

export default function UpdateDialog({ ready }: { ready: boolean }) {
  const update = useStatusStore((s) => s.update);
  const clientUpdate = useStatusStore((s) => s.clientUpdate);
  const setClientUpdate = useStatusStore((s) => s.setClientUpdate);
  const setAppInfo = useStatusStore((s) => s.setAppInfo);
  const appInfo = useStatusStore((s) => s.appInfo);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState<"launcher" | "client" | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let un1: (() => void) | null = null, un2: (() => void) | null = null;
    listen<Progress>("update://progress", setProgress).then((u) => (un1 = u));
    listen<Progress>("client-update://progress", setProgress).then((u) => (un2 = u));
    return () => { un1?.(); un2?.(); };
  }, []);

  const target = update ?? (clientUpdate ? null : null);
  const show = ready && !dismissed && (!!update || !!clientUpdate);
  if (!show) return null;

  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;

  const runLauncher = async () => {
    if (!update) return;
    setError(null);
    setInstalling("launcher");
    setProgress(null);
    try {
      const msg = await installUpdate(update);
      toast.success("Update", msg);
      if (!update.verifiable) setInstalling(null);
      // bei verifizierbarem Update beendet sich der Launcher und startet den Installer
    } catch (e) {
      setError(String(e));
      setInstalling(null);
    }
  };

  const runClient = async () => {
    if (!clientUpdate) return;
    setError(null);
    setInstalling("client");
    setProgress(null);
    try {
      const msg = await installClientUpdate(clientUpdate);
      toast.success("Chaos Client aktualisiert", msg);
      setClientUpdate(null);
      setAppInfo(await getAppInfo());
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(null);
      setProgress(null);
    }
  };

  const notes = (update?.releaseNotes || clientUpdate?.releaseNotes || "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

  return (
    <div className="chaos-upd-backdrop" role="dialog" aria-modal="true" aria-labelledby="chaos-upd-title">
      <div className="chaos-upd">
        <div className="chaos-upd-glow" aria-hidden="true" />
        <div className="chaos-upd-head">
          <div className="chaos-upd-icon">⬇</div>
          <div>
            <span className="chaos-upd-kicker">{update ? "Launcher-Update" : "Chaos-Client-Update"} verfügbar</span>
            <h2 id="chaos-upd-title">
              {update ? <>Chaos Launcher <span className="chaos-upd-ver">v{update.version}</span></> : <>Chaos Client <span className="chaos-upd-ver">{clientUpdate?.version}</span></>}
            </h2>
            <span className="chaos-upd-meta">
              {update ? `Installiert: v${update.currentVersion}` : `Installiert: ${clientUpdate?.currentVersion}`}
              {update?.fileSize ? ` · ${formatBytes(update.fileSize)}` : clientUpdate?.fileSize ? ` · ${formatBytes(clientUpdate.fileSize)}` : ""}
              {update?.publishedAt ? ` · ${update.publishedAt}` : clientUpdate?.publishedAt ? ` · ${clientUpdate.publishedAt}` : ""}
            </span>
          </div>
        </div>

        {notes.length > 0 && (
          <div className="chaos-upd-notes">
            <span className="chaos-upd-notes-title">Was ist neu</span>
            <ul>
              {notes.slice(0, 8).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {update && clientUpdate && (
          <p className="chaos-upd-also">Außerdem verfügbar: Chaos Client {clientUpdate.version} (wird nach dem Launcher-Update angeboten).</p>
        )}

        {installing && (
          <div className="chaos-upd-progress">
            <div className="chaos-progress">
              <div className="chaos-progress-fill" style={{ width: `${pct ?? 25}%`, transition: "width 0.3s" }} />
            </div>
            <span>{progress?.message ?? (installing === "launcher" ? "Lade Update …" : "Lade Chaos Client …")}{pct !== null ? ` · ${pct}%` : ""}</span>
          </div>
        )}
        {error && <div className="onyx-toast onyx-toast-warn" style={{ marginTop: 10 }}>{error}</div>}

        <div className="chaos-upd-actions">
          {update ? (
            <button className="chaos-btn chaos-btn-primary chaos-upd-main" disabled={!!installing} onClick={runLauncher}>
              {installing === "launcher" ? "Wird installiert …" : update.verifiable ? "Jetzt aktualisieren" : "Download-Seite öffnen"}
            </button>
          ) : (
            <button className="chaos-btn chaos-btn-primary chaos-upd-main" disabled={!!installing} onClick={runClient}>
              {installing === "client" ? "Wird installiert …" : "Chaos Client aktualisieren"}
            </button>
          )}
          <button className="chaos-btn chaos-btn-ghost" disabled={!!installing} onClick={() => setDismissed(true)}>
            Später
          </button>
          <button className="chaos-btn chaos-btn-ghost chaos-upd-link" onClick={() => openUrl(update?.releaseUrl || clientUpdate?.releaseUrl || "https://chaoslauncher.duckdns.org")}>
            Website ↗
          </button>
        </div>
        <p className="chaos-upd-foot">
          {update?.verifiable || !update ? "Die Datei wird vor der Installation per SHA-256-Prüfsumme verifiziert." : "Für dieses Release liegt keine Prüfsumme vor – der Launcher öffnet die Download-Seite statt eine unverifizierte Datei auszuführen."}
          {appInfo ? ` · Launcher v${appInfo.version}` : ""}
          {target ? "" : ""}
        </p>
      </div>
    </div>
  );
}

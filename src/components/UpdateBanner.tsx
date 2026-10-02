/* ============================================================
 * Onyx Launcher - Update-Banner
 *
 * Wird beim Start eingeblendet, wenn eine neue Version auf
 * GitHub verfügbar ist. Der Nutzer kann direkt updaten.
 * ============================================================ */

import { useState, useEffect } from "react";
import { invoke } from "@/lib/bridge";
import "./UpdateBanner.css";

interface UpdateInfo {
  version: string;
  releaseUrl: string;
  releaseNotes: string;
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  isNewer: boolean;
}

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nach 3 Sekunden nach Update suchen (Launcher zuerst laden lassen)
    const timer = setTimeout(async () => {
      try {
        const info = await invoke<UpdateInfo | null>("check_for_updates");
        if (info && info.isNewer) {
          setUpdate(info);
        }
      } catch (e) {
        // Stille: wenn der Check fehlschlägt, einfach nichts anzeigen
        console.log("[Onyx] Update-Check fehlgeschlagen:", e);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleInstall = async () => {
    if (!update) return;
    setInstalling(true);
    setStatus("Lade Update herunter …");
    setError(null);
    try {
      const result = await invoke<string>("install_update", {
        downloadUrl: update.downloadUrl,
      });
      setStatus(result);
    } catch (e) {
      setError(String(e));
      setInstalling(false);
    }
  };

  const openInBrowser = () => {
    if (update) {
      window.open(update.releaseUrl, "_blank");
    }
  };

  if (!update || dismissed) return null;

  return (
    <div className="onyx-update-banner">
      <div className="onyx-update-content">
        <span className="onyx-update-icon">🔄</span>
        <div className="onyx-update-text">
          <strong>Update verfügbar!</strong>
          <span>
            Version {update.version} ist da.{" "}
            {update.fileSize > 0 && `(${(update.fileSize / 1024 / 1024).toFixed(1)} MB)`}
          </span>
          {installing && <span className="onyx-update-status">{status}</span>}
          {error && <span className="onyx-update-error">❌ {error}</span>}
        </div>
      </div>
      <div className="onyx-update-actions">
        {!installing ? (
          <>
            <button className="onyx-btn" onClick={openInBrowser} title="Release-Notes ansehen">
              📄 Details
            </button>
            <button
              className="onyx-btn onyx-btn-primary"
              onClick={handleInstall}
            >
              ⬇ Jetzt updaten
            </button>
            <button
              className="onyx-update-dismiss"
              onClick={() => setDismissed(true)}
              title="Später erinnern"
            >
              ✕
            </button>
          </>
        ) : (
          <span className="onyx-update-spinner">⏳ Installiere …</span>
        )}
      </div>
    </div>
  );
}

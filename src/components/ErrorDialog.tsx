/* ============================================================
 * Chaos Launcher - Fehlerdialog
 *
 * Zeigt Launch-/Installationsfehler verständlich an:
 *   Titel · Grund · Aktionen (Reparieren, Java installieren, …)
 *   · ausklappbare technische Details.
 * ============================================================ */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui";
import type { LaunchError } from "@/types";
import { openPath, repairInstance, resetProfile, downloadJava } from "@/lib/api/launcher";
import { disableCrashingMod, findInstalledMod } from "@/lib/crash";
import { useInstanceStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import "./ErrorDialog.css";

const ACTION_LABEL: Record<string, string> = {
  repair: "Reparieren",
  install_java: "Java installieren",
  login: "Anmelden",
  open_logs: "Logs öffnen",
  reset_profile: "Profil zurücksetzen",
  retry: "Erneut versuchen",
  settings: "Einstellungen",
  open_mods: "Mods öffnen",
  open_profile: "Profil öffnen",
  open_crash: "Crash-Report öffnen",
  disable_mod: "Mod deaktivieren",
};

export default function ErrorDialog({
  error,
  instanceId,
  javaVersion,
  modName,
  onClose,
  onRetry,
}: {
  error: LaunchError | null;
  instanceId?: string;
  javaVersion?: number;
  /** Von der Crash-Analyse erkannte Mod (für "Mod deaktivieren") */
  modName?: string | null;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const instance = useInstanceStore((s) => s.instances.find((i) => i.id === instanceId));
  const crashingMod = findInstalledMod(instance, modName);

  if (!error) return null;

  const run = async (action: string) => {
    setBusy(action);
    try {
      switch (action) {
        case "repair": {
          if (!instanceId) break;
          const rep = await repairInstance(instanceId);
          toast.success("Reparatur abgeschlossen", `${rep.removedFiles} Dateien entfernt, ${rep.verifiedFiles} geprüft. ${rep.notes[0] ?? ""}`);
          onClose();
          onRetry?.();
          break;
        }
        case "install_java": {
          const v = javaVersion && javaVersion > 0 ? javaVersion : 21;
          toast.info(`Java ${v} wird installiert`, "Das dauert je nach Verbindung 1–3 Minuten.");
          await downloadJava(v);
          toast.success(`Java ${v} installiert`, "Du kannst Minecraft jetzt starten.");
          onClose();
          onRetry?.();
          break;
        }
        case "login":
          onClose();
          navigate("/accounts");
          break;
        case "open_logs":
          await openPath("logs");
          break;
        case "open_crash":
          if (instanceId) await openPath(`crash:${instanceId}`);
          break;
        case "reset_profile": {
          if (!instanceId) break;
          const removed = await resetProfile(instanceId);
          toast.success("Profil zurückgesetzt", removed.length ? `Entfernt: ${removed.join(", ")}` : "Nichts zu entfernen.");
          onClose();
          break;
        }
        case "retry":
          onClose();
          onRetry?.();
          break;
        case "settings":
          onClose();
          navigate("/settings");
          break;
        case "open_mods":
          onClose();
          navigate("/mods");
          break;
        case "open_profile":
          onClose();
          navigate("/profiles");
          break;
        case "disable_mod": {
          if (!instanceId) break;
          const mod = await disableCrashingMod(instanceId, modName);
          if (mod) {
            toast.success(`"${mod.title}" deaktiviert`, "Starte Minecraft jetzt neu – die Mod wird nicht mehr geladen.");
            onClose();
          } else {
            toast.warning("Mod nicht gefunden", `"${modName ?? "?"}" ist nicht in der Mod-Liste des Profils. Entferne die Datei im Mods-Ordner.`);
            await openPath(`instance:${instanceId}`).catch(() => {});
          }
          break;
        }
      }
    } catch (e) {
      toast.error("Aktion fehlgeschlagen", String(e));
    } finally {
      setBusy(null);
    }
  };

  const label = (a: string) => (a === "disable_mod" && crashingMod ? `"${crashingMod.title}" deaktivieren` : (ACTION_LABEL[a] ?? a));
  const visible = error.actions.filter((a) => a !== "disable_mod" || (instanceId && modName));
  const primary = visible.filter((a) => a !== "open_logs" && a !== "retry");
  const secondary = visible.filter((a) => a === "open_logs" || a === "retry");

  return (
    <Modal open onClose={onClose} width={560}>
      <div className="chaos-errdlg">
        <div className="chaos-errdlg-icon">!</div>
        <div className="chaos-errdlg-body">
          <h3>{error.title || "Minecraft konnte nicht gestartet werden."}</h3>
          <div className="chaos-errdlg-reason">
            <span className="chaos-errdlg-reason-label">Grund</span>
            <p>{error.reason}</p>
          </div>
          <div className="chaos-errdlg-actions">
            {primary.map((a) => (
              <button key={a} className="chaos-btn chaos-btn-primary" disabled={busy !== null} onClick={() => run(a)}>
                {busy === a ? "…" : label(a).toUpperCase()}
              </button>
            ))}
            {secondary.map((a) => (
              <button key={a} className="chaos-btn" disabled={busy !== null} onClick={() => run(a)}>
                {busy === a ? "…" : label(a).toUpperCase()}
              </button>
            ))}
            <button className="chaos-btn chaos-btn-ghost" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? "DETAILS AUSBLENDEN" : "DETAILS"}
            </button>
          </div>
          {showDetails && (
            <pre className="chaos-errdlg-details">
              {`Code: ${error.code}\n`}
              {error.details || "(keine weiteren Details)"}
            </pre>
          )}
        </div>
      </div>
      <div className="chaos-modal-actions">
        <button className="chaos-btn" onClick={onClose}>
          Schließen
        </button>
      </div>
    </Modal>
  );
}

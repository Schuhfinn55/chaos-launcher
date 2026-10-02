/* ============================================================
 * Chaos Launcher - LaunchPanel
 *
 * Großer SPIELEN-Button + Fortschritt + Fehlerdialog. Wird auf
 * Home, Spielen und Chaoscraft verwendet.
 * ============================================================ */

import { useState } from "react";
import { AsciiProgress, ProgressBar } from "@/components/ui";
import ErrorDialog from "@/components/ErrorDialog";
import { PHASE_LABELS, useLauncher } from "@/lib/useLauncher";
import { useT } from "@/lib/i18n/useT";
import type { Instance } from "@/types";
import "./LaunchPanel.css";

export default function LaunchPanel({
  instance,
  size = "hero",
  label,
  onLaunched,
}: {
  instance: Instance | null;
  size?: "hero" | "compact";
  label?: string;
  onLaunched?: () => void;
}) {
  const { t } = useT();
  const L = useLauncher(instance?.id);
  const [showLog, setShowLog] = useState(false);

  const disabled = !instance || L.launching || L.running;
  const text = L.launching ? t("home.starting") : L.running ? t("home.running") : (label ?? t("home.play"));

  return (
    <div className={"chaos-launch " + size}>
      <div className="chaos-launch-buttons">
        <button
          className={"chaos-launch-btn" + (L.launching ? " launching" : "") + (L.running ? " running" : "")}
          disabled={disabled}
          onClick={async () => {
            const ok = await L.launch();
            if (ok) onLaunched?.();
          }}
        >
          {L.launching ? (
            <span className="chaos-launch-spinner" />
          ) : L.running ? (
            <span className="chaos-dot online" />
          ) : (
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          <span className="chaos-launch-text">{text}</span>
          {instance && !L.launching && !L.running && size === "hero" && (
            <span className="chaos-launch-sub">
              {instance.name} · {instance.mcVersion}
            </span>
          )}
        </button>
        {(L.launching || L.running || L.stopping) && (
          <button className="chaos-launch-stop" disabled={L.stopping} onClick={L.stop}>
            {L.stopping ? "…" : L.launching ? t("home.cancel") : t("home.stop")}
          </button>
        )}
      </div>

      {L.message && !L.launching && <p className="chaos-launch-msg">{L.message}</p>}

      {L.launching && (
        <div className="chaos-launch-progress">
          <ProgressBar
            value={L.percent}
            indeterminate={!L.progress || (L.progress.total === 0 && L.progress.phase !== "done")}
            label={L.progress ? (PHASE_LABELS[L.progress.phase] ?? L.progress.phase) : "Vorbereitung"}
            right={L.progress && L.progress.total > 0 ? `${L.progress.current} / ${L.progress.total}` : ""}
          />
          <div className="chaos-launch-progress-line">
            <span className="chaos-mono chaos-muted chaos-truncate">{L.progress?.message ?? L.message ?? ""}</span>
            <AsciiProgress value={L.percent} width={14} />
          </div>
          {L.history.length > 0 && (
            <button className="chaos-btn chaos-btn-ghost chaos-btn-sm" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Aktivität ausblenden" : "Aktivität anzeigen"}
            </button>
          )}
          {showLog && <pre className="chaos-launch-log">{L.history.join("\n")}</pre>}
        </div>
      )}

      <ErrorDialog error={L.error} instanceId={instance?.id} javaVersion={instance?.javaVersion} onClose={L.clearError} onRetry={() => void L.launch()} />
    </div>
  );
}

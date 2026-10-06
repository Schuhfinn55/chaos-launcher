/* ============================================================
 * Chaos Launcher - Spielen
 *
 * Profilauswahl + großer Start-Button + Vorprüfung, Status,
 * Reparatur, Crash-Analyse und Logs.
 * ============================================================ */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LaunchPanel from "@/components/LaunchPanel";
import CrashAnalyzer from "@/components/CrashAnalyzer";
import FpsBoostCard from "@/components/FpsBoostCard";
import { Empty, PageHead } from "@/components/ui";
import { useInstanceStore, useStatusStore } from "@/stores/useStore";
import { checkInstance, getLaunchLog, getMinecraftLog, openPath, repairInstance, formatBytes } from "@/lib/api/launcher";
import { toast } from "@/stores/toastStore";
import { useT } from "@/lib/i18n/useT";
import { formatPlaytime } from "@/lib/utils";
import "./PlayPage.css";

export default function PlayPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const setActive = useInstanceStore((s) => s.setActive);
  const statusMap = useStatusStore((s) => s.instanceStatus);
  const setStatus = useStatusStore((s) => s.setInstanceStatus);
  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null;
  const status = active ? statusMap[active.id] : undefined;
  const [log, setLog] = useState<string | null>(null);
  const [logKind, setLogKind] = useState<"launch" | "minecraft">("launch");
  const [repairing, setRepairing] = useState(false);

  useEffect(() => {
    if (!active) return;
    checkInstance(active.id).then(setStatus).catch(() => {});
  }, [active?.id, active, setStatus]);

  const loadLog = async (kind: "launch" | "minecraft") => {
    setLogKind(kind);
    try {
      setLog(kind === "launch" ? await getLaunchLog(150) : active ? await getMinecraftLog(active.id, 250) : "");
    } catch (e) {
      setLog(String(e));
    }
  };

  const repair = async () => {
    if (!active) return;
    setRepairing(true);
    try {
      const rep = await repairInstance(active.id);
      toast.success("Reparatur abgeschlossen", `${rep.removedFiles} entfernt, ${rep.verifiedFiles} geprüft.`);
      setStatus(await checkInstance(active.id));
    } catch (e) {
      toast.error("Reparatur fehlgeschlagen", String(e));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="onyx-content chaos-play">
      <PageHead title={t("nav.play")} subtitle="Wähle ein Profil und starte Minecraft. Vor dem Start werden Account, Java, Mods und Dateien geprüft." />

      {instances.length === 0 ? (
        <Empty
          icon="🎮"
          title="Keine Profile vorhanden"
          hint="Erstelle dein erstes Profil mit Minecraft-Version und Modloader."
          action={
            <button className="chaos-btn chaos-btn-primary" onClick={() => navigate("/profiles")}>
              {t("home.createProfile")}
            </button>
          }
        />
      ) : (
        <div className="chaos-play-grid">
          <section className="chaos-card chaos-play-hero" style={{ ["--profile-color" as string]: active?.iconColor ?? "var(--chaos-accent)" }}>
            <div className="chaos-play-hero-glow" />
            <div className="chaos-play-hero-head">
              <div>
                <h1 className="chaos-play-title">{active?.name}</h1>
                <div className="chaos-row chaos-wrap" style={{ gap: 6 }}>
                  <span className="chaos-badge chaos-badge-accent">Minecraft {active?.mcVersion}</span>
                  <span className="chaos-badge" style={{ textTransform: "capitalize" }}>
                    {active?.loader} {active?.loaderVersion ?? ""}
                  </span>
                  <span className="chaos-badge">{active?.mods.filter((m) => m.enabled).length} Mods</span>
                  <span className="chaos-badge">{active ? (active.ramMb / 1024).toFixed(1) : 0} GB RAM</span>
                  {active?.playTimeSeconds ? <span className="chaos-badge">⏱ {formatPlaytime(active.playTimeSeconds)}</span> : null}
                </div>
              </div>
            </div>
            <LaunchPanel instance={active} size="hero" />

            {/* Status */}
            {status && (
              <div className="chaos-play-status">
                <div className="chaos-play-status-row">
                  <span className={"chaos-dot " + (status.installed ? "online" : status.neverInstalled ? "pending" : "offline")} />
                  <strong>{status.installed ? "Profil vollständig installiert" : status.neverInstalled ? "Noch nicht installiert – wird beim ersten Start geladen" : "Dateien fehlen oder sind beschädigt"}</strong>
                  <span className="chaos-faint chaos-mono" style={{ marginLeft: "auto" }}>
                    {formatBytes(status.sizeBytes)}
                  </span>
                </div>
                <div className="chaos-play-status-grid">
                  <span>
                    Java {status.javaRequired}: <strong className={status.javaFound ? "ok" : "bad"}>{status.javaFound ? `Java ${status.javaFound} gefunden` : "fehlt"}</strong>
                  </span>
                  <span>
                    Bibliotheken: <strong className={status.librariesMissing ? "bad" : "ok"}>{status.librariesTotal - status.librariesMissing}/{status.librariesTotal || "?"}</strong>
                  </span>
                  <span>
                    Spieldateien: <strong className={status.assetsMissing ? "bad" : "ok"}>{status.assetsTotal - status.assetsMissing}/{status.assetsTotal || "?"}</strong>
                  </span>
                  <span>
                    Mods: <strong className={status.modsMissing.length ? "bad" : "ok"}>{status.modsTotal - status.modsMissing.length}/{status.modsTotal}</strong>
                  </span>
                </div>
                {status.problems.length > 0 && !status.installed && !status.neverInstalled && (
                  <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
                    <button className="chaos-btn chaos-btn-sm" disabled={repairing} onClick={repair}>
                      {repairing ? "Repariere …" : "Dateien reparieren"}
                    </button>
                    <span className="chaos-faint" style={{ fontSize: 12 }}>
                      {status.problems.join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            )}

            {active && <FpsBoostCard instance={active} />}

            <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
              {active && <CrashAnalyzer instanceId={active.id} instanceName={active.name} />}
              <button className="chaos-btn chaos-btn-sm" onClick={() => loadLog("launch")}>
                Launch-Log
              </button>
              <button className="chaos-btn chaos-btn-sm" onClick={() => loadLog("minecraft")}>
                Minecraft-Log
              </button>
              <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => active && openPath(`instance:${active.id}`)}>
                Ordner öffnen
              </button>
              <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => active && openPath(`crash:${active.id}`)}>
                Crash-Reports
              </button>
            </div>
            {log !== null && (
              <details open className="chaos-play-log">
                <summary>
                  {logKind === "launch" ? "Launch-Log" : "Minecraft-Log"} <button className="chaos-btn chaos-btn-ghost chaos-btn-sm" onClick={() => setLog(null)}>schließen</button>
                </summary>
                <pre>{log}</pre>
              </details>
            )}
          </section>

          <aside className="chaos-play-list">
            <span className="chaos-section-title">Profile</span>
            {instances.map((inst) => {
              const st = statusMap[inst.id];
              return (
                <button key={inst.id} className={"chaos-card chaos-play-inst" + (inst.id === active?.id ? " selected" : "")} onClick={() => setActive(inst.id)}>
                  <span className="chaos-play-inst-dot" style={{ background: inst.iconColor }} />
                  <span className="chaos-col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <strong className="chaos-truncate">{inst.name}</strong>
                    <span className="chaos-faint" style={{ fontSize: 11 }}>
                      {inst.mcVersion} · {inst.loader} · {inst.mods.length} Mods
                    </span>
                  </span>
                  {st && <span className={"chaos-dot " + (st.installed ? "online" : st.neverInstalled ? "pending" : "offline")} />}
                </button>
              );
            })}
            <button className="chaos-btn" onClick={() => navigate("/profiles")}>
              + Profil verwalten
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

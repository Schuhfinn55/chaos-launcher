/* ============================================================
 * Chaos Launcher - Home
 *
 * Spielerprofil mit 3D-Skin, ausgewähltes Profil + großer SPIELEN-
 * Button, zuletzt verwendete Profile, Serverstatus, News,
 * Chaoscraft-Bereich, Download-/Update-Status, Versionen.
 * ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LaunchPanel from "@/components/LaunchPanel";
import SkinViewer3D from "@/features/cosmetics/SkinViewer3D";
import { Skeleton, StatusDot } from "@/components/ui";
import { useAccountStore, useCosmeticsStore, useInstanceStore, useStatusStore } from "@/stores/useStore";
import { useT } from "@/lib/i18n/useT";
import { CHAOSCRAFT } from "@/lib/config/chaoscraft";
import { chaoscraftAddress, pingServer } from "@/lib/api/servers";
import { loadNews, formatNewsDate, NEWS_CATEGORY_META } from "@/lib/api/news";
import { activeCapeFor, getCapeDataUrl } from "@/lib/api/cosmetics";
import { checkInstance, repairInstance, formatBytes } from "@/lib/api/launcher";
import { formatPlaytime } from "@/lib/utils";
import { toast } from "@/stores/toastStore";
import type { NewsItem } from "@/types";
import "./HomePage.css";

export default function HomePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const account = useAccountStore((s) => s.active);
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const setActive = useInstanceStore((s) => s.setActive);
  const cosmetics = useCosmeticsStore((s) => s.state);
  const appInfo = useStatusStore((s) => s.appInfo);
  const update = useStatusStore((s) => s.update);
  const instanceStatus = useStatusStore((s) => s.instanceStatus);
  const setInstanceStatus = useStatusStore((s) => s.setInstanceStatus);
  const serverStatusMap = useStatusStore((s) => s.serverStatus);
  const setServerStatus = useStatusStore((s) => s.setServerStatus);

  const active = instances.find((i) => i.id === activeId) ?? null;
  const status = active ? instanceStatus[active.id] : undefined;
  const [capeUrl, setCapeUrl] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [repairing, setRepairing] = useState(false);

  const address = chaoscraftAddress();
  const server = Object.values(serverStatusMap).find((s) => `${s.address}:${s.port}` === normalize(address));

  // Serverstatus laden + alle 60 s aktualisieren
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const st = await pingServer(address);
        if (alive) setServerStatus(st);
      } catch {
        /* egal */
      }
    };
    void run();
    const t = setInterval(run, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [address, setServerStatus]);

  useEffect(() => {
    loadNews().then((r) => setNews(r.items.slice(0, 4))).catch(() => setNews([]));
  }, []);

  // Cape des aktiven Accounts für die 3D-Vorschau
  const cape = activeCapeFor(cosmetics, account?.uuid);
  useEffect(() => {
    let alive = true;
    if (!cape) {
      setCapeUrl(null);
      return;
    }
    getCapeDataUrl(cape.id).then((u) => alive && setCapeUrl(u)).catch(() => setCapeUrl(null));
    return () => {
      alive = false;
    };
  }, [cape?.id, cape]);

  // Status des aktiven Profils aktualisieren, wenn es wechselt
  useEffect(() => {
    if (!active) return;
    checkInstance(active.id).then(setInstanceStatus).catch(() => {});
  }, [active?.id, active, setInstanceStatus]);

  const recent = useMemo(
    () => [...instances].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)).slice(0, 4),
    [instances]
  );

  const repair = async () => {
    if (!active) return;
    setRepairing(true);
    try {
      const rep = await repairInstance(active.id);
      toast.success("Reparatur abgeschlossen", rep.notes[0]);
      setInstanceStatus(await checkInstance(active.id));
    } catch (e) {
      toast.error("Reparatur fehlgeschlagen", String(e));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="onyx-content chaos-home">
      {/* ---------- Linke Spalte: Spieler ---------- */}
      <section className="chaos-home-player chaos-card">
        <div className="chaos-home-player-3d">
          <SkinViewer3D
            skinUrl={account ? `https://crafatar.com/skins/${account.uuid}` : null}
            capeUrl={capeUrl}
            width={240}
            height={330}
            zoom={0.9}
          />
        </div>
        <div className="chaos-home-player-info">
          {account ? (
            <>
              <span className="chaos-home-player-welcome">{t("home.welcome")}</span>
              <h2 className="chaos-home-player-name">{account.username}</h2>
              <div className="chaos-row chaos-wrap" style={{ gap: 6, marginTop: 6 }}>
                <span className="chaos-badge chaos-badge-accent">Microsoft</span>
                {cape ? <span className="chaos-badge chaos-badge-success">🧥 {cape.name}</span> : <span className="chaos-badge">Kein Cape</span>}
              </div>
              <div className="chaos-row" style={{ gap: 8, marginTop: 14 }}>
                <button className="chaos-btn chaos-btn-sm" onClick={() => navigate("/cosmetics")}>
                  Cosmetics
                </button>
                <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" onClick={() => navigate("/accounts")}>
                  Account
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="chaos-home-player-name">{t("home.noAccount")}</h2>
              <p className="chaos-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Melde dich an, um Skin, Name und Cape zu sehen.
              </p>
              <button className="chaos-btn chaos-btn-primary" style={{ marginTop: 14 }} onClick={() => navigate("/accounts")}>
                {t("home.login")}
              </button>
            </>
          )}
        </div>
      </section>

      {/* ---------- Mitte: Hero ---------- */}
      <section className="chaos-home-hero chaos-card" style={{ ["--profile-color" as string]: active?.iconColor ?? "var(--chaos-accent)" }}>
        <div className="chaos-home-hero-glow" />
        <div className="chaos-home-hero-top">
          <div>
            <span className="chaos-section-label">{t("home.selectedProfile")}</span>
            {active ? (
              <>
                <h1 className="chaos-home-hero-title">{active.name}</h1>
                <div className="chaos-row chaos-wrap" style={{ gap: 6 }}>
                  <span className="chaos-badge chaos-badge-accent">Minecraft {active.mcVersion}</span>
                  <span className="chaos-badge" style={{ textTransform: "capitalize" }}>
                    {active.loader}
                    {active.loaderVersion ? ` ${active.loaderVersion}` : ""}
                  </span>
                  <span className="chaos-badge">{active.mods.filter((m) => m.enabled).length} Mods</span>
                  <span className="chaos-badge">{(active.ramMb / 1024).toFixed(active.ramMb % 1024 ? 1 : 0)} GB RAM</span>
                  {status && (
                    <span className={"chaos-badge " + (status.installed ? "chaos-badge-success" : "chaos-badge-warning")}>
                      {status.installed ? t("startup.installed") : status.neverInstalled ? t("startup.notInstalled") : t("startup.missing")}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <h1 className="chaos-home-hero-title">{t("home.noProfile")}</h1>
                <p className="chaos-muted" style={{ fontSize: 13 }}>
                  Erstelle ein Profil mit Minecraft-Version und Modloader.
                </p>
              </>
            )}
          </div>
          {instances.length > 1 && (
            <select className="onyx-select chaos-home-hero-select" value={active?.id ?? ""} onChange={(e) => setActive(e.target.value)}>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.mcVersion}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="chaos-home-hero-launch">
          {active ? (
            <LaunchPanel instance={active} size="hero" />
          ) : (
            <button className="chaos-launch-btn" style={{ minWidth: 280, minHeight: 80 }} onClick={() => navigate("/profiles")}>
              <span className="chaos-launch-text">{t("home.createProfile")}</span>
            </button>
          )}
        </div>

        <div className="chaos-home-recent">
          <span className="chaos-section-title">{t("home.recent")}</span>
          {recent.length === 0 ? (
            <p className="chaos-faint" style={{ fontSize: 12 }}>
              Noch keine Profile.
            </p>
          ) : (
            <div className="chaos-home-recent-grid">
              {recent.map((i) => (
                <button key={i.id} className={"chaos-home-recent-item" + (i.id === active?.id ? " active" : "")} onClick={() => setActive(i.id)}>
                  <span className="chaos-home-recent-dot" style={{ background: i.iconColor }} />
                  <span className="chaos-col" style={{ gap: 2, minWidth: 0 }}>
                    <strong className="chaos-truncate">{i.name}</strong>
                    <span className="chaos-faint" style={{ fontSize: 11 }}>
                      {i.mcVersion} · {i.loader}
                      {i.playTimeSeconds ? ` · ${formatPlaytime(i.playTimeSeconds)}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------- Rechte Spalte ---------- */}
      <aside className="chaos-home-side">
        {/* Serverstatus */}
        <div className="chaos-card chaos-home-card">
          <div className="chaos-home-card-head">
            <span className="chaos-section-title" style={{ marginBottom: 0 }}>
              {t("home.serverStatus")}
            </span>
            <StatusDot state={!server ? "pending" : server.online ? "online" : "offline"} />
          </div>
          <div className="chaos-home-server">
            <strong>{CHAOSCRAFT.name}</strong>
            <span className={"chaos-home-server-state " + (server?.online ? "on" : "off")}>
              {!server ? t("status.checking") : server.online ? `🟢 ${t("status.online")}` : `🔴 ${t("status.offline")}`}
            </span>
          </div>
          {server?.online ? (
            <div className="chaos-home-server-grid">
              <div>
                <span>{t("status.players")}</span>
                <strong>
                  {server.playersOnline} / {server.playersMax}
                </strong>
              </div>
              <div>
                <span>{t("status.ping")}</span>
                <strong>{server.latencyMs} ms</strong>
              </div>
              <div>
                <span>{t("status.version")}</span>
                <strong className="chaos-truncate">{server.version || "—"}</strong>
              </div>
              <div>
                <span>{t("status.ip")}</span>
                <strong className="chaos-mono chaos-truncate">{address}</strong>
              </div>
            </div>
          ) : (
            <p className="chaos-faint" style={{ fontSize: 12 }}>
              {server?.error ? `Nicht erreichbar: ${server.error}` : address}
            </p>
          )}
          <button className="chaos-btn chaos-btn-sm" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={() => navigate("/servers")}>
            Alle Server
          </button>
        </div>

        {/* Chaoscraft */}
        <div className="chaos-card chaos-home-card chaos-home-chaoscraft">
          <span className="chaos-section-title">{CHAOSCRAFT.name}</span>
          <p className="chaos-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Das offizielle Profil mit Fabric {CHAOSCRAFT.mcVersion} und Performance-Mods. Ein Klick wählt das Profil und startet.
          </p>
          <button className="chaos-btn chaos-btn-primary chaos-btn-lg" style={{ width: "100%", letterSpacing: 2 }} onClick={() => navigate("/chaoscraft")}>
            {t("home.playChaoscraft")}
          </button>
        </div>

        {/* News */}
        <div className="chaos-card chaos-home-card">
          <div className="chaos-home-card-head">
            <span className="chaos-section-title" style={{ marginBottom: 0 }}>
              {t("home.news")}
            </span>
            <button className="chaos-btn chaos-btn-ghost chaos-btn-sm" onClick={() => navigate("/news")}>
              Alle
            </button>
          </div>
          {news === null ? (
            <div className="chaos-col">
              <Skeleton kind="title" />
              <Skeleton kind="text" />
              <Skeleton kind="text" style={{ width: "80%" }} />
            </div>
          ) : (
            <ul className="chaos-home-news">
              {news.map((n) => (
                <li key={n.id} onClick={() => navigate("/news")}>
                  <span className="chaos-home-news-cat">{NEWS_CATEGORY_META[n.category]?.icon ?? "ℹ"}</span>
                  <span className="chaos-col" style={{ gap: 2, minWidth: 0 }}>
                    <strong className="chaos-truncate">{n.title}</strong>
                    <span className="chaos-faint" style={{ fontSize: 11 }}>
                      {formatNewsDate(n.date)} · {NEWS_CATEGORY_META[n.category]?.label ?? n.category}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Download / Update */}
        <div className="chaos-card chaos-home-card">
          <span className="chaos-section-title">{t("home.updates")}</span>
          <ul className="chaos-home-status">
            <li>
              <span>{t("home.launcherVersion")}</span>
              <strong>
                v{appInfo?.version ?? "…"}{" "}
                {update ? <span className="chaos-badge chaos-badge-warning">v{update.version} verfügbar</span> : <span className="chaos-badge chaos-badge-success">aktuell</span>}
              </strong>
            </li>
            <li>
              <span>{t("home.clientVersion")}</span>
              <strong>{appInfo?.clientModVersion ? `Chaos Client ${appInfo.clientModVersion}` : "—"}</strong>
            </li>
            {active && (
              <li>
                <span>Profil-Dateien</span>
                <strong>
                  {status ? (status.installed ? `vollständig · ${formatBytes(status.sizeBytes)}` : status.problems[0] ?? "wird geprüft …") : "wird geprüft …"}
                </strong>
              </li>
            )}
          </ul>
          <div className="chaos-row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {update && (
              <button className="chaos-btn chaos-btn-primary chaos-btn-sm" onClick={() => navigate("/settings?tab=launcher")}>
                Update installieren
              </button>
            )}
            {active && status && !status.installed && !status.neverInstalled && (
              <button className="chaos-btn chaos-btn-sm" disabled={repairing} onClick={repair}>
                {repairing ? "Repariere …" : "Reparieren"}
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function normalize(addr: string): string {
  const a = addr.trim();
  if (/:\d+$/.test(a)) return a;
  return `${a}:25565`;
}

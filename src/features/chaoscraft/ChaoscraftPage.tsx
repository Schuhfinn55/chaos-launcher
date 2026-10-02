/* ============================================================
 * Chaos Launcher - ChaoscraftSMP
 *
 * Status, Spieler, Version, IP, News & Events. Der große Button
 * legt (falls nötig) das Chaoscraft-Profil an, installiert die
 * Mods, wählt es aus und startet Minecraft mit Direktverbindung.
 * ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LaunchPanel from "@/components/LaunchPanel";
import { Empty, ProgressBar, StatusDot } from "@/components/ui";
import { CHAOSCRAFT } from "@/lib/config/chaoscraft";
import { chaoscraftAddress, pingServer } from "@/lib/api/servers";
import { loadNews, formatNewsDate } from "@/lib/api/news";
import { installSlugList } from "@/lib/api/mods";
import { useAccountStore, useInstanceStore, useSettingsStore, useStatusStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { uid } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";
import type { Instance, NewsItem, ServerStatus } from "@/types";
import "./ChaoscraftPage.css";

export default function ChaoscraftPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const add = useInstanceStore((s) => s.add);
  const update = useInstanceStore((s) => s.update);
  const setActive = useInstanceStore((s) => s.setActive);
  const settings = useSettingsStore((s) => s.settings);
  const account = useAccountStore((s) => s.active);
  const setServerStatus = useStatusStore((s) => s.setServerStatus);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [setup, setSetup] = useState<{ running: boolean; text: string; pct: number }>({ running: false, text: "", pct: 0 });
  const [copied, setCopied] = useState(false);
  const address = chaoscraftAddress();

  const profile = useMemo(() => instances.find((i) => i.preset === "chaoscraft") ?? instances.find((i) => i.name.toLowerCase().includes("chaoscraft")) ?? null, [instances]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const s = await pingServer(address);
        if (alive) {
          setStatus(s);
          setServerStatus(s);
        }
      } catch {
        /* egal */
      }
    };
    void run();
    const timer = setInterval(run, 45_000);
    loadNews().then((r) => setNews(r.items.filter((n) => n.category === "server" || n.category === "event")));
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [address, setServerStatus]);

  /** Legt das Chaoscraft-Profil an und installiert die Mods. */
  const ensureProfile = async (): Promise<Instance | null> => {
    if (profile) {
      if (profile.quickServer !== address) await update(profile.id, { quickServer: address });
      setActive(profile.id);
      return { ...profile, quickServer: address };
    }
    setSetup({ running: true, text: "Erstelle Chaoscraft-Profil …", pct: 5 });
    const inst: Instance = {
      id: uid(),
      name: CHAOSCRAFT.profileName,
      mcVersion: CHAOSCRAFT.mcVersion,
      loader: CHAOSCRAFT.loader,
      iconColor: CHAOSCRAFT.profileColor,
      mods: [],
      createdAt: Date.now(),
      ramMb: Math.max(CHAOSCRAFT.ramMb, settings?.defaultRamMb ?? 4096),
      minRamMb: settings?.defaultMinRamMb ?? 2048,
      javaVersion: 21,
      preset: "chaoscraft",
      description: `Offizielles Profil für ${CHAOSCRAFT.name}.`,
      quickServer: address,
    };
    await add(inst);
    setActive(inst.id);
    const total = CHAOSCRAFT.mods.length;
    let done = 0;
    const result = await installSlugList(inst.id, CHAOSCRAFT.mods, (s) => {
      done = Math.min(done + 0.5, total);
      setSetup({ running: true, text: s, pct: 10 + (done / total) * 85 });
    });
    setSetup({ running: false, text: "", pct: 100 });
    if (result.failed.length > 0) {
      toast.warning(`${result.added} Mods installiert`, `Fehlgeschlagen: ${result.failed.join(", ")}`);
    } else {
      toast.success("Chaoscraft-Profil bereit", `${result.added} Mods installiert.`);
    }
    return useInstanceStore.getState().instances.find((i) => i.id === inst.id) ?? inst;
  };

  const [launchTarget, setLaunchTarget] = useState<Instance | null>(profile);
  useEffect(() => setLaunchTarget(profile), [profile]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* egal */
    }
  };

  const events = news.filter((n) => n.category === "event");
  const serverNews = news.filter((n) => n.category === "server");

  return (
    <div className="onyx-content chaos-cc">
      <section className="chaos-card chaos-cc-hero">
        <div className="chaos-cc-hero-bg" />
        <div className="chaos-cc-hero-content">
          <span className="chaos-section-label">Offizieller Server</span>
          <h1 className="chaos-logo-text chaos-wordmark" style={{ fontSize: 40 }}>
            Chaoscraft SMP
          </h1>
          <div className="chaos-row chaos-wrap" style={{ gap: 10 }}>
            <StatusDot state={!status ? "pending" : status.online ? "online" : "offline"} />
            <span className={"chaos-cc-state " + (status?.online ? "on" : "off")}>{!status ? t("status.checking") : status.online ? `🟢 ${t("status.online")}` : `🔴 ${t("status.offline")}`}</span>
            {status?.online && <span className="chaos-badge chaos-badge-accent">{status.playersOnline} / {status.playersMax} Spieler</span>}
            {status?.online && <span className="chaos-badge">{status.version}</span>}
            {status?.online && <span className="chaos-badge">{status.latencyMs} ms</span>}
          </div>
          <p className="chaos-muted" style={{ fontSize: 13, maxWidth: 560 }}>
            {status?.motd || `Spiele mit der Community auf ${CHAOSCRAFT.name}. Das Chaoscraft-Profil bringt Fabric ${CHAOSCRAFT.mcVersion} mit allen empfohlenen Performance-Mods mit und verbindet dich direkt mit dem Server.`}
          </p>
          <div className="chaos-cc-ip">
            <span className="chaos-mono">{address}</span>
            <button className="chaos-btn chaos-btn-sm" onClick={copy}>
              {copied ? t("status.copied") : t("status.copy")}
            </button>
          </div>

          {setup.running ? (
            <div className="chaos-cc-setup">
              <ProgressBar value={setup.pct} label="Chaoscraft-Profil wird eingerichtet" right={`${Math.round(setup.pct)}%`} />
              <span className="chaos-mono chaos-muted" style={{ fontSize: 12 }}>
                {setup.text}
              </span>
            </div>
          ) : launchTarget ? (
            <LaunchPanel instance={launchTarget} size="hero" label={t("home.playChaoscraft")} />
          ) : (
            <button
              className="chaos-launch-btn"
              style={{ minWidth: 320, minHeight: 84 }}
              onClick={async () => {
                if (!account) {
                  toast.warning("Anmeldung nötig", "Melde dich zuerst mit deinem Microsoft-Account an.");
                  navigate("/accounts");
                  return;
                }
                const inst = await ensureProfile();
                setLaunchTarget(inst);
              }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="chaos-launch-text">{t("home.playChaoscraft")}</span>
            </button>
          )}
          {!profile && !setup.running && (
            <p className="chaos-faint" style={{ fontSize: 12 }}>
              Beim ersten Klick wird das Chaoscraft-Profil (Fabric {CHAOSCRAFT.mcVersion}, {CHAOSCRAFT.mods.length} Mods) automatisch erstellt.
            </p>
          )}
        </div>
      </section>

      <div className="chaos-cc-grid">
        <section className="chaos-card chaos-cc-card">
          <span className="chaos-section-title">Chaoscraft-Profil</span>
          {profile ? (
            <>
              <div className="chaos-row" style={{ gap: 10 }}>
                <span className="chaos-dot" style={{ background: profile.iconColor, boxShadow: `0 0 8px ${profile.iconColor}` }} />
                <strong>{profile.name}</strong>
              </div>
              <ul className="chaos-cc-facts">
                <li>
                  <span>Minecraft</span>
                  <strong>{profile.mcVersion}</strong>
                </li>
                <li>
                  <span>Loader</span>
                  <strong style={{ textTransform: "capitalize" }}>{profile.loader} {profile.loaderVersion ?? ""}</strong>
                </li>
                <li>
                  <span>Mods</span>
                  <strong>{profile.mods.filter((m) => m.enabled).length}</strong>
                </li>
                <li>
                  <span>RAM</span>
                  <strong>{(profile.ramMb / 1024).toFixed(1)} GB</strong>
                </li>
              </ul>
              <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
                <button className="chaos-btn chaos-btn-sm" onClick={() => navigate("/mods")}>
                  Mods verwalten
                </button>
                <button className="chaos-btn chaos-btn-sm" onClick={() => navigate("/profiles")}>
                  Profil bearbeiten
                </button>
              </div>
            </>
          ) : (
            <p className="chaos-muted" style={{ fontSize: 13 }}>
              Noch kein Chaoscraft-Profil. Es wird beim ersten Start automatisch angelegt.
            </p>
          )}
        </section>

        <section className="chaos-card chaos-cc-card">
          <span className="chaos-section-title">Server-News</span>
          {serverNews.length === 0 ? (
            <Empty title="Keine Server-News" hint="Trage unter Einstellungen → Chaoscraft eine News-Quelle ein." />
          ) : (
            <ul className="chaos-cc-news">
              {serverNews.map((n) => (
                <li key={n.id}>
                  <strong>{n.title}</strong>
                  <span>{n.summary}</span>
                  <em>{formatNewsDate(n.date)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="chaos-card chaos-cc-card">
          <span className="chaos-section-title">Events</span>
          {events.length === 0 ? (
            <Empty title="Keine Events geplant" hint="Events erscheinen hier, sobald sie in der News-Quelle veröffentlicht werden." />
          ) : (
            <ul className="chaos-cc-news">
              {events.map((n) => (
                <li key={n.id}>
                  <strong>🎉 {n.title}</strong>
                  <span>{n.summary}</span>
                  <em>{formatNewsDate(n.date)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

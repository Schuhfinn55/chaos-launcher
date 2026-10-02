/* ============================================================
 * Chaos Launcher - Server
 * ChaoscraftSMP-Status + eigene Server mit Live-Ping.
 * ============================================================ */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Empty, PageHead, StatusDot } from "@/components/ui";
import { CHAOSCRAFT } from "@/lib/config/chaoscraft";
import { chaoscraftAddress, loadSavedServers, pingServer, pingServers, saveSavedServers, type SavedServer } from "@/lib/api/servers";
import { useInstanceStore, useStatusStore } from "@/stores/useStore";
import { toast } from "@/stores/toastStore";
import { uid } from "@/lib/utils";
import type { ServerStatus } from "@/types";
import { useT } from "@/lib/i18n/useT";
import "./ServersPage.css";

export default function ServersPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const setServerStatus = useStatusStore((s) => s.setServerStatus);
  const [servers, setServers] = useState<SavedServer[]>(loadSavedServers());
  const [status, setStatus] = useState<Record<string, ServerStatus>>({});
  const [chaos, setChaos] = useState<ServerStatus | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const instances = useInstanceStore((s) => s.instances);
  const update = useInstanceStore((s) => s.update);
  const activeId = useInstanceStore((s) => s.activeId);
  const chaosAddr = chaoscraftAddress();

  const refresh = async () => {
    setBusy(true);
    try {
      const [c, list] = await Promise.all([pingServer(chaosAddr), pingServers(servers.map((s) => s.address))]);
      setChaos(c);
      setServerStatus(c);
      const map: Record<string, ServerStatus> = {};
      servers.forEach((s, i) => (map[s.id] = list[i]));
      setStatus(map);
    } catch (e) {
      toast.error("Ping fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers.length, chaosAddr]);

  const add = () => {
    const a = address.trim();
    if (!a) return;
    const next = [...servers, { id: uid(), name: name.trim() || a, address: a }];
    setServers(next);
    saveSavedServers(next);
    setName("");
    setAddress("");
  };
  const remove = (id: string) => {
    const next = servers.filter((s) => s.id !== id);
    setServers(next);
    saveSavedServers(next);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* egal */
    }
  };
  const setQuickJoin = async (addr: string) => {
    if (!activeId) {
      toast.warning("Kein Profil", "Wähle zuerst ein Profil.");
      return;
    }
    const inst = instances.find((i) => i.id === activeId);
    await update(activeId, { quickServer: inst?.quickServer === addr ? "" : addr });
    toast.success(inst?.quickServer === addr ? "Direktverbindung entfernt" : "Direktverbindung gesetzt", inst?.quickServer === addr ? undefined : `${inst?.name} verbindet beim Start mit ${addr}.`);
  };

  const activeInst = instances.find((i) => i.id === activeId);

  return (
    <div className="onyx-content">
      <PageHead
        title={t("nav.servers")}
        subtitle="Live-Status deiner Server. Der Status wird automatisch jede Minute aktualisiert."
        actions={
          <button className="chaos-btn" disabled={busy} onClick={refresh}>
            {busy ? "Prüfe …" : "↻ Aktualisieren"}
          </button>
        }
      />

      {/* Chaoscraft Hero */}
      <section className="chaos-card chaos-srv-hero">
        <div className="chaos-srv-hero-glow" />
        <div className="chaos-srv-hero-main">
          <div className="chaos-row" style={{ gap: 12 }}>
            <StatusDot state={!chaos ? "pending" : chaos.online ? "online" : "offline"} />
            <h2>{CHAOSCRAFT.name}</h2>
            <span className={"chaos-srv-state " + (chaos?.online ? "on" : "off")}>{!chaos ? t("status.checking") : chaos.online ? t("status.online") : t("status.offline")}</span>
          </div>
          <p className="chaos-muted chaos-truncate" style={{ fontSize: 13 }}>
            {chaos?.motd || "Das offizielle Chaoscraft-SMP."}
          </p>
          <div className="chaos-srv-grid">
            <div>
              <span>{t("status.players")}</span>
              <strong>{chaos?.online ? `${chaos.playersOnline} / ${chaos.playersMax}` : "—"}</strong>
            </div>
            <div>
              <span>{t("status.version")}</span>
              <strong>{chaos?.online ? chaos.version : "—"}</strong>
            </div>
            <div>
              <span>{t("status.ping")}</span>
              <strong>{chaos?.online ? `${chaos.latencyMs} ms` : "—"}</strong>
            </div>
            <div>
              <span>{t("status.ip")}</span>
              <strong className="chaos-mono">{chaosAddr}</strong>
            </div>
          </div>
          {chaos?.online && chaos.sample.length > 0 && (
            <p className="chaos-faint" style={{ fontSize: 12 }}>
              Online: {chaos.sample.join(", ")}
            </p>
          )}
          <div className="chaos-row chaos-wrap" style={{ gap: 8 }}>
            <button className="chaos-btn chaos-btn-primary chaos-btn-lg" onClick={() => navigate("/chaoscraft")}>
              {t("home.playChaoscraft")}
            </button>
            <button className="chaos-btn" onClick={() => copy(chaosAddr)}>
              {copied ? t("status.copied") : `IP ${t("status.copy").toLowerCase()}`}
            </button>
          </div>
        </div>
        {chaos?.favicon && <img className="chaos-srv-favicon" src={chaos.favicon} alt="" />}
      </section>

      {/* Eigene Server */}
      <span className="chaos-section-title" style={{ marginTop: 24 }}>
        Eigene Server
      </span>
      <div className="chaos-card chaos-srv-add">
        <input className="chaos-input" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="chaos-input" placeholder="Adresse, z.B. play.beispiel.de:25565" value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="chaos-btn chaos-btn-primary" onClick={add} disabled={!address.trim()}>
          + Hinzufügen
        </button>
      </div>

      {servers.length === 0 ? (
        <Empty icon="🖥" title="Noch keine eigenen Server" hint="Füge Server hinzu, um ihren Status zu sehen und direkt zu verbinden." />
      ) : (
        <div className="chaos-srv-list">
          {servers.map((s) => {
            const st = status[s.id];
            const isQuick = activeInst?.quickServer === s.address;
            return (
              <div key={s.id} className="chaos-card chaos-srv-item">
                <StatusDot state={!st ? "pending" : st.online ? "online" : "offline"} />
                <div className="chaos-col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                  <strong className="chaos-truncate">{s.name}</strong>
                  <span className="chaos-faint chaos-mono" style={{ fontSize: 11 }}>
                    {s.address}
                  </span>
                  {st && <span className="chaos-faint chaos-truncate" style={{ fontSize: 11 }}>{st.online ? st.motd : st.error ?? "offline"}</span>}
                </div>
                <div className="chaos-srv-item-stats">
                  <span>{st?.online ? `${st.playersOnline}/${st.playersMax}` : "—"}</span>
                  <span>{st?.online ? `${st.latencyMs} ms` : ""}</span>
                  <span className="chaos-truncate" style={{ maxWidth: 120 }}>{st?.online ? st.version : ""}</span>
                </div>
                <button className={"chaos-btn chaos-btn-sm" + (isQuick ? " chaos-btn-primary" : "")} title="Beim Start des aktiven Profils direkt verbinden" onClick={() => setQuickJoin(s.address)}>
                  {isQuick ? "Direktstart ✓" : "Direktstart"}
                </button>
                <button className="chaos-btn chaos-btn-sm" onClick={() => copy(s.address)}>
                  IP
                </button>
                <button className="chaos-btn chaos-btn-sm chaos-btn-danger" onClick={() => remove(s.id)}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="chaos-faint" style={{ fontSize: 12, marginTop: 14 }}>
        Tipp: Unter Extras → Freunde kannst du Mitspieler mit ihren Server-IPs verwalten.
      </p>
    </div>
  );
}

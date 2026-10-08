/* ============================================================
 * Chaos Launcher - Freunde
 *
 * Echte Freundesliste über die Chaos-Cosmetics-API: Anfragen senden,
 * annehmen, Online-Status (Launcher offen / im Spiel auf Server X),
 * „Mitspielen“ startet Minecraft direkt auf dem Server des Freundes.
 * Die Namen/UUIDs werden zusätzlich an den Chaos Client übergeben
 * (Freunde werden ingame in der Tab-Liste hervorgehoben).
 * ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { avatarUrl, fetchUuid } from "@/lib/mojang";
import { friendsAction, friendsList } from "@/lib/api/friends";
import { effectiveApiUrl, getRemoteCosmetics, type RemoteCosmetics } from "@/lib/api/cosmetics";
import { hatById } from "@/lib/builtinHats";
import { effectById } from "@/lib/builtinEffects";
import { wingsById } from "@/lib/builtinWings";
import { useAccountStore, useInstanceStore, useSettingsStore } from "@/stores/useStore";
import { setPendingJoin } from "@/stores/joinStore";
import { toast } from "@/stores/toastStore";
import type { FriendEntry, FriendsView } from "@/types";
import "./FriendsPage.css";

const STATE_META: Record<FriendEntry["state"], { label: string; color: string }> = {
  ingame: { label: "Im Spiel", color: "var(--chaos-success, #22c55e)" },
  online: { label: "Launcher offen", color: "#60a5fa" },
  offline: { label: "Offline", color: "var(--chaos-text-dim)" },
};

function timeAgo(ms: number): string {
  if (!ms) return "noch nie gesehen";
  const d = Date.now() - ms;
  if (d < 90_000) return "gerade eben";
  if (d < 3_600_000) return `vor ${Math.round(d / 60_000)} min`;
  if (d < 86_400_000) return `vor ${Math.round(d / 3_600_000)} h`;
  return `vor ${Math.round(d / 86_400_000)} Tagen`;
}

function FriendCosmetics({ uuid }: { uuid: string }) {
  const apiUrl = useSettingsStore((s) => effectiveApiUrl(s.settings));
  const [data, setData] = useState<RemoteCosmetics | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setData(undefined);
    getRemoteCosmetics(uuid).then((d) => alive && setData(d)).catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [uuid, apiUrl]);
  if (data === undefined) return <span className="chaos-faint" style={{ fontSize: 11 }}>Cosmetics werden geladen …</span>;
  if (!data) return <span className="chaos-faint" style={{ fontSize: 11 }}>Keine Cosmetics sichtbar.</span>;
  const hat = hatById(data.hat), effect = effectById(data.effect), wings = wingsById(data.wings);
  return (
    <div className="chaos-row chaos-wrap" style={{ gap: 6 }}>
      <span className="chaos-badge">{data.activeCape ? `🧥 ${data.activeCape.name || "Cape"}` : "🧥 kein Cape"}</span>
      <span className="chaos-badge">{hat ? `${hat.icon} ${hat.name}` : "🎩 kein Hut"}</span>
      <span className="chaos-badge">{wings ? `${wings.icon} ${wings.name}` : "🪽 keine Wings"}</span>
      <span className="chaos-badge">{effect ? `${effect.icon} ${effect.name}` : "✨ kein Effekt"}</span>
    </div>
  );
}

export default function FriendsPage() {
  const navigate = useNavigate();
  const account = useAccountStore((s) => s.active);
  const activeInstanceId = useInstanceStore((s) => s.activeId);
  const [view, setView] = useState<FriendsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      setView(await friendsList(account.uuid));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [account]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: "request" | "accept" | "decline" | "remove", uuid: string, label: string, who = "") => {
    if (!account) return;
    setBusy(true);
    try {
      const r = await friendsAction(account.uuid, action, uuid, who);
      if (action === "request") toast.success(r.accepted ? "Jetzt befreundet" : r.already ? "Schon befreundet" : "Anfrage gesendet", who || label);
      else toast.info(label, who);
      await load();
    } catch (e) {
      toast.error("Fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  const addByName = async () => {
    const n = name.trim();
    if (!n || !account) return;
    setBusy(true);
    try {
      const uuid = (await fetchUuid(n)) ?? "";
      const r = await friendsAction(account.uuid, "request", uuid, n);
      toast.success(r.accepted ? "Jetzt befreundet" : r.already ? "Schon befreundet" : "Anfrage gesendet", n);
      setName("");
      await load();
    } catch (e) {
      toast.error("Anfrage fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  const join = (f: FriendEntry) => {
    if (!f.server) return;
    if (!activeInstanceId) {
      toast.warning("Kein Profil", "Wähle zuerst ein Profil auf der Spielen-Seite.");
      navigate("/play");
      return;
    }
    setPendingJoin(f.server);
    toast.info("Mitspielen", `Nächster Start verbindet direkt mit ${f.server}.`);
    navigate("/play");
  };

  if (!account) {
    return (
      <div className="onyx-page">
        <PageHeader title="Freunde" subtitle="Freundesliste mit Online-Status – für alle, die den Chaos Launcher nutzen." />
        <EmptyState icon="👥" title="Nicht angemeldet" hint="Melde dich mit deinem Minecraft-Account an, um Freunde hinzuzufügen." />
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const friends = (view?.friends ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  const online = friends.filter((f) => f.state !== "offline").length;

  return (
    <div className="onyx-page">
      <PageHeader
        title="Freunde"
        subtitle={`${online} von ${view?.friends.length ?? 0} online · Status wird live über die Chaos-API geteilt.`}
        actions={
          <input className="chaos-input" placeholder="Suchen …" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 180 }} />
        }
      />

      <div className="onyx-card onyx-friend-add">
        <div className="onyx-friend-form">
          <input className="chaos-input" placeholder="Minecraft-Name des Freundes" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addByName()} maxLength={16} />
          <button className="onyx-btn onyx-btn-primary" onClick={addByName} disabled={!name.trim() || busy}>
            {busy ? "…" : "Anfrage senden"}
          </button>
        </div>
        <span className="onyx-friend-hint">Der Freund muss den Chaos Launcher nutzen und bekommt die Anfrage hier unter „Anfragen“. Nimmt er an, seht ihr euch gegenseitig online.</span>
      </div>

      {error && <div className="onyx-toast onyx-toast-warn">Freundesliste nicht erreichbar: {error}</div>}

      {(view?.incoming.length ?? 0) > 0 && (
        <div className="onyx-friend-group">
          <div className="onyx-friend-group-head">
            <span className="onyx-friend-group-dot" style={{ background: "#f5c342" }} />
            <span className="onyx-friend-group-label">Anfragen</span>
            <span className="onyx-friend-group-count">{view!.incoming.length}</span>
          </div>
          {view!.incoming.map((f) => (
            <div key={f.uuid} className="onyx-card onyx-friend">
              <img className="onyx-friend-avatar" src={avatarUrl(f.uuid)} alt="" />
              <div className="onyx-friend-info">
                <span className="onyx-friend-name">{f.name}</span>
                <span className="onyx-friend-meta">möchte mit dir befreundet sein</span>
              </div>
              <div className="chaos-row" style={{ gap: 6 }}>
                <button className="onyx-btn onyx-btn-primary" disabled={busy} onClick={() => act("accept", f.uuid, "Angenommen", f.name)}>Annehmen</button>
                <button className="onyx-btn" disabled={busy} onClick={() => act("decline", f.uuid, "Abgelehnt", f.name)}>Ablehnen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(view?.outgoing.length ?? 0) > 0 && (
        <div className="onyx-friend-group">
          <div className="onyx-friend-group-head">
            <span className="onyx-friend-group-dot" style={{ background: "#60a5fa" }} />
            <span className="onyx-friend-group-label">Gesendete Anfragen</span>
            <span className="onyx-friend-group-count">{view!.outgoing.length}</span>
          </div>
          {view!.outgoing.map((f) => (
            <div key={f.uuid} className="onyx-card onyx-friend">
              <img className="onyx-friend-avatar" src={avatarUrl(f.uuid)} alt="" />
              <div className="onyx-friend-info">
                <span className="onyx-friend-name">{f.name}</span>
                <span className="onyx-friend-meta">wartet auf Antwort</span>
              </div>
              <button className="onyx-btn" disabled={busy} onClick={() => act("decline", f.uuid, "Anfrage zurückgezogen", f.name)}>Zurückziehen</button>
            </div>
          ))}
        </div>
      )}

      {view && friends.length === 0 ? (
        <EmptyState icon="👥" title={q ? "Keine Treffer" : "Noch keine Freunde"} hint={q ? "Anderen Namen probieren." : "Schick oben eine Anfrage an einen Chaos-Spieler."} />
      ) : (
        <div className="onyx-friend-groups">
          {(["ingame", "online", "offline"] as FriendEntry["state"][]).map((state) => {
            const list = friends.filter((f) => f.state === state);
            if (!list.length) return null;
            const meta = STATE_META[state];
            return (
              <div key={state} className="onyx-friend-group">
                <div className="onyx-friend-group-head">
                  <span className="onyx-friend-group-dot" style={{ background: meta.color }} />
                  <span className="onyx-friend-group-label">{meta.label}</span>
                  <span className="onyx-friend-group-count">{list.length}</span>
                </div>
                {list.map((f) => (
                  <div key={f.uuid} className={"onyx-card onyx-friend" + (open === f.uuid ? " open" : "")} onClick={() => setOpen(open === f.uuid ? null : f.uuid)}>
                    <img className="onyx-friend-avatar" src={avatarUrl(f.uuid)} alt="" />
                    <div className="onyx-friend-info">
                      <span className="onyx-friend-name">{f.name}</span>
                      <span className="onyx-friend-status" style={{ color: meta.color }}>
                        {state === "ingame" ? (f.server ? `spielt auf ${f.server}` : "spielt gerade") : state === "online" ? "hat den Launcher offen" : `zuletzt ${timeAgo(f.at)}`}
                      </span>
                      {open === f.uuid && <FriendCosmetics uuid={f.uuid} />}
                    </div>
                    <div className="chaos-row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      {state === "ingame" && f.server && (
                        <button className="onyx-btn onyx-btn-primary" onClick={() => join(f)} title={`Minecraft starten und mit ${f.server} verbinden`}>
                          ▶ Mitspielen
                        </button>
                      )}
                      <button className="onyx-btn" disabled={busy} onClick={() => act("remove", f.uuid, "Entfernt", f.name)}>Entfernen</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

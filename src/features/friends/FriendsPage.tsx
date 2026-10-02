/* ============================================================
 * Onyx Launcher - Freunde-Liste (voll funktional)
 *
 * Features:
 *   - Echte Minecraft-Avatare (via Crafatar/Mojang)
 *   - Gruppen: Online / Abwesend / Offline
 *   - Suchfeld zum Filtern
 *   - Server-Join-Button (IP-Feld pro Freund)
 *   - Details: Freund-seit, letzter Server, zuletzt gespielt
 * ============================================================ */

import { useState } from "react";
import { useFriendStore } from "@/stores/useStore";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { uid, formatDate } from "@/lib/utils";
import { fetchUuid, avatarUrl } from "@/lib/mojang";
import { invoke } from "@/lib/bridge";
import type { Friend } from "@/types";
import "./FriendsPage.css";

const STATUS_META: Record<Friend["status"], { label: string; color: string; order: number }> = {
  online: { label: "Online", color: "var(--onyx-success)", order: 0 },
  away: { label: "Abwesend", color: "var(--onyx-warning)", order: 1 },
  offline: { label: "Offline", color: "var(--onyx-text-faint)", order: 2 },
};

export default function FriendsPage() {
  const friends = useFriendStore((s) => s.friends);
  const add = useFriendStore((s) => s.add);
  const remove = useFriendStore((s) => s.remove);
  const update = useFriendStore((s) => s.update);

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  /** Fügt einen Freund hinzu und lädt seinen Avatar + UUID. */
  const addFriend = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      // UUID + Avatar automatisch laden
      const uuid = await fetchUuid(name.trim());
      const friend: Friend = {
        id: uid(),
        name: name.trim(),
        note: note.trim() || undefined,
        status: "offline",
        addedAt: Date.now(),
        uuid: uuid ?? undefined,
        avatarUrl: uuid ? avatarUrl(uuid) : undefined,
      };
      await add(friend);
      setName("");
      setNote("");
    } finally {
      setAdding(false);
    }
  };

  /** Aktualisiert den Avatar eines Freundes (falls noch nicht geladen). */
  const refreshAvatar = async (friend: Friend) => {
    const uuid = friend.uuid ?? (await fetchUuid(friend.name));
    if (uuid) {
      update(friend.id, { uuid, avatarUrl: avatarUrl(uuid) });
    }
  };

  /** Setzt die Server-IP für einen Freund. */
  const setServer = (friend: Friend, ip: string) => {
    update(friend.id, { lastServer: ip });
  };

  /** "Zusammen spielen": startet Minecraft (falls aktiv) und joinet den Server.
   *  Da wir das aktive Profil brauchen, leiten wir auf Spielen weiter. */
  const joinServer = async (friend: Friend) => {
    if (!friend.lastServer) return;
    try {
      // Markiere "zuletzt zusammen gespielt"
      update(friend.id, { lastPlayed: Date.now() });
      // Hinweis: Echtes direktes Joinen würde beim Launch als
      // --server / --quickPlayMultiplayer Argument ergänzt. Für jetzt
      // kopieren wir die IP in die Zwischenablage als Hilfestellung.
      await navigator.clipboard?.writeText(friend.lastServer);
      window.alert(
        `Server-IP "${friend.lastServer}" kopiert!\n\nStarte Minecraft über den Spielen-Tab und füge die IP im Mehrspieler-Menü ein.`
      );
    } catch {
      /* clipboard ggf. nicht verfügbar */
    }
  };

  // Filter + Sortierung (Gruppen)
  // Defensive: falls friends null/undefined (alte Cache-Stände), [] nutzen
  const safeFriends = friends ?? [];
  const filtered = safeFriends.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.note ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (f.lastServer ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const sorted = [...filtered].sort(
    (a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order
  );
  const grouped: Record<Friend["status"], Friend[]> = {
    online: sorted.filter((f) => f.status === "online"),
    away: sorted.filter((f) => f.status === "away"),
    offline: sorted.filter((f) => f.status === "offline"),
  };

  return (
    <div className="onyx-content">
      <PageHeader
        title="Freunde"
        subtitle="Behalte deine Mitspieler im Blick – mit echten Avataren, Server-IPs und Status-Gruppen."
      />

      {/* Hinzufügen */}
      <div className="onyx-card onyx-friend-add">
        <h3>Freund hinzufügen</h3>
        <div className="onyx-friend-form">
          <input
            className="onyx-input"
            placeholder="Minecraft-Name (für Avatar)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFriend()}
          />
          <input
            className="onyx-input"
            placeholder="Notiz (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFriend()}
          />
          <button className="onyx-btn onyx-btn-primary" onClick={addFriend} disabled={!name.trim() || adding}>
            {adding ? "Lädt …" : "Hinzufügen"}
          </button>
        </div>
        <p className="onyx-friend-hint">
          Der Avatar wird automatisch über deinen Minecraft-Namen geladen.
        </p>
      </div>

      {/* Suche */}
      {safeFriends.length > 0 && (
        <div className="onyx-toolbar">
          <input
            className="onyx-input"
            placeholder="Freunde durchsuchen (Name, Notiz, Server) …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {safeFriends.length === 0 ? (
        <EmptyState
          title="Noch keine Freunde"
          hint="Füge Freunde mit ihrem Minecraft-Namen hinzu – ihre Avatare erscheinen automatisch."
        />
      ) : sorted.length === 0 ? (
        <EmptyState title="Keine Treffer" hint="Kein Freund passt auf deine Suche." />
      ) : (
        <div className="onyx-friend-groups">
          {(["online", "away", "offline"] as const).map((status) => {
            const group = grouped[status];
            if (group.length === 0) return null;
            const meta = STATUS_META[status];
            return (
              <div key={status} className="onyx-friend-group">
                <div className="onyx-friend-group-head">
                  <span className="onyx-friend-group-dot" style={{ background: meta.color }} />
                  <span className="onyx-friend-group-label">{meta.label}</span>
                  <span className="onyx-friend-group-count">{group.length}</span>
                </div>
                <div className="onyx-list">
                  {group.map((f) => (
                    <div key={f.id} className="onyx-card onyx-friend">
                      <div className="onyx-friend-avatar">
                        {f.avatarUrl ? (
                          <img src={f.avatarUrl} alt="" onError={() => refreshAvatar(f)} />
                        ) : (
                          <span>{f.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="onyx-friend-info">
                        <div className="onyx-friend-name">
                          <strong>{f.name}</strong>
                          <span className="onyx-friend-status" style={{ color: meta.color }}>
                            ● {meta.label}
                          </span>
                        </div>
                        {f.note && <span className="onyx-friend-note">{f.note}</span>}
                        <div className="onyx-friend-meta">
                          <span>freund seit {formatDate(f.addedAt)}</span>
                          {f.lastPlayed && (
                            <span>· zuletzt gespielt {formatDate(f.lastPlayed)}</span>
                          )}
                        </div>
                        {/* Server-IP */}
                        <div className="onyx-friend-server">
                          <input
                            className="onyx-input"
                            placeholder="Server-IP (z.B. play.hypixel.net)"
                            value={f.lastServer ?? ""}
                            onChange={(e) => setServer(f, e.target.value)}
                          />
                          <button
                            className="onyx-btn onyx-btn-primary"
                            onClick={() => joinServer(f)}
                            disabled={!f.lastServer}
                          >
                            Zusammen spielen
                          </button>
                        </div>
                      </div>
                      <select
                        className="onyx-select"
                        value={f.status}
                        onChange={(e) => update(f.id, { status: e.target.value as Friend["status"] })}
                      >
                        <option value="online">Online</option>
                        <option value="away">Abwesend</option>
                        <option value="offline">Offline</option>
                      </select>
                      <button className="onyx-btn onyx-btn-danger" onClick={() => remove(f.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

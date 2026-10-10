/* ============================================================
 * Chaos Launcher - Cosmetics › Emotes
 *
 * Alle Emotes mit 3D-Vorschau (Klick), legendäre Emotes per Code,
 * Belegung des Ingame-Emote-Rads (8 Slots). Die Belegung wird im
 * Cosmetics-Profil gespeichert, an den Chaos Client exportiert und mit
 * Änderungen aus dem Spiel abgeglichen (neuester Stand gewinnt).
 * ============================================================ */

import { useEffect, useState } from "react";
import { Empty } from "@/components/ui";
import { CHAOS_EMOTES, DEFAULT_WHEEL, WHEEL_SLOTS, emoteById, isEmoteUnlocked, normalizeWheel, type BuiltinEmote } from "@/lib/builtinEmotes";
import { setEmoteWheel, syncEmoteWheelFromGame } from "@/lib/api/cosmetics";
import { toast } from "@/stores/toastStore";
import type { Account, CosmeticsProfile } from "@/types";
import { RedeemCodeForm } from "./RedeemCodeForm";

interface Props {
  account: Account | null;
  profile: CosmeticsProfile | null;
  busy: boolean;
  onPreview: (id: string | null) => void;
  previewId: string | null;
  onLogin: () => void;
  onChanged: () => Promise<void>;
}

export function EmotesSection(p: Props) {
  const unlocks = p.profile?.unlocks ?? [];
  const wheel = normalizeWheel(p.profile?.emoteWheel);
  const [assigning, setAssigning] = useState<string | null>(null); // Emote-ID, für die ein Slot gewählt wird
  const [saving, setSaving] = useState(false);

  // Beim Öffnen: Änderungen aus dem Spiel übernehmen (Rad ingame getauscht)
  useEffect(() => {
    if (!p.account) return;
    syncEmoteWheelFromGame(p.account.uuid).then((changed) => { if (changed) void p.onChanged(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.account?.uuid]);

  const save = async (ids: string[]) => {
    if (!p.account) return;
    setSaving(true);
    try {
      await setEmoteWheel(p.account.uuid, ids);
      await p.onChanged();
    } catch (e) {
      toast.error("Rad speichern fehlgeschlagen", String(e));
    } finally {
      setSaving(false);
    }
  };

  const assign = async (slot: number, id: string) => {
    const next = [...wheel];
    // Emote darf nur einmal im Rad sein
    for (let i = 0; i < next.length; i++) if (next[i] === id) next[i] = "";
    next[slot] = id;
    setAssigning(null);
    await save(next);
    toast.success("Ins Rad gelegt", `${emoteById(id)?.name} liegt auf Slot ${slot + 1}.`);
  };

  const clear = async (slot: number) => { const next = [...wheel]; next[slot] = ""; await save(next); };

  const legendary = CHAOS_EMOTES.filter((e) => e.exclusive);
  const regular = CHAOS_EMOTES.filter((e) => !e.exclusive);

  return (
    <div className="chaos-cos-section">
      <div className="chaos-row chaos-wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="chaos-section-title">Emotes</span>
        <span className="chaos-badge">{CHAOS_EMOTES.length} Emotes · {legendary.filter((e) => isEmoteUnlocked(e, unlocks)).length}/{legendary.length} legendär freigeschaltet</span>
      </div>
      {!p.account && <Empty icon="🕺" title="Nicht angemeldet" hint="Melde dich an, um dein Emote-Rad zu belegen." action={<button className="chaos-btn chaos-btn-primary" onClick={p.onLogin}>Anmelden</button>} />}
      <p className="chaos-faint" style={{ fontSize: 12, margin: 0 }}>
        Klick = Vorschau in 3D · „Ins Rad“ = Slot im Ingame-Emote-Rad (Taste B) wählen. Im Spiel kannst du das Rad ebenfalls umbelegen – beides bleibt synchron.
      </p>

      {/* ---------- Emote-Rad ---------- */}
      <div className="chaos-card chaos-wheel">
        <div className="chaos-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 13 }}>🎡 Dein Emote-Rad</strong>
          <div className="chaos-row" style={{ gap: 6 }}>
            {assigning && <span className="chaos-badge chaos-badge-accent">Slot für „{emoteById(assigning)?.name}“ wählen …</span>}
            {assigning && <button className="chaos-btn chaos-btn-sm" onClick={() => setAssigning(null)}>Abbrechen</button>}
            <button className="chaos-btn chaos-btn-sm" disabled={!p.account || saving} onClick={() => void save([...DEFAULT_WHEEL])}>Standard</button>
          </div>
        </div>
        <div className="chaos-wheel-slots">
          {Array.from({ length: WHEEL_SLOTS }, (_, i) => {
            const e = emoteById(wheel[i]);
            const locked = e ? !isEmoteUnlocked(e, unlocks) : false;
            return (
              <div key={i} className={"chaos-wheel-slot" + (assigning ? " target" : "") + (locked ? " locked" : "")} onClick={() => { if (assigning) void assign(i, assigning); else if (e) p.onPreview(p.previewId === e.id ? null : e.id); }} title={assigning ? `Slot ${i + 1} belegen` : e ? e.description : "Leer"}>
                <span className="chaos-wheel-num">{i + 1}</span>
                <span className="chaos-wheel-icon">{e ? e.icon : "·"}</span>
                <span className="chaos-wheel-name">{e ? e.name : "Leer"}</span>
                {e && !assigning && <button className="chaos-wheel-x" title="Slot leeren" onClick={(ev) => { ev.stopPropagation(); void clear(i); }}>×</button>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Legendär ---------- */}
      <div className="chaos-legendary">
        <div className="chaos-row chaos-wrap" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <span className="chaos-section-title" style={{ color: "#f5c342" }}>👑 Legendär – nur mit Code</span>
            <p className="chaos-faint" style={{ fontSize: 12, margin: "2px 0 0" }}>Breakdance, Chaos Rave, Helikopter, Levitation, Moonwalk, Drachenbrüllen. Codes gibt es nur vom Chaos-Team.</p>
          </div>
          <RedeemCodeForm account={p.account} busy={p.busy} onUnlocked={p.onChanged} />
        </div>
        <div className="chaos-cos-grid" style={{ marginTop: 10 }}>
          {legendary.map((e) => (
            <EmoteCard key={e.id} emote={e} slot={wheel.indexOf(e.id)} preview={p.previewId === e.id} locked={!isEmoteUnlocked(e, unlocks)} busy={!p.account || saving} assigning={assigning === e.id} onPreview={() => p.onPreview(p.previewId === e.id ? null : e.id)} onAssign={() => setAssigning(assigning === e.id ? null : e.id)} />
          ))}
        </div>
      </div>

      {/* ---------- Alle Emotes ---------- */}
      <span className="chaos-section-title" style={{ marginTop: 6 }}>Alle Emotes</span>
      <div className="chaos-cos-grid">
        {regular.map((e) => (
          <EmoteCard key={e.id} emote={e} slot={wheel.indexOf(e.id)} preview={p.previewId === e.id} locked={false} busy={!p.account || saving} assigning={assigning === e.id} onPreview={() => p.onPreview(p.previewId === e.id ? null : e.id)} onAssign={() => setAssigning(assigning === e.id ? null : e.id)} />
        ))}
      </div>
    </div>
  );
}

function EmoteCard({ emote, slot, preview, locked, busy, assigning, onPreview, onAssign }: { emote: BuiltinEmote; slot: number; preview: boolean; locked: boolean; busy: boolean; assigning: boolean; onPreview: () => void; onAssign: () => void }) {
  return (
    <div className={"chaos-card hoverable chaos-cos-item" + (preview ? " preview" : "") + (emote.exclusive ? " legendary" : "") + (locked ? " locked" : "")} onClick={onPreview}>
      <div className="chaos-cos-item-img emote">
        <span className="chaos-emote-icon">{emote.icon}</span>
        <span className="chaos-emote-meta">{emote.loop ? "∞ Loop" : `${emote.seconds.toFixed(1)}s`}</span>
        {locked && <span className="chaos-lock" title="Nur mit Code">🔒</span>}
        {slot >= 0 && <span className="chaos-emote-slot" title="Im Emote-Rad">Rad {slot + 1}</span>}
      </div>
      <strong>{emote.name}</strong>
      <span className="chaos-faint" style={{ fontSize: 11 }}>{emote.description}</span>
      <div className="chaos-cos-item-actions" onClick={(e) => e.stopPropagation()}>
        {locked ? (
          <span className="chaos-badge" title="Code oben eingeben">🔒 Code nötig</span>
        ) : (
          <button className={"chaos-btn chaos-btn-sm" + (assigning ? "" : " chaos-btn-primary")} disabled={busy} onClick={onAssign}>
            {assigning ? "Slot wählen …" : slot >= 0 ? "Slot ändern" : "Ins Rad"}
          </button>
        )}
      </div>
    </div>
  );
}

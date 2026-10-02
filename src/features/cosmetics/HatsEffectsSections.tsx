/* ============================================================
 * Chaos Launcher - Cosmetics › Hüte & Effekte
 *
 * Vorgefertigte Hüte (3D-Quader am Kopf) und Partikel-Effekte. Auswahl
 * wird pro Account gespeichert (cosmetics.json) und beim Start als
 * chaos-cosmetics/config.json exportiert; der Chaos Client rendert sie
 * ingame. Andere Chaos-Spieler sehen sie über die Cosmetics-API.
 * ============================================================ */

import { Empty } from "@/components/ui";
import { CHAOS_HATS, type BuiltinHat } from "@/lib/builtinHats";
import { CHAOS_EFFECTS, type BuiltinEffect } from "@/lib/builtinEffects";
import type { Account, CosmeticsProfile } from "@/types";

interface Common {
  account: Account | null;
  profile: CosmeticsProfile | null;
  busy: boolean;
  onSelect: (id: string) => Promise<void>;
  onPreview: (id: string | null) => void;
  previewId: string | null;
  onLogin: () => void;
}

export function HatsSection(p: Common) {
  const activeId = p.profile?.hatId ?? "";
  return (
    <div className="chaos-cos-section">
      <div className="chaos-row chaos-wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="chaos-section-title">Hüte</span>
        <div className="chaos-row" style={{ gap: 8 }}>
          <span className="chaos-badge">{activeId ? `Aktiv: ${CHAOS_HATS.find((h) => h.id === activeId)?.name ?? activeId}` : "Kein Hut"}</span>
          {activeId && (
            <button className="chaos-btn chaos-btn-sm" disabled={p.busy || !p.account} onClick={() => p.onSelect("")}>
              Hut abnehmen
            </button>
          )}
        </div>
      </div>
      {!p.account && <Empty icon="🎩" title="Nicht angemeldet" hint="Melde dich an, um einen Hut zu tragen." action={<button className="chaos-btn chaos-btn-primary" onClick={p.onLogin}>Anmelden</button>} />}
      <p className="chaos-faint" style={{ fontSize: 12, margin: 0 }}>
        Klick = Vorschau in 3D · „Tragen“ = ingame aktivieren. Hüte werden vom Chaos Client am Kopf gerendert und folgen jeder Kopfbewegung.
      </p>
      <div className="chaos-cos-grid">
        {CHAOS_HATS.map((h) => (
          <HatCard key={h.id} hat={h} active={h.id === activeId} preview={p.previewId === h.id} busy={p.busy || !p.account} onPreview={() => p.onPreview(p.previewId === h.id ? null : h.id)} onWear={() => p.onSelect(h.id)} />
        ))}
      </div>
    </div>
  );
}

function HatCard({ hat, active, preview, busy, onPreview, onWear }: { hat: BuiltinHat; active: boolean; preview: boolean; busy: boolean; onPreview: () => void; onWear: () => void }) {
  return (
    <div className={"chaos-card hoverable chaos-cos-item" + (active ? " active" : preview ? " preview" : "")} onClick={onPreview}>
      <div className="chaos-cos-item-img hat">
        <HatThumb hat={hat} />
      </div>
      <strong>{hat.icon} {hat.name}</strong>
      <span className="chaos-faint" style={{ fontSize: 11 }}>{hat.description}</span>
      <div className="chaos-cos-item-actions" onClick={(e) => e.stopPropagation()}>
        <button className={"chaos-btn chaos-btn-sm" + (active ? "" : " chaos-btn-primary")} disabled={busy || active} onClick={onWear}>
          {active ? "Getragen" : "Tragen"}
        </button>
      </div>
    </div>
  );
}

/** Isometrische Mini-Vorschau der Quader (ohne WebGL). */
function HatThumb({ hat }: { hat: BuiltinHat }) {
  const sc = 4.2, cx = 48, cy = 58;
  const iso = (x: number, y: number, z: number) => ({ px: cx + (x - z) * sc * 0.87, py: cy + (x + z) * sc * 0.5 + y * sc });
  const shade = (c: string, f: number) => {
    const m = c.replace("#", "");
    const r = Math.round(parseInt(m.slice(0, 2), 16) * f), g = Math.round(parseInt(m.slice(2, 4), 16) * f), b = Math.round(parseInt(m.slice(4, 6), 16) * f);
    return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
  };
  const boxes = [{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, color: "#7a5a3a" }, ...hat.boxes].sort((a, b) => a.y + a.h - (b.y + b.h) || a.x + a.z - (b.x + b.z));
  return (
    <svg viewBox="0 0 96 96" width="96" height="96">
      {boxes.map((b, i) => {
        const x1 = b.x, x2 = b.x + b.w, z1 = b.z, z2 = b.z + b.d, yT = b.y, yB = b.y + b.h;
        const top = [iso(x1, yT, z1), iso(x2, yT, z1), iso(x2, yT, z2), iso(x1, yT, z2)];
        const left = [iso(x1, yT, z2), iso(x2, yT, z2), iso(x2, yB, z2), iso(x1, yB, z2)];
        const right = [iso(x2, yT, z1), iso(x2, yT, z2), iso(x2, yB, z2), iso(x2, yB, z1)];
        const pts = (a: { px: number; py: number }[]) => a.map((q) => `${q.px.toFixed(1)},${q.py.toFixed(1)}`).join(" ");
        return (
          <g key={i}>
            <polygon points={pts(left)} fill={shade(b.color, 0.75)} />
            <polygon points={pts(right)} fill={shade(b.color, 0.55)} />
            <polygon points={pts(top)} fill={shade(b.color, 1.05)} />
          </g>
        );
      })}
    </svg>
  );
}

export function EffectsSection(p: Common) {
  const activeId = p.profile?.effectId ?? "";
  return (
    <div className="chaos-cos-section">
      <div className="chaos-row chaos-wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="chaos-section-title">Effekte</span>
        <div className="chaos-row" style={{ gap: 8 }}>
          <span className="chaos-badge">{activeId ? `Aktiv: ${CHAOS_EFFECTS.find((e) => e.id === activeId)?.name ?? activeId}` : "Kein Effekt"}</span>
          {activeId && (
            <button className="chaos-btn chaos-btn-sm" disabled={p.busy || !p.account} onClick={() => p.onSelect("")}>
              Effekt entfernen
            </button>
          )}
        </div>
      </div>
      {!p.account && <Empty icon="✨" title="Nicht angemeldet" hint="Melde dich an, um einen Effekt zu aktivieren." action={<button className="chaos-btn chaos-btn-primary" onClick={p.onLogin}>Anmelden</button>} />}
      <p className="chaos-faint" style={{ fontSize: 12, margin: 0 }}>
        Partikel-Effekte werden vom Chaos Client um deinen Spieler gerendert – rein kosmetisch, ohne Einfluss auf das Gameplay.
      </p>
      <div className="chaos-cos-grid">
        {CHAOS_EFFECTS.map((e) => (
          <EffectCard key={e.id} effect={e} active={e.id === activeId} preview={p.previewId === e.id} busy={p.busy || !p.account} onPreview={() => p.onPreview(p.previewId === e.id ? null : e.id)} onUse={() => p.onSelect(e.id)} />
        ))}
      </div>
    </div>
  );
}

function EffectCard({ effect, active, preview, busy, onPreview, onUse }: { effect: BuiltinEffect; active: boolean; preview: boolean; busy: boolean; onPreview: () => void; onUse: () => void }) {
  return (
    <div className={"chaos-card hoverable chaos-cos-item" + (active ? " active" : preview ? " preview" : "")} onClick={onPreview}>
      <div className="chaos-cos-item-img effect" style={{ background: `radial-gradient(circle at 50% 60%, ${effect.colors[0]}55, transparent 70%)` }}>
        <span className="chaos-cos-effect-icon">{effect.icon}</span>
        <div className="chaos-cos-effect-dots">
          {effect.colors.map((c, i) => (
            <span key={i} style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
          ))}
        </div>
      </div>
      <strong>{effect.name}</strong>
      <span className="chaos-faint" style={{ fontSize: 11 }}>{effect.description}</span>
      <div className="chaos-cos-item-actions" onClick={(e) => e.stopPropagation()}>
        <button className={"chaos-btn chaos-btn-sm" + (active ? "" : " chaos-btn-primary")} disabled={busy || active} onClick={onUse}>
          {active ? "Aktiv" : "Aktivieren"}
        </button>
      </div>
    </div>
  );
}

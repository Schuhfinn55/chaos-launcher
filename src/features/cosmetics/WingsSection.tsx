/* ============================================================
 * Chaos Launcher - Cosmetics › Wings
 *
 * Animierte Pixel-Art-Flügel am Rücken. Auswahl pro Account
 * (cosmetics.json), Export nach chaos-cosmetics/config.json, Rendering
 * ingame durch den Chaos Client; andere Chaos-Spieler sehen sie über die
 * Cosmetics-API.
 * ============================================================ */

import { Empty } from "@/components/ui";
import { CHAOS_WINGS, WINGS_PLANE, wingsTextureUrl, type BuiltinWings } from "@/lib/builtinWings";
import type { Account, CosmeticsProfile } from "@/types";

interface Props {
  account: Account | null;
  profile: CosmeticsProfile | null;
  busy: boolean;
  onSelect: (id: string) => Promise<void>;
  onPreview: (id: string | null) => void;
  previewId: string | null;
  onLogin: () => void;
}

export function WingsSection(p: Props) {
  const activeId = p.profile?.wingsId ?? "";
  return (
    <div className="chaos-cos-section">
      <div className="chaos-row chaos-wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="chaos-section-title">Wings</span>
        <div className="chaos-row" style={{ gap: 8 }}>
          <span className="chaos-badge">{activeId ? `Aktiv: ${CHAOS_WINGS.find((w) => w.id === activeId)?.name ?? activeId}` : "Keine Wings"}</span>
          {activeId && (
            <button className="chaos-btn chaos-btn-sm" disabled={p.busy || !p.account} onClick={() => p.onSelect("")}>
              Wings ablegen
            </button>
          )}
        </div>
      </div>
      {!p.account && <Empty icon="🪽" title="Nicht angemeldet" hint="Melde dich an, um Wings zu tragen." action={<button className="chaos-btn chaos-btn-primary" onClick={p.onLogin}>Anmelden</button>} />}
      <p className="chaos-faint" style={{ fontSize: 12, margin: 0 }}>
        Klick = animierte 3D-Vorschau · „Anlegen“ = ingame aktivieren. Die Flügel schlagen im Stand ruhig, beim Laufen schneller, spannen sich beim Gleiten weit auf und klappen beim Schleichen ein.
      </p>
      <div className="chaos-cos-grid">
        {CHAOS_WINGS.map((w) => (
          <WingsCard key={w.id} wings={w} active={w.id === activeId} preview={p.previewId === w.id} busy={p.busy || !p.account} onPreview={() => p.onPreview(p.previewId === w.id ? null : w.id)} onWear={() => p.onSelect(w.id)} />
        ))}
      </div>
    </div>
  );
}

function WingsCard({ wings, active, preview, busy, onPreview, onWear }: { wings: BuiltinWings; active: boolean; preview: boolean; busy: boolean; onPreview: () => void; onWear: () => void }) {
  return (
    <div className={"chaos-card hoverable chaos-cos-item" + (active ? " active" : preview ? " preview" : "")} onClick={onPreview}>
      <div className={"chaos-cos-item-img wings" + (wings.glow ? " glow" : "")}>
        <WingsThumb wings={wings} />
      </div>
      <strong>{wings.icon} {wings.name}</strong>
      <span className="chaos-faint" style={{ fontSize: 11 }}>{wings.description}</span>
      <div className="chaos-cos-item-actions" onClick={(e) => e.stopPropagation()}>
        <button className={"chaos-btn chaos-btn-sm" + (active ? "" : " chaos-btn-primary")} disabled={busy || active} onClick={onWear}>
          {active ? "Angelegt" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

/** Pixel-Art-Vorschau: die Textur enthält bereits beide Flügel nebeneinander. */
export function WingsThumb({ wings, scale = 1.6 }: { wings: BuiltinWings; scale?: number }) {
  const url = wingsTextureUrl(wings.id);
  const px = 2; // Texturpixel pro Einheit
  const pairW = WINGS_PLANE.w * 2 * px, pairH = WINGS_PLANE.h * px;
  const texW = WINGS_PLANE.texW * px, texH = WINGS_PLANE.texH * px;
  if (!url) return <span style={{ fontSize: 32 }}>{wings.icon}</span>;
  return (
    <div
      className="chaos-wings-thumb"
      style={{
        width: pairW * scale,
        height: pairH * scale,
        backgroundImage: `url(${url})`,
        backgroundSize: `${texW * scale}px ${texH * scale}px`,
        ["--dur" as string]: `${Math.max(0.8, 0.5 / wings.flapSpeed / 8).toFixed(2)}s`,
      }}
      aria-label={wings.name}
    />
  );
}

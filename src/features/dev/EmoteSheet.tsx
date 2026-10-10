/* ============================================================
 * Chaos Launcher - Dev: Emote-Übersicht
 *
 * Nur im Dev-Modus (#/dev/emotes): rendert jedes Emote in mehreren
 * Momentaufnahmen (offscreen skinview3d) als Bildraster, um fehlerhafte
 * Posen schnell zu erkennen. Nicht Teil des Builds für Nutzer.
 * ============================================================ */

import { useEffect, useState } from "react";
import { SkinViewer, type PlayerObject } from "skinview3d";
import { CHAOS_EMOTES, EmoteAnimation, resetEmotePose } from "@/lib/builtinEmotes";
import steveUrl from "../../assets/steve.png?url";

const FRAMES = [0.12, 0.3, 0.5, 0.7, 0.9];
const SIZE = 200;

interface Row { id: string; name: string; frames: string[] }

export default function EmoteSheet() {
  const [rows, setRows] = useState<Row[]>([]);
  const [angle, setAngle] = useState(0.6);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = document.createElement("canvas");
      const v = new SkinViewer({ canvas, width: SIZE, height: SIZE, renderPaused: true, enableControls: false, preserveDrawingBuffer: true, fov: 45, zoom: 0.8 });
      v.autoRotate = false;
      v.animation = null;
      v.playerObject.cape.visible = false;
      await v.loadSkin(steveUrl, { model: "default" });
      v.playerObject.skin.visible = true;
      v.playerWrapper.rotation.y = angle;
      v.camera.position.set(0, 0, 44);
      v.camera.lookAt(0, -3, 0);
      const out: Row[] = [];
      for (const e of CHAOS_EMOTES) {
        const frames: string[] = [];
        for (const f of FRAMES) {
          const anim = new EmoteAnimation(e);
          anim.progress = e.seconds * f;
          resetEmotePose(v.playerObject);
          (anim as unknown as { animate: (p: PlayerObject, d: number) => void }).animate(v.playerObject, 0);
          v.playerObject.updateMatrixWorld(true);
          v.render();
          frames.push(canvas.toDataURL("image/png"));
        }
        out.push({ id: e.id, name: e.name, frames });
        if (cancelled) return;
        setRows([...out]);
      }
      resetEmotePose(v.playerObject);
      v.dispose();
    })();
    return () => { cancelled = true; };
  }, [angle]);
  return (
    <div style={{ padding: 16, background: "#0b0b0e", color: "#eee", minHeight: "100vh", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <strong>Emote-Übersicht ({rows.length}/{CHAOS_EMOTES.length})</strong>
        <label>Blickwinkel <input type="range" min={-3.14} max={3.14} step={0.1} value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></label>
        <span style={{ opacity: 0.6 }}>Frames bei {FRAMES.map((f) => Math.round(f * 100) + "%").join(", ")} der Dauer</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(1, 1fr)", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ background: "#16161c", borderRadius: 8, padding: 6 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>{r.name} <span style={{ opacity: 0.5 }}>({r.id})</span></div>
            <div style={{ display: "flex", gap: 2 }}>
              {r.frames.map((src, i) => <img key={i} src={src} width={SIZE * 0.6} height={SIZE * 0.6} style={{ background: "#222", borderRadius: 4 }} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

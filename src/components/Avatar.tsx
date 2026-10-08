/* ============================================================
 * Chaos Launcher - Spieler-Avatar (Kopf)
 *
 * Zeichnet das Gesicht (8×8 + Hut-Layer) direkt aus der echten
 * Skin-Textur des Accounts (vom Mojang-Sessionserver geladen) – kein
 * Platzhalter-Steve/Alex mehr. Fallback: Crafatar.
 * ============================================================ */

import { useEffect, useRef } from "react";
import { useProfileSkinStore } from "@/stores/useStore";

interface Props {
  uuid: string | undefined;
  size?: number;
  className?: string;
  title?: string;
}

export default function Avatar({ uuid, size = 32, className, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skin = useProfileSkinStore((s) => (uuid ? s.byUuid[uuid] : undefined));
  const load = useProfileSkinStore((s) => s.load);

  useEffect(() => {
    if (uuid) load(uuid);
  }, [uuid, load]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const s = img.naturalWidth / 64;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 8 * s, 8 * s, 8 * s, 8 * s, 0, 0, size, size);
      // Hut-Layer leicht größer
      const o = size / 16;
      ctx.drawImage(img, 40 * s, 8 * s, 8 * s, 8 * s, -o, -o, size + 2 * o, size + 2 * o);
    };
    img.onerror = () => {
      if (!uuid) return;
      const fb = new Image();
      fb.crossOrigin = "anonymous";
      fb.onload = () => { ctx.clearRect(0, 0, size, size); ctx.drawImage(fb, 0, 0, size, size); };
      fb.src = `https://mc-heads.net/avatar/${uuid}/${Math.max(8, Math.min(512, size * 2))}`;
    };
    img.src = skin?.dataUrl ?? (uuid ? `https://mc-heads.net/skin/${uuid}` : "");
  }, [skin?.dataUrl, uuid, size]);

  return <canvas ref={canvasRef} width={size} height={size} className={className} title={title} style={{ width: size, height: size, imageRendering: "pixelated", borderRadius: Math.round(size * 0.2) }} />;
}

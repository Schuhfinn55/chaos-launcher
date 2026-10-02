/* ============================================================
 * Chaos Launcher - 2D-Vorschau eines Partikel-Effekts
 * Überlagert die 3D-Vorschau mit animierten Partikeln passend zum
 * Muster des Effekts (Ring, Aufsteigen, Umlaufen, Regen, Ausbruch, Füße).
 * ============================================================ */

import { useEffect, useRef } from "react";
import type { BuiltinEffect } from "@/lib/builtinEffects";

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; angle: number; radius: number }

export default function EffectPreview({ effect, width, height }: { effect: BuiltinEffect | null; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !effect) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parts: P[] = [];
    const cx = width / 2, feetY = height * 0.86, headY = height * 0.3;
    let raf = 0, t = 0;
    const spawn = () => {
      const color = effect.colors[Math.floor(Math.random() * effect.colors.length)];
      const base: P = { x: cx, y: feetY, vx: 0, vy: 0, life: 0, max: 60 + Math.random() * 40, size: 2 + Math.random() * 2, color, angle: Math.random() * Math.PI * 2, radius: 40 + Math.random() * 10 };
      switch (effect.pattern) {
        case "ring": base.y = feetY - 6; break;
        case "orbit": base.y = headY + Math.random() * 30; base.radius = 32 + Math.random() * 8; break;
        case "rise": base.x = cx + (Math.random() - 0.5) * 70; base.y = feetY - Math.random() * 20; base.vy = -0.6 - Math.random() * 0.6; base.vx = (Math.random() - 0.5) * 0.3; break;
        case "rain": base.x = cx + (Math.random() - 0.5) * 120; base.y = 0; base.vy = 0.8 + Math.random() * 0.8; base.vx = (Math.random() - 0.5) * 0.4; base.max = 160; break;
        case "burst": base.x = cx + (Math.random() - 0.5) * 20; base.y = headY + Math.random() * (feetY - headY); base.vx = (Math.random() - 0.5) * 2.4; base.vy = (Math.random() - 0.5) * 2.4; base.max = 25 + Math.random() * 15; break;
        case "feet": base.x = cx + (Math.random() - 0.5) * 30; base.y = feetY; base.vy = -0.9 - Math.random() * 0.8; base.vx = (Math.random() - 0.5) * 0.4; base.max = 30 + Math.random() * 20; break;
      }
      parts.push(base);
    };
    const step = () => {
      t++;
      ctx.clearRect(0, 0, width, height);
      if (t % (effect.pattern === "burst" ? 2 : 3) === 0 && parts.length < 90) spawn();
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++;
        if (p.life > p.max) { parts.splice(i, 1); continue; }
        if (effect.pattern === "ring" || effect.pattern === "orbit") {
          p.angle += effect.pattern === "ring" ? 0.04 : 0.06;
          p.x = cx + Math.cos(p.angle) * p.radius;
          p.y = (effect.pattern === "ring" ? feetY - 6 : p.y) + Math.sin(p.angle) * (effect.pattern === "ring" ? 10 : 4) - (effect.pattern === "ring" ? p.life * 0.25 : 0);
        } else { p.x += p.vx; p.y += p.vy; }
        const a = 1 - p.life / p.max;
        ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.2));
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, width, height); };
  }, [effect, width, height]);

  if (!effect) return null;
  return <canvas ref={ref} width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", width, height }} />;
}

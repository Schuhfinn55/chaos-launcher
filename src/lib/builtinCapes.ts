/* ============================================================
 * Chaos Launcher - Eingebaute Cape-Vorlagen
 *
 * Werden per Canvas als 256×128-PNG erzeugt (HD-Cape-Format, 4× des
 * Standard-Layouts 64×32: sichtbare Vorderseite x=1,y=1,10×16 Einheiten).
 * Der Chaos Client rendert HD-Capes genauso wie 64×32, nur schärfer.
 * ============================================================ */

export interface BuiltinCape {
  id: string;
  name: string;
  description: string;
  generate: () => string;
}

/** Skalierung des 64×32-Layouts. 4 → 256×128 (erlaubtes Format). */
const S = 4;
const FW = 10 * S; // Breite der Vorderseite
const FH = 16 * S; // Höhe der Vorderseite

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Zeichnet die Vorderseite über `paint` (Koordinaten 0..w, 0..h) und baut den Rest der Textur. */
function drawCape(paint: Painter): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64 * S;
  canvas.height = 32 * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Vorderseite in eigenem Canvas malen
  const front = document.createElement("canvas");
  front.width = FW;
  front.height = FH;
  const f = front.getContext("2d")!;
  paint(f, FW, FH);
  // Vignette für Tiefe
  const vig = f.createRadialGradient(FW / 2, FH / 2, FH * 0.3, FW / 2, FH / 2, FH * 0.8);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.35)");
  f.fillStyle = vig;
  f.fillRect(0, 0, FW, FH);
  ctx.drawImage(front, 1 * S, 1 * S);

  // Rückseite: abgedunkelte Kopie
  const back = f.getImageData(0, 0, FW, FH);
  for (let i = 0; i < back.data.length; i += 4) {
    back.data[i] = Math.round(back.data[i] * 0.62);
    back.data[i + 1] = Math.round(back.data[i + 1] * 0.62);
    back.data[i + 2] = Math.round(back.data[i + 2] * 0.62);
  }
  ctx.putImageData(back, 12 * S, 1 * S);

  // Kanten (links/rechts/oben/unten) dunkel
  ctx.fillStyle = "#140608";
  ctx.fillRect(0, 1 * S, 1 * S, FH); // linke Kante
  ctx.fillRect(11 * S, 1 * S, 1 * S, FH); // rechte Kante
  ctx.fillRect(1 * S, 0, FW, 1 * S); // oben
  ctx.fillRect(11 * S, 0, FW, 1 * S); // unten
  return canvas.toDataURL("image/png");
}

/* ---------- Hilfsfunktionen ---------- */

function lerpColor(a: string, b: string, t: number): string {
  const pa = hex(a), pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hex(c: string): number[] {
  const m = c.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
/** Deterministischer Zufall (gleiche Vorlage = gleiches Bild). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function vgrad(ctx: CanvasRenderingContext2D, w: number, h: number, stops: string[]) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
function dgrad(ctx: CanvasRenderingContext2D, w: number, h: number, stops: string[]) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
/** Chaos-"C": aufgebrochener Ring. */
function chaosRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, glow?: string) {
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = r * 0.9;
    ctx.strokeStyle = glow;
    ctx.lineWidth = r * 0.42;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.2, Math.PI * 1.8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.34;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.22, Math.PI * 1.78);
  ctx.stroke();
  // Riss durch den Ring
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.3, cy - r * 0.15);
  ctx.lineTo(cx - r * 0.3, cy + r * 0.1);
  ctx.stroke();
  ctx.restore();
}
function trim(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, thick = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, thick);
  ctx.fillRect(0, h - thick, w, thick);
}

/* ---------- Designs ---------- */

const chaosClassic = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#3a0d12", "#1c0608", "#0d0405"]);
    // Rautenmuster
    ctx.fillStyle = "rgba(225,29,46,0.08)";
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) ctx.fillRect(x, y, 4, 4);
    chaosRing(ctx, w / 2, h * 0.42, 9, "#ff2d44", "rgba(225,29,46,0.7)");
    trim(ctx, w, h, "#e11d2e", 2);
  });

const inferno = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#0a0304", "#3b0a0a", "#9a1b12", "#ff6a00", "#ffd166"]);
    const r = rng(7);
    // Flammenzungen von unten
    for (let i = 0; i < 14; i++) {
      const x = r() * w, base = h, top = h * (0.35 + r() * 0.35);
      const g = ctx.createLinearGradient(0, top, 0, base);
      g.addColorStop(0, "rgba(255,230,120,0)");
      g.addColorStop(0.5, "rgba(255,120,30,0.55)");
      g.addColorStop(1, "rgba(255,60,20,0.9)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 4, base);
      ctx.quadraticCurveTo(x - 2, top + 10, x, top);
      ctx.quadraticCurveTo(x + 2, top + 10, x + 4, base);
      ctx.fill();
    }
    // Glut-Funken
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(255,${180 + Math.floor(r() * 60)},80,${0.5 + r() * 0.5})`;
      ctx.fillRect(Math.floor(r() * w), Math.floor(h * 0.2 + r() * h * 0.7), 1, 1);
    }
  });

const lightning = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#07070a", "#111118", "#07070a"]);
    const r = rng(21);
    const bolt = (x: number, color: string, width: number, glow: number) => {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "miter";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      let cx = x;
      for (let y = 6; y <= h; y += 6) {
        cx += (r() - 0.5) * 9;
        ctx.lineTo(cx, y);
      }
      ctx.stroke();
      ctx.restore();
    };
    bolt(w * 0.55, "rgba(225,29,46,0.6)", 4, 10);
    bolt(w * 0.55, "#ff4d5e", 1.5, 6);
    bolt(w * 0.25, "rgba(255,120,130,0.35)", 1, 4);
    trim(ctx, w, h, "#2a1014", 1);
  });

const galaxy = () =>
  drawCape((ctx, w, h) => {
    dgrad(ctx, w, h, ["#120318", "#3b0a3f", "#8a1538", "#1a0a2e"]);
    const r = rng(99);
    // Nebel
    for (let i = 0; i < 6; i++) {
      const g = ctx.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 14 + r() * 16);
      g.addColorStop(0, `rgba(${200 + r() * 55},${40 + r() * 60},${120 + r() * 100},0.35)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // Sterne
    for (let i = 0; i < 70; i++) {
      const a = 0.4 + r() * 0.6;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      const x = Math.floor(r() * w), y = Math.floor(r() * h);
      ctx.fillRect(x, y, 1, 1);
      if (r() > 0.85) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
    }
  });

const neon = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#05050a", "#0b0b14"]);
    // Gitterlinien
    ctx.strokeStyle = "rgba(225,29,46,0.25)";
    ctx.lineWidth = 1;
    for (let y = 8; y < h; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 8; x < w; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    // Neon-C
    chaosRing(ctx, w / 2, h * 0.45, 10, "#ff3b4e", "rgba(255,59,78,0.9)");
    // Neon-Saum
    ctx.save();
    ctx.shadowColor = "#ff3b4e";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ff3b4e";
    ctx.fillRect(0, h - 3, w, 2);
    ctx.restore();
  });

const bloodMoon = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#0a0608", "#1c0a10", "#0a0608"]);
    const g = ctx.createRadialGradient(w / 2, h * 0.32, 2, w / 2, h * 0.32, 13);
    g.addColorStop(0, "#ff5a5a");
    g.addColorStop(0.6, "#b3121f");
    g.addColorStop(0.75, "#5a0a12");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Wolkenstreifen
    ctx.fillStyle = "rgba(10,6,8,0.75)";
    ctx.fillRect(0, h * 0.3, w, 2);
    ctx.fillRect(4, h * 0.36, w - 8, 1);
    // Silhouette (Berge)
    ctx.fillStyle = "#07040a";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.7);
    ctx.lineTo(w * 0.2, h * 0.58);
    ctx.lineTo(w * 0.4, h * 0.68);
    ctx.lineTo(w * 0.6, h * 0.55);
    ctx.lineTo(w * 0.8, h * 0.66);
    ctx.lineTo(w, h * 0.6);
    ctx.lineTo(w, h);
    ctx.fill();
  });

const carbon = () =>
  drawCape((ctx, w, h) => {
    ctx.fillStyle = "#141417";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const odd = ((x + y) / 4) % 2 === 0;
        ctx.fillStyle = odd ? "#1f1f24" : "#0e0e11";
        ctx.fillRect(x, y, 4, 4);
        ctx.fillStyle = odd ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)";
        ctx.fillRect(x, y, 4, 1);
      }
    }
    // roter Diagonalstreifen
    ctx.fillStyle = "#e11d2e";
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w, 7);
    ctx.lineTo(0, h);
    ctx.lineTo(0, h - 7);
    ctx.fill();
  });

const goldElite = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#1a1206", "#0f0a04", "#1a1206"]);
    // Ornamentrahmen
    ctx.strokeStyle = "#f5c342";
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = "rgba(245,195,66,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // Krone
    ctx.fillStyle = "#f5c342";
    const cx = w / 2, cy = h * 0.42;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 6);
    ctx.lineTo(cx - 10, cy - 4);
    ctx.lineTo(cx - 5, cy + 1);
    ctx.lineTo(cx, cy - 8);
    ctx.lineTo(cx + 5, cy + 1);
    ctx.lineTo(cx + 10, cy - 4);
    ctx.lineTo(cx + 10, cy + 6);
    ctx.fill();
    ctx.fillStyle = "#e11d2e";
    ctx.fillRect(cx - 8, cy + 3, 16, 2);
    ctx.fillStyle = "#fff1b8";
    ctx.fillRect(cx - 1, cy - 9, 2, 2);
  });

const toxic = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#06110a", "#0b2412", "#06110a"]);
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const x = r() * w, y = r() * h, rad = 3 + r() * 6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(120,255,80,0.8)");
      g.addColorStop(1, "rgba(60,200,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Totenkopf-Symbol minimalistisch
    ctx.fillStyle = "#b6ff5c";
    const cx = w / 2, cy = h * 0.45;
    ctx.fillRect(cx - 5, cy - 6, 10, 8);
    ctx.fillRect(cx - 3, cy + 2, 6, 3);
    ctx.fillStyle = "#06110a";
    ctx.fillRect(cx - 3, cy - 3, 2, 2);
    ctx.fillRect(cx + 1, cy - 3, 2, 2);
    ctx.fillRect(cx - 1, cy, 2, 1);
  });

const ocean = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#03203a", "#0b4f78", "#0ea5c9", "#67e8f9"]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const y = h * 0.35 + i * 9;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 3 + i) * 2.2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 0, w, h * 0.12);
  });

const aurora = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#030711", "#0a1230", "#030711"]);
    const bands = ["rgba(34,197,94,0.55)", "rgba(56,189,248,0.5)", "rgba(168,85,247,0.5)", "rgba(225,29,46,0.4)"];
    bands.forEach((c, i) => {
      ctx.save();
      ctx.filter = "blur(2px)";
      ctx.strokeStyle = c;
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let x = -4; x <= w + 4; x += 2) ctx.lineTo(x, h * 0.25 + i * 9 + Math.sin(x / 6 + i) * 5);
      ctx.stroke();
      ctx.restore();
    });
    const r = rng(3);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
  });

const chaoscraft = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#0b0b0e", "#151518", "#0b0b0e"]);
    // Rot/Schwarz Split
    ctx.fillStyle = "#e11d2e";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h * 0.22);
    ctx.lineTo(0, h * 0.4);
    ctx.fill();
    ctx.fillStyle = "#8f1b22";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.4);
    ctx.lineTo(w, h * 0.22);
    ctx.lineTo(w, h * 0.28);
    ctx.lineTo(0, h * 0.46);
    ctx.fill();
    chaosRing(ctx, w / 2, h * 0.68, 8, "#ffffff", "rgba(225,29,46,0.8)");
    ctx.fillStyle = "#e11d2e";
    ctx.fillRect(0, h - 3, w, 3);
  });

const pixelCamo = () =>
  drawCape((ctx, w, h) => {
    const r = rng(42);
    const cols = ["#e11d2e", "#7a0f17", "#2a0b0f", "#141416", "#3a3a40"];
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { ctx.fillStyle = cols[Math.floor(r() * cols.length)]; ctx.fillRect(x, y, 4, 4); }
  });

const shadow = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#000000", "#0a0a0c", "#000000"]);
    const r = rng(77);
    ctx.fillStyle = "rgba(225,29,46,0.18)";
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1 + Math.floor(r() * 3));
    // Augen
    ctx.save();
    ctx.shadowColor = "#ff2d44";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#ff2d44";
    ctx.fillRect(w / 2 - 7, h * 0.38, 4, 2);
    ctx.fillRect(w / 2 + 3, h * 0.38, 4, 2);
    ctx.restore();
  });

const onyx = () =>
  drawCape((ctx, w, h) => {
    vgrad(ctx, w, h, ["#042f3f", "#0891b2", "#22d3ee", "#a5f3fc"]);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 11 + 3, w, 1);
  });

const amethyst = () =>
  drawCape((ctx, w, h) => {
    dgrad(ctx, w, h, ["#1e1b4b", "#6d28d9", "#a78bfa", "#ede9fe"]);
    // Kristall-Facetten
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo((i * 9) % w, 0); ctx.lineTo(((i * 9) % w) + 14, h); ctx.stroke(); }
  });

export const CHAOS_CAPES: BuiltinCape[] = [
  { id: "chaos-classic", name: "Chaos Cape", description: "Dunkelrot, Rautenmuster, Chaos-C", generate: chaosClassic },
  { id: "chaoscraft", name: "Chaoscraft", description: "Rot/Schwarz-Split mit weißem C", generate: chaoscraft },
  { id: "inferno", name: "Inferno", description: "Flammen und Glut", generate: inferno },
  { id: "lightning", name: "Red Lightning", description: "Blitz auf Schwarz", generate: lightning },
  { id: "neon", name: "Neon Grid", description: "Leuchtendes Gitter + Neon-C", generate: neon },
  { id: "blood-moon", name: "Blood Moon", description: "Blutmond über Bergen", generate: bloodMoon },
  { id: "galaxy", name: "Galaxy", description: "Nebel und Sterne", generate: galaxy },
  { id: "aurora", name: "Aurora", description: "Polarlichter", generate: aurora },
  { id: "carbon", name: "Carbon", description: "Carbon mit rotem Streifen", generate: carbon },
  { id: "gold-elite", name: "Gold Elite", description: "Goldrahmen und Krone", generate: goldElite },
  { id: "toxic", name: "Toxic", description: "Giftgrün mit Schädel", generate: toxic },
  { id: "shadow", name: "Shadow", description: "Schwarz mit glühenden Augen", generate: shadow },
  { id: "pixel-camo", name: "Pixel Camo", description: "Rot-schwarze Pixel-Tarnung", generate: pixelCamo },
  { id: "ocean", name: "Ocean", description: "Wellen in Blau", generate: ocean },
  { id: "amethyst", name: "Amethyst", description: "Lila Kristall", generate: amethyst },
  { id: "onyx", name: "Onyx Legacy", description: "Cyan-Erinnerung", generate: onyx },
];

/** Kompatibilität zum alten Namen. */
export const BUILTIN_CAPES = CHAOS_CAPES;

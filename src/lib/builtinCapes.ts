/* ============================================================
 * Chaos Launcher - Eingebaute Cape-Vorlagen
 * Werden per Canvas als 64×32-PNG erzeugt (Standard-Cape-Format,
 * sichtbare Vorderseite x=1,y=1,10×16) und auf Wunsch in die
 * Bibliothek importiert.
 * ============================================================ */

export interface BuiltinCape {
  id: string;
  name: string;
  description: string;
  generate: () => string;
}

function drawCape(draw: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, 64, 32);
  // Rückseite (x=12,y=1) und Ränder leicht füllen, damit das Cape rundum sichtbar ist
  draw(ctx);
  // Rückseite als abgedunkelte Kopie der Vorderseite
  const front = ctx.getImageData(1, 1, 10, 16);
  for (let i = 0; i < front.data.length; i += 4) {
    front.data[i] = Math.round(front.data[i] * 0.7);
    front.data[i + 1] = Math.round(front.data[i + 1] * 0.7);
    front.data[i + 2] = Math.round(front.data[i + 2] * 0.7);
  }
  ctx.putImageData(front, 12, 1);
  // Seiten/Ober-/Unterkanten
  ctx.fillStyle = "rgba(20,8,10,1)";
  ctx.fillRect(0, 1, 1, 16);
  ctx.fillRect(11, 1, 1, 16);
  ctx.fillRect(1, 0, 10, 1);
  ctx.fillRect(11, 0, 10, 1);
  // Elytra-Bereich (x=22..) neutral
  return canvas.toDataURL("image/png");
}

function gradientCape(colors: string[], accent?: string): string {
  return drawCape((ctx) => {
    const grad = ctx.createLinearGradient(1, 1, 11, 17);
    colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillRect(1, 1, 10, 16);
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(1, 1, 10, 2);
    }
  });
}

/** Chaos-"C": aufgebrochener Ring in der Mitte. */
function chaosCape(bg: string, ring: string, glow: string): string {
  return drawCape((ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(1, 1, 10, 16);
    ctx.fillStyle = glow;
    ctx.fillRect(3, 5, 6, 8);
    ctx.fillStyle = ring;
    // C-Form
    ctx.fillRect(4, 5, 4, 1);
    ctx.fillRect(3, 6, 1, 6);
    ctx.fillRect(4, 12, 4, 1);
    ctx.fillRect(8, 5, 1, 2);
    ctx.fillRect(8, 11, 1, 2);
    // Riss
    ctx.fillStyle = bg;
    ctx.fillRect(3, 8, 2, 1);
  });
}

function boltCape(bg: string, bolt: string): string {
  return drawCape((ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(1, 1, 10, 16);
    ctx.fillStyle = bolt;
    ctx.fillRect(6, 2, 2, 5);
    ctx.fillRect(5, 6, 4, 2);
    ctx.fillRect(4, 8, 5, 1);
    ctx.fillRect(5, 9, 2, 5);
    ctx.fillRect(4, 12, 3, 2);
  });
}

function stripedCape(colors: string[]): string {
  return drawCape((ctx) => {
    const h = Math.floor(16 / colors.length);
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(1, 1 + i * h, 10, h);
    });
  });
}

function checkerCape(c1: string, c2: string): string {
  return drawCape((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 10; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? c1 : c2;
        ctx.fillRect(1 + x, 1 + y, 1, 1);
      }
    }
  });
}

export const CHAOS_CAPES: BuiltinCape[] = [
  { id: "chaos-classic", name: "Chaos Cape", description: "Dunkelrot mit Chaos-C", generate: () => chaosCape("#2a0b0f", "#e11d2e", "#5b1015") },
  { id: "chaos-ember", name: "Ember", description: "Glut-Verlauf", generate: () => gradientCape(["#2a0b0f", "#8f1b22", "#e11d2e", "#ff5c6c"], "#ffd6da") },
  { id: "chaos-bolt", name: "Red Energy", description: "Schwarz mit rotem Blitz", generate: () => boltCape("#0c0a0c", "#ff3b4e") },
  { id: "chaos-night", name: "Blackout", description: "Tiefschwarz, roter Saum", generate: () => gradientCape(["#050506", "#111114", "#1a0608"], "#e11d2e") },
  { id: "chaos-stripes", name: "Stripes", description: "Rot-Schwarz gestreift", generate: () => stripedCape(["#e11d2e", "#0c0a0c", "#8f1b22", "#0c0a0c"]) },
  { id: "chaos-checker", name: "Checker", description: "Schachbrett", generate: () => checkerCape("#e11d2e", "#1a0608") },
  { id: "onyx", name: "Onyx Legacy", description: "Cyan-Erinnerung", generate: () => gradientCape(["#065f7a", "#0891b2", "#22d3ee", "#7dd3fc"], "#cffafe") },
  { id: "amethyst", name: "Amethyst", description: "Lila-Verlauf", generate: () => gradientCape(["#312e81", "#6366f1", "#a78bfa", "#c4b5fd"]) },
];

/** Kompatibilität zum alten Namen. */
export const BUILTIN_CAPES = CHAOS_CAPES;

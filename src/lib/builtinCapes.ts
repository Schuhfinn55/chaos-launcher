/* ============================================================
 * Onyx Launcher - Eingebaute Cape-Bibliothek
 *
 * Stellt vorgefertigte Capes zur Verfügung, die der Benutzer
 * ohne Upload sofort nutzen kann. Die Capes werden als Canvas-
 * PNGs generiert (64×32, Standard-Minecraft-Cape-Format).
 * ============================================================ */

export interface BuiltinCape {
  id: string;
  name: string;
  /** Beschreibung/Farbe des Capes */
  description: string;
  /** Generiert die Cape-PNG als Data-URL. */
  generate: () => string;
}

/**
 * Zeichnet ein Cape auf einen Canvas und gibt es als PNG-Data-URL zurück.
 * Cape-Format: 64×32 Pixel (Standard Minecraft).
 * Der sichtbare Cape-Bereich ist 10×16 (x=1, y=1).
 */
function drawCape(draw: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Transparenter Hintergrund
  ctx.clearRect(0, 0, 64, 32);

  // Cape-Bereich (x=1, y=1, 10×16) mit Zeichnung füllen
  draw(ctx);

  return canvas.toDataURL("image/png");
}

/** Füllt den Cape-Bereich mit einem Farbverlauf. */
function gradientCape(colors: string[], accent?: string): string {
  return drawCape((ctx) => {
    const grad = ctx.createLinearGradient(1, 1, 11, 17);
    colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillRect(1, 1, 10, 16);

    // Akzent-Streifen oben
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(1, 1, 10, 2);
    }
  });
}

/** Zeichnet ein Cape mit Schachbrett-Muster. */
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

/** Zeichnet ein Cape mit Onyx-Logo (Blitz). */
function boltCape(bg: string, bolt: string): string {
  return drawCape((ctx) => {
    // Hintergrund
    ctx.fillStyle = bg;
    ctx.fillRect(1, 1, 10, 16);
    // Blitz in der Mitte
    ctx.fillStyle = bolt;
    // Vereinfachter Blitz
    ctx.fillRect(5, 2, 2, 5);
    ctx.fillRect(4, 4, 4, 3);
    ctx.fillRect(3, 7, 6, 2);
    ctx.fillRect(5, 9, 2, 5);
    ctx.fillRect(4, 11, 4, 3);
  });
}

/** Zeichnet ein gestreiftes Cape. */
function stripedCape(colors: string[]): string {
  return drawCape((ctx) => {
    const stripeH = Math.floor(16 / colors.length);
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(1, 1 + i * stripeH, 10, stripeH);
    });
  });
}

/** Eingebaute Capes. */
export const BUILTIN_CAPES: BuiltinCape[] = [
  {
    id: "onyx-classic",
    name: "Onyx Classic",
    description: "Cyan-Gradient im Onyx-Stil",
    generate: () => gradientCape(["#065f7a", "#0891b2", "#22d3ee", "#7dd3fc"], "#cffafe"),
  },
  {
    id: "onyx-bolt",
    name: "Onyx Bolt",
    description: "Dunkler Hintergrund mit Blitz",
    generate: () => boltCape("#0b1f29", "#22d3ee"),
  },
  {
    id: "onyx-deep",
    name: "Onyx Deep",
    description: "Tiefes Cyan-Meer",
    generate: () => gradientCape(["#06141a", "#065f7a", "#0891b2"]),
  },
  {
    id: "onyx-glow",
    name: "Onyx Glow",
    description: "Leuchtendes Cyan-Weiß",
    generate: () => gradientCape(["#0891b2", "#22d3ee", "#cffafe", "#ffffff"]),
  },
  {
    id: "rainbow",
    name: "Rainbow",
    description: "Bunter Regenbogen",
    generate: () => stripedCape(["#f87171", "#fbbf24", "#4ade80", "#22d3ee", "#a78bfa", "#f472b6"]),
  },
  {
    id: "checker-cyan",
    name: "Cyan Checker",
    description: "Schachbrett in Cyan",
    generate: () => checkerCape("#22d3ee", "#065f7a"),
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Sonnenuntergang-Gradient",
    generate: () => gradientCape(["#7c2d12", "#dc2626", "#f59e0b", "#fcd34d"]),
  },
  {
    id: "forest",
    name: "Forest",
    description: "Wald-Grün-Töne",
    generate: () => gradientCape(["#14532d", "#16a34a", "#4ade80"]),
  },
  {
    id: "amethyst",
    name: "Amethyst",
    description: "Lila-Gradient",
    generate: () => gradientCape(["#312e81", "#6366f1", "#a78bfa", "#c4b5fd"]),
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Mitternachts-Blau",
    generate: () => gradientCape(["#020617", "#1e3a8a", "#3b82f6"]),
  },
];

/**
 * Liefert alle eingebauten Capes mit generierten Data-URLs.
 * Wird beim Start der SkinsPage aufgerufen.
 */
export function getBuiltinCapes(): Array<{ id: string; name: string; description: string; dataUrl: string }> {
  return BUILTIN_CAPES.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    dataUrl: c.generate(),
  }));
}

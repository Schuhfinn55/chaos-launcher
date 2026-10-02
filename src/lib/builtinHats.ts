/* ============================================================
 * Chaos Launcher - Vorgefertigte Hüte
 *
 * Jeder Hut besteht aus wenigen farbigen Quadern in Kopf-Koordinaten
 * (Minecraft-Modellraum: Kopf = x −4..4, y −8..0 (oben = negativ),
 * z −4..4, Einheit 1 = 1/16 Block). Dieselbe Definition ist im Chaos
 * Client (HatCatalog.java) hinterlegt – Launcher-Vorschau und Spiel
 * zeigen damit exakt denselben Hut.
 * ============================================================ */

export interface HatBox {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
}

export interface BuiltinHat {
  id: string;
  name: string;
  description: string;
  icon: string;
  boxes: HatBox[];
}

const B = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): HatBox => ({ x, y, z, w, h, d, color });

export const CHAOS_HATS: BuiltinHat[] = [
  {
    id: "top-hat", name: "Zylinder", description: "Klassischer schwarzer Zylinder mit rotem Band.", icon: "🎩",
    boxes: [B(-6, -9, -6, 12, 1, 12, "#111113"), B(-4, -16, -4, 8, 7, 8, "#1a1a1e"), B(-4.3, -11, -4.3, 8.6, 2, 8.6, "#e11d2e")],
  },
  {
    id: "chaos-crown", name: "Chaos-Krone", description: "Schwarze Krone mit roten Zacken.", icon: "👑",
    boxes: [B(-4.5, -11, -4.5, 9, 3, 9, "#1a0a0d"), B(-4.5, -13, -4.5, 2, 2, 2, "#e11d2e"), B(2.5, -13, -4.5, 2, 2, 2, "#e11d2e"), B(-4.5, -13, 2.5, 2, 2, 2, "#e11d2e"), B(2.5, -13, 2.5, 2, 2, 2, "#e11d2e"), B(-1, -14, -4.5, 2, 3, 1, "#ff4d5e")],
  },
  {
    id: "gold-crown", name: "Goldkrone", description: "Königliche Krone aus Gold.", icon: "👑",
    boxes: [B(-4.5, -11, -4.5, 9, 3, 9, "#f5c342"), B(-4.5, -13, -4.5, 2, 2, 2, "#f5c342"), B(2.5, -13, -4.5, 2, 2, 2, "#f5c342"), B(-4.5, -13, 2.5, 2, 2, 2, "#f5c342"), B(2.5, -13, 2.5, 2, 2, 2, "#f5c342"), B(-1, -13, -4.6, 2, 2, 1, "#e11d2e")],
  },
  {
    id: "halo", name: "Heiligenschein", description: "Leuchtender Ring über dem Kopf.", icon: "😇",
    boxes: [B(-4, -11, -4, 8, 0.6, 1, "#fff1b8"), B(-4, -11, 3, 8, 0.6, 1, "#fff1b8"), B(-4, -11, -3, 1, 0.6, 6, "#fff1b8"), B(3, -11, -3, 1, 0.6, 6, "#fff1b8")],
  },
  {
    id: "horns", name: "Teufelshörner", description: "Zwei rote Hörner.", icon: "😈",
    boxes: [B(-4.5, -10, -1, 2, 2, 2, "#8f1b22"), B(-4, -12, -0.5, 1.4, 2, 1.4, "#e11d2e"), B(-3.6, -13.5, -0.2, 0.8, 1.6, 0.8, "#ff6b6b"), B(2.5, -10, -1, 2, 2, 2, "#8f1b22"), B(2.6, -12, -0.5, 1.4, 2, 1.4, "#e11d2e"), B(2.8, -13.5, -0.2, 0.8, 1.6, 0.8, "#ff6b6b")],
  },
  {
    id: "wizard", name: "Zaubererhut", description: "Spitzhut in Mitternachtsrot.", icon: "🧙",
    boxes: [B(-6.5, -9, -6.5, 13, 1, 13, "#2a0b0f"), B(-4, -13, -4, 8, 4, 8, "#3a0d12"), B(-3, -16, -3, 6, 3, 6, "#3a0d12"), B(-2, -18.5, -2, 4, 2.5, 4, "#3a0d12"), B(-1, -20.5, -1, 2, 2, 2, "#e11d2e")],
  },
  {
    id: "cap", name: "Chaos-Cap", description: "Rote Baseballcap mit schwarzem Schild.", icon: "🧢",
    boxes: [B(-4.5, -9.5, -4.5, 9, 2.5, 9, "#e11d2e"), B(-4, -7, -8, 8, 0.8, 4, "#111113"), B(-0.6, -10.2, -0.6, 1.2, 0.8, 1.2, "#111113")],
  },
  {
    id: "headphones", name: "Kopfhörer", description: "Gaming-Headset mit rotem Licht.", icon: "🎧",
    boxes: [B(-4.5, -9.5, -1, 9, 1, 2, "#111113"), B(-5.6, -6, -1.6, 1.6, 4, 3.2, "#1a1a1e"), B(4, -6, -1.6, 1.6, 4, 3.2, "#1a1a1e"), B(-5.9, -5, -0.6, 0.4, 2, 1.2, "#e11d2e"), B(5.5, -5, -0.6, 0.4, 2, 1.2, "#e11d2e")],
  },
  {
    id: "bunny", name: "Hasenohren", description: "Zwei lange Ohren.", icon: "🐰",
    boxes: [B(-3.5, -15, -0.6, 2, 7, 1.2, "#f4f1f2"), B(-3, -14, -0.3, 1, 5, 0.6, "#f9a8b8"), B(1.5, -15, -0.6, 2, 7, 1.2, "#f4f1f2"), B(2, -14, -0.3, 1, 5, 0.6, "#f9a8b8")],
  },
  {
    id: "viking", name: "Wikingerhelm", description: "Eisenhelm mit Hörnern.", icon: "⛑",
    boxes: [B(-4.5, -9.5, -4.5, 9, 3, 9, "#9ca3af"), B(-4.5, -7, -4.5, 9, 0.6, 9, "#4b5563"), B(-7, -11, -1, 2.5, 2, 2, "#f4f1f2"), B(4.5, -11, -1, 2.5, 2, 2, "#f4f1f2"), B(-6, -13, -0.6, 1.4, 2.2, 1.2, "#f4f1f2"), B(4.6, -13, -0.6, 1.4, 2.2, 1.2, "#f4f1f2")],
  },
  {
    id: "propeller", name: "Propellerkappe", description: "Bunte Kappe mit Propeller.", icon: "🚁",
    boxes: [B(-4.5, -9.5, -4.5, 9, 2.5, 9, "#e11d2e"), B(-4.5, -9.5, -4.5, 4.5, 2.5, 4.5, "#fbbf24"), B(4.5 - 4.5, -9.5, 0, 4.5, 2.5, 4.5, "#3b82f6"), B(-0.4, -11.5, -0.4, 0.8, 2, 0.8, "#111113"), B(-4, -12, -0.4, 8, 0.5, 0.8, "#f4f1f2")],
  },
  {
    id: "santa", name: "Weihnachtsmütze", description: "Rote Mütze mit weißem Bommel.", icon: "🎅",
    boxes: [B(-4.6, -9.5, -4.6, 9.2, 2, 9.2, "#f4f1f2"), B(-4, -13, -4, 8, 3.5, 8, "#e11d2e"), B(-2.5, -15.5, -2.5, 5, 2.5, 5, "#e11d2e"), B(-0.5, -17, 1, 3, 2, 3, "#e11d2e"), B(1, -18.5, 2.5, 2.5, 2.5, 2.5, "#f4f1f2")],
  },
];

export function hatById(id: string | undefined | null): BuiltinHat | null {
  if (!id) return null;
  return CHAOS_HATS.find((h) => h.id === id) ?? null;
}

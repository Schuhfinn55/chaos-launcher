"""
Chaos Hats – eine Quelle für Launcher (src/lib/builtinHats.ts) und Chaos Client (HatCatalog.java).

Koordinaten im Kopf-Modellraum: Kopf = x -4..4, y -8..0 (oben negativ), z -4..4 (Gesicht = -z), Einheit 1/16 Block.
Jeder Hut: id, name, description, icon, glow (emissiv), spin (Grad pro Tick um die Hochachse), bob (Schweben, Einheiten), boxes.

Aufruf: python scripts/gen_hats.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LAUNCHER = os.path.dirname(HERE)
MOD = os.path.join(os.path.dirname(LAUNCHER), "onyx-visuals")

B = lambda x, y, z, w, h, d, c: (x, y, z, w, h, d, c)


def mirror(boxes):
    """Spiegelt Quader an der x-Achse (für symmetrische Hüte)."""
    return [B(-(x + w), y, z, w, h, d, c) for (x, y, z, w, h, d, c) in boxes]


def H(id, name, desc, icon, boxes, glow=False, spin=0.0, bob=0.0):
    return dict(id=id, name=name, description=desc, icon=icon, glow=glow, spin=spin, bob=bob, boxes=boxes)


# ------------------------------------------------------------------ Hüte
left_horn = [B(-4.5, -10, -1, 2, 2, 2, "#8f1b22"), B(-4, -12, -0.5, 1.4, 2, 1.4, "#e11d2e"), B(-3.6, -13.5, -0.2, 0.8, 1.6, 0.8, "#ff6b6b")]
left_cat = [B(-4.2, -10.5, -1, 2.8, 3, 1.6, "#111113"), B(-3.6, -12.5, -0.7, 1.6, 2.2, 1, "#111113"), B(-3.4, -10.2, -1.3, 1.2, 2, 0.4, "#f472b6")]
left_antler = [B(-3.8, -13, -0.6, 1.2, 5, 1.2, "#6b4423"), B(-6, -12, -0.5, 2.4, 1, 1, "#7c4f2a"), B(-6.2, -14.5, -0.5, 1, 3, 1, "#7c4f2a"),
               B(-3.2, -15.5, -0.5, 1, 3, 1, "#8b5a2b"), B(-1.6, -13.5, -0.5, 1.6, 1, 1, "#7c4f2a")]
left_dragon_horn = [B(-6.2, -9.5, -1, 2, 2, 2, "#0f172a"), B(-6.8, -11.5, -0.8, 1.6, 2.2, 1.6, "#1e293b"), B(-7.6, -13.3, -0.6, 1.2, 2, 1.2, "#334155")]
left_wolf_ear = [B(-4.4, -10.8, -1.2, 2.6, 3.2, 2, "#4b5563"), B(-3.8, -12.6, -0.9, 1.4, 2, 1.4, "#374151"), B(-3.6, -10.5, -1.5, 1.2, 2.2, 0.4, "#d1d5db")]

HATS = [
    H("top-hat", "Zylinder", "Klassischer schwarzer Zylinder mit rotem Band.", "🎩",
      [B(-6, -9, -6, 12, 1, 12, "#111113"), B(-4, -16, -4, 8, 7, 8, "#1a1a1e"), B(-4.3, -11, -4.3, 8.6, 2, 8.6, "#e11d2e")]),
    H("chaos-crown", "Chaos-Krone", "Schwarze Krone mit glühenden roten Zacken.", "👑",
      [B(-4.5, -11, -4.5, 9, 3, 9, "#1a0a0d"), B(-4.5, -13, -4.5, 2, 2, 2, "#e11d2e"), B(2.5, -13, -4.5, 2, 2, 2, "#e11d2e"),
       B(-4.5, -13, 2.5, 2, 2, 2, "#e11d2e"), B(2.5, -13, 2.5, 2, 2, 2, "#e11d2e"), B(-1, -14, -4.5, 2, 3, 1, "#ff4d5e")]),
    H("gold-crown", "Goldkrone", "Königliche Krone aus Gold mit rotem Rubin.", "👑",
      [B(-4.5, -11, -4.5, 9, 3, 9, "#f5c342"), B(-4.5, -13, -4.5, 2, 2, 2, "#f5c342"), B(2.5, -13, -4.5, 2, 2, 2, "#f5c342"),
       B(-4.5, -13, 2.5, 2, 2, 2, "#f5c342"), B(2.5, -13, 2.5, 2, 2, 2, "#f5c342"), B(-1, -13, -4.6, 2, 2, 1, "#e11d2e")]),
    H("halo", "Heiligenschein", "Leuchtender Ring, der langsam über dem Kopf schwebt und rotiert.", "😇",
      [B(-4, -11, -4, 8, 0.6, 1, "#fff1b8"), B(-4, -11, 3, 8, 0.6, 1, "#fff1b8"), B(-4, -11, -3, 1, 0.6, 6, "#fff1b8"), B(3, -11, -3, 1, 0.6, 6, "#fff1b8")],
      glow=True, spin=1.2, bob=0.35),
    H("horns", "Teufelshörner", "Zwei rote Hörner.", "😈", left_horn + mirror(left_horn)),
    H("wizard", "Zaubererhut", "Spitzhut in Mitternachtsrot.", "🧙",
      [B(-6.5, -9, -6.5, 13, 1, 13, "#2a0b0f"), B(-4, -13, -4, 8, 4, 8, "#3a0d12"), B(-3, -16, -3, 6, 3, 6, "#3a0d12"),
       B(-2, -18.5, -2, 4, 2.5, 4, "#3a0d12"), B(-1, -20.5, -1, 2, 2, 2, "#e11d2e")]),
    H("cap", "Chaos-Cap", "Rote Baseballcap mit schwarzem Schild.", "🧢",
      [B(-4.5, -9.5, -4.5, 9, 2.5, 9, "#e11d2e"), B(-4, -7, -8, 8, 0.8, 4, "#111113"), B(-0.6, -10.2, -0.6, 1.2, 0.8, 1.2, "#111113")]),
    H("headphones", "Kopfhörer", "Gaming-Headset mit rotem Licht.", "🎧",
      [B(-4.5, -9.5, -1, 9, 1, 2, "#111113"), B(-5.6, -6, -1.6, 1.6, 4, 3.2, "#1a1a1e"), B(4, -6, -1.6, 1.6, 4, 3.2, "#1a1a1e"),
       B(-5.9, -5, -0.6, 0.4, 2, 1.2, "#e11d2e"), B(5.5, -5, -0.6, 0.4, 2, 1.2, "#e11d2e")]),
    H("bunny", "Hasenohren", "Zwei lange Ohren.", "🐰",
      [B(-3.5, -15, -0.6, 2, 7, 1.2, "#f4f1f2"), B(-3, -14, -0.3, 1, 5, 0.6, "#f9a8b8"), B(1.5, -15, -0.6, 2, 7, 1.2, "#f4f1f2"), B(2, -14, -0.3, 1, 5, 0.6, "#f9a8b8")]),
    H("viking", "Wikingerhelm", "Eisenhelm mit Hörnern.", "⛑",
      [B(-4.5, -9.5, -4.5, 9, 3, 9, "#9ca3af"), B(-4.5, -7, -4.5, 9, 0.6, 9, "#4b5563"), B(-7, -11, -1, 2.5, 2, 2, "#f4f1f2"),
       B(4.5, -11, -1, 2.5, 2, 2, "#f4f1f2"), B(-6, -13, -0.6, 1.4, 2.2, 1.2, "#f4f1f2"), B(4.6, -13, -0.6, 1.4, 2.2, 1.2, "#f4f1f2")]),
    H("propeller", "Propellerkappe", "Bunte Kappe mit Propeller.", "🚁",
      [B(-4.5, -9.5, -4.5, 9, 2.5, 9, "#e11d2e"), B(-4.5, -9.5, -4.5, 4.5, 2.5, 4.5, "#fbbf24"), B(0, -9.5, 0, 4.5, 2.5, 4.5, "#3b82f6"),
       B(-0.4, -11.5, -0.4, 0.8, 2, 0.8, "#111113"), B(-4, -12, -0.4, 8, 0.5, 0.8, "#f4f1f2")]),
    H("santa", "Weihnachtsmütze", "Rote Mütze mit weißem Bommel.", "🎅",
      [B(-4.6, -9.5, -4.6, 9.2, 2, 9.2, "#f4f1f2"), B(-4, -13, -4, 8, 3.5, 8, "#e11d2e"), B(-2.5, -15.5, -2.5, 5, 2.5, 5, "#e11d2e"),
       B(-0.5, -17, 1, 3, 2, 3, "#e11d2e"), B(1, -18.5, 2.5, 2.5, 2.5, 2.5, "#f4f1f2")]),
    # ---- neu ----
    H("dragon-helm", "Drachenhelm", "Dunkler Schuppenhelm mit Stachelkamm, geschwungenen Hörnern und glühenden Augen.", "🐲",
      [B(-4.6, -9.2, -4.6, 9.2, 4, 9.2, "#1f2937"), B(-4.8, -6.2, -5, 9.6, 1, 1, "#111827"),
       B(-0.6, -11, -3, 1.2, 2, 1.2, "#334155"), B(-0.6, -11.5, -0.5, 1.2, 2.5, 1.2, "#334155"), B(-0.6, -11, 2, 1.2, 2, 1.2, "#334155"),
       B(-3, -6.5, -5.1, 2, 1, 0.5, "#ff2d44"), B(1, -6.5, -5.1, 2, 1, 0.5, "#ff2d44")] + left_dragon_horn + mirror(left_dragon_horn)),
    H("chaos-visor", "Chaos-Visor", "Cyber-Visor mit grell leuchtendem Streifen in Chaos-Rot.", "🕶",
      [B(-4.8, -5, -4.9, 9.6, 2.4, 1.2, "#0b0b10"), B(-4.9, -5, -4.5, 0.8, 2.4, 6, "#0b0b10"), B(4.1, -5, -4.5, 0.8, 2.4, 6, "#0b0b10"),
       B(-4.4, -4.3, -5.2, 8.8, 0.8, 0.4, "#ff1f3d"), B(-4.6, -4.6, 3.6, 9.2, 1.4, 1, "#1a1a1e")], glow=True),
    H("cat-ears", "Katzenohren", "Schwarze Katzenohren mit rosa Innenseite.", "🐱", left_cat + mirror(left_cat)),
    H("wolf-ears", "Wolfsohren", "Graue Wolfsohren mit hellem Fell.", "🐺", left_wolf_ear + mirror(left_wolf_ear)),
    H("pirate", "Piratenhut", "Schwarzer Dreispitz mit Totenkopf und Goldborte.", "🏴‍☠️",
      [B(-6.5, -9, -6.5, 13, 1, 13, "#111113"), B(-4.2, -12.5, -4.2, 8.4, 3.5, 8.4, "#1a1a1e"),
       B(-7, -11.5, -2, 1.2, 3.5, 6, "#1a1a1e"), B(5.8, -11.5, -2, 1.2, 3.5, 6, "#1a1a1e"), B(-5, -11.8, -5.2, 10, 3.2, 1.2, "#1a1a1e"),
       B(-1.2, -11.2, -5.6, 2.4, 2, 0.5, "#f4f1f2"), B(-0.9, -10.8, -5.8, 0.6, 0.6, 0.3, "#111113"), B(0.3, -10.8, -5.8, 0.6, 0.6, 0.3, "#111113"),
       B(-5, -8.8, -5.3, 10, 0.4, 1.3, "#f5c342")]),
    H("antlers", "Geweih", "Braunes Hirschgeweih mit verzweigten Enden.", "🦌", left_antler + mirror(left_antler)),
    H("flame-crown", "Flammenkrone", "Lodernde Krone aus glühenden Flammen – schwebt leicht.", "🔥",
      [B(-4.5, -10.5, -4.5, 9, 2, 9, "#7a0f17"),
       B(-3.5, -13.5, -4.6, 1.4, 3, 1, "#ff6a00"), B(-0.7, -15, -4.6, 1.4, 4.5, 1, "#ffd166"), B(2.1, -13.5, -4.6, 1.4, 3, 1, "#ff6a00"),
       B(-4.6, -13, -0.7, 1, 2.5, 1.4, "#ff6a00"), B(3.6, -13, -0.7, 1, 2.5, 1.4, "#ff6a00"), B(-0.7, -13.5, 3.6, 1.4, 3, 1, "#ff8a1f"),
       B(-4.6, -12.5, -4.6, 1, 2, 1, "#e11d2e"), B(3.6, -12.5, -4.6, 1, 2, 1, "#e11d2e"), B(-4.6, -12.5, 3.6, 1, 2, 1, "#e11d2e"), B(3.6, -12.5, 3.6, 1, 2, 1, "#e11d2e")],
      glow=True, bob=0.3),
    H("astronaut", "Astronautenhelm", "Weißer Raumhelm mit dunklem Visier und roter Antenne.", "👩‍🚀",
      [B(-5.5, -9.5, -5.5, 11, 10.5, 11, "#f4f1f2"), B(-4, -7, -6, 8, 5, 0.8, "#1e293b"), B(-3, -6, -6.2, 2, 1, 0.3, "#93c5fd"),
       B(-5.8, 0.8, -5.8, 11.6, 1, 11.6, "#9ca3af"), B(5.4, -11, -0.4, 0.6, 3, 0.8, "#9ca3af"), B(5.2, -11.6, -0.6, 1, 0.8, 1.2, "#e11d2e")]),
    H("mushroom", "Pilzhut", "Roter Fliegenpilz mit weißen Punkten.", "🍄",
      [B(-6.5, -11.5, -6.5, 13, 3.5, 13, "#e11d2e"), B(-4.5, -13.5, -4.5, 9, 2, 9, "#e11d2e"), B(-4.5, -8.2, -4.5, 9, 0.4, 9, "#f5e0c3"),
       B(-5, -11.6, -6.7, 2, 2, 0.4, "#f4f1f2"), B(2, -12.6, -6.7, 2.4, 2.4, 0.4, "#f4f1f2"), B(-2, -13.7, -2, 3, 0.4, 3, "#f4f1f2"),
       B(-6.7, -11, 0, 0.4, 2, 2.4, "#f4f1f2"), B(6.3, -12, -3, 0.4, 2, 2, "#f4f1f2"), B(-1, -11.5, 6.3, 2, 2, 0.4, "#f4f1f2")]),
    H("knight-helm", "Ritterhelm", "Stahlhelm mit Visierschlitz und rotem Federbusch.", "🛡",
      [B(-4.6, -9.5, -4.6, 9.2, 5, 9.2, "#9ca3af"), B(-4.7, -4.6, -5, 9.4, 3.6, 1, "#6b7280"), B(-3.5, -3.4, -5.2, 7, 0.6, 0.3, "#111113"),
       B(-0.4, -10.5, -4.6, 0.8, 1, 9.2, "#d1d5db"), B(-4.8, -4.6, -2, 0.6, 4, 6, "#6b7280"), B(4.2, -4.6, -2, 0.6, 4, 6, "#6b7280"),
       B(-0.6, -14.5, -1, 1.2, 5, 2, "#e11d2e"), B(-0.6, -14, 1, 1.2, 3, 3, "#b91c1c"), B(-0.6, -13, 4, 1.2, 2, 2, "#e11d2e")]),
    H("flower-crown", "Blumenkranz", "Grüner Kranz mit rosa, gelben und weißen Blüten.", "🌸",
      [B(-4.5, -9, -4.8, 9, 1, 1, "#2e7d32"), B(-4.5, -9, 3.8, 9, 1, 1, "#2e7d32"), B(-4.8, -9, -3.8, 1, 1, 7.6, "#2e7d32"), B(3.8, -9, -3.8, 1, 1, 7.6, "#2e7d32"),
       B(-3.5, -10, -5.2, 1.6, 1.6, 1.4, "#f472b6"), B(0.8, -10.2, -5.2, 1.6, 1.8, 1.4, "#fbbf24"), B(-1.4, -9.8, -5.3, 1.2, 1.2, 1.4, "#f4f1f2"),
       B(-5.4, -10, -1, 1.4, 1.6, 1.6, "#f472b6"), B(4, -10, 0.5, 1.4, 1.6, 1.6, "#fbbf24"), B(3.6, -9.8, -3, 1.2, 1.2, 1.2, "#f4f1f2"), B(-1, -9.9, 4, 1.6, 1.4, 1.4, "#f472b6"),
       B(-4, -9.3, -5.1, 1, 0.5, 1, "#4ade80"), B(2.6, -9.4, -5.1, 1, 0.5, 1, "#4ade80")]),
    H("neon-halo", "Neon-Ring", "Rotierender Chaos-roter Neonring – leuchtet im Dunkeln.", "⭕",
      [B(-5, -11.5, -5, 10, 0.5, 1, "#ff1f3d"), B(-5, -11.5, 4, 10, 0.5, 1, "#ff1f3d"), B(-5, -11.5, -4, 1, 0.5, 8, "#ff1f3d"), B(4, -11.5, -4, 1, 0.5, 8, "#ff1f3d"),
       B(-1, -12.2, -5.3, 2, 0.4, 0.6, "#ffffff")], glow=True, spin=2.5, bob=0.4),
    H("ice-crown", "Eiskrone", "Kristallkrone aus leuchtendem Eis.", "❄",
      [B(-4.5, -10.5, -4.5, 9, 2, 9, "#bae6fd"), B(-4.4, -13, -4.4, 1.4, 2.5, 1.4, "#e0f2fe"), B(3, -13, -4.4, 1.4, 2.5, 1.4, "#e0f2fe"),
       B(-4.4, -13, 3, 1.4, 2.5, 1.4, "#e0f2fe"), B(3, -13, 3, 1.4, 2.5, 1.4, "#e0f2fe"), B(-0.8, -15, -4.4, 1.6, 4.5, 1.2, "#f0f9ff"),
       B(-0.5, -16.5, -4.2, 1, 1.5, 0.8, "#ffffff")], glow=True),
]


def fmt(v):
    s = ("%g" % v)
    return s


def java_box(b):
    x, y, z, w, h, d, c = b
    return "b(%s, %s, %s, %s, %s, %s, 0x%s)" % (fmt(x), fmt(y), fmt(z), fmt(w), fmt(h), fmt(d), c.lstrip("#"))


def ts_box(b):
    x, y, z, w, h, d, c = b
    return 'B(%s, %s, %s, %s, %s, %s, "%s")' % (fmt(x), fmt(y), fmt(z), fmt(w), fmt(h), fmt(d), c)


def main():
    # ---- Java
    lines = []
    for h in HATS:
        boxes = ", ".join(java_box(b) for b in h["boxes"])
        lines.append('        add(new Hat("%s", "%s", "%s", "%s", %s, %sf, %sf, List.of(%s)));' % (
            h["id"], h["name"], h["description"].replace('"', '\\"'), h["icon"], "true" if h["glow"] else "false", fmt(h["spin"]), fmt(h["bob"]), boxes))
    java = '''package com.chaoscraft.client.cosmetics;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Vorgefertigte Hüte – GENERIERT von scripts/gen_hats.py (Chaos Launcher), identisch zu
 * src/lib/builtinHats.ts. Koordinaten im Kopf-Modellraum: Kopf = x −4..4, y −8..0
 * (oben negativ), z −4..4; Einheit 1/16 Block. glow = emissiv, spin = Grad/Tick,
 * bob = Schwebe-Amplitude in Einheiten.
 */
public final class HatCatalog {
    private HatCatalog() {}

    public record Box(float x, float y, float z, float w, float h, float d, int color) {}
    public record Hat(String id, String name, String description, String icon, boolean glow, float spin, float bob, List<Box> boxes) {}

    private static Box b(double x, double y, double z, double w, double h, double d, int color) {
        return new Box((float) x, (float) y, (float) z, (float) w, (float) h, (float) d, 0xFF000000 | color);
    }

    private static final Map<String, Hat> HATS = new LinkedHashMap<>();

    static {
%s
    }

    private static void add(Hat h) { HATS.put(h.id(), h); }

    public static List<Hat> all() { return List.copyOf(HATS.values()); }
    public static Hat byId(String id) { return id == null ? null : HATS.get(id); }
}
''' % "\n".join(lines)
    jp = os.path.join(MOD, "src", "main", "java", "com", "chaoscraft", "client", "cosmetics", "HatCatalog.java")
    with open(jp, "w", encoding="utf-8", newline="\n") as f:
        f.write(java)
    # ---- TypeScript
    items = []
    for h in HATS:
        extra = ""
        if h["glow"]:
            extra += " glow: true,"
        if h["spin"]:
            extra += " spin: %s," % fmt(h["spin"])
        if h["bob"]:
            extra += " bob: %s," % fmt(h["bob"])
        items.append('  {\n    id: "%s", name: "%s", description: "%s", icon: "%s",%s\n    boxes: [%s],\n  },' % (
            h["id"], h["name"], h["description"].replace('"', '\\"'), h["icon"], extra, ", ".join(ts_box(b) for b in h["boxes"])))
    ts = '''/* ============================================================
 * Chaos Launcher - Vorgefertigte Hüte
 *
 * GENERIERT von scripts/gen_hats.py – nicht von Hand bearbeiten.
 * Jeder Hut besteht aus farbigen Quadern in Kopf-Koordinaten
 * (Minecraft-Modellraum: Kopf = x −4..4, y −8..0 (oben = negativ),
 * z −4..4, Einheit 1 = 1/16 Block). Dieselbe Definition ist im Chaos
 * Client (HatCatalog.java) hinterlegt – Launcher-Vorschau und Spiel
 * zeigen damit exakt denselben Hut. glow = leuchtet, spin = Grad/Tick,
 * bob = Schwebe-Amplitude.
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
  glow?: boolean;
  spin?: number;
  bob?: number;
  boxes: HatBox[];
}

const B = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): HatBox => ({ x, y, z, w, h, d, color });

export const CHAOS_HATS: BuiltinHat[] = [
%s
];

export function hatById(id: string | undefined | null): BuiltinHat | null {
  if (!id) return null;
  return CHAOS_HATS.find((h) => h.id === id) ?? null;
}
''' % "\n".join(items)
    tp = os.path.join(LAUNCHER, "src", "lib", "builtinHats.ts")
    with open(tp, "w", encoding="utf-8", newline="\n") as f:
        f.write(ts)
    print("ok: %d Hüte -> %s, %s" % (len(HATS), jp, tp))


if __name__ == "__main__":
    main()

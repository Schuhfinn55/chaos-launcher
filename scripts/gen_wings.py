"""
Chaos Wings – Pixel-Art-Generator.

Erzeugt für jedes Wings-Design eine Textur (128×64 px, 2 px pro Modell-Einheit):
links der gespiegelte Flügel (Nordseite des Quaders), rechts das Original
(Südseite) – zusammen ergibt die Textur direkt ein Flügelpaar (Thumbnail).
Außerdem wird wings.json für Launcher und Chaos Client geschrieben.

Aufruf: python scripts/gen_wings.py
"""
import json
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw

PX = 2                 # Texturpixel pro Modell-Einheit
W, H, TOP = 26, 30, 16  # Flügelfläche in Einheiten; TOP = Einheiten oberhalb der Wurzel
IW, IH = W * PX, H * PX  # 52 × 60
TEX = (128, 64)

HERE = os.path.dirname(os.path.abspath(__file__))
LAUNCHER = os.path.dirname(HERE)
MOD = os.path.join(os.path.dirname(LAUNCHER), "onyx-visuals")
OUT_L = os.path.join(LAUNCHER, "src", "assets", "wings")
OUT_M = os.path.join(MOD, "src", "main", "resources", "assets", "chaosclient", "textures", "wings")


# ---------------------------------------------------------------- Farben
def rgba(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))


def shade(c, f):
    return (min(255, int(c[0] * f)), min(255, int(c[1] * f)), min(255, int(c[2] * f)), c[3])


def alpha(c, a):
    return (c[0], c[1], c[2], a)


# ---------------------------------------------------------------- Masken
def new_mask():
    return Image.new("L", (IW, IH), 0)


def poly(points):
    m = new_mask()
    ImageDraw.Draw(m).polygon([(float(x), float(y)) for x, y in points], fill=255)
    return m


def ellipse(cx, cy, rx, ry):
    m = new_mask()
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return m


def line(p0, p1, w=1):
    m = new_mask()
    ImageDraw.Draw(m).line([tuple(p0), tuple(p1)], fill=255, width=w)
    return m


def union(*ms):
    out = new_mask()
    for m in ms:
        out = ImageChops.lighter(out, m)
    return out


def intersect(a, b):
    return ImageChops.darker(a, b)


def qcurve(p0, c, p1, n=8):
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]))
    return pts


def pull(p, towards, f):
    return (p[0] + (towards[0] - p[0]) * f, p[1] + (towards[1] - p[1]) * f)


def mid(a, b):
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


# ---------------------------------------------------------------- Zeichenfläche
class Layer:
    def __init__(self):
        self.img = Image.new("RGBA", (IW, IH), (0, 0, 0, 0))

    def paint(self, mask, fn):
        px = self.img.load()
        m = mask.load()
        for y in range(IH):
            for x in range(IW):
                if m[x, y]:
                    c = fn(x, y)
                    if c:
                        px[x, y] = c

    def edge(self, mask, fn, dirs=((1, 0), (-1, 0), (0, 1), (0, -1))):
        """Innere Kontur: Maskenpixel mit Nachbarn außerhalb (in den angegebenen Richtungen)."""
        m = mask.load()
        px = self.img.load()
        for y in range(IH):
            for x in range(IW):
                if not m[x, y]:
                    continue
                for dx, dy in dirs:
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= IW or ny >= IH or not m[nx, ny]:
                        c = fn(x, y)
                        if c:
                            px[x, y] = c
                        break

    def dots(self, mask, color, every=5, seed=1):
        rnd = random.Random(seed)
        px = self.img.load()
        m = mask.load()
        for y in range(IH):
            for x in range(IW):
                if m[x, y] and rnd.random() < 1.0 / every:
                    px[x, y] = color

    def mask(self):
        return self.img.split()[3].point(lambda a: 255 if a > 0 else 0)


def gradient(c0, c1, origin, reach):
    def fn(x, y):
        return mix(c0, c1, math.hypot(x - origin[0], y - origin[1]) / reach)
    return fn


def vgradient(c0, c1, y0, y1):
    def fn(x, y):
        return mix(c0, c1, (y - y0) / max(1, (y1 - y0)))
    return fn


# ---------------------------------------------------------------- Formen
def feather(base, ang_deg, length, width):
    a = math.radians(ang_deg)
    d = (math.cos(a), math.sin(a))
    p = (-d[1], d[0])
    bx, by = base

    def P(t, s):
        return (bx + d[0] * t + p[0] * s, by + d[1] * t + p[1] * s)

    return [P(0, -width / 2), P(length * 0.55, -width / 2), P(length * 0.86, -width * 0.3), P(length, 0), P(length * 0.86, width * 0.3), P(length * 0.55, width / 2), P(0, width / 2)]


def clamp_len(base, ang, length, margin=1.0):
    a = math.radians(ang)
    for _ in range(40):
        tx, ty = base[0] + math.cos(a) * length, base[1] + math.sin(a) * length
        if tx <= IW - margin and ty <= IH - margin and ty >= margin:
            break
        length -= 0.5
    return length


def draw_feathered(L, base_c, tip_c, shoulder_c, outline_f=0.55, stars=None, tip_glow=None, seed=0):
    R, E, Wr = (3, 24), (16, 7), (36, 9)

    def arm(t):
        return ((1 - t) ** 2 * R[0] + 2 * (1 - t) * t * E[0] + t * t * Wr[0], (1 - t) ** 2 * R[1] + 2 * (1 - t) * t * E[1] + t * t * Wr[1])

    n = 9
    lengths = [24, 28, 31, 33, 34, 34, 33, 31, 28]
    prim = []
    for i in range(n):
        t = 1.0 - i * (0.78 / (n - 1))
        ang = 20 + i * (78 / (n - 1))
        b = arm(t)
        ln = clamp_len(b, ang, lengths[i])
        prim.append((b, ang, ln, 7 if i < 5 else 6, i))
    for (b, ang, ln, w, i) in prim:
        m = poly(feather(b, ang, ln, w))
        f = 1.0 + (0.08 if i % 2 else -0.05)

        def col(x, y, b=b, ln=ln, f=f):
            dist = math.hypot(x - b[0], y - b[1]) / ln
            return shade(mix(base_c, tip_c, dist * 1.2 - 0.15), f)

        L.paint(m, col)
        L.edge(m, lambda x, y, col=col: shade(col(x, y), outline_f))
        L.edge(m, lambda x, y, col=col: shade(col(x, y), 1.22), dirs=((0, -1), (-1, 0)))
        if tip_glow:
            tipm = intersect(m, ellipse(b[0] + math.cos(math.radians(ang)) * ln, b[1] + math.sin(math.radians(ang)) * ln, w * 0.9, w * 0.9))
            L.paint(tipm, lambda x, y: tip_glow)
    # Deckfedern
    for i in range(7):
        t = 0.95 - i * (0.72 / 6)
        ang = 24 + i * (66 / 6)
        b = arm(t)
        ln = 15 - i * 0.5
        m = poly(feather(b, ang, ln, 6))

        def col(x, y, b=b, ln=ln, i=i):
            dist = math.hypot(x - b[0], y - b[1]) / ln
            return shade(mix(shoulder_c, base_c, dist * 0.9), 1.0 if i % 2 else 0.92)

        L.paint(m, col)
        L.edge(m, lambda x, y, col=col: shade(col(x, y), outline_f + 0.1))
        L.edge(m, lambda x, y, col=col: shade(col(x, y), 1.15), dirs=((0, -1), (-1, 0)))
    # Schulter
    m = union(ellipse(R[0] + 4, R[1] - 3, 5, 4), ellipse(E[0] - 1, E[1] + 4, 7, 3))
    L.paint(m, gradient(shade(shoulder_c, 1.05), base_c, (R[0] + 2, R[1] - 6), 18))
    L.edge(m, lambda x, y: shade(shoulder_c, 0.72))
    if stars:
        L.dots(L.mask(), stars[0], every=stars[1], seed=7 + seed)
        L.dots(L.mask(), stars[2], every=stars[1] * 3, seed=11 + seed)


def draw_membrane(L, mem_top, mem_bot, bone_c, vein_c, outline_c, glow_c=None, mem_alpha=255, scale=1.0):
    def S(p):
        return (p[0] * scale, (p[1] - 26) * scale + 26)

    R, E = S((3, 26)), S((15, 8))
    T1, T2, T3, B = S((50, 4)), S((50, 32)), S((37, 52)), S((5, 46))
    c12 = pull(mid(T1, T2), E, 0.6)
    c23 = pull(mid(T2, T3), E, 0.6)
    c3b = pull(mid(T3, B), E, 0.45)
    outline = [R, E, T1] + qcurve(T1, c12, T2)[1:] + qcurve(T2, c23, T3)[1:] + qcurve(T3, c3b, B)[1:]
    mem = poly(outline)
    base = vgradient(alpha(mem_top, mem_alpha), alpha(mem_bot, mem_alpha), E[1], B[1] + 6)
    rnd = random.Random(3)

    def col(x, y):
        c = base(x, y)
        return shade(c, 0.93) if rnd.random() < 0.18 else c

    L.paint(mem, col)
    # Adern
    for p in (c12, c23, c3b, mid(E, T2), mid(E, T3)):
        L.paint(line(E, pull(p, E, -0.35), 1), lambda x, y: alpha(vein_c, mem_alpha))
    # Kontur
    L.edge(mem, lambda x, y: outline_c)
    # Knochen
    for a, b, w in ((R, E, 4), (E, T1, 3), (E, T2, 3), (E, T3, 2)):
        bm = line(a, b, w)
        L.paint(bm, lambda x, y: bone_c)
        L.edge(bm, lambda x, y: shade(bone_c, 0.6))
        L.edge(bm, lambda x, y: shade(bone_c, 1.25), dirs=((0, -1), (-1, 0)))
    # Kralle am Ellbogen
    claw = poly([(E[0] - 2, E[1] + 1), (E[0] + 2, E[1] + 1), (E[0] - 1, E[1] - 6)])
    L.paint(claw, lambda x, y: shade(bone_c, 1.3))
    L.edge(claw, lambda x, y: shade(bone_c, 0.6))
    # Gelenk
    j = ellipse(E[0], E[1], 3, 3)
    L.paint(j, lambda x, y: bone_c)
    L.edge(j, lambda x, y: shade(bone_c, 0.6))
    if glow_c:
        for p in (c12, c23, c3b):
            L.paint(line(E, pull(p, E, -0.3), 1), lambda x, y: glow_c)
        L.edge(mem, lambda x, y: glow_c)


def draw_butterfly(L, c_in, c_out, c_vein, c_spot, c_spot2, c_edge, mem_alpha=255):
    R = (3, 27)
    upper = poly([R, (7, 13), (18, 4), (34, 2), (47, 6), (51, 16), (47, 26), (36, 30), (20, 31), (8, 30)])
    lower = poly([(5, 31), (18, 32), (31, 34), (41, 41), (41, 51), (32, 58), (18, 57), (8, 48), (4, 38)])
    wing = union(upper, lower)
    rnd = random.Random(5)
    g = gradient(alpha(c_in, mem_alpha), alpha(c_out, mem_alpha), R, 50)

    def col(x, y):
        c = g(x, y)
        return shade(c, 1.06) if rnd.random() < 0.15 else c

    L.paint(wing, col)
    for p in ((20, 5), (34, 3), (47, 8), (50, 18), (44, 28), (30, 36), (40, 44), (36, 56), (20, 56), (9, 46)):
        L.paint(line(R, p, 1), lambda x, y: alpha(c_vein, mem_alpha))
    # Augenflecken
    for (cx, cy, rx, ry) in ((36, 15, 6, 5), (27, 46, 5, 4)):
        L.paint(ellipse(cx, cy, rx, ry), lambda x, y: c_spot)
        L.paint(ellipse(cx, cy, rx - 2, ry - 2), lambda x, y: c_spot2)
        L.paint(ellipse(cx - 1, cy - 1, 1, 1), lambda x, y: (255, 255, 255, 255))
    L.edge(wing, lambda x, y: c_edge)
    L.edge(wing, lambda x, y: (255, 255, 255, 230) if (x + y) % 6 == 0 else None)
    L.paint(ellipse(4, 29, 3, 6), lambda x, y: c_edge)


def draw_crystal(L, c_light, c_dark, c_edge, c_core):
    R = (2, 27)
    shards = [(-68, 30, 8), (-44, 36, 10), (-20, 40, 11), (4, 38, 10), (28, 34, 9), (52, 28, 8)]
    for i, (ang, ln, w) in enumerate(shards):
        ln = clamp_len(R, ang, ln)
        a = math.radians(ang)
        d = (math.cos(a), math.sin(a))
        p = (-d[1], d[0])

        def P(t, s):
            return (R[0] + d[0] * t + p[0] * s, R[1] + d[1] * t + p[1] * s)

        m = poly([P(0, -w * 0.2), P(ln * 0.6, -w / 2), P(ln, 0), P(ln * 0.6, w / 2), P(0, w * 0.2)])

        def col(x, y, d=d, p=p, ln=ln):
            side = (x - R[0]) * p[0] + (y - R[1]) * p[1]
            t = ((x - R[0]) * d[0] + (y - R[1]) * d[1]) / ln
            base = mix(c_dark if side > 0 else c_light, c_core, 0.6 - t * 0.6)
            return base

        L.paint(m, col)
        L.paint(line(P(0, 0), P(ln, 0), 1), lambda x, y: shade(c_light, 1.08))
        L.edge(m, lambda x, y: c_edge)
        L.edge(m, lambda x, y: (255, 255, 255, 255), dirs=((-1, 0), (0, -1)))
    core = ellipse(R[0] + 3, R[1], 5, 7)
    L.paint(core, lambda x, y: c_core)
    L.edge(core, lambda x, y: c_edge)
    L.dots(L.mask(), (255, 255, 255, 255), every=28, seed=4)


# ---------------------------------------------------------------- Designs
def W_(id, name, desc, icon, draw, colors, flapSpeed=0.08, flapAmp=18, openAngle=38, tilt=10, scale=1.0, glow=False, particle="", frames=1, fps=10, exclusive=False):
    return dict(id=id, name=name, description=desc, icon=icon, draw=draw, colors=colors, flapSpeed=flapSpeed, flapAmp=flapAmp, openAngle=openAngle, tilt=tilt, scale=scale, glow=glow, particle=particle, frames=frames, fps=fps, exclusive=exclusive)


# ---------------------------------------------------------------- Legendär (animierte Texturen, nur per Code)
def _mem_points():
    R, E = (3, 26), (15, 8)
    T1, T2, T3, B = (50, 4), (50, 32), (37, 52), (5, 46)
    return R, E, T1, T2, T3, B


def draw_overlord(L, k, n):
    """Chaos Overlord: schwarze Drachenschwinge, blutrote Membran, Energieadern, die nach außen pulsieren, Blitze."""
    t = k / n
    pulse = 0.5 + 0.5 * math.sin(t * math.tau)
    glow = mix(rgba("#FF1F3D"), rgba("#FFE4E8"), pulse * 0.7)
    draw_membrane(L, rgba("#4A0810"), rgba("#14050A"), rgba("#0B0608"), rgba("#8A1020"), rgba("#060305"), glow_c=glow)
    R, E, T1, T2, T3, B = _mem_points()
    rnd = random.Random(100 + k)
    # Energie-Impulse wandern entlang der Adern (Ellbogen → Spitzen)
    for i, T in enumerate((T1, T2, T3, mid(T2, T3), mid(T3, B))):
        f = (t + i * 0.2) % 1.0
        px, py = E[0] + (T[0] - E[0]) * f, E[1] + (T[1] - E[1]) * f
        L.paint(intersect(ellipse(px, py, 1.3, 1.3), L.mask()), lambda x, y: rgba("#FFB3BC"))
        f2 = (f - 0.1) % 1.0
        qx, qy = E[0] + (T[0] - E[0]) * f2, E[1] + (T[1] - E[1]) * f2
        L.paint(intersect(ellipse(qx, qy, 0.9, 0.9), L.mask()), lambda x, y: rgba("#FF5A6E"))
    # Blitze: kurze gezackte Linien über der Membran
    for _ in range(3 if pulse > 0.5 else 1):
        x0, y0 = rnd.uniform(18, 46), rnd.uniform(8, 44)
        pts = [(x0, y0)]
        for _s in range(4):
            pts.append((pts[-1][0] + rnd.uniform(-5, 5), pts[-1][1] + rnd.uniform(-5, 5)))
        for a, b in zip(pts, pts[1:]):
            L.paint(intersect(line(a, b, 1), L.mask()), lambda x, y: rgba("#FFD6DC"))
    # Glut an den Spitzen
    for T in (T1, T2, T3):
        L.paint(intersect(ellipse(T[0], T[1], 2.5, 2.5), L.mask()), lambda x, y: mix(rgba("#FF2D44"), rgba("#FFD6DC"), pulse * 0.5))


def draw_celestial(L, k, n):
    """Celestial Seraph: schillernde Federn (Cyan → Violett → Gold → Rosé), funkelnde Sterne, weißes Spitzenleuchten."""
    t = k / n
    pal = [(rgba("#E0F7FF"), rgba("#38BDF8")), (rgba("#EDE9FE"), rgba("#8B5CF6")), (rgba("#FFF7CC"), rgba("#F5C342")), (rgba("#FCE7F3"), rgba("#F472B6"))]
    seg = t * len(pal)
    i = int(seg) % len(pal)
    j = (i + 1) % len(pal)
    f = seg - int(seg)
    base = mix(pal[i][0], pal[j][0], f)
    tip = mix(pal[i][1], pal[j][1], f)
    draw_feathered(L, base, tip, rgba("#FFFFFF"), outline_f=0.68, stars=((255, 255, 255, 255), 14, tip), tip_glow=rgba("#FFFFFF"), seed=k * 3)
    # Lichtbogen über der Schulter
    rnd = random.Random(500 + k)
    for _ in range(6):
        x, y = rnd.uniform(4, 30), rnd.uniform(4, 30)
        L.paint(intersect(ellipse(x, y, 1.2, 1.2), L.mask()), lambda x_, y_: rgba("#FFFFFF"))


DESIGNS = [
    W_("angel", "Engelsflügel", "Weiße Federn mit cremefarbenem Schimmer – sanfter, ruhiger Flügelschlag.", "🕊",
       lambda L: draw_feathered(L, rgba("#F4F6FA"), rgba("#C9D2E3"), rgba("#FFFFFF")),
       ["#FFFFFF", "#F4F6FA", "#C9D2E3"], flapSpeed=0.07, flapAmp=16, openAngle=40, tilt=12),
    W_("chaos", "Chaos-Schwingen", "Schwarze Schwingen mit blutroten Federspitzen – das Markenzeichen des Chaos Clients.", "✸",
       lambda L: draw_feathered(L, rgba("#17171C"), rgba("#8A0F1C"), rgba("#2A2A32"), outline_f=0.45, tip_glow=rgba("#FF2D44")),
       ["#17171C", "#8A0F1C", "#FF2D44"], flapSpeed=0.09, flapAmp=20, openAngle=42, tilt=10, particle="dust_red"),
    W_("phoenix", "Phönix", "Brennende Federn von Gold über Orange bis Rot – leuchten im Dunkeln, mit Funkenflug.", "🔥",
       lambda L: draw_feathered(L, rgba("#FFD166"), rgba("#D7261E"), rgba("#FFF1A8"), outline_f=0.62, tip_glow=rgba("#FF5A1F")),
       ["#FFD166", "#FF8A1F", "#D7261E"], flapSpeed=0.1, flapAmp=22, openAngle=44, tilt=14, glow=True, particle="flame"),
    W_("galaxy", "Galaxie", "Violett-blauer Sternennebel mit funkelnden Sternen – leuchtet bei Nacht.", "🌌",
       lambda L: draw_feathered(L, rgba("#5B21B6"), rgba("#2563EB"), rgba("#C4B5FD"), outline_f=0.5, stars=((255, 255, 255, 255), 22, (191, 219, 254, 255))),
       ["#5B21B6", "#2563EB", "#C4B5FD"], flapSpeed=0.075, flapAmp=16, openAngle=40, tilt=12, glow=True, particle="end_rod"),
    W_("shadow", "Schattenflügel", "Rauchschwarze Federn mit violettem Schimmer an den Spitzen.", "🌑",
       lambda L: draw_feathered(L, rgba("#101016"), rgba("#4C1D95"), rgba("#1E1E27"), outline_f=0.4),
       ["#101016", "#4C1D95", "#1E1E27"], flapSpeed=0.08, flapAmp=18, openAngle=36, tilt=8, particle="smoke"),
    W_("demon", "Dämonenflügel", "Dunkelrote Membran auf schwarzen Knochen, glühende Adern – pure Bosheit.", "😈",
       lambda L: draw_membrane(L, rgba("#5A0F1A"), rgba("#2A0810"), rgba("#1A0A0D"), rgba("#7F1D2B"), rgba("#120508"), glow_c=rgba("#FF2D44")),
       ["#5A0F1A", "#1A0A0D", "#FF2D44"], flapSpeed=0.07, flapAmp=22, openAngle=40, tilt=6, scale=1.1),
    W_("dragon", "Drachenflügel", "Große grüne Drachenmembran mit dunklen Speichen und Kralle.", "🐉",
       lambda L: draw_membrane(L, rgba("#2F7D3A"), rgba("#14421C"), rgba("#0B2A12"), rgba("#1E5A28"), rgba("#061A0A")),
       ["#2F7D3A", "#14421C", "#0B2A12"], flapSpeed=0.06, flapAmp=26, openAngle=42, tilt=4, scale=1.15),
    W_("bat", "Fledermaus", "Kleine schwarze Membranflügel mit schnellem, flatterigem Schlag.", "🦇",
       lambda L: draw_membrane(L, rgba("#26262E"), rgba("#111116"), rgba("#0A0A0E"), rgba("#1C1C24"), rgba("#050507"), scale=0.78),
       ["#26262E", "#111116", "#0A0A0E"], flapSpeed=0.2, flapAmp=24, openAngle=38, tilt=4, scale=0.8),
    W_("neon", "Neon-Flügel", "Fast schwarze Membran mit grell leuchtenden Neon-Kanten in Chaos-Rot.", "⚡",
       lambda L: draw_membrane(L, rgba("#0A0A0F"), rgba("#15050A"), rgba("#1A1A22"), rgba("#3A0A14"), rgba("#FF1F3D"), glow_c=rgba("#FF2D8A"), mem_alpha=215),
       ["#0A0A0F", "#FF1F3D", "#FF2D8A"], flapSpeed=0.085, flapAmp=18, openAngle=40, tilt=8, glow=True),
    W_("butterfly", "Schmetterling", "Pink-violette Schmetterlingsflügel mit Augenflecken und weißen Randpunkten.", "🦋",
       lambda L: draw_butterfly(L, rgba("#FF7EB6"), rgba("#7C3AED"), rgba("#3B0764"), rgba("#1E1B4B"), rgba("#60A5FA"), rgba("#1E1B4B")),
       ["#FF7EB6", "#7C3AED", "#1E1B4B"], flapSpeed=0.12, flapAmp=24, openAngle=34, tilt=6),
    W_("fairy", "Feenflügel", "Durchscheinend schimmernd in Cyan und Weiß – mit Glitzerstaub.", "✨",
       lambda L: draw_butterfly(L, rgba("#ECFEFF"), rgba("#22D3EE"), rgba("#A5F3FC"), rgba("#67E8F9"), rgba("#FFFFFF"), rgba("#CFFAFE"), mem_alpha=175),
       ["#ECFEFF", "#22D3EE", "#A5F3FC"], flapSpeed=0.16, flapAmp=14, openAngle=36, tilt=10, glow=True, particle="end_rod"),
    W_("crystal", "Kristallflügel", "Kantige Eiskristalle, klar und kühl – mit Schneeschimmer.", "❄",
       lambda L: draw_crystal(L, rgba("#E0F2FE"), rgba("#7DD3FC"), rgba("#0369A1"), rgba("#F0F9FF")),
       ["#E0F2FE", "#7DD3FC", "#0369A1"], flapSpeed=0.06, flapAmp=10, openAngle=38, tilt=12, particle="snowflake"),
    # ---- Premium
    W_("void", "Void-Schwingen", "Tiefschwarze Federn mit violettem Leuchten und funkelnden Sternen – aus dem Nichts.", "🕳",
       lambda L: draw_feathered(L, rgba("#0B0612"), rgba("#6D28D9"), rgba("#1B1030"), outline_f=0.4, stars=((221, 214, 254, 255), 26, (139, 92, 246, 255)), tip_glow=rgba("#A78BFA")),
       ["#0B0612", "#6D28D9", "#A78BFA"], flapSpeed=0.07, flapAmp=18, openAngle=42, tilt=12, glow=True, particle="portal"),
    W_("inferno", "Inferno-Drache", "Glühende Lavamembran auf verkohlten Knochen – brennt und funkelt.", "🌋",
       lambda L: draw_membrane(L, rgba("#FF6A00"), rgba("#7A0F0F"), rgba("#1A0A0D"), rgba("#FFD166"), rgba("#120508"), glow_c=rgba("#FFB347")),
       ["#FF6A00", "#7A0F0F", "#FFD166"], flapSpeed=0.065, flapAmp=26, openAngle=42, tilt=6, scale=1.18, glow=True, particle="flame"),
    W_("cyber", "Cyber-Flügel", "Fast schwarze Membran mit leuchtenden Cyan-Schaltkreisen – Neon aus der Zukunft.", "🤖",
       lambda L: draw_membrane(L, rgba("#050A12"), rgba("#071A24"), rgba("#0B2A36"), rgba("#00E5FF"), rgba("#00FFF0"), glow_c=rgba("#7DF9FF"), mem_alpha=220),
       ["#050A12", "#00E5FF", "#7DF9FF"], flapSpeed=0.09, flapAmp=18, openAngle=40, tilt=8, glow=True, particle="dust_cyan"),
    W_("frost", "Frostflügel", "Eisblaue Federn mit weißem Glitzer – kühl leuchtend, mit Schneeflocken.", "🧊",
       lambda L: draw_feathered(L, rgba("#E0F2FE"), rgba("#38BDF8"), rgba("#FFFFFF"), outline_f=0.6, stars=((255, 255, 255, 255), 20, (186, 230, 253, 255))),
       ["#E0F2FE", "#38BDF8", "#FFFFFF"], flapSpeed=0.065, flapAmp=16, openAngle=40, tilt=12, glow=True, particle="snowflake"),
    W_("blood-angel", "Blutengel", "Weiße Engelsfedern, deren Spitzen in Blut getaucht sind.", "🩸",
       lambda L: draw_feathered(L, rgba("#F4F6FA"), rgba("#B91C1C"), rgba("#FFFFFF"), outline_f=0.55, tip_glow=rgba("#FF2D44")),
       ["#F4F6FA", "#B91C1C", "#FF2D44"], flapSpeed=0.075, flapAmp=18, openAngle=42, tilt=12, particle="dust_red"),
    W_("golden", "Goldene Schwingen", "Federn aus poliertem Gold mit hellem Glanz – leuchten warm.", "🏆",
       lambda L: draw_feathered(L, rgba("#FDE68A"), rgba("#B45309"), rgba("#FFF7CC"), outline_f=0.6, stars=((255, 255, 255, 255), 30, (253, 224, 71, 255))),
       ["#FDE68A", "#B45309", "#FFF7CC"], flapSpeed=0.07, flapAmp=16, openAngle=40, tilt=12, glow=True, particle="dust_gold"),
    # ---- Legendär (nur per Code)
    W_("overlord", "Chaos Overlord", "LEGENDÄR · Schwarze Drachenschwingen mit pulsierenden Energieadern, Blitzen und Glut – nur mit Code.", "👑",
       draw_overlord, ["#4A0810", "#FF1F3D", "#FFE4E8"], flapSpeed=0.06, flapAmp=28, openAngle=44, tilt=6, scale=1.32, glow=True, particle="overlord", frames=8, fps=10, exclusive=True),
    W_("celestial", "Celestial Seraph", "LEGENDÄR · Schillernde Federn, die ihre Farbe wechseln, mit Sternenstaub und Lichtspuren – nur mit Code.", "🌟",
       draw_celestial, ["#E0F7FF", "#8B5CF6", "#F5C342"], flapSpeed=0.065, flapAmp=18, openAngle=46, tilt=14, scale=1.3, glow=True, particle="celestial", frames=8, fps=8, exclusive=True),
    W_("seraph", "Seraphim", "Drei Lagen leuchtend weißer Federn mit goldenem Saum – überirdisch.", "👼",
       lambda L: draw_feathered(L, rgba("#FFFFFF"), rgba("#F5C342"), rgba("#FFF8E1"), outline_f=0.68, stars=((255, 255, 255, 255), 18, (255, 241, 184, 255))),
       ["#FFFFFF", "#F5C342", "#FFF8E1"], flapSpeed=0.06, flapAmp=14, openAngle=44, tilt=14, scale=1.12, glow=True, particle="glow"),
]


def build(design, frame=0):
    L = Layer()
    if design.get("frames", 1) > 1:
        design["draw"](L, frame, design["frames"])
    else:
        design["draw"](L)
    a = L.img  # Original: Wurzel links
    tex = Image.new("RGBA", TEX, (0, 0, 0, 0))
    tex.paste(a.transpose(Image.FLIP_LEFT_RIGHT), (0, 0))  # Region 1 (Nordseite): Wurzel rechts
    tex.paste(a, (IW, 0))  # Region 2 (Südseite): Wurzel links
    return tex


def main():
    os.makedirs(OUT_L, exist_ok=True)
    os.makedirs(OUT_M, exist_ok=True)
    out = {
        "_doc": "Chaos Wings – gemeinsame Definition für Launcher (3D-Vorschau) und Chaos Client. Flügel = flache Textur-Ebene (plane.w × plane.h Einheiten, Oberkante plane.top über der Wurzel), Textur 2 px/Einheit, links gespiegelt (Nordseite), rechts Original (Südseite). Generiert von scripts/gen_wings.py.",
        "root": {"x": 2.0, "y": 1.5, "z": 2.3},
        "plane": {"w": W, "h": H, "top": TOP, "texW": TEX[0] // PX, "texH": TEX[1] // PX},
        "wings": [],
    }
    for d in DESIGNS:
        n = d.get("frames", 1)
        for k in range(n):
            tex = build(d, k)
            names = [d["id"] + ".png"] if k == 0 else []
            if n > 1:
                names.append("%s_f%d.png" % (d["id"], k))
            for nm in names:
                tex.save(os.path.join(OUT_L, nm))
                tex.save(os.path.join(OUT_M, nm))
        out["wings"].append({k: d[k] for k in ("id", "name", "description", "icon", "colors", "flapSpeed", "flapAmp", "openAngle", "tilt", "scale", "glow", "particle", "frames", "fps", "exclusive")})
        print("ok", d["id"], "(%d Frames)" % n if n > 1 else "")
    js = json.dumps(out, ensure_ascii=False, indent=2)
    for p in (os.path.join(LAUNCHER, "src", "lib", "wings.json"), os.path.join(MOD, "src", "main", "resources", "assets", "chaosclient", "wings.json")):
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(js + "\n")
    # Vorschau-Kontaktbogen
    sheet = Image.new("RGBA", (TEX[0] * 4, TEX[1] * ((len(DESIGNS) + 3) // 4)), (30, 30, 36, 255))
    for i, d in enumerate(DESIGNS):
        t = Image.open(os.path.join(OUT_L, d["id"] + ".png"))
        sheet.alpha_composite(t, ((i % 4) * TEX[0], (i // 4) * TEX[1]))
    sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
    sheet.save(os.path.join(HERE, "wings_sheet.png"))
    print("sheet:", os.path.join(HERE, "wings_sheet.png"))


if __name__ == "__main__":
    main()

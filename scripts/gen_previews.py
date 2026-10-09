"""
Vorschaubilder für das Ingame-Cosmetics-Menü des Chaos Clients:
  textures/previews/hats/<id>.png     – Hut auf einem Steve-Kopf, gerendert mit trailer3d (96×96, transparent)
  textures/previews/effects/<id>.png  – Partikelbild nach Muster/Farben aus builtinEffects.ts (96×96, transparent)
Aufruf: python scripts/gen_previews.py
"""
import math
import os
import random
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MOD = os.path.join(os.path.dirname(ROOT), "onyx-visuals")
OUT = os.path.join(MOD, "src", "main", "resources", "assets", "chaosclient", "textures", "previews")
sys.path.insert(0, HERE)
import trailer3d as t3  # noqa: E402
from gen_hats import HATS  # noqa: E402

S = 96


def render_hats():
    os.makedirs(os.path.join(OUT, "hats"), exist_ok=True)
    skin = Image.open("D:/tmp/trailer/assets/steve.png").convert("RGBA")
    for hat in HATS:
        # Kopf (nur Kopf-Box + Hut), Kamera schräg von vorn-oben
        quads = []
        faces = t3.skin_faces(skin, 0, 0, 8, 8, 8, up=8)
        quads += t3.box_quads(-4, 24, -4, 4, 32, 4, faces)
        ov = t3.skin_faces(skin, 32, 0, 8, 8, 8, up=8)
        if any(np.asarray(f)[..., 3].max() > 0 for f in ov.values()):
            quads += t3.box_quads(-4.5, 23.5, -4.5, 4.5, 32.5, 4.5, ov)
        quads += t3.hat_quads(hat["id"], t=0.0)
        # Bounding der Hut-Boxen für den Zoom
        ys = [24 - y for (_, y, _, _, h, _, _) in hat["boxes"]] + [24 - (y + h) for (_, y, _, _, h, _, _) in hat["boxes"]] + [24, 32]
        top = max(ys)
        extent = max(abs(v) for b in hat["boxes"] for v in (b[0], b[0] + b[3], b[2], b[2] + b[5])) + 1
        center_y = (min(ys) + top) / 2 + 1
        dist = 26 + max(0, extent - 5) * 2.2 + max(0, top - 32) * 0.8
        cam = t3.Camera(pos=(dist * 0.72, center_y + dist * 0.45, -dist * 0.72), target=(0, center_y, 0), fov_deg=40, w=S * 4, h=S * 4)
        im = t3.render_quads(quads, cam, (S * 4, S * 4), fog=(500, 1000))
        im = im.resize((S, S), Image.LANCZOS)
        im.save(os.path.join(OUT, "hats", hat["id"] + ".png"))
    print("hats:", len(HATS))


def parse_effects():
    src = open(os.path.join(ROOT, "src", "lib", "builtinEffects.ts"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r'id: "([a-z-]+)".*?colors: \[([^\]]*)\].*?pattern: "([a-z]+)"', src):
        cols = re.findall(r'"#([0-9a-fA-F]{6})"', m.group(2))
        out.append((m.group(1), [tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) for c in cols], m.group(3)))
    return out


def render_effects():
    os.makedirs(os.path.join(OUT, "effects"), exist_ok=True)
    for eid, cols, pat in parse_effects():
        rnd = random.Random(hash(eid) & 0xFFFF)
        big = S * 4
        im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        cx, cy = big / 2, big / 2
        pts = []
        n = 70
        for i in range(n):
            f = i / n
            if pat == "ring":
                a = f * math.tau * 2
                r = big * (0.26 + 0.08 * math.sin(a * 3))
                pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r * 0.45 + (f - 0.5) * big * 0.5))
            elif pat == "orbit":
                a = f * math.tau * 2.5
                r = big * 0.3 * (1 - f * 0.5)
                pts.append((cx + math.cos(a) * r, cy - (f - 0.5) * big * 0.6 + math.sin(a) * r * 0.3))
            elif pat == "rise":
                pts.append((cx + (rnd.random() - 0.5) * big * 0.6, cy + big * 0.4 - f * big * 0.8 + rnd.random() * 20))
            elif pat == "rain":
                pts.append((cx + (rnd.random() - 0.5) * big * 0.8, cy - big * 0.4 + f * big * 0.8 + rnd.random() * 20))
            elif pat == "burst":
                a = rnd.random() * math.tau
                r = big * 0.4 * math.sqrt(rnd.random())
                pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
            else:  # feet
                pts.append((cx + (rnd.random() - 0.5) * big * 0.7, cy + big * 0.3 - rnd.random() * big * 0.25))
        for i, (x, y) in enumerate(pts):
            c = cols[i % len(cols)]
            sz = 7 + rnd.random() * 9
            d.ellipse([x - sz, y - sz, x + sz, y + sz], fill=c + (230,))
        glow = im.filter(ImageFilter.GaussianBlur(14))
        base = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        base.alpha_composite(glow)
        base.alpha_composite(im)
        base.resize((S, S), Image.LANCZOS).save(os.path.join(OUT, "effects", eid + ".png"))
    print("effects:", len(parse_effects()))


if __name__ == "__main__":
    render_hats()
    render_effects()
    # Kontaktbogen
    hats = [Image.open(os.path.join(OUT, "hats", h["id"] + ".png")) for h in HATS]
    effs = [Image.open(os.path.join(OUT, "effects", e[0] + ".png")) for e in parse_effects()]
    cols = 8
    rows = math.ceil(len(hats) / cols) + math.ceil(len(effs) / cols)
    sheet = Image.new("RGBA", (S * cols, S * rows), (30, 30, 36, 255))
    for i, im in enumerate(hats):
        sheet.alpha_composite(im, ((i % cols) * S, (i // cols) * S))
    off = math.ceil(len(hats) / cols)
    for i, im in enumerate(effs):
        sheet.alpha_composite(im, ((i % cols) * S, (off + i // cols) * S))
    sheet.save("D:/tmp/previews_sheet.png")
    print("sheet: D:/tmp/previews_sheet.png")

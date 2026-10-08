"""
CHAOS LAUNCHER – Cinematic Trailer (1080p, 30 fps), komplett in Python gerendert.

Szenen: 1 Mysteriöser Start · 2 Chaos beginnt · 3 Launcher-Reveal (beat-synchron) ·
4 Montage · 5 Logo-Reveal mit Impact · 6 Final Shot. Ton: eigener Song des Nutzers
(Aufnahme), Schnitte auf den erkannten Beat (102 BPM).

Eingaben: D:/tmp/trailer/song.wav, D:/tmp/trailer/assets/skin.png, assets/blocks/*.png,
          D:/tmp/video/shots/*.png, src/assets/wings/*.png, website/assets/icon.png
Ausgabe:  D:/tmp/trailer/chaos-launcher-trailer.mp4
"""
import math
import os
import random
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TR = "D:/tmp/trailer"
SHOTS = "D:/tmp/video/shots"
OUT = os.path.join(TR, "chaos-launcher-trailer.mp4")
FF = r"C:\Users\fabian\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
W, H, FPS = 1920, 1080, 30
BAR = 120  # Letterbox
RED = (225, 29, 46)
RED_D = (120, 10, 20)
ORANGE = (255, 140, 60)
WHITE = (245, 245, 247)
random.seed(42)
rng = np.random.default_rng(42)


# ------------------------------------------------------------------ Audio / Beat
def load_song():
    w = wave.open(os.path.join(TR, "song.wav"))
    sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return a, sr


def analyze(a, sr):
    hop = 512
    n = len(a) // hop
    fr = a[: n * hop].reshape(n, hop) * np.hanning(hop)
    spec = np.abs(np.fft.rfft(fr, axis=1))
    flux = np.maximum(spec[1:] - spec[:-1], 0).sum(axis=1)
    flux = np.concatenate([[0], flux])
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    ofps = sr / hop
    bpm = 102.0
    period = 60 / bpm
    # Phase: Beatraster so legen, dass es die Onsets am besten trifft
    best = (-1e9, 0.0)
    for ph in np.linspace(0, period, 40, endpoint=False):
        times = np.arange(ph, len(a) / sr, period)
        idx = np.clip((times * ofps).astype(int), 0, len(flux) - 1)
        v = flux[idx].sum()
        if v > best[0]:
            best = (v, ph)
    beats = list(np.arange(best[1], len(a) / sr, period))
    # Energie pro 0.1 s (für Puls/Glitch-Stärke)
    step = sr // 10
    energy = np.array([np.sqrt((a[i * step:(i + 1) * step] ** 2).mean()) for i in range(len(a) // step)])
    energy = energy / (energy.max() + 1e-9)
    return beats, flux, ofps, energy


SONG, SR = load_song()
BEATS, FLUX, OFPS, ENERGY = analyze(SONG, SR)
BEAT = 60 / 102.0


def onset(t):
    i = int(t * OFPS)
    return float(FLUX[i]) if 0 <= i < len(FLUX) else 0.0


def energy(t):
    i = int(t * 10)
    return float(ENERGY[i]) if 0 <= i < len(ENERGY) else 0.0


def beat_phase(t):
    """0..1 innerhalb des aktuellen Beats (0 = Beat-Schlag)."""
    i = np.searchsorted(BEATS, t) - 1
    if i < 0:
        return 1.0
    return (t - BEATS[i]) / BEAT


def beats_between(t0, t1, every=1):
    return [b for k, b in enumerate(BEATS) if t0 <= b < t1 and k % every == 0]


# ------------------------------------------------------------------ Fonts / Assets
def font(size, weight="bold"):
    name = {"bold": "segoeuib.ttf", "regular": "segoeui.ttf", "light": "segoeuil.ttf", "semi": "seguisb.ttf", "black": "segoeuib.ttf"}[weight]
    return ImageFont.truetype("C:/Windows/Fonts/" + name, size)


LOGO = Image.open(os.path.join(ROOT, "website", "assets", "icon.png")).convert("RGBA")
SKIN = Image.open(os.path.join(TR, "assets", "skin.png")).convert("RGBA")
BLOCK_NAMES = ["obsidian", "deepslate", "blackstone", "netherrack", "redstone_block", "crying_obsidian", "basalt_side", "polished_blackstone", "red_nether_bricks", "magma", "stone", "ancient_debris_side"]
BLOCKS = {n: Image.open(os.path.join(TR, "assets", "blocks", n + ".png")).convert("RGBA").resize((64, 64), Image.NEAREST) for n in BLOCK_NAMES}


def shot(name):
    return Image.open(os.path.join(SHOTS, name + ".png")).convert("RGB")


SHOT_CACHE = {}


def get_shot(name):
    if name not in SHOT_CACHE:
        SHOT_CACHE[name] = shot(name)
    return SHOT_CACHE[name]


# ------------------------------------------------------------------ Geometrie-Helfer
def affine_quad(src, dst):
    """Bild `src` (RGBA) so transformieren, dass seine Ecken auf das Parallelogramm dst (4 Punkte) fallen. Rückgabe: (Bild, (x,y))."""
    xs = [p[0] for p in dst]
    ys = [p[1] for p in dst]
    x0, y0 = int(math.floor(min(xs))), int(math.floor(min(ys)))
    ow, oh = int(math.ceil(max(xs))) - x0 + 1, int(math.ceil(max(ys))) - y0 + 1
    # Ausgabe → Quelle: affine über 3 Punkte (dst0→(0,0), dst1→(w,0), dst3→(0,h))
    sw, sh = src.size
    d0, d1, d3 = [(p[0] - x0, p[1] - y0) for p in (dst[0], dst[1], dst[3])]
    A = np.array([[d0[0], d0[1], 1], [d1[0], d1[1], 1], [d3[0], d3[1], 1]], dtype=float)
    bx = np.array([0, sw, 0], dtype=float)
    by = np.array([0, 0, sh], dtype=float)
    cx = np.linalg.solve(A, bx)
    cy = np.linalg.solve(A, by)
    coeffs = (cx[0], cx[1], cx[2], cy[0], cy[1], cy[2])
    out = src.transform((ow, oh), Image.AFFINE, coeffs, resample=Image.NEAREST)
    return out, (x0, y0)


def shade(img, f):
    arr = np.asarray(img).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] * f, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


CUBE_CACHE = {}


def iso_cube(name, s):
    """Isometrischer Würfel (Kantenlänge s px) aus einer Blocktextur. Canvas 2s × 2s."""
    key = (name, s)
    if key in CUBE_CACHE:
        return CUBE_CACHE[key]
    tex = BLOCKS[name]
    cv = Image.new("RGBA", (2 * s, 2 * s), (0, 0, 0, 0))
    h = s / 2
    top = [(s, 0), (2 * s, h), (s, 2 * h), (0, h)]
    left = [(0, h), (s, 2 * h), (s, 2 * h + s), (0, h + s)]
    right = [(s, 2 * h), (2 * s, h), (2 * s, h + s), (s, 2 * h + s)]
    for quad, f in ((top, 1.0), (left, 0.62), (right, 0.42)):
        face, pos = affine_quad(shade(tex, f), quad)
        cv.alpha_composite(face, pos)
    CUBE_CACHE[key] = cv
    return cv


def iso_box(front, side, top, dst_origin, w, h, d, scale):
    """Isometrische Box aus 3 Texturen (Pixel-Flächen), Ursprung = linke untere vordere Ecke in Iso-Koordinaten."""
    # Iso-Projektion: x → (+0.866, +0.5), z → (-0.866, +0.5), y → (0, -1)
    ox, oy = dst_origin
    ux, uy = 0.866 * scale, 0.5 * scale
    def P(x, y, z):
        return (ox + (x * ux - z * ux), oy + (x * uy + z * uy) - y * scale)
    parts = []
    # Vorderseite (x-Breite w, y-Höhe h) bei z=0
    parts.append((front, [P(0, h, 0), P(w, h, 0), P(w, 0, 0), P(0, 0, 0)], 0.86))
    # rechte Seite (z-Tiefe d) bei x=w
    parts.append((side, [P(w, h, 0), P(w, h, d), P(w, 0, d), P(w, 0, 0)], 0.6))
    # Oberseite
    parts.append((top, [P(0, h, d), P(w, h, d), P(w, h, 0), P(0, h, 0)], 1.0))
    return parts


def render_player(scale=12):
    """Spielerfigur aus dem Skin (isometrisch), inkl. Hut-/Jacken-Overlay. Rückgabe RGBA-Bild."""
    def tex(x, y, w, h, flip=False):
        im = SKIN.crop((x, y, x + w, y + h))
        return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im

    def with_overlay(base, ov):
        b = base.copy()
        b.alpha_composite(ov)
        return b

    cv = Image.new("RGBA", (int(40 * scale), int(44 * scale)), (0, 0, 0, 0))
    ox, oy = int(14 * scale), int(36 * scale)
    boxes = []
    # (front, side(right), top, origin(x,y,z), w,h,d)  – Einheiten: Skin-Pixel
    # Beine
    boxes += iso_box(with_overlay(tex(4, 20, 4, 12), tex(4, 36, 4, 12)), with_overlay(tex(8, 20, 4, 12), tex(8, 36, 4, 12)), tex(4, 16, 4, 4), (ox, oy), 4, 12, 4, scale)  # rechtes Bein (Skin) links im Bild
    boxes_l = iso_box(with_overlay(tex(20, 52, 4, 12), tex(4, 52, 4, 12)), with_overlay(tex(24, 52, 4, 12), tex(8, 52, 4, 12)), tex(20, 48, 4, 4), (ox + int(4 * 0.866 * scale), oy + int(4 * 0.5 * scale)), 4, 12, 4, scale)
    # Körper
    body = iso_box(with_overlay(tex(20, 20, 8, 12), tex(20, 36, 8, 12)), with_overlay(tex(28, 20, 4, 12), tex(28, 36, 4, 12)), tex(20, 16, 8, 4), (ox, oy - int(12 * scale)), 8, 12, 4, scale)
    # Arme
    arm_r = iso_box(with_overlay(tex(44, 20, 4, 12), tex(44, 36, 4, 12)), with_overlay(tex(48, 20, 4, 12), tex(48, 36, 4, 12)), tex(44, 16, 4, 4), (ox - int(4 * 0.866 * scale), oy - int(12 * scale) - int(4 * 0.5 * scale)), 4, 12, 4, scale)
    arm_l = iso_box(with_overlay(tex(36, 52, 4, 12), tex(52, 52, 4, 12)), with_overlay(tex(40, 52, 4, 12), tex(56, 52, 4, 12)), tex(36, 48, 4, 4), (ox + int(8 * 0.866 * scale), oy - int(12 * scale) + int(8 * 0.5 * scale)), 4, 12, 4, scale)
    # Kopf
    head = iso_box(with_overlay(tex(8, 8, 8, 8), tex(40, 8, 8, 8)), with_overlay(tex(16, 8, 8, 8), tex(48, 8, 8, 8)), with_overlay(tex(8, 0, 8, 8), tex(40, 0, 8, 8)), (ox, oy - int(20 * scale)), 8, 8, 8, scale)
    order = [arm_r, boxes, boxes_l, body, arm_l, head]
    for parts in order:
        for img, quad, f in parts:
            face, pos = affine_quad(shade(img.resize((img.width * 8, img.height * 8), Image.NEAREST), f), quad)
            cv.alpha_composite(face, pos)
    return cv


def outline(img, px=4, color=(18, 2, 4, 255)):
    a = img.split()[3].filter(ImageFilter.MaxFilter(px * 2 + 1))
    ol = Image.new("RGBA", img.size, color)
    ol.putalpha(a)
    ol.alpha_composite(img)
    return ol


PLAYER = outline(render_player(12))


def wing_frame(wid, k, scale):
    im = Image.open(os.path.join(ROOT, "src", "assets", "wings", f"{wid}_f{k}.png")).convert("RGBA")
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


# ------------------------------------------------------------------ Overlays (vorberechnet)
def make_vignette():
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    v = np.clip(1.18 - 0.55 * d ** 1.6, 0, 1)
    return v[..., None].astype(np.float32)


VIGNETTE = make_vignette()
GRAIN = [rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]
SCANLINES = (1 - 0.06 * (np.arange(H) % 3 == 0))[:, None, None].astype(np.float32)


def radial_sprite(size, color, power=2.2):
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / (size / 2)
    a = np.clip(1 - d, 0, 1) ** power
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = color
    arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


GLOW_RED = radial_sprite(900, RED, 2.6)
GLOW_ORANGE = radial_sprite(500, ORANGE, 2.4)
DOT_RED = radial_sprite(24, (255, 120, 130), 1.5)
DOT_WHITE = radial_sprite(16, (255, 255, 255), 1.5)


def text_img(s, f, fill=WHITE, glow=None, blur=16, spacing=0):
    """Text als RGBA-Sprite (mit optionalem Glow), einmal berechnet."""
    if spacing:
        s2 = s
        widths = [f.getlength(ch) for ch in s2]
        tw = int(sum(widths) + spacing * (len(s2) - 1))
    else:
        tw = int(f.getlength(s))
    th = int(f.size * 1.4)
    pad = blur * 3 if glow else 4
    img = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def draw(fill_):
        x = pad
        if spacing:
            for ch, cw in zip(s, widths):
                d.text((x, pad), ch, font=f, fill=fill_)
                x += cw + spacing
        else:
            d.text((pad, pad), s, font=f, fill=fill_)

    if glow:
        draw(glow + (255,))
        img = img.filter(ImageFilter.GaussianBlur(blur))
        d = ImageDraw.Draw(img)
    draw(fill + (255,))
    return img


TXT_CACHE = {}


def txt(key, *args, **kw):
    if key not in TXT_CACHE:
        TXT_CACHE[key] = text_img(*args, **kw)
    return TXT_CACHE[key]


# ------------------------------------------------------------------ Frame-Compositing (numpy)
def to_np(img):
    return np.asarray(img.convert("RGB")).astype(np.float32)


def composite(base_np, sprite, x, y, alpha=1.0):
    """RGBA-Sprite additiv-normal auf float-RGB-Array legen (x,y = linke obere Ecke)."""
    sw, sh = sprite.size
    x0, y0 = int(x), int(y)
    x1, y1 = x0 + sw, y0 + sh
    bx0, by0, bx1, by1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if bx0 >= bx1 or by0 >= by1:
        return
    sp = np.asarray(sprite).astype(np.float32)[by0 - y0:by1 - y0, bx0 - x0:bx1 - x0]
    a = sp[..., 3:4] / 255.0 * alpha
    base_np[by0:by1, bx0:bx1] = base_np[by0:by1, bx0:bx1] * (1 - a) + sp[..., :3] * a


def add_light(base_np, sprite, x, y, strength=1.0):
    """Additives Licht (Glow)."""
    sw, sh = sprite.size
    x0, y0 = int(x), int(y)
    x1, y1 = x0 + sw, y0 + sh
    bx0, by0, bx1, by1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if bx0 >= bx1 or by0 >= by1:
        return
    sp = np.asarray(sprite).astype(np.float32)[by0 - y0:by1 - y0, bx0 - x0:bx1 - x0]
    a = sp[..., 3:4] / 255.0 * strength
    base_np[by0:by1, bx0:bx1] += sp[..., :3] * a


def finish(arr, t, grain=0.035, letterbox=True, flash=0.0, shake=(0, 0), aberration=0):
    """Grading, Vignette, Körnung, Letterbox → PIL."""
    if shake != (0, 0):
        arr = np.roll(arr, shift=(int(shake[1]), int(shake[0])), axis=(0, 1))
    if aberration > 0:
        s = int(aberration)
        arr = arr.copy()
        arr[..., 0] = np.roll(arr[..., 0], s, axis=1)
        arr[..., 2] = np.roll(arr[..., 2], -s, axis=1)
    # Grading: kühle Schatten leicht rötlich, Lichter leicht warm
    arr = arr * np.array([1.0, 0.95, 0.96], dtype=np.float32)
    arr = arr * VIGNETTE
    if grain > 0:
        g = GRAIN[int(t * FPS) % len(GRAIN)]
        g = np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)[:H, :W]
        arr = arr + g[..., None] * (grain * 255)
    arr = arr * SCANLINES
    if flash > 0:
        arr = arr + 255 * flash
    arr = np.clip(arr, 0, 255)
    if letterbox:
        arr[:BAR] = 0
        arr[H - BAR:] = 0
    return Image.fromarray(arr.astype(np.uint8), "RGB")


# ------------------------------------------------------------------ Welt-Elemente
class Particles:
    def __init__(self, n, seed=1):
        r = np.random.default_rng(seed)
        self.p = np.stack([r.uniform(-1.6, 1.6, n), r.uniform(-1, 1, n), r.uniform(0.3, 4.0, n)], axis=1)  # x, y, z
        self.v = r.uniform(0.02, 0.08, n)
        self.ph = r.uniform(0, 6.28, n)

    def draw(self, arr, t, cam_speed=0.0, alpha=1.0, tint=0.0):
        z = (self.p[:, 2] - t * (0.08 + cam_speed)) % 4.0 + 0.3
        f = 900.0
        x = W / 2 + self.p[:, 0] * f / z + np.sin(t * 0.7 + self.ph) * 6
        y = H / 2 + (self.p[:, 1] - t * self.v * 0.1 % 1.0) * f / z
        size = np.clip(14 / z, 2, 24)
        bright = np.clip(1.2 / z, 0.15, 1.0) * (0.6 + 0.4 * np.sin(t * 3 + self.ph))
        order = np.argsort(-z)
        for i in order:
            if 0 <= x[i] < W and 0 <= y[i] < H:
                s = int(size[i])
                spr = DOT_WHITE if tint > 0.5 and i % 7 == 0 else DOT_RED
                add_light(arr, spr.resize((s, s)), x[i] - s / 2, y[i] - s / 2, strength=bright[i] * alpha)


PARTS = Particles(220)
PARTS_B = Particles(140, seed=5)


def grid_floor(arr, t, speed, alpha, color=RED_D, horizon=0.56):
    """Perspektivischer Boden (Linien), bewegt sich auf die Kamera zu."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hy = int(H * horizon)
    vp = (W / 2, hy)
    col = color + (int(255 * alpha),)
    # Längslinien
    for i in range(-14, 15):
        x_far = W / 2 + i * 70
        x_near = W / 2 + i * 420
        d.line([(x_far, hy), (x_near, H + 100)], fill=col, width=2)
    # Querlinien (bewegt)
    off = (t * speed) % 1.0
    for k in range(1, 26):
        z = (k - off)
        if z <= 0.05:
            continue
        y = hy + (H - hy) * (1.2 / z) * 0.3
        if y > H:
            continue
        a = int(255 * alpha * min(1, (y - hy) / (H - hy) + 0.1))
        d.line([(0, y), (W, y)], fill=color + (a,), width=2 if z < 3 else 1)
    # Horizontlicht
    d.line([(0, hy), (W, hy)], fill=RED + (int(200 * alpha),), width=2)
    composite(arr, img, 0, 0)


class CubeField:
    def __init__(self, n=48, seed=3):
        r = np.random.default_rng(seed)
        self.pos = np.stack([r.uniform(-2.2, 2.2, n), r.uniform(-1.3, 1.3, n), r.uniform(0.6, 6.0, n)], axis=1)
        self.rot = r.uniform(0, 1, n)
        self.names = [BLOCK_NAMES[i % len(BLOCK_NAMES)] for i in r.permutation(n)]

    def draw(self, arr, t, speed, alpha=1.0, fog_z=5.5, tint_light=True):
        z = (self.pos[:, 2] - t * speed) % 6.0 + 0.6
        f = 1000.0
        order = np.argsort(-z)
        for i in order:
            zz = z[i]
            sx = W / 2 + self.pos[i, 0] * f / zz
            sy = H / 2 + (self.pos[i, 1] + math.sin(t * 0.6 + i) * 0.05) * f / zz
            s = int(np.clip(260 / zz, 10, 420))
            if s < 12:
                continue
            fog = float(np.clip(1 - (zz - 1.0) / fog_z, 0.08, 1.0)) * alpha
            cube = iso_cube(self.names[i], min(s, 400) // 2 * 2)
            if sx + cube.width < 0 or sx - cube.width > W or sy + cube.height < 0 or sy - cube.height > H:
                continue
            composite(arr, cube, sx - cube.width / 2, sy - cube.height / 2, alpha=fog)
            if tint_light and self.names[i] in ("redstone_block", "magma", "crying_obsidian"):
                g = GLOW_ORANGE if self.names[i] == "magma" else GLOW_RED
                gs = int(cube.width * 1.6)
                add_light(arr, g.resize((gs, gs)), sx - gs / 2, sy - gs / 2, strength=0.35 * fog)


CUBES = CubeField()
CUBES_BG = CubeField(36, seed=9)


def glitch(arr, strength):
    """Digitale Störung: horizontale Streifen versetzen + Kanalversatz."""
    if strength <= 0.02:
        return arr
    arr = arr.copy()
    n = int(2 + strength * 10)
    for _ in range(n):
        y = random.randint(0, H - 30)
        h = random.randint(4, 40)
        dx = int(random.uniform(-80, 80) * strength)
        arr[y:y + h] = np.roll(arr[y:y + h], dx, axis=1)
    s = int(6 * strength)
    if s:
        arr[..., 0] = np.roll(arr[..., 0], s, axis=1)
        arr[..., 2] = np.roll(arr[..., 2], -s, axis=1)
    return arr


def hud(arr, label, t, p):
    """Futuristische UI-Rahmen: Ecken, Label, Scanlinie."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = 60
    L = int(40 + 30 * min(1, p * 4))
    for (x, y, sx, sy) in ((m, BAR + m, 1, 1), (W - m, BAR + m, -1, 1), (m, H - BAR - m, 1, -1), (W - m, H - BAR - m, -1, -1)):
        d.line([(x, y), (x + sx * L, y)], fill=RED + (220,), width=3)
        d.line([(x, y), (x, y + sy * L)], fill=RED + (220,), width=3)
    f = font(22, "semi")
    lab = f"// {label}"
    d.text((m + 56, BAR + m - 6), lab, font=f, fill=WHITE + (int(255 * min(1, p * 3)),))
    d.text((W - m - 56 - f.getlength("CHAOS LAUNCHER 2.3"), BAR + m - 6), "CHAOS LAUNCHER 2.3", font=f, fill=(200, 200, 210, 160))
    # Scanlinie
    sy = BAR + int(((t * 0.35) % 1.0) * (H - 2 * BAR))
    d.line([(m, sy), (W - m, sy)], fill=RED + (70,), width=2)
    composite(arr, img, 0, 0)


def ui_shot(arr, name, t0, t, dur, mode, label):
    """Screenshot mit Kamerabewegung: push (Zoom auf Punkt), slide, orbit (leichte Perspektive via Scherung)."""
    p = (t - t0) / dur
    sh = get_shot(name)
    if mode[0] == "push":
        _, fx, fy, z0, z1 = mode
        z = z0 + (z1 - z0) * (p ** 0.8)
        cw, ch = int(W / z), int(H / z)
        cx, cy = int(fx * W), int(fy * H)
        x0 = int(np.clip(cx - cw / 2, 0, W - cw))
        y0 = int(np.clip(cy - ch / 2, 0, H - ch))
        crop = sh.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.LANCZOS if z > 1.05 else Image.BILINEAR)
        base = np.asarray(crop).astype(np.float32) * 0.92
        arr[:] = base
    elif mode[0] == "slide":
        _, dx = mode
        off = int(dx * (1 - p ** 0.6))
        base = np.asarray(sh).astype(np.float32) * 0.92
        arr[:] = np.roll(base, off, axis=1)
        if off > 0:
            arr[:, :off] = 0
        elif off < 0:
            arr[:, off:] = 0
    # leichte Abdunklung der Ränder + rotes Licht
    hud(arr, label, t, p)


# ------------------------------------------------------------------ Szenen
def scene1(t, dur, arr):
    p = t / dur
    # langsames Auftauchen: Partikel, dann Umgebung
    PARTS.draw(arr, t, cam_speed=0.0, alpha=min(1, p * 1.6) * 1.0)
    env = max(0, (p - 0.2) / 0.8)
    grid_floor(arr, t, speed=0.25 + 0.3 * p, alpha=0.5 * env)
    # subtile rote Lichtlinien
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for k in range(5):
        y = int(H * 0.56 - 60 * k - 10 * math.sin(t + k))
        a = int(70 * env * (1 - k / 6))
        d.line([(W * 0.2 + 40 * k, y), (W * 0.8 - 40 * k, y)], fill=RED + (a,), width=1)
    composite(arr, img, 0, 0)
    # Glow am Horizont
    add_light(arr, GLOW_RED, W / 2 - 450, H * 0.56 - 450, strength=0.35 * env)
    # Störungen gelegentlich
    g = onset(t)
    st = 0.25 * env if g > 2.2 else 0.0
    return glitch(arr, st), dict(grain=0.05)


def scene2(t, dur, arr):
    p = t / dur
    speed = 0.4 + 1.4 * p
    grid_floor(arr, t, speed=speed, alpha=0.45)
    CUBES.draw(arr, t, speed=0.35 + 0.9 * p, alpha=min(1, p * 2.5))
    PARTS.draw(arr, t, cam_speed=0.2 * p, alpha=0.9)
    # Energieimpulse auf jedem Beat: expandierende Ringe
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for b in beats_between(t - 1.2, t):
        age = t - b
        r = int(60 + age * 1400)
        a = int(190 * max(0, 1 - age / 1.1))
        d.ellipse([W / 2 - r, H * 0.56 - r * 0.42, W / 2 + r, H * 0.56 + r * 0.42], outline=RED + (a,), width=3)
    composite(arr, img, 0, 0)
    bp = beat_phase(t)
    add_light(arr, GLOW_RED, W / 2 - 450, H * 0.56 - 450, strength=0.3 + 0.35 * max(0, 1 - bp * 2))
    return glitch(arr, 0.12 if onset(t) > 2.8 else 0.0), dict(grain=0.04)


UI_SHOTS = [
    ("home", ("push", 0.45, 0.35, 1.0, 1.25), "HAUPTMENÜ"),
    ("play", ("slide", -500), "PROFIL · VERSION 1.21.11"),
    ("play", ("push", 0.30, 0.68, 1.2, 1.7), "FPS-BOOST"),
    ("mods", ("push", 0.5, 0.45, 1.0, 1.2), "MODS"),
    ("settings", ("slide", 500), "EINSTELLUNGEN"),
    ("cape", ("push", 0.62, 0.62, 1.05, 1.5), "COSMETICS · CAPES"),
    ("hat", ("push", 0.6, 0.55, 1.1, 1.6), "COSMETICS · HÜTE"),
    ("wings", ("push", 0.55, 0.45, 1.0, 1.45), "COSMETICS · WINGS"),
    ("servers", ("slide", -500), "MULTIPLAYER · SERVER"),
    ("friends", ("push", 0.5, 0.4, 1.0, 1.3), "FREUNDE"),
]


def scene3(t, dur, arr, t_abs):
    # Schnitte auf jeden 2. Beat; Shots rotieren
    cuts = beats_between(T3[0], T3[1], every=2)
    idx = max(0, np.searchsorted(cuts, t_abs) - 1)
    if not cuts or t_abs < cuts[0]:
        c0, c1 = T3[0], cuts[0] if cuts else T3[1]
        name, mode, label = UI_SHOTS[0]
    else:
        c0 = cuts[idx]
        c1 = cuts[idx + 1] if idx + 1 < len(cuts) else T3[1]
        name, mode, label = UI_SHOTS[idx % len(UI_SHOTS)]
    ui_shot(arr, name, c0, t_abs, max(0.2, c1 - c0), mode, label)
    # kurzer Glitch am Schnitt
    age = t_abs - c0
    st = 0.5 if age < 0.08 else 0.0
    return glitch(arr, st), dict(grain=0.03, flash=0.08 if age < 0.05 else 0.0)


def creator_shot(arr, t, p):
    """Der Entwickler: Skin-Figur mit Chaos-Overlord-Wings, Partikel, Titel."""
    CUBES_BG.draw(arr, t * 0.4, speed=0.1, alpha=0.35, fog_z=3.0, tint_light=False)
    grid_floor(arr, t, speed=0.3, alpha=0.25, horizon=0.7)
    k = int(t * 10) % 8
    wing = wing_frame("overlord", k, 7)
    flapk = 1 - 0.08 * (0.5 + 0.5 * math.sin(t * 2.8))
    half = wing.width // 2
    lw = max(1, int(half * flapk))
    left = wing.crop((0, 0, half, wing.height)).resize((lw, wing.height), Image.NEAREST)
    right = wing.crop((half, 0, wing.width, wing.height)).resize((lw, wing.height), Image.NEAREST)
    zoom = 1.0 + 0.06 * p
    cx, cy = W / 2, H * 0.50 + 10 * math.sin(t * 1.5)
    composite(arr, left, cx - lw - 10, cy - wing.height / 2 - 40, alpha=0.95)
    composite(arr, right, cx + 10, cy - wing.height / 2 - 40, alpha=0.95)
    add_light(arr, GLOW_RED, cx - 450, cy - 450, strength=0.18)
    pl = PLAYER.resize((int(PLAYER.width * 0.62 * zoom), int(PLAYER.height * 0.62 * zoom)), Image.LANCZOS)
    composite(arr, pl, cx - pl.width / 2 + 10, cy - pl.height / 2 + 20)
    PARTS_B.draw(arr, t, alpha=0.7)
    a = min(1, max(0, (p - 0.15) * 3))
    t1 = txt("creator1", "YTCHAOSFABI44", font(64, "bold"), glow=RED, blur=18, spacing=6)
    t2 = txt("creator2", "ENTWICKLER & GRÜNDER VON CHAOSCRAFT", font(26, "semi"), fill=(200, 200, 210), spacing=4)
    composite(arr, t1, W / 2 - t1.width / 2, H - BAR - 150 - t1.height / 2, alpha=a)
    composite(arr, t2, W / 2 - t2.width / 2, H - BAR - 70 - t2.height / 2, alpha=a)


def wings_shot(arr, t, p, wid, name, glow_col):
    CUBES_BG.draw(arr, t * 0.5, speed=0.2, alpha=0.3, fog_z=3.0, tint_light=False)
    k = int(t * 9) % 8
    # Zeitlupe kurz vor dem Reveal: Flügelschlag langsamer am Anfang
    sl = 0.35 + 0.65 * min(1, p * 2)
    wing = wing_frame(wid, k, 8)
    flapk = 1 - 0.1 * (0.5 + 0.5 * math.sin(t * 2.4 * sl))
    half = wing.width // 2
    lw = max(1, int(half * flapk))
    cx, cy = W / 2, H * 0.47
    left = wing.crop((0, 0, half, wing.height)).resize((lw, wing.height), Image.NEAREST)
    right = wing.crop((half, 0, wing.width, wing.height)).resize((lw, wing.height), Image.NEAREST)
    g = radial_sprite(900, glow_col, 2.4)
    add_light(arr, g, cx - 450, cy - 450, strength=0.4)
    composite(arr, left, cx - lw, cy - wing.height / 2)
    composite(arr, right, cx, cy - wing.height / 2)
    PARTS_B.draw(arr, t, alpha=0.8, tint=1.0)
    tt = txt("w_" + wid, name, font(56, "bold"), glow=glow_col, blur=18, spacing=8)
    t2 = txt("w2_" + wid, "LEGENDÄR · NUR MIT CODE", font(24, "semi"), fill=(245, 195, 66), spacing=5)
    a = min(1, max(0, (p - 0.1) * 4))
    composite(arr, tt, W / 2 - tt.width / 2, H - BAR - 150 - tt.height / 2, alpha=a)
    composite(arr, t2, W / 2 - t2.width / 2, H - BAR - 70 - t2.height / 2, alpha=a)


def flythrough(arr, t, p, speed=1.8):
    grid_floor(arr, t, speed=speed, alpha=0.4)
    CUBES.draw(arr, t, speed=speed * 0.7, alpha=1.0)
    PARTS.draw(arr, t, cam_speed=0.5, alpha=1.0)
    add_light(arr, GLOW_RED, W / 2 - 450, H * 0.56 - 450, strength=0.3)


def block_detail(arr, t, p, name):
    """Detailaufnahme eines Blocks: großer Würfel, langsame Drehung (per Skalierung der Seiten simuliert), Licht."""
    cube = iso_cube(name, 520)
    cx, cy = W / 2 + 120 * (p - 0.5), H * 0.5
    add_light(arr, GLOW_ORANGE if name == "magma" else GLOW_RED, cx - 250, cy - 250, strength=0.6)
    composite(arr, cube, cx - cube.width / 2, cy - cube.height / 2 + 20 * math.sin(t * 2))
    PARTS_B.draw(arr, t, alpha=0.6)
    lab = txt("blk_" + name, name.replace("_", " ").upper(), font(26, "semi"), fill=(200, 200, 210), spacing=6)
    composite(arr, lab, W / 2 - lab.width / 2, H - BAR - 80 - lab.height / 2, alpha=min(1, p * 4))


def feature_card(arr, t, p, title, sub):
    flythrough(arr, t, p, speed=1.2)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, H], fill=(0, 0, 0, 120))
    composite(arr, img, 0, 0)
    a = min(1, p * 5)
    t1 = txt("fc1_" + title, title, font(92, "bold"), glow=RED, blur=22, spacing=4)
    t2 = txt("fc2_" + sub, sub, font(30, "light"), fill=(215, 215, 225), spacing=3)
    composite(arr, t1, W / 2 - t1.width / 2, H / 2 - 40 - t1.height / 2 - 20 * (1 - a), alpha=a)
    composite(arr, t2, W / 2 - t2.width / 2, H / 2 + 70 - t2.height / 2, alpha=a)


MONTAGE = [
    ("fly", None), ("ui", ("wings", ("push", 0.25, 0.55, 1.3, 1.9), "WINGS · 3D-VORSCHAU")), ("card", ("19 WINGS", "ANIMIERT · LEUCHTEND · MIT PARTIKELN")),
    ("block", "redstone_block"), ("ui", ("hat", ("push", 0.7, 0.6, 1.5, 2.0), "25 HÜTE")), ("wings", ("overlord", "CHAOS OVERLORD", RED)),
    ("ui", ("cape", ("push", 0.68, 0.7, 1.4, 1.9), "ANIMIERTE CAPES")), ("block", "magma"), ("card", ("24 EFFEKTE", "CHAOS-STURM · GEWITTER · GALAXIE · BLUTMOND")),
    ("wings", ("celestial", "CELESTIAL SERAPH", (139, 92, 246))), ("ui", ("effect", ("push", 0.5, 0.5, 1.1, 1.5), "EFFEKTE")), ("fly", None),
    ("creator", None), ("ui", ("friends", ("push", 0.4, 0.45, 1.1, 1.4), "FREUNDE · LIVE-STATUS")), ("card", ("FREUNDE", "ANFRAGEN · ONLINE-STATUS · MITSPIELEN")),
    ("block", "crying_obsidian"), ("ui", ("play", ("push", 0.3, 0.7, 1.4, 1.9), "FPS-BOOST")), ("card", ("FPS-BOOST", "HOHE PRIORITÄT · RICHTIGE GPU · EIN KLICK")),
    ("fly", None), ("card", ("CHAOS-BADGE", "DAS ROTE C VOR DEINEM NAMEN")), ("ui", ("home", ("push", 0.5, 0.3, 1.2, 1.6), "AUTO-UPDATES")),
]


def scene4(t, dur, arr, t_abs):
    # Schnitte: pro Beat (Creator- und Wings-Shots dauern 4 Beats)
    cuts = beats_between(T4[0], T4[1])
    # Längen pro Element bestimmen
    plan = []
    i, k = 0, 0
    while i < len(cuts):
        kind, arg = MONTAGE[k % len(MONTAGE)]
        n = 4 if kind in ("creator", "wings") else (2 if kind in ("card", "fly") else 1)
        plan.append((cuts[i], cuts[min(i + n, len(cuts) - 1)] if i + n < len(cuts) else T4[1], kind, arg))
        i += n
        k += 1
    cur = plan[-1]
    for pl in plan:
        if pl[0] <= t_abs < pl[1]:
            cur = pl
            break
    c0, c1, kind, arg = cur
    p = (t_abs - c0) / max(0.2, c1 - c0)
    flash = 0.0
    if kind == "fly":
        flythrough(arr, t, p)
    elif kind == "ui":
        name, mode, label = arg
        ui_shot(arr, name, c0, t_abs, max(0.2, c1 - c0), mode, label)
    elif kind == "card":
        feature_card(arr, t, p, *arg)
    elif kind == "block":
        block_detail(arr, t, p, arg)
    elif kind == "wings":
        wings_shot(arr, t, p, *arg)
    elif kind == "creator":
        creator_shot(arr, t, p)
    age = t_abs - c0
    if age < 0.06:
        flash = 0.12
    return glitch(arr, 0.45 if age < 0.07 else 0.0), dict(grain=0.035, flash=flash, aberration=3 if age < 0.1 else 0)


def logo_pieces(size, n=8):
    lg = LOGO.resize((size, size), Image.LANCZOS)
    pieces = []
    pw = size // n
    for i in range(n):
        pieces.append((lg.crop((i * pw, 0, (i + 1) * pw if i < n - 1 else size, size)), i * pw))
    return lg, pieces


LG, LG_PIECES = logo_pieces(420)
LG_GLOW = LG.filter(ImageFilter.GaussianBlur(40))


def scene5(t, dur, arr):
    p = t / dur
    shake = (0, 0)
    flash = 0.0
    aber = 0
    # 0–22 %: schwarz, roter Lichtstrahl fährt über das Bild
    if p < 0.26:
        q = p / 0.26
        x = int(-200 + (W + 400) * q)
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.line([(x, BAR), (x - 120, H - BAR)], fill=RED + (230,), width=3)
        d.line([(x + 6, BAR), (x - 114, H - BAR)], fill=(255, 180, 190, 90), width=1)
        composite(arr, img, 0, 0)
        add_light(arr, GLOW_RED.resize((700, 700)), x - 350, H / 2 - 350, strength=0.5)
    # 22–60 %: Partikel sammeln sich in der Mitte, Logo baut sich stückweise auf
    if 0.2 <= p < 0.62:
        q = (p - 0.2) / 0.42
        r = np.random.default_rng(11)
        n = 160
        ang = r.uniform(0, 6.28, n)
        rad0 = r.uniform(300, 1100, n)
        rad = rad0 * (1 - q) ** 1.6 + 30
        for i in range(n):
            x = W / 2 + math.cos(ang[i] + q * 2) * rad[i]
            y = H / 2 + math.sin(ang[i] + q * 2) * rad[i] * 0.6
            add_light(arr, DOT_RED, x - 12, y - 12, strength=0.9)
        # Teile des Logos
        for i, (piece, px) in enumerate(LG_PIECES):
            start = 0.35 + i * 0.07
            a = float(np.clip((q - start) / 0.12, 0, 1))
            if a <= 0:
                continue
            off = int((1 - a) * 160 * (1 if i % 2 else -1))
            composite(arr, piece, W / 2 - LG.width / 2 + px, H / 2 - LG.height / 2 + off - 40, alpha=a)
        add_light(arr, GLOW_RED, W / 2 - 450, H / 2 - 450 - 40, strength=0.25 * q)
    # 62 %: IMPACT
    if p >= 0.62:
        q = (p - 0.62) / 0.38
        age = (p - 0.62) * dur
        flash = max(0, 0.9 - age * 3.5) if age < 0.26 else 0.0
        sh = max(0, 1 - age / 0.7)
        shake = (random.uniform(-26, 26) * sh, random.uniform(-16, 16) * sh)
        aber = int(10 * sh)
        add_light(arr, LG_GLOW.resize((760, 760)), W / 2 - 380, H / 2 - 380 - 40, strength=0.6 + 0.3 * sh)
        composite(arr, LG, W / 2 - LG.width / 2, H / 2 - LG.height / 2 - 40)
        ta = min(1, max(0, (age - 0.15) * 4))
        t1 = txt("logo1", "CHAOS LAUNCHER", font(104, "bold"), glow=RED, blur=26, spacing=10)
        t2 = txt("logo2", "THE NEXT GENERATION", font(30, "semi"), fill=(220, 220, 230), spacing=12)
        composite(arr, t1, W / 2 - t1.width / 2, H / 2 + 250 - t1.height / 2, alpha=ta)
        composite(arr, t2, W / 2 - t2.width / 2, H / 2 + 345 - t2.height / 2, alpha=min(1, max(0, (age - 0.5) * 3)))
        # Schockwelle
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        rr = int(100 + age * 1800)
        d.ellipse([W / 2 - rr, H / 2 - rr * 0.5, W / 2 + rr, H / 2 + rr * 0.5], outline=RED + (int(200 * max(0, 1 - age / 1.0)),), width=4)
        composite(arr, img, 0, 0)
        PARTS_B.draw(arr, t, alpha=0.5)
    return arr, dict(grain=0.03, flash=flash, shake=shake, aberration=aber)


def scene6(t, dur, arr):
    p = t / dur
    # Kamera fährt zurück: Welt im Hintergrund, Logo wird kleiner
    CUBES_BG.draw(arr, t * 0.3, speed=0.05, alpha=0.6, fog_z=4.0)
    grid_floor(arr, t, speed=0.15, alpha=0.3, horizon=0.62)
    PARTS.draw(arr, t, alpha=0.7)
    s = 1.0 - 0.3 * p
    size = int(420 * s)
    lg = LOGO.resize((size, size), Image.LANCZOS)
    add_light(arr, LG_GLOW.resize((int(760 * s), int(760 * s))), W / 2 - 380 * s, H / 2 - 380 * s - 40 * s, strength=0.5)
    composite(arr, lg, W / 2 - size / 2, H / 2 - size / 2 - 40 * s)
    t1 = txt("logo1", "CHAOS LAUNCHER", font(104, "bold"), glow=RED, blur=26, spacing=10)
    t1s = t1.resize((int(t1.width * s), int(t1.height * s)), Image.LANCZOS)
    composite(arr, t1s, W / 2 - t1s.width / 2, H / 2 + 250 * s - t1s.height / 2)
    t3 = txt("url", "chaos-launcher.chaoscraft.workers.dev", font(30, "regular"), fill=(245, 195, 66))
    composite(arr, t3, W / 2 - t3.width / 2, H - BAR - 90, alpha=min(1, max(0, (p - 0.2) * 3)))
    # Ausblenden
    fade = 1.0
    if p > 0.72:
        fade = max(0, 1 - (p - 0.72) / 0.16)
    arr *= fade
    if p > 0.86:
        q = (p - 0.86) / 0.14
        tt = txt("final", "CHAOS LAUNCHER", font(72, "bold"), spacing=14)
        a = math.sin(min(1, q * 1.4) * math.pi) if q < 0.9 else 0
        composite(arr, tt, W / 2 - tt.width / 2, H / 2 - tt.height / 2, alpha=max(0, a))
    return arr, dict(grain=0.03)


# ------------------------------------------------------------------ Timeline (an den Song angepasst)
# Song: ruhig 0–22 s, Aufbau ab 23, energisch 65–88, Einbruch 89–96, Wiedereinsatz ab 98
T1 = (0.0, 12.0)
T2 = (12.0, 23.0)
T3 = (23.0, 47.0)
T4 = (47.0, 89.0)
T5 = (89.0, 99.0)
T6 = (99.0, 112.0)
TOTAL = T6[1]


def frame_at(T):
    arr = np.zeros((H, W, 3), dtype=np.float32)
    if T < T1[1]:
        arr, kw = scene1(T - T1[0], T1[1] - T1[0], arr)
    elif T < T2[1]:
        arr, kw = scene2(T - T2[0], T2[1] - T2[0], arr)
    elif T < T3[1]:
        arr, kw = scene3(T - T3[0], T3[1] - T3[0], arr, T)
    elif T < T4[1]:
        arr, kw = scene4(T - T4[0], T4[1] - T4[0], arr, T)
    elif T < T5[1]:
        arr, kw = scene5(T - T5[0], T5[1] - T5[0], arr)
    else:
        arr, kw = scene6(T - T6[0], T6[1] - T6[0], arr)
    # harte Schwarzblende zu Szene 5 (Stille), sanfte Überblendungen sonst
    for a, b in ((T1, T2), (T2, T3), (T3, T4)):
        if b[0] - 0.4 <= T < b[0]:
            arr *= (b[0] - T) / 0.4
        if b[0] <= T < b[0] + 0.4 and a is not T3:
            arr *= (T - b[0]) / 0.4
    if T4[1] - 0.25 <= T < T4[1]:
        arr *= (T4[1] - T) / 0.25
    return finish(arr, T, **kw)


def write_audio(path):
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", os.path.join(TR, "song.wav"), "-t", str(TOTAL),
                    "-af", f"afade=t=in:st=0:d=1.5,afade=t=out:st={TOTAL - 3.5}:d=3.5,loudnorm=I=-14:TP=-1.5", "-ac", "2", path], check=True)


def main():
    wav = os.path.join(TR, "trailer-audio.wav")
    write_audio(wav)
    total_frames = int(TOTAL * FPS)
    print(f"Trailer: {TOTAL:.0f} s, {total_frames} Frames, {len(BEATS)} Beats")
    cmd = [FF, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(total_frames):
        img = frame_at(i / FPS)
        proc.stdin.write(img.tobytes())
        if i % (FPS * 10) == 0:
            print(f"  {i / FPS:5.1f} s", flush=True)
    proc.stdin.close()
    proc.wait()
    print("fertig:", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        times = [float(x) for x in sys.argv[2:]] or [5, 18, 30, 50, 60, 70, 95, 104]
        cols = 2
        w, h = 960, 540
        sheet = Image.new("RGB", (w * cols, h * math.ceil(len(times) / cols)))
        for i, tt in enumerate(times):
            sheet.paste(frame_at(tt).resize((w, h), Image.LANCZOS), ((i % cols) * w, (i // cols) * h))
        sheet.save(os.path.join(TR, "preview.jpg"), quality=88)
        print("preview:", os.path.join(TR, "preview.jpg"))
    else:
        main()

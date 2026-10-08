"""
Kleiner Software-3D-Renderer für den Chaos-Trailer (numpy + Pillow):
Spielermodell aus dem Skin (alle Schichten), Wings als Textur-Ebenen am Rücken,
Hüte aus dem Hut-Katalog (gen_hats.py), Blockboden mit echten Texturen, Nebel,
Perspektivkamera. Rendert pro Quad eine perspektivische Texturtransformation.
"""
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_hats import HATS  # noqa: E402


def norm(v):
    n = np.linalg.norm(v)
    return v / n if n else v


class Camera:
    def __init__(self, pos, target, fov_deg=48.0, w=1920, h=1080, up=(0, 1, 0)):
        self.pos = np.array(pos, dtype=float)
        self.target = np.array(target, dtype=float)
        self.w, self.h = w, h
        self.f = (h / 2) / math.tan(math.radians(fov_deg) / 2)
        fwd = norm(self.target - self.pos)
        right = norm(np.cross(fwd, np.array(up, dtype=float)))
        upv = np.cross(right, fwd)
        self.R = np.stack([right, upv, fwd])  # Welt → Kamera

    def project(self, pts):
        """pts (n,3) Welt → (n,3): screen x, y, depth z (Kamera-z)."""
        c = (pts - self.pos) @ self.R.T
        z = np.maximum(c[:, 2], 1e-3)
        x = self.w / 2 + c[:, 0] * self.f / z
        y = self.h / 2 - c[:, 1] * self.f / z
        return np.stack([x, y, c[:, 2]], axis=1)


def perspective_coeffs(src_pts, dst_pts):
    """Koeffizienten für Image.transform(PERSPECTIVE): Ausgabe(dst) → Quelle(src)."""
    A = []
    b = []
    for (sx, sy), (dx, dy) in zip(src_pts, dst_pts):
        A.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        b.append(sx)
        A.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        b.append(sy)
    return np.linalg.solve(np.array(A, dtype=float), np.array(b, dtype=float))


class Quad:
    __slots__ = ("pts", "tex", "bright", "depth", "double")

    def __init__(self, pts, tex, bright=1.0, double=False):
        self.pts = np.array(pts, dtype=float)  # 4×3, Reihenfolge = Textur-Ecken (lo, ro, ru, lu)
        self.tex = tex
        self.bright = bright
        self.double = double


LIGHT = norm(np.array([-0.35, 0.9, -0.3]))


def face_bright(pts, cam):
    n = norm(np.cross(pts[1] - pts[0], pts[3] - pts[0]))
    view = norm(cam.pos - pts.mean(axis=0))
    facing = float(n @ view)
    diff = max(0.0, float(n @ LIGHT))
    return facing, 0.52 + 0.48 * diff


def render_quads(quads, cam, size, fog=(60.0, 160.0), fog_color=(6, 4, 6), bg=None):
    """Zeichnet Quads (painter's algorithm, hinten → vorn) auf ein RGBA-Bild."""
    W, H = size
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0)) if bg is None else bg.copy()
    items = []
    for q in quads:
        facing, br = face_bright(q.pts, cam)
        if facing <= 0 and not q.double:
            continue
        if q.double:
            br = 1.0  # Flügel: emissiv wie im Spiel
        pr = cam.project(q.pts)
        if (pr[:, 2] <= 0.5).any():
            continue
        if pr[:, 0].max() < 0 or pr[:, 0].min() > W or pr[:, 1].max() < 0 or pr[:, 1].min() > H:
            continue
        depth = float(pr[:, 2].mean())
        items.append((depth, q, pr, br))
    items.sort(key=lambda it: -it[0])
    for depth, q, pr, br in items:
        xs, ys = pr[:, 0], pr[:, 1]
        x0, y0 = int(math.floor(xs.min())), int(math.floor(ys.min()))
        x1, y1 = int(math.ceil(xs.max())) + 1, int(math.ceil(ys.max())) + 1
        bw, bh = x1 - x0, y1 - y0
        if bw < 1 or bh < 1 or bw > 4000 or bh > 4000:
            continue
        tex = q.tex
        tw, th = tex.size
        dst = [(x - x0, y - y0) for x, y in zip(xs, ys)]
        src = [(0, 0), (tw, 0), (tw, th), (0, th)]
        try:
            co = perspective_coeffs(src, dst)
        except np.linalg.LinAlgError:
            continue
        face = tex.transform((bw, bh), Image.PERSPECTIVE, tuple(co), resample=Image.NEAREST)
        # Helligkeit + Nebel
        f0, f1 = fog
        fogk = float(np.clip((depth - f0) / (f1 - f0), 0, 1))
        arr = np.asarray(face).astype(np.float32)
        arr[..., :3] = arr[..., :3] * (br * q.bright) * (1 - fogk) + np.array(fog_color, dtype=np.float32) * fogk
        arr[..., 3] = arr[..., 3] * (1 - fogk * 0.85)
        face = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
        # Clipping an den Bildrand
        px, py = x0, y0
        if px < 0 or py < 0 or px + bw > W or py + bh > H:
            cx0, cy0 = max(0, -px), max(0, -py)
            cx1, cy1 = min(bw, W - px), min(bh, H - py)
            if cx1 <= cx0 or cy1 <= cy0:
                continue
            face = face.crop((cx0, cy0, cx1, cy1))
            px, py = max(0, px), max(0, py)
        out.alpha_composite(face, (px, py))
    return out


# ------------------------------------------------------------------ Boxen
def box_quads(x0, y0, z0, x1, y1, z1, faces):
    """faces: dict mit Texturen für 'top','bottom','front'(-z),'back'(+z),'left'(+x),'right'(-x)."""
    qs = []
    if "top" in faces:
        qs.append(Quad([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], faces["top"]))  # von oben: lo=hinten-links
    if "bottom" in faces:
        qs.append(Quad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], faces["bottom"]))
    if "front" in faces:  # -z, Betrachter schaut auf -z-Seite → links im Bild = -x? Spieler blickt -z, seine rechte Seite ist -x; Textur-Vorderseite: links = Spieler-rechts(-x)
        qs.append(Quad([(x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)], faces["front"]))
    if "back" in faces:  # +z
        qs.append(Quad([(x1, y1, z1), (x0, y1, z1), (x0, y0, z1), (x1, y0, z1)], faces["back"]))
    if "left" in faces:  # +x (Spieler-links)
        qs.append(Quad([(x1, y1, z0), (x1, y1, z1), (x1, y0, z1), (x1, y0, z0)], faces["left"]))
    if "right" in faces:  # -x
        qs.append(Quad([(x0, y1, z1), (x0, y1, z0), (x0, y0, z0), (x0, y0, z1)], faces["right"]))
    return qs


def skin_faces(skin, u, v, w, h, d, up=8, mirror=False):
    """Texturen eines Box-Elements im Standard-Skin-Layout (u,v = Offset, w/h/d = Größe)."""
    def crop(x, y, cw, ch):
        im = skin.crop((x, y, x + cw, y + ch))
        return im.resize((cw * up, ch * up), Image.NEAREST)
    faces = {
        "top": crop(u + d, v, w, d),
        "bottom": crop(u + d + w, v, w, d).transpose(Image.FLIP_TOP_BOTTOM),
        "right": crop(u, v + d, d, h),
        "front": crop(u + d, v + d, w, h),
        "left": crop(u + d + w, v + d, d, h),
        "back": crop(u + 2 * d + w, v + d, w, h),
    }
    return faces


def player_quads(skin, slim=False, yaw=0.0, swing=0.0, with_overlay=True, up=8):
    """Spielermodell in MC-Einheiten (Füße bei y=0, blickt nach -z), um die Hochachse gedreht."""
    aw = 3 if slim else 4
    parts = []  # (box, uv, size, pivot, rot)
    # (x0,y0,z0,x1,y1,z1, uv_base, uv_overlay, (w,h,d), pivot_y, swing_sign)
    parts.append(((-4, 24, -4, 4, 32, 4), (0, 0), (32, 0), (8, 8, 8), None, 0))
    parts.append(((-4, 12, -2, 4, 24, 2), (16, 16), (16, 32), (8, 12, 4), None, 0))
    parts.append(((-4 - aw, 12, -2, -4, 24, 2), (40, 16), (40, 32), (aw, 12, 4), 22, 1))     # rechter Arm (-x)
    parts.append(((4, 12, -2, 4 + aw, 24, 2), (32, 48), (48, 48), (aw, 12, 4), 22, -1))      # linker Arm (+x)
    parts.append(((-4, 0, -2, 0, 12, 2), (0, 16), (0, 32), (4, 12, 4), 12, -1))               # rechtes Bein
    parts.append(((0, 0, -2, 4, 12, 2), (16, 48), (0, 48), (4, 12, 4), 12, 1))                # linkes Bein
    quads = []
    for (x0, y0, z0, x1, y1, z1), uv, uvo, (w, h, d), pivot, sgn in parts:
        for layer, (uu, vv), inflate in ((0, uv, 0.0), (1, uvo, 0.5)):
            if layer == 1 and not with_overlay:
                continue
            faces = skin_faces(skin, uu, vv, w, h, d, up=up)
            if layer == 1:
                # Overlay-Schicht nur zeichnen, wenn sie Pixel hat
                if not any(np.asarray(f)[..., 3].max() > 0 for f in faces.values()):
                    continue
            qs = box_quads(x0 - inflate, y0 - inflate, z0 - inflate, x1 + inflate, y1 + inflate, z1 + inflate, faces)
            # Schwingen von Armen/Beinen um die Pivot-Höhe (x-Achse)
            if pivot is not None and swing:
                ang = swing * sgn
                ca, sa = math.cos(ang), math.sin(ang)
                for q in qs:
                    p = q.pts.copy()
                    y = p[:, 1] - pivot
                    z = p[:, 2]
                    p[:, 1] = y * ca - z * sa + pivot
                    p[:, 2] = y * sa + z * ca
                    q.pts = p
            quads += qs
    # Yaw um die Hochachse
    if yaw:
        cy, sy = math.cos(yaw), math.sin(yaw)
        for q in quads:
            p = q.pts.copy()
            x, z = p[:, 0].copy(), p[:, 2].copy()
            p[:, 0] = x * cy + z * sy
            p[:, 2] = -x * sy + z * cy
            q.pts = p
    return quads


def rotate_y(pts, yaw, cx=0.0, cz=0.0):
    cy, sy = math.cos(yaw), math.sin(yaw)
    p = pts.copy()
    x, z = p[:, 0] - cx, p[:, 2] - cz
    p[:, 0] = x * cy + z * sy + cx
    p[:, 2] = -x * sy + z * cy + cz
    return p


def wing_quads(frame_img, t, scale=1.15, yaw=0.0, open_deg=40.0, tilt_deg=8.0, flap_speed=2.2, flap_amp=0.18, plane=(26, 30, 16), root=(4.2, 2.0, 3.1)):
    """Zwei Flügel-Ebenen am Rücken (wie im Chaos Client): Wurzel bei (±rootX, 24-rootY, +rootZ)."""
    pw, ph, top = plane
    rx, ry, rz = root
    half = frame_img.width // 2
    tex_left = frame_img.crop((half, 0, frame_img.width, frame_img.height))      # Original: Wurzel links → +x-Flügel
    tex_right = frame_img.crop((0, 0, half, frame_img.height))                    # gespiegelt: Wurzel rechts → -x-Flügel
    # Textur-Region: Ebene ist pw×ph Einheiten innerhalb 64×32-Einheiten-Textur (2 px/Einheit): links 52×60 px
    px = 2
    tex_left = tex_left.crop((0, 0, pw * px, ph * px)).resize((pw * px * 4, ph * px * 4), Image.NEAREST)
    tex_right = tex_right.crop((half - pw * px, 0, half, ph * px)).resize((pw * px * 4, ph * px * 4), Image.NEAREST)
    flap = math.sin(t * flap_speed * 3.0)
    open_a = math.radians(open_deg + flap * 10)
    tilt_a = math.radians(tilt_deg + flap * 12)
    quads = []
    for sx, tex in ((1, tex_left), (-1, tex_right)):
        # Flügelfläche in lokalen Koordinaten: Wurzel (0,0,0), Fläche in +x (nach außen), y von +top bis -(ph-top)
        s = scale
        corners = np.array([(0, top * s, 0), (pw * s, top * s, 0), (pw * s, -(ph - top) * s, 0), (0, -(ph - top) * s, 0)], dtype=float)
        if sx < 0:
            corners[:, 0] *= -1
            corners = corners[[1, 0, 3, 2]]
        # Roll (Spitze heben) um z … hier um die z-Achse: y' = y cos − x sin
        ca, sa = math.cos(tilt_a), math.sin(tilt_a)
        x, y = corners[:, 0].copy(), corners[:, 1].copy()
        corners[:, 0] = x * ca - y * sa * sx
        corners[:, 1] = x * sa * sx + y * ca
        # Öffnen (Yaw um Hochachse an der Wurzel): Spitze nach hinten (+z)
        corners = rotate_y(corners, -sx * open_a)
        corners[:, 0] += sx * rx
        corners[:, 1] += 24 - ry
        corners[:, 2] += rz
        if yaw:
            corners = rotate_y(corners, yaw)
        quads.append(Quad(corners, tex, bright=1.15, double=True))
    return quads


def color_tex(hex_color, size=8):
    h = hex_color.lstrip("#")
    c = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    return Image.new("RGBA", (size, size), c)


def hat_quads(hat_id, yaw=0.0, t=0.0):
    hat = next((h for h in HATS if h["id"] == hat_id), None)
    if not hat:
        return []
    quads = []
    bob = math.sin(t * 2.7) * hat["bob"]
    for (x, y, z, w, h, d, c) in hat["boxes"]:
        tex = color_tex(c)
        faces = {k: tex for k in ("top", "bottom", "front", "back", "left", "right")}
        # Kopfraum: y negativ = oben; Welt: y = 24 - y_head
        qs = box_quads(x, 24 - (y + h) + bob, z, x + w, 24 - y + bob, z + d, faces)
        if hat["spin"]:
            ang = math.radians(t * 30 * hat["spin"])
            for q in qs:
                q.pts = rotate_y(q.pts, ang)
        if hat.get("glow"):
            for q in qs:
                q.bright = 1.6
        quads += qs
    if yaw:
        for q in quads:
            q.pts = rotate_y(q.pts, yaw)
    return quads


def floor_quads(blocks, size=4, y_top=0.0, block=16.0, t=0.0, glow_names=("redstone_block", "magma")):
    """Blockboden size×size (Mitte unter dem Spieler). blocks: dict name → 64×64-Textur. Muster deterministisch."""
    rng = np.random.default_rng(3)
    names = list(blocks.keys())
    quads = []
    for gx in range(-size, size + 1):
        for gz in range(-size, size + 1):
            r = rng.random()
            name = names[int(rng.integers(0, len(names)))]
            if (gx, gz) == (0, 0):
                name = "polished_blackstone" if "polished_blackstone" in blocks else name
            tex = blocks[name]
            x0, z0 = gx * block - block / 2, gz * block - block / 2
            faces = {"top": tex, "front": tex, "back": tex, "left": tex, "right": tex}
            qs = box_quads(x0, y_top - block, z0, x0 + block, y_top, z0 + block, faces)
            if name in glow_names:
                for q in qs:
                    q.bright = 1.5
            quads += qs
    return quads

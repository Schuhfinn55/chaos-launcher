"""
Chaos Launcher – Release-Video (1080p, 30 fps) komplett aus Python:
Szenen mit Logo-Intro, Launcher-Screenshots (Kamerafahrt), animierten Wings/Capes,
Feature-Texten und Outro. Ton: generierter Synth-Beat (lizenzfrei, numpy).

Eingaben:  D:/tmp/video/shots/*.png   (headless-Edge-Screenshots, 1920×1080)
           src/assets/wings/*.png      (Wings-Texturen, legendäre mit _f0..7)
           website/assets/icon.png     (Logo)
Ausgabe:   D:/tmp/video/chaos-launcher-2.3.0.mp4

Aufruf: python scripts/make_release_video.py
"""
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHOTS = "D:/tmp/video/shots"
OUT = "D:/tmp/video/chaos-launcher-2.3.0.mp4"
W, H, FPS = 1920, 1080, 30
RED, RED2, GOLD, WHITE, DIM = (225, 29, 46), (255, 77, 94), (245, 195, 66), (245, 245, 247), (160, 160, 170)
FF = r"C:\Users\fabian\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"


def font(size, bold=True, light=False):
    name = "segoeuil.ttf" if light else ("segoeuib.ttf" if bold else "segoeui.ttf")
    try:
        return ImageFont.truetype("C:/Windows/Fonts/" + name, size)
    except Exception:
        return ImageFont.load_default()


def ease(t):  # smoothstep
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


# ------------------------------------------------------------------ Hintergrund
_bg_cache = {}


def background(t, pulse=0.0):
    key = int(t * 2) % 60
    if key in _bg_cache and pulse == 0.0:
        return _bg_cache[key].copy()
    img = Image.new("RGB", (W, H), (9, 9, 12))
    glow = Image.new("RGB", (W // 4, H // 4), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    a = t * 0.25
    cx, cy = int(W / 8 + math.cos(a) * 90), int(H / 8 + math.sin(a * 0.7) * 60)
    r = int(170 + 30 * pulse)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(90 + int(40 * pulse), 8, 18))
    cx2, cy2 = int(W / 8 * 3 - math.cos(a * 0.6) * 80), int(H / 8 * 3 + math.sin(a) * 50)
    gd.ellipse([cx2 - 150, cy2 - 150, cx2 + 150, cy2 + 150], fill=(60, 6, 14))
    glow = glow.filter(ImageFilter.GaussianBlur(45)).resize((W, H), Image.BILINEAR)
    img = Image.fromarray(np.clip(np.asarray(img, dtype=np.int16) + np.asarray(glow, dtype=np.int16), 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=(14, 14, 19))
    for y in range(0, H, 60):
        d.line([(0, y), (W, y)], fill=(14, 14, 19))
    if pulse == 0.0:
        _bg_cache[key] = img.copy()
    return img


# ------------------------------------------------------------------ Partikel (Glut)
random.seed(7)
EMBERS = [(random.random(), random.random(), 0.3 + random.random() * 0.9, random.random() * 6.28, 1 + random.random() * 2.5) for _ in range(90)]


def embers(img, t, alpha=1.0):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for (x0, y0, spd, ph, sz) in EMBERS:
        y = (y0 - t * spd * 0.05) % 1.0
        x = (x0 + math.sin(t * 0.8 + ph) * 0.01) % 1.0
        a = int(alpha * (120 + 100 * math.sin(t * 3 + ph)))
        px, py = x * W, y * H
        d.ellipse([px - sz, py - sz, px + sz, py + sz], fill=(255, 90, 100, max(0, min(255, a))))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


# ------------------------------------------------------------------ Hilfen
def text_glow(img, xy, s, f, fill=WHITE, glow=RED, anchor="la", blur=18, strength=1.0):
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    gd.text(xy, s, font=f, fill=glow + (int(220 * strength),), anchor=anchor)
    gl = gl.filter(ImageFilter.GaussianBlur(blur))
    out = Image.alpha_composite(img.convert("RGBA"), gl)
    ImageDraw.Draw(out).text(xy, s, font=f, fill=fill, anchor=anchor)
    return out.convert("RGB")


def paste_center(img, src, cx, cy, scale=1.0, alpha=1.0):
    if scale != 1.0:
        src = src.resize((max(1, int(src.width * scale)), max(1, int(src.height * scale))), Image.LANCZOS)
    if src.mode != "RGBA":
        src = src.convert("RGBA")
    if alpha < 1.0:
        a = src.split()[3].point(lambda v: int(v * alpha))
        src.putalpha(a)
    x, y = int(cx - src.width / 2), int(cy - src.height / 2)
    base = img.convert("RGBA")
    base.alpha_composite(src, (max(-src.width, x), max(-src.height, y)))
    return base.convert("RGB")


def rounded_shot(path, radius=22, shadow=True):
    im = Image.open(path).convert("RGB")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=radius, fill=255)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    # feiner Rand
    ImageDraw.Draw(out).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=radius, outline=(255, 255, 255, 40), width=2)
    return out


LOGO = Image.open(os.path.join(ROOT, "website", "assets", "icon.png")).convert("RGBA")


def logo(size):
    return LOGO.resize((size, size), Image.LANCZOS)


# ------------------------------------------------------------------ Szenen
def scene_intro(t, dur):
    p = t / dur
    pulse = 0.5 + 0.5 * math.sin(t * 2.2)
    img = background(t, pulse * 0.6)
    img = embers(img, t, alpha=min(1.0, p * 2))
    # Logo
    s = ease_out(p * 2.2)
    size = int(40 + 300 * s)
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    r = int(size * (0.75 + 0.1 * pulse))
    ImageDraw.Draw(gl).ellipse([W / 2 - r, H * 0.36 - r, W / 2 + r, H * 0.36 + r], fill=RED + (120,))
    gl = gl.filter(ImageFilter.GaussianBlur(70))
    img = Image.alpha_composite(img.convert("RGBA"), gl).convert("RGB")
    img = paste_center(img, logo(max(8, size)), W / 2, H * 0.36, alpha=min(1, p * 3))
    # Titel Buchstabe für Buchstabe
    title = "CHAOS LAUNCHER"
    n = int(max(0, (p - 0.3)) / 0.5 * len(title))
    shown = title[:n]
    if shown:
        f = font(118)
        img = text_glow(img, (W / 2, H * 0.68), shown, f, anchor="mm", blur=22, strength=0.9)
    if p > 0.78:
        a = ease((p - 0.78) / 0.2)
        f2 = font(44, light=True)
        img = text_glow(img, (W / 2, H * 0.80), "Version 2.3.0  ·  Dein Minecraft. Dein Chaos.", f2, fill=tuple(int(c * a) for c in DIM), glow=(0, 0, 0), anchor="mm", blur=1, strength=0)
    return img


def scene_shot(t, dur, path, headline, bullets, kicker=""):
    """Screenshot mit Kamerafahrt (Ken Burns) links, Text rechts."""
    p = t / dur
    img = background(t)
    img = embers(img, t, alpha=0.5)
    shot = rounded_shot(path)
    # Kamerafahrt: leichtes Zoomen + Verschieben
    zoom = 0.62 + 0.05 * ease(p)
    slide = ease_out(min(1, p * 2.5))
    cx = W * 0.36 + (1 - slide) * -400
    cy = H * 0.52 + math.sin(t * 0.5) * 6
    img = paste_center(img, shot, cx, cy, scale=zoom, alpha=slide)
    # Text rechts
    x = int(W * 0.66)
    y = int(H * 0.26)
    d = ImageDraw.Draw(img)
    if kicker:
        a = ease(min(1, p * 3))
        d.text((x, y - 50), kicker, font=font(26), fill=tuple(int(c * a) for c in RED2))
    hp = ease(min(1, (p - 0.05) * 2.5))
    img = text_glow(img, (x, y), headline, font(72), anchor="la", blur=20, strength=0.7 * hp, fill=tuple(int(c * hp) for c in WHITE))
    d = ImageDraw.Draw(img)
    yy = y + 110
    for i, b in enumerate(bullets):
        bp = ease((p - 0.18 - i * 0.1) * 4)
        if bp <= 0:
            continue
        off = int((1 - bp) * 40)
        col = tuple(int(c * bp) for c in (225, 225, 232))
        d.rounded_rectangle([x + off, yy + 14, x + off + 10, yy + 24], radius=5, fill=tuple(int(c * bp) for c in RED))
        d.text((x + off + 26, yy), b, font=font(34, bold=False), fill=col)
        yy += 56
    return img


def wing_pair(wid, frame=None, scale=6):
    name = f"{wid}_f{frame}.png" if frame is not None else f"{wid}.png"
    im = Image.open(os.path.join(ROOT, "src", "assets", "wings", name)).convert("RGBA")
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


def flap(img, pair, cx, cy, t, speed=2.0, amp=0.12):
    """Flügelschlag: linke/rechte Hälfte horizontal stauchen (Perspektive)."""
    half = pair.width // 2
    left, right = pair.crop((0, 0, half, pair.height)), pair.crop((half, 0, pair.width, pair.height))
    k = 1 - amp * (0.5 + 0.5 * math.sin(t * speed * 3.1))
    lw = max(1, int(half * k))
    left = left.resize((lw, pair.height), Image.NEAREST)
    right = right.resize((lw, pair.height), Image.NEAREST)
    base = img.convert("RGBA")
    base.alpha_composite(left, (int(cx - lw), int(cy - pair.height / 2)))
    base.alpha_composite(right, (int(cx), int(cy - pair.height / 2)))
    return base.convert("RGB")


def scene_wings(t, dur):
    p = t / dur
    img = background(t, 0.3)
    img = embers(img, t, alpha=0.8)
    img = text_glow(img, (W / 2, 110), "19 WINGS", font(84), anchor="mm", blur=22, strength=0.8)
    d = ImageDraw.Draw(img)
    d.text((W / 2, 185), "Federn, Membranen, Kristalle – animiert, leuchtend, mit Partikeln", font=font(32, light=True), fill=DIM, anchor="mm")
    ids = ["angel", "chaos", "phoenix", "galaxy", "demon", "dragon", "neon", "butterfly", "fairy", "crystal", "void", "inferno", "cyber", "frost", "blood-angel", "golden", "seraph"]
    cols = 6
    for i, wid in enumerate(ids):
        ap = ease((p - 0.08 - i * 0.035) * 5)
        if ap <= 0:
            continue
        pair = wing_pair(wid, scale=3)
        cx = W * 0.5 + (i % cols - (cols - 1) / 2) * 300
        cy = 360 + (i // cols) * 230 + (1 - ap) * 60
        pair.putalpha(pair.split()[3].point(lambda v: int(v * ap)))
        img = flap(img, pair, cx, cy, t + i * 0.7, speed=1.4, amp=0.1)
    return img


def scene_legendary(t, dur):
    p = t / dur
    pulse = 0.5 + 0.5 * math.sin(t * 2.5)
    img = background(t, 0.5 + 0.5 * pulse)
    img = embers(img, t, alpha=1.0)
    hp = ease(min(1, p * 3))
    img = text_glow(img, (W / 2, 95), "LEGENDÄRE WINGS", font(84), fill=tuple(int(c * hp) for c in GOLD), glow=GOLD, anchor="mm", blur=26, strength=0.9 * hp)
    d = ImageDraw.Draw(img)
    d.text((W / 2, 165), "Animierte Texturen · nur mit Code · größer als alles andere", font=font(32, light=True), fill=tuple(int(c * hp) for c in DIM), anchor="mm")
    for i, (wid, name, fps) in enumerate((("overlord", "CHAOS OVERLORD", 10), ("celestial", "CELESTIAL SERAPH", 8))):
        ap = ease((p - 0.1 - i * 0.25) * 3)
        if ap <= 0:
            continue
        frame = int(t * fps) % 8
        pair = wing_pair(wid, frame=frame, scale=5)
        cx = W * (0.28 + i * 0.44)
        cy = H * 0.55 + (1 - ap) * 80
        pair.putalpha(pair.split()[3].point(lambda v: int(v * ap)))
        img = flap(img, pair, cx, cy, t + i, speed=1.1, amp=0.12)
        img = text_glow(img, (cx, H * 0.86), name, font(48), fill=tuple(int(c * ap) for c in WHITE), glow=RED if i == 0 else (139, 92, 246), anchor="mm", blur=18, strength=0.8 * ap)
        ImageDraw.Draw(img).text((cx, H * 0.92), "🔒 nur mit Code", font=font(26, bold=False), fill=tuple(int(c * ap) for c in GOLD), anchor="mm")
    return img


def scene_list(t, dur, headline, items, accent=RED):
    p = t / dur
    img = background(t)
    img = embers(img, t, alpha=0.5)
    hp = ease(min(1, p * 3))
    img = text_glow(img, (W / 2, 130), headline, font(84), fill=tuple(int(c * hp) for c in WHITE), glow=accent, anchor="mm", blur=22, strength=0.8 * hp)
    d = ImageDraw.Draw(img)
    cols = 2 if len(items) > 6 else 1
    per = math.ceil(len(items) / cols)
    for i, (ic, title, sub) in enumerate(items):
        ip = ease((p - 0.12 - i * 0.07) * 4)
        if ip <= 0:
            continue
        col, row = i // per, i % per
        x = int(W * (0.12 if cols == 1 else (0.1 + col * 0.45)))
        y = int(260 + row * (95 if cols == 2 else 110)) + int((1 - ip) * 40)
        d.rounded_rectangle([x, y, x + (W * (0.76 if cols == 1 else 0.38)), y + 78], radius=16, fill=(22, 22, 28), outline=tuple(int(c * ip) for c in accent), width=2)
        d.text((x + 24, y + 14), ic, font=font(40, bold=False), fill=tuple(int(c * ip) for c in WHITE))
        d.text((x + 90, y + 10), title, font=font(32), fill=tuple(int(c * ip) for c in WHITE))
        d.text((x + 90, y + 46), sub, font=font(22, bold=False), fill=tuple(int(c * ip) for c in DIM))
    return img


def scene_outro(t, dur):
    p = t / dur
    pulse = 0.5 + 0.5 * math.sin(t * 2)
    img = background(t, pulse * 0.5)
    img = embers(img, t, alpha=1.0)
    img = paste_center(img, logo(200), W / 2, H * 0.27, alpha=ease(min(1, p * 3)))
    img = text_glow(img, (W / 2, H * 0.50), "JETZT HERUNTERLADEN", font(96), anchor="mm", blur=24, strength=0.9)
    hp = ease((p - 0.15) * 3)
    img = text_glow(img, (W / 2, H * 0.63), "chaos-launcher.chaoscraft.workers.dev", font(54, bold=False), fill=tuple(int(c * hp) for c in GOLD), glow=(0, 0, 0), anchor="mm", blur=1, strength=0)
    d = ImageDraw.Draw(img)
    a = ease((p - 0.3) * 3)
    d.text((W / 2, H * 0.74), "Kostenlos · Open Source · Windows  ·  Update kommt automatisch", font=font(30, light=True), fill=tuple(int(c * a) for c in DIM), anchor="mm")
    d.text((W / 2, H * 0.86), "Discord: discord.gg/un8uxrhx9S  ·  Server: ChaoscraftSMP", font=font(30, bold=False), fill=tuple(int(c * a) for c in WHITE), anchor="mm")
    if p > 0.9:
        f = (p - 0.9) / 0.1
        img = Image.blend(img, Image.new("RGB", (W, H), (0, 0, 0)), ease(f))
    return img


# ------------------------------------------------------------------ Timeline
S = os.path.join
SCENES = [
    (6.0, scene_intro),
    (7.5, lambda t, d: scene_shot(t, d, S(SHOTS, "home.png"), "Alles an einem Ort", ["Profile für jede Version – Fabric, Forge, NeoForge, Vanilla", "Mods aus Modrinth & CurseForge mit einem Klick", "Import aus anderen Launchern", "Auto-Updates – immer aktuell"], kicker="LAUNCHER")),
    (7.0, lambda t, d: scene_shot(t, d, S(SHOTS, "cape.png"), "Animierte Capes", ["12 animierte Chaos-Vorlagen", "Eigene GIFs & PNG-Streifen importieren", "Tempo einstellen, Live-3D-Vorschau", "Alle Chaos-Spieler sehen dein Cape"], kicker="COSMETICS")),
    (7.0, lambda t, d: scene_shot(t, d, S(SHOTS, "hat.png"), "25 Hüte", ["Drachenhelm, Chaos-Visor, Piratenhut …", "Leuchten, rotieren, schweben", "Exakt gleich im Launcher und im Spiel"], kicker="COSMETICS")),
    (8.0, scene_wings),
    (9.0, scene_legendary),
    (7.0, lambda t, d: scene_list(t, d, "24 EFFEKTE", [("🌪", "Chaos-Sturm", "Doppelhelix aus rotem und schwarzem Staub"), ("⚡", "Gewitter", "Blitzsäulen und Funken"), ("🌌", "Galaxie", "Sternenspirale um dich"), ("🌑", "Blutmond", "Blutroter Nebel mit Glut"), ("👻", "Irrlichter", "Seelen um deinen Kopf"), ("🎆", "Feuerwerksspur", "Funkelt beim Laufen"), ("🌈", "Regenbogen", "Tanzende Farbhelix"), ("❄", "Frost-Aura", "Schneeflocken und Eisstaub")])),
    (7.0, lambda t, d: scene_shot(t, d, S(SHOTS, "friends.png"), "Freunde", ["Anfragen senden & annehmen", "Live: im Spiel auf Server X · Launcher offen · offline", "„Mitspielen“ – ein Klick, direkt auf den Server", "Freunde ingame in der Tab-Liste markiert"], kicker="NEU IN 2.3")),
    (6.5, lambda t, d: scene_shot(t, d, S(SHOTS, "play.png"), "FPS-Boost", ["RAM, Grafikkarte und Monitor im Blick", "Schwere Mods mit einem Klick aus", "Hohe Prozesspriorität, richtige GPU", "„Boost anwenden“ – fertig"], kicker="PERFORMANCE")),
    (6.0, lambda t, d: scene_list(t, d, "UND NOCH MEHR", [("🔴", "Chaos-Badge", "Rotes C vor dem Namen aller Chaos-Spieler"), ("🎵", "Music Player", "MP3, WAV, OGG mit Hotkeys im Spiel"), ("🎙", "Simple Voice Chat", "Im Chaoscraft-Profil dabei"), ("🔁", "Sitzung heilt sich selbst", "Kein „Ungültige Sitzung“ mehr"), ("🧰", "Mod-Manager", "Updates, Abhängigkeiten, Shader, Resourcepacks"), ("🖥", "Ingame-Menü", "Rechte Shift-Taste: alles ohne Launcher-Wechsel")])),
    (7.0, scene_outro),
]
TOTAL = sum(d for d, _ in SCENES)
CROSS = 0.5  # Überblendung in Sekunden


def frame_at(T):
    acc = 0.0
    for idx, (dur, fn) in enumerate(SCENES):
        if T < acc + dur:
            local = T - acc
            img = fn(local, dur)
            # Überblendung zur nächsten Szene
            if idx + 1 < len(SCENES) and local > dur - CROSS:
                nxt = SCENES[idx + 1][1](0.0, SCENES[idx + 1][0])
                img = Image.blend(img, nxt, ease((local - (dur - CROSS)) / CROSS))
            return img
        acc += dur
    return SCENES[-1][1](SCENES[-1][0], SCENES[-1][0])


# ------------------------------------------------------------------ Ton (Synth-Beat, lizenzfrei generiert)
def make_audio(path, seconds):
    sr = 44100
    n = int(sr * seconds)
    t = np.arange(n) / sr
    bpm = 118
    beat = 60 / bpm
    out = np.zeros(n, dtype=np.float32)
    # Bass (Dark Synth): Grundton wechselt alle 2 Takte
    notes = [55.0, 55.0, 65.41, 49.0]  # A1, A1, C2, G1
    for i in range(int(seconds / (beat * 8)) + 1):
        f0 = notes[i % len(notes)]
        s, e = int(i * beat * 8 * sr), min(n, int((i + 1) * beat * 8 * sr))
        tt = t[s:e] - t[s] if e > s else t[:0]
        saw = 2 * ((tt * f0) % 1) - 1
        sub = np.sin(2 * np.pi * f0 * tt)
        env = 0.5 + 0.5 * np.sin(2 * np.pi * tt / (beat * 4) - np.pi / 2)
        out[s:e] += (0.18 * saw * (0.4 + 0.6 * env) + 0.22 * sub).astype(np.float32)
    # Kick auf jeden Beat, Hi-Hat auf Offbeats, Snare auf 2 und 4
    k = 0
    while k * beat < seconds:
        s = int(k * beat * sr)
        L = int(0.25 * sr)
        tt = np.arange(min(L, n - s)) / sr
        kick = np.sin(2 * np.pi * (120 * np.exp(-tt * 18) + 40) * tt) * np.exp(-tt * 9)
        out[s:s + len(kick)] += 0.9 * kick.astype(np.float32)
        if k % 2 == 1:
            Ls = int(0.18 * sr)
            tt2 = np.arange(min(Ls, n - s)) / sr
            snare = (np.random.rand(len(tt2)) * 2 - 1) * np.exp(-tt2 * 22) * 0.35
            out[s:s + len(snare)] += snare.astype(np.float32)
        sh = s + int(beat * sr / 2)
        if sh < n:
            Lh = int(0.06 * sr)
            tt3 = np.arange(min(Lh, n - sh)) / sr
            hat = (np.random.rand(len(tt3)) * 2 - 1) * np.exp(-tt3 * 60) * 0.12
            out[sh:sh + len(hat)] += hat.astype(np.float32)
        k += 1
    # Pad (Akkord) leise
    for f0 in (220.0, 261.63, 329.63):
        out += (0.04 * np.sin(2 * np.pi * f0 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 8))).astype(np.float32)
    # Fade in/out
    fade = int(1.5 * sr)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade * 2:] *= np.linspace(1, 0, fade * 2)
    out = np.tanh(out * 1.3) * 0.85
    pcm = (out * 32767).astype(np.int16)
    import wave
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    wav = OUT.replace(".mp4", ".wav")
    print("Ton …")
    make_audio(wav, TOTAL + 0.5)
    total_frames = int(TOTAL * FPS)
    print(f"Video: {TOTAL:.1f} s, {total_frames} Frames")
    cmd = [FF, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(total_frames):
        img = frame_at(i / FPS)
        proc.stdin.write(img.tobytes())
        if i % (FPS * 5) == 0:
            print(f"  {i / FPS:5.1f} s", flush=True)
    proc.stdin.close()
    proc.wait()
    print("fertig:", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()

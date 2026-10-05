"""Chaos-Namens-Badge: Pixel-Icon (Font-Glyph) vor dem Spielernamen, wie bei NoRisk/LabyMod.
Erzeugt assets/chaosclient/font/badge.png (Glyphen nebeneinander, je 16×16, gerendert mit Höhe 8 → 2× Detail)
und assets/chaosclient/font/badge.json. Glyphen: U+E000 Chaos-C, U+E001 Flamme, U+E002 Krone, U+E003 Totenkopf."""
import json, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(os.path.dirname(os.path.dirname(HERE)), "onyx-visuals")
OUT = os.path.join(MOD, "src", "main", "resources", "assets", "chaosclient", "font")
os.makedirs(OUT, exist_ok=True)
G = 16
RED, RED2, DARK, BLACK, WHITE, GOLD, GOLD2, BONE = (225, 29, 46, 255), (255, 92, 108, 255), (20, 8, 10, 255), (10, 10, 12, 255), (255, 255, 255, 255), (250, 204, 21, 255), (253, 230, 138, 255), (236, 236, 236, 255)


def chaos_c(d):
    # schwarzer runder Button mit rotem Ring-C und Glanz
    d.ellipse([1, 1, 14, 14], fill=BLACK, outline=DARK)
    d.ellipse([3, 3, 12, 12], outline=RED, width=2)
    d.rectangle([9, 6, 13, 9], fill=BLACK)  # Öffnung des C
    d.point([(4, 4), (5, 3)], fill=RED2)
    d.point([(12, 2)], fill=WHITE)


def flame(d):
    pts = [(8, 1), (11, 5), (10, 8), (13, 9), (12, 13), (8, 15), (4, 13), (3, 9), (6, 8), (5, 5)]
    d.polygon(pts, fill=RED, outline=DARK)
    d.polygon([(8, 6), (10, 10), (8, 14), (6, 10)], fill=GOLD)
    d.polygon([(8, 9), (9, 11), (8, 13), (7, 11)], fill=WHITE)


def crown(d):
    d.polygon([(2, 13), (2, 5), (5, 8), (8, 3), (11, 8), (14, 5), (14, 13)], fill=GOLD, outline=DARK)
    d.rectangle([2, 11, 14, 13], fill=GOLD2, outline=DARK)
    d.point([(8, 11), (4, 11), (12, 11)], fill=RED)
    d.point([(8, 4)], fill=WHITE)


def skull(d):
    d.ellipse([3, 1, 13, 11], fill=BONE, outline=DARK)
    d.rectangle([5, 10, 11, 14], fill=BONE, outline=DARK)
    d.rectangle([5, 5, 7, 7], fill=RED)
    d.rectangle([9, 5, 11, 7], fill=RED)
    d.point([(8, 9)], fill=DARK)
    d.point([(6, 13), (8, 13), (10, 13)], fill=DARK)


glyphs = [chaos_c, flame, crown, skull]
img = Image.new("RGBA", (G * len(glyphs), G), (0, 0, 0, 0))
for i, fn in enumerate(glyphs):
    tile = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    fn(ImageDraw.Draw(tile))
    img.paste(tile, (i * G, 0))
img.save(os.path.join(OUT, "badge.png"))
chars = "".join(chr(0xE000 + i) for i in range(len(glyphs)))
json.dump({"providers": [{"type": "bitmap", "file": "chaosclient:font/badge.png", "ascent": 7, "height": 8, "chars": [chars]}]}, open(os.path.join(OUT, "badge.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
prev = img.resize((img.width * 6, img.height * 6), Image.NEAREST)
prev.save(os.path.join(HERE, "badge_preview.png"))
print("ok", os.path.join(OUT, "badge.png"))

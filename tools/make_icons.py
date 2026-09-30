"""Génère les icônes de l'appli : un « Я » à l'encre bleue sur une page de cahier russe
(petits carreaux, marge rouge), comme le thème de l'appli.

Usage : python tools/make_icons.py [chemin/vers/PT_Serif-Regular.ttf]
(nécessite Pillow : pip install pillow ; la police se télécharge sur fonts.google.com — PT Serif).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER = (246, 248, 251)
GRID = (221, 228, 238)
MARGIN = (233, 163, 168)
INK = (31, 46, 107)
FALLBACK_FONTS = ["C:/Windows/Fonts/georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]
OUT = Path(__file__).resolve().parent.parent / "icons"


def load_font(size: int, font_path: str | None) -> ImageFont.FreeTypeFont:
    for path in [font_path, *FALLBACK_FONTS]:
        if path:
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size=size)


def make_icon(size: int, font_path: str | None) -> Image.Image:
    img = Image.new("RGB", (size, size), PAPER)
    draw = ImageDraw.Draw(img)
    cell = size / 7.5                      # des carreaux visibles même en petit
    line = max(1, round(size / 180))
    for i in range(1, 8):
        pos = round(i * cell)
        draw.line([(pos, 0), (pos, size)], fill=GRID, width=line)
        draw.line([(0, pos), (size, pos)], fill=GRID, width=line)
    margin_x = round(size * 0.2)          # la marge rouge du cahier
    draw.line([(margin_x, 0), (margin_x, size)], fill=MARGIN, width=max(2, round(size / 60)))

    font = load_font(round(size * 0.66), font_path)
    left, top, right, bottom = draw.textbbox((0, 0), "Я", font=font)
    area_left = margin_x
    x = area_left + (size - area_left - (right - left)) / 2 - left
    y = (size - (bottom - top)) / 2 - top
    draw.text((x, y), "Я", font=font, fill=INK)
    return img


def main():
    font_path = sys.argv[1] if len(sys.argv) > 1 else None
    OUT.mkdir(exist_ok=True)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        make_icon(size, font_path).save(OUT / name)
        print(f"icons/{name} ({size}x{size})")


if __name__ == "__main__":
    main()

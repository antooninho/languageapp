"""Génère les icônes de l'appli (un « Я » blanc sur fond rouge).

Usage : python tools/make_icons.py   (nécessite Pillow : pip install pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BACKGROUND = (179, 38, 30)  # --primary du thème clair
FOREGROUND = (255, 255, 255)
FONT_PATH = "C:/Windows/Fonts/arialbd.ttf"
OUT = Path(__file__).resolve().parent.parent / "icons"


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(FONT_PATH, int(size * 0.62))
    except OSError:
        font = ImageFont.load_default(size=int(size * 0.62))
    left, top, right, bottom = draw.textbbox((0, 0), "Я", font=font)
    x = (size - (right - left)) / 2 - left
    y = (size - (bottom - top)) / 2 - top
    draw.text((x, y), "Я", font=font, fill=FOREGROUND)
    return img


def main():
    OUT.mkdir(exist_ok=True)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        make_icon(size).save(OUT / name)
        print(f"icons/{name} ({size}x{size})")


if __name__ == "__main__":
    main()

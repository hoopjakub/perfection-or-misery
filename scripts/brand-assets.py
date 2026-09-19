"""Draws the Perfection or Misery brand assets from the Kit Drop brief
(docs/ui-overhaul/05-STYLE-GUIDE.md §9): the compact mark is a riveted plate
reading P/M in the super, with an orange zip-tie tag hanging off its corner.

Run from the project root:  python scripts/brand-assets.py
Needs Pillow and the installed @expo-google-fonts packages (for the face).
Writes into assets/ over the Expo template art.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SUPER = ROOT / "node_modules/@expo-google-fonts/barlow-condensed/900Black_Italic/BarlowCondensed_900Black_Italic.ttf"

COTTON = (243, 243, 240, 255)
INK = (12, 12, 13, 255)
NYLON = (20, 20, 22, 255)
ORANGE = (255, 90, 0, 255)
CLEAR = (0, 0, 0, 0)

SS = 4  # draw at 4x and downsample, for clean edges


def mark(size: int, *, plate=COTTON, line=INK, text=INK, tag=True, mono=None) -> Image.Image:
    """The compact mark on a transparent square of `size`. The plate fills the
    middle ~62% so it survives Android's circular adaptive-icon mask."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    d = ImageDraw.Draw(im)
    if mono:
        plate, line, text = CLEAR, mono, mono
    w, h = int(S * 0.62), int(S * 0.42)
    x0, y0 = (S - w) // 2, (S - h) // 2 + int(S * 0.03)
    x1, y1 = x0 + w, y0 + h
    stroke = max(SS, int(S * 0.018))
    # 2px-style ink offset, scaled: the plate sits pressed onto the cloth
    off = int(S * 0.022)
    if not mono:
        d.rectangle([x0 + off, y0 + off, x1 + off, y1 + off], fill=line)
    d.rectangle([x0, y0, x1, y1], fill=plate, outline=line, width=stroke)
    # rivets
    r = int(S * 0.012)
    inset = int(S * 0.04)
    for cx, cy in [(x0 + inset, y0 + inset), (x1 - inset, y0 + inset), (x0 + inset, y1 - inset), (x1 - inset, y1 - inset)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=line)
    # P/M in the super, optically centred
    font = ImageFont.truetype(str(SUPER), int(h * 0.82))
    label = "P/M"
    bbox = d.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((x0 + (w - tw) / 2 - bbox[0], y0 + (h - th) / 2 - bbox[1]), label, font=font, fill=text)
    if tag:
        # zip-tie tag: a strap from the top-right corner, then a round head with a hole
        tag_col = mono or ORANGE
        sx, sy = x1 - int(S * 0.02), y0 + int(S * 0.02)
        ex, ey = x1 + int(S * 0.07), y0 - int(S * 0.12)
        d.line([sx, sy, ex, ey], fill=tag_col, width=int(S * 0.028))
        hr = int(S * 0.055)
        d.ellipse([ex - hr, ey - hr, ex + hr, ey + hr], fill=tag_col)
        hole = int(hr * 0.35)
        d.ellipse([ex - hole, ey - hole, ex + hole, ey + hole], fill=CLEAR if mono else (NYLON if plate == COTTON else INK))
    return im.resize((size, size), Image.LANCZOS)


def on_ground(size: int, ground, **kw) -> Image.Image:
    base = Image.new("RGBA", (size, size), ground)
    base.alpha_composite(mark(size, **kw))
    return base


def main():
    on_ground(1024, NYLON).convert("RGB").save(ASSETS / "icon.png")
    mark(512).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGBA", (512, 512), NYLON).save(ASSETS / "android-icon-background.png")
    mark(432, mono=(255, 255, 255, 255)).save(ASSETS / "android-icon-monochrome.png")
    # favicon: at 48px the plate alone reads; the tag stays as an orange cluster
    on_ground(48, NYLON).save(ASSETS / "favicon.png")
    # splash: the mark on nylon, transparent so the splash background shows
    mark(1024).save(ASSETS / "splash-icon.png")
    print("brand assets written to", ASSETS)


if __name__ == "__main__":
    main()

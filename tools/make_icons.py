"""Draws the extension icons: code lines on a purple-to-blue tile, with the
middle line folded into a chevron and dots, like a collapsed comment.

    python tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
W = 1024  # draw large, then downscale for clean edges

TOP = (130, 80, 223)
BOTTOM = (9, 105, 218)
WHITE = (255, 255, 255, 255)
FADED = (255, 255, 255, 150)
ACCENT = (255, 211, 61, 255)


def draw(pad, simple):
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    p = int(W * pad)
    inner = W - 2 * p

    gradient = Image.new("RGBA", (W, W))
    g = ImageDraw.Draw(gradient)
    for y in range(W):
        t = y / (W - 1)
        g.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle((p, p, W - p, W - p), radius=int(inner * 0.23), fill=255)
    img.paste(gradient, (0, 0), mask)

    d = ImageDraw.Draw(img)
    X = lambda f: p + inner * f
    h = inner * (0.14 if simple else 0.10)

    def bar(x0, x1, y, fill):
        d.rounded_rectangle((X(x0), X(y) - h / 2, X(x1), X(y) + h / 2), radius=h / 2, fill=fill)

    bar(0.20, 0.76, 0.26, WHITE)

    # The folded comment: a chevron followed by dots.
    y = X(0.50)
    cx = X(0.20)
    d.polygon([(cx, y - h * 0.95), (cx, y + h * 0.95), (cx + h * 1.55, y)], fill=ACCENT)
    if simple:
        bar(0.46, 0.72, 0.50, FADED)
    else:
        r = h * 0.40
        x = X(0.44)
        while x + r <= X(0.80):
            d.ellipse((x - r, y - r, x + r, y + r), fill=FADED)
            x += h * 1.35

    bar(0.32, 0.68, 0.74, WHITE)
    return img


def main():
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    # Chrome's guideline: 128px icons keep ~16px of transparent padding.
    for size, pad, simple in [(16, 0.0, True), (32, 0.03, True), (48, 0.06, False), (128, 0.125, False)]:
        draw(pad, simple).resize((size, size), Image.LANCZOS).save(out / f"icon{size}.png")
    draw(0.125, False).resize((512, 512), Image.LANCZOS).save(out / "icon512.png")
    print("wrote", out)


if __name__ == "__main__":
    main()

"""Generate CupSet brand assets (logo.png, banner.png). Requires Pillow.

Run:  python3 assets/make_brand.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter

HERE = Path(__file__).resolve().parent
CYAN, VIOLET, ROSE = (34, 211, 238), (129, 140, 248), (244, 63, 94)
BG_TOP, BG_BOT = (16, 22, 38), (11, 14, 20)
INK, MUT, DIM, DARK = (238, 242, 255), (147, 160, 187), (91, 106, 140), (11, 14, 20)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(size):
    return ImageFont.load_default(size=size)


def diag_gradient(size):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w + y / h) / 2
            c = lerp(CYAN, VIOLET, t * 2) if t < 0.5 else lerp(VIOLET, ROSE, (t - 0.5) * 2)
            px[x, y] = c
    return img


def vert_gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        c = lerp(top, bottom, y / h)
        for x in range(w):
            px[x, y] = c
    return img


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    if img.mode == "RGBA":
        img.putalpha(ImageChops.darker(img.split()[3], mask))
        return img
    img.putalpha(mask)
    return img.convert("RGBA")


def clapper_board(bw, bh):
    """White clapperboard with dark slate + play button, transparent bg."""
    layer = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rectangle([0, 0, bw - 1, bh - 1], fill=(255, 255, 255, 255))
    sh = int(bh * 0.30)
    d.rectangle([0, 0, bw - 1, sh], fill=DARK + (255,))
    n, wslash = 6, max(2, bw // 30)
    for i in range(n):
        sx = int(bw * 0.05 + i * bw * 0.155)
        d.line([sx, 3, sx + int(bw * 0.085), sh - 3], fill=(255, 255, 255, 255), width=wslash)
    cx, cy = bw / 2, sh + (bh - sh) / 2
    r = (bh - sh) * 0.30
    d.polygon([(cx - r * 0.75, cy - r), (cx + r * 0.95, cy), (cx - r * 0.75, cy + r)], fill=DARK + (255,))
    return rounded(layer, min(bw, bh) // 11)


def fit_text(d, xy, text, start, max_w, fill):
    s = start
    while s > 10:
        f = font(s)
        bb = d.textbbox(xy, text, font=f)
        if bb[2] - bb[0] <= max_w:
            break
        s -= 2
    d.text(xy, text, font=font(s), fill=fill)


def make_logo(path, size=512):
    tile = rounded(diag_gradient((size, size)), size * 112 // 512)
    bw, bh = int(size * 0.68), int(size * 0.56)
    board = clapper_board(bw, bh)
    tile.alpha_composite(board, (int((size - bw) / 2), int(size * 0.24)))
    tile.save(path)
    print("wrote", path)


def make_banner(path, w=1200, h=630):
    img = vert_gradient((w, h), BG_TOP, BG_BOT).convert("RGBA")
    # soft violet glow
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([w * 0.35, -h * 0.55, w * 1.15, h * 0.75], fill=(129, 140, 248, 46))
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    img.alpha_composite(glow)
    glow2 = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow2).ellipse([-w * 0.25, h * 0.25, w * 0.35, h * 1.25], fill=(34, 211, 238, 30))
    img.alpha_composite(glow2.filter(ImageFilter.GaussianBlur(60)))

    mark = rounded(diag_gradient((200, 200)), 44)
    board = clapper_board(136, 112)
    mark.alpha_composite(board, (32, 48))
    img.alpha_composite(mark, (90, 150))

    d = ImageDraw.Draw(img)
    d.text((330, 140), "CupSet", font=font(124), fill=INK)
    fit_text(d, (90, 385), "Free browser video editor - no uploads, no watermark", 36, w - 90 - 40, MUT)
    fit_text(d, (90, 448), "Timeline - filters - captions - screen record - MP4 export", 31, w - 90 - 40, DIM)
    d.text((90, h - 70), "Copyright 2026 salim-slimani  |  MIT licensed", font=font(26), fill=DIM)
    img.convert("RGB").save(path, quality=92)
    print("wrote", path)


if __name__ == "__main__":
    make_logo(HERE / "logo.png")
    make_banner(HERE / "banner.png")

"""Regenerate the fluorescent-yellow dog PNG icons (192/512/maskable/180).

The PNGs are build artifacts, not source: they are generated in CI before
`vite build` (see .github/workflows/deploy.yml), so they are not committed.
Requires Pillow: pip install pillow
"""

from PIL import Image, ImageDraw

YELLOW = (229, 255, 0)
BLACK = (10, 10, 10)


def draw_dog(d, cx, cy, r):
    er = r * 0.42
    # ears overlapping the head top
    d.ellipse([cx - r * 0.66 - er, cy - r * 0.78 - er, cx - r * 0.66 + er, cy - r * 0.78 + er], fill=YELLOW)
    d.ellipse([cx + r * 0.66 - er, cy - r * 0.78 - er, cx + r * 0.66 + er, cy - r * 0.78 + er], fill=YELLOW)
    # head
    d.ellipse([cx - r, cy - r * 0.55, cx + r, cy + r * 0.85], fill=YELLOW)
    # eyes
    eye_r = r * 0.13
    d.ellipse([cx - r * 0.42 - eye_r, cy - r * 0.12 - eye_r, cx - r * 0.42 + eye_r, cy - r * 0.12 + eye_r], fill=BLACK)
    d.ellipse([cx + r * 0.42 - eye_r, cy - r * 0.12 - eye_r, cx + r * 0.42 + eye_r, cy - r * 0.12 + eye_r], fill=BLACK)
    # nose
    d.ellipse([cx - r * 0.26, cy + r * 0.28, cx + r * 0.26, cy + r * 0.52], fill=BLACK)


def rounded_bg(size, radius):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BLACK + (255,))
    return img, d


def main():
    import os

    out = os.path.join(os.path.dirname(__file__), "..", "public")
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
        img, d = rounded_bg(size, int(size * 0.19))
        draw_dog(d, size / 2, size * 0.52, size * 0.30)
        img.convert("RGB").save(os.path.join(out, name))
        print(name, img.size)

    # maskable: full-bleed black square, dog at 72% scale inside safe zone
    size = 512
    img = Image.new("RGB", (size, size), BLACK)
    d = ImageDraw.Draw(img)
    draw_dog(d, size / 2, size * 0.50, size * 0.26)
    img.save(os.path.join(out, "icon-512-maskable.png"))
    print("icon-512-maskable.png", img.size)


if __name__ == "__main__":
    main()

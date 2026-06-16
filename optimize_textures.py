"""
Texture optimisation for the Digital Exhibition.

Downscales the oversized source textures in place so they upload fast and use a
fraction of the GPU memory on mobile:

  - 5 exhibit photos -> fit within 1600x1200, JPEG q82
  - orb_tex.png      -> 512x512  (mapped onto a tiny 0.22 sphere)
  - tile.png         -> 1024x1024 power-of-two (enables mipmaps + repeat wrap)

Originals are git-tracked, so this overwrites them in place. Re-running is safe
(idempotent: images already at or below target size are left untouched).

Usage:
    python optimize_textures.py
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))

EXHIBIT_DIR = os.path.join(ROOT, "images")
EXHIBIT_MAX = (1600, 1200)
EXHIBIT_QUALITY = 82

PNG_TARGETS = {
    "orb_tex.png": (512, 512),
    "tile.png": (1024, 1024),
}


def human(n_bytes):
    return f"{n_bytes / 1024 / 1024:.2f} MB"


def optimize_jpeg(path, max_size, quality):
    before = os.path.getsize(path)
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        if w > max_size[0] or h > max_size[1]:
            im.thumbnail(max_size, Image.LANCZOS)
        im.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    after = os.path.getsize(path)
    new = Image.open(path).size
    print(f"  {os.path.basename(path):40s} {w}x{h} -> {new[0]}x{new[1]}  "
          f"{human(before)} -> {human(after)}")


def optimize_png(path, size):
    before = os.path.getsize(path)
    with Image.open(path) as im:
        w, h = im.size
        mode = "RGBA" if "A" in im.getbands() else "RGB"
        im = im.convert(mode)
        im = im.resize(size, Image.LANCZOS)
        im.save(path, "PNG", optimize=True)
    after = os.path.getsize(path)
    print(f"  {os.path.basename(path):40s} {w}x{h} -> {size[0]}x{size[1]}  "
          f"{human(before)} -> {human(after)}")


def main():
    print("Exhibit photos:")
    if os.path.isdir(EXHIBIT_DIR):
        for name in sorted(os.listdir(EXHIBIT_DIR)):
            if name.lower().endswith((".jpg", ".jpeg")):
                optimize_jpeg(os.path.join(EXHIBIT_DIR, name),
                              EXHIBIT_MAX, EXHIBIT_QUALITY)

    print("Texture PNGs:")
    for name, size in PNG_TARGETS.items():
        path = os.path.join(ROOT, name)
        if os.path.isfile(path):
            optimize_png(path, size)

    print("Done.")


if __name__ == "__main__":
    main()

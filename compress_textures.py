"""
compress_textures.py
Recompresses orb_tex.png and tile.png using Pillow.
  - orb_tex.png: quantised to 256 colours (lossy, like pngquant) then max zlib
  - tile.png:    lossless max-zlib recompress only (it's already small)
"""
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).parent

def size_kb(path):
    return round(path.stat().st_size / 1024, 1)

def compress_quantised(src: pathlib.Path, colours: int = 256):
    """Quantise to N colours then save at max zlib compression."""
    img = Image.open(src).convert("RGBA")
    # quantize() returns a palette-mode image; convert back for consistent save
    quantised = img.quantize(colors=colours, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    out = src.with_suffix('.png')  # overwrite in place
    before = size_kb(src)
    quantised.save(out, format='PNG', optimize=True, compress_level=9)
    after = size_kb(out)
    print(f"  {src.name}: {before} KB → {after} KB  (saved {before-after:.1f} KB, {100*(before-after)/before:.0f}%)")

def compress_lossless(src: pathlib.Path):
    """Lossless recompress at maximum zlib level."""
    img = Image.open(src)
    before = size_kb(src)
    img.save(src, format='PNG', optimize=True, compress_level=9)
    after = size_kb(src)
    print(f"  {src.name}: {before} KB → {after} KB  (saved {before-after:.1f} KB, {100*(before-after)/before:.0f}%)")

print("Compressing textures...")
compress_quantised(ROOT / "orb_tex.png", colours=256)
compress_lossless(ROOT / "tile.png")
print("\nDone. Hard-refresh the browser to see updated transfer sizes.")

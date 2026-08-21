from pathlib import Path

from PIL import Image


root = Path(__file__).resolve().parents[1] / "assets" / "images"
targets = ["icon.png", "splash-icon.png", "favicon.png", "android-icon-foreground.png"]

for filename in targets:
    path = root / filename
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        rgba.thumbnail((768, 768), Image.Resampling.LANCZOS)
        rgba.save(path, format="PNG", optimize=True, compress_level=9)
        print(f"{filename}: {path.stat().st_size} bytes, {rgba.size[0]}x{rgba.size[1]}")

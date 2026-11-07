"""
Generator kursora myszy (krok 172): celownik z kości z krwawą kropką, w stylu znacznika celowania (loot_sprites.py).

Kursor podstawia CSS (`cursor: url(...)` w index.html), więc gra niczego nie rysuje co klatkę — to zwykły kursor systemu
z naszym obrazkiem. Siatka ASCII 15x15 (środek = gorący punkt), skala 2x (jak zoom gry) i 4x (ekrany HiDPI).

Użycie (z katalogu głównego repozytorium):
  python tools/cursor_sprites.py                       # public/assets/cursor/crosshair{,@2x}.png
  python tools/cursor_sprites.py --preview tools/out   # dodatkowo podgląd 8x na tle posadzki
"""
import argparse
import os

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import BONE, OUT, hx

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'cursor')
# Kanwa kursora: 32 px przy 1x i 64 px przy 2x — Chrome odrzuca kursory większe niż 32 px CSS przy krawędzi okna.
CANVAS = 32
SCALE = 2
BLOOD = hx('#c8243a')

# . przezroczyste  L kość (baza)  H kość (blask)  R krew  o obrys (dokładany niżej automatycznie)
CROSSHAIR = [
    '...............',
    '.......H.......',
    '.......L.......',
    '.......L.......',
    '.......L.......',
    '...............',
    '...............',
    '.HLLL..R..LLLH.',
    '...............',
    '...............',
    '.......L.......',
    '.......L.......',
    '.......L.......',
    '.......H.......',
    '...............',
]
COLORS = {'L': BONE[1], 'H': BONE[2], 'R': BLOOD}


def logical():
    """Obrazek 15x15: piksele z siatki + obrys 1 px w 8-sąsiedztwie (czytelny na jasnym i ciemnym tle)."""
    size = len(CROSSHAIR)
    assert all(len(row) == size for row in CROSSHAIR), 'siatka kursora musi być kwadratem'
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(CROSSHAIR):
        for x, ch in enumerate(row):
            if ch in COLORS:
                px[x, y] = COLORS[ch]
    filled = {(x, y) for y in range(size) for x in range(size) if px[x, y][3]}
    for x, y in filled:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < size and 0 <= ny < size and (nx, ny) not in filled:
                    px[nx, ny] = OUT
    return img


def export(img, factor):
    """Skala całkowita (pixel-perfect), wyśrodkowana na kanwie CANVAS*factor/SCALE."""
    big = img.resize((img.width * factor, img.height * factor), Image.NEAREST)
    side = CANVAS * factor // SCALE
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    off = (side - big.width) // 2
    canvas.paste(big, (off, off))
    return canvas, off + (img.width // 2) * factor + factor // 2


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--preview', help='katalog na podgląd 8x')
    args = parser.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    img = logical()
    for name, factor in (('crosshair.png', SCALE), ('crosshair@2x.png', SCALE * 2)):
        sheet, hot = export(img, factor)
        sheet.save(os.path.join(OUT_DIR, name))
        print(f'{name}: {sheet.width}x{sheet.height}, gorący punkt {hot},{hot}')
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        bg = Image.new('RGBA', (img.width * 2, img.height), trt.PALETTES['piaskowiec'].floor[2])
        dark = Image.new('RGBA', (img.width, img.height), hx('#0e0e12'))
        bg.paste(dark, (img.width, 0))
        bg.alpha_composite(img, (0, 0))
        bg.alpha_composite(img, (img.width, 0))
        bg.resize((bg.width * 8, bg.height * 8), Image.NEAREST).save(os.path.join(args.preview, 'cursor_preview.png'))


if __name__ == '__main__':
    main()

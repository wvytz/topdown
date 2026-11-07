"""
Generator kursorów myszy (krok 172, kursory bohaterów — krok 178): celownik z kości z krwawą kropką (menu),
mieczyk barbarzyńcy, mały łuk łucznika i kostur Czarodziejki z kryształem (krok 180), w stylu znacznika celowania (loot_sprites.py).

Kursor podstawia CSS (`cursor: url(...)` w index.html), więc gra niczego nie rysuje co klatkę — to zwykły kursor systemu
z naszym obrazkiem. Siatki ASCII 15x15 (gorący punkt podaje HOTSPOTS; musi zgadzać się z config/cursorConfig.ts), skala 2x (jak zoom gry) i 4x (ekrany HiDPI).

Użycie (z katalogu głównego repozytorium):
  python tools/cursor_sprites.py                       # public/assets/cursor/<kursor>{,@2x}.png
  python tools/cursor_sprites.py --preview tools/out   # dodatkowo podgląd 8x na tle posadzki
"""
import argparse
import os

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import BONE, DIRT, GOLD, IRON, OUT, hx

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'cursor')
# Kanwa kursora: 32 px przy 1x i 64 px przy 2x — Chrome odrzuca kursory większe niż 32 px CSS przy krawędzi okna.
CANVAS = 32
SCALE = 2
BLOOD = hx('#c8243a')

# . przezroczyste  L kość (baza)  H kość (blask)  j kość (cięciwa)  R krew  s S T stal  g G Y złoto  w W u drewno  c C e kryształ
# Obrys 1 px dokładamy automatycznie, dlatego skrajne wiersze i kolumny zostają puste.
CURSORS = {
    'crosshair': [
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
    ],
    # Mieczyk barbarzyńcy: czubek ostrza w lewym górnym rogu to gorący punkt (jak strzałka systemu).
    'sword': [
        '...............',
        '.TS............',
        '.sTS...........',
        '..sTS..........',
        '...sTS.........',
        '....sTS........',
        '.....sTS.......',
        '......sTS..YG..',
        '.......sTSYG...',
        '.........YG....',
        '........YGwW...',
        '.......YG..wW..',
        '.......G....YG.',
        '............GG.',
        '...............',
    ],
    # Mały łuk łucznika z nałożoną strzałą: grot w lewym górnym rogu to gorący punkt.
    'bow': [
        '...............',
        '.TS............',
        '.ST......uuuuu.',
        '...L..uuuu..j..',
        '....Luu....j...',
        '....WL....j....',
        '...uW.L..j.....',
        '...u...Lj......',
        '...u...jLR.....',
        '..uu..j.RR.....',
        '..u..j.........',
        '..u.j..........',
        '..uj...........',
        '..u............',
        '...............',
    ],
    # Kostur Czarodziejki (krok 180): kryształ w kolorach jej promienia w lewym górnym rogu — gorący punkt.
    'wand': [
        '...............',
        '.eC............',
        '.CeCc..........',
        '..CCCc.........',
        '..cCcYG........',
        '...cYGuw.......',
        '.....uw........',
        '......uw.......',
        '.......uw......',
        '........uw.....',
        '.........uw....',
        '..........uw...',
        '...........uG..',
        '............G..',
        '...............',
    ],
}
# Gorący punkt (x, y) w pikselach siatki.
HOTSPOTS = {'crosshair': (7, 7), 'sword': (1, 1), 'bow': (1, 1), 'wand': (1, 1)}
COLORS = {
    'L': BONE[1], 'H': BONE[2], 'j': BONE[2], 'R': BLOOD,
    's': IRON[0], 'S': IRON[1], 'T': IRON[2],
    'g': GOLD[0], 'G': GOLD[1], 'Y': GOLD[2],
    'c': hx('#4a1f8c'), 'C': hx('#8a4fe0'), 'e': hx('#f6eaff'),  # kryształ — fiolet Czarodziejki (SORCERY_COLORS, krok 181)
    'w': DIRT[2], 'W': DIRT[3], 'u': hx('#9a6e44'),  # u jaśniejsze od DIRT[4] — łuk ma być widać na ciemnym tle
}


def logical(rows):
    """Obrazek 15x15: piksele z siatki + obrys 1 px w 8-sąsiedztwie (czytelny na jasnym i ciemnym tle)."""
    size = len(rows)
    assert all(len(row) == size for row in rows), 'siatka kursora musi być kwadratem'
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
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


def export(img, factor, hotspot):
    """Skala całkowita (pixel-perfect), wyśrodkowana na kanwie CANVAS*factor/SCALE; zwraca też gorący punkt w px obrazka."""
    big = img.resize((img.width * factor, img.height * factor), Image.NEAREST)
    side = CANVAS * factor // SCALE
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    off = (side - big.width) // 2
    canvas.paste(big, (off, off))
    return canvas, tuple(off + v * factor + factor // 2 for v in hotspot)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--preview', help='katalog na podgląd 8x')
    args = parser.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    images = {name: logical(rows) for name, rows in CURSORS.items()}
    for name, img in images.items():
        for suffix, factor in (('', SCALE), ('@2x', SCALE * 2)):
            sheet, hot = export(img, factor, HOTSPOTS[name])
            sheet.save(os.path.join(OUT_DIR, f'{name}{suffix}.png'))
            print(f'{name}{suffix}.png: {sheet.width}x{sheet.height}, gorący punkt {hot[0]},{hot[1]}')
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        size = len(CURSORS['crosshair'])
        bg = Image.new('RGBA', (size * len(images), size * 2), trt.PALETTES['piaskowiec'].floor[2])
        bg.paste(Image.new('RGBA', (bg.width, size), hx('#0e0e12')), (0, size))
        for i, img in enumerate(images.values()):
            bg.alpha_composite(img, (i * size, 0))
            bg.alpha_composite(img, (i * size, size))
        bg.resize((bg.width * 8, bg.height * 8), Image.NEAREST).save(os.path.join(args.preview, 'cursor_preview.png'))

if __name__ == '__main__':
    main()

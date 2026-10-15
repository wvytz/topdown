"""
Generator rekwizytów ruin (krok 48): pułapki i rzeczy do rozbicia na pierwszym piętrze.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/ruins_props.py                       # arkusze do public/assets/sprites/
  python tools/ruins_props.py --preview tools/out   # dodatkowo podglądy 4x na podłodze ruin

ruins-traps.png (288x32, komórka 32x32 = jeden kafel, bez kierunków), 9 klatek:
  0 płyta z kolcami schowanymi (kamienna płyta, 3x3 otwory), 1–2 ostrzeżenie (groty w otworach, płyta drży o 1 px),
  3 kolce w połowie, 4 kolce wysunięte, 5 płyta naciskowa, 6 płyta naciśnięta,
  7 otwór strzelniczy (wylot na dół — silnik obraca go o 90° w stronę strzału), 8 otwór uzbrojony (żar w wylocie).
dart.png (16x16): strzałka grotem w prawo (silnik obraca o wielokrotność 90°).
ruins-breakables.png (192x32, komórka 32x32): 0–1 urny (dwa kształty), 2 skrzynia, 3–5 skorupy i deski po rozbiciu.
Widok z góry, obrys #1b1a22 (STYLEGUIDE §3), cieniowanie pasmowe, światło z lewej-góry; bez czystej czerni i bieli.
"""
import argparse
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import IRON, OUT, Img, ok, outline
from spider_sprites import band_shade, ellipse

PAL = trt.PALETTES['piaskowiec']
SPRITES = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 32
# Kamień płyt: ciemniejszy od posadzki, żeby pułapka była czytelna (chłodniejszy odcień).
STONE = (ok(.30, .014, 250), ok(.38, .014, 245), ok(.45, .016, 240), ok(.52, .016, 235), ok(.60, .014, 230))
# Glina urn: wypalona terakota; drewno skrzyń: ciepły brąz.
CLAY = (ok(.33, .060, 40), ok(.42, .080, 42), ok(.52, .095, 45), ok(.61, .090, 50), ok(.70, .070, 60))
WOOD = (ok(.28, .040, 55), ok(.36, .050, 60), ok(.45, .060, 65), ok(.54, .060, 70), ok(.62, .050, 75))
EMBER = trt.FLAME


def plate(img, x0, y0, size, ramp, raised=True):
    """Kwadratowa płyta: jasna krawędź z lewej-góry, ciemna z prawej-dołu (gdy uniesiona)."""
    for y in range(y0, y0 + size):
        for x in range(x0, x0 + size):
            lit = x == x0 or y == y0
            dark = x == x0 + size - 1 or y == y0 + size - 1
            img.put(x, y, ramp[3] if lit and raised else (ramp[1] if dark and raised else ramp[2]))


def spike_frame(f):
    img = Img(CELL, CELL)
    shake = 1 if f == 2 else 0
    x0, y0 = 4 + shake, 4
    plate(img, x0, y0, 24, STONE)
    holes = [(x0 + 5 + i * 7, y0 + 5 + j * 7) for i in range(3) for j in range(3)]
    for hx, hy in holes:
        for dy in range(2):
            for dx in range(2):
                img.put(hx + dx, hy + dy, STONE[0])
        if f in (1, 2):  # groty w otworach: jasne czubki 2x2
            for dy in range(2):
                for dx in range(2):
                    img.put(hx + dx, hy + dy, IRON[2] if dx + dy == 0 else IRON[1])
        if f in (3, 4):  # kolce: romb (z góry — ostrosłup), blask z lewej-góry, ciemny obrys
            r = 2.5 if f == 3 else 3.6
            cx, cy = hx + 1, hy + 1
            pts = [(x, y) for y in range(cy - 5, cy + 5) for x in range(cx - 5, cx + 5)
                   if abs(x + .5 - cx) + abs(y + .5 - cy) <= r]
            for x, y in pts:
                d = (x + .5 - cx) + (y + .5 - cy)
                img.put(x, y, trt.BONE[1] if d < -1 else (IRON[2] if d < .5 else (IRON[1] if d < 2 else IRON[0])))
            inside = set(pts)
            for x, y in pts:
                if any((x + ax, y + ay) not in inside for ax, ay in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    if (x + .5 - cx) + (y + .5 - cy) > 0:
                        img.put(x, y, OUT)
    outline(img, OUT)
    return img


def pressure_frame(pressed):
    img = Img(CELL, CELL)
    plate(img, 7, 7, 18, STONE, raised=not pressed)
    # wyryty znak: krzyż w środku (ciemniejszy, gdy płyta wciśnięta)
    for i in range(-3, 4):
        img.put(16 + i, 16, STONE[1] if not pressed else STONE[0])
        img.put(16, 16 + i, STONE[1] if not pressed else STONE[0])
    outline(img, OUT)
    return img


def shooter_frame(armed):
    """Otwór strzelniczy z góry na licu muru: kamienny blok, ciemny wylot skierowany w dół."""
    img = Img(CELL, CELL)
    plate(img, 9, 12, 14, STONE)
    for y in range(20, 26):
        for x in range(13, 19):
            img.put(x, y, STONE[0])
    # żelazny pierścień wylotu
    for x in range(12, 20):
        img.put(x, 19, IRON[1])
    if armed:  # żar w wylocie — ostrzeżenie
        for x in range(14, 18):
            img.put(x, 22, EMBER[1])
            img.put(x, 23, EMBER[2])
    outline(img, OUT)
    return img


def dart():
    img = Img(16, 16)
    for x in range(4, 11):  # drzewce
        img.put(x, 8, WOOD[3])
        img.put(x, 7, WOOD[4] if x % 3 else WOOD[3])
    for dx, dy, c in ((11, 7, IRON[2]), (11, 8, IRON[1]), (12, 7, IRON[2]), (12, 8, IRON[1]), (13, 8, IRON[2]), (13, 7, IRON[2])):
        img.put(dx, dy, c)
    for x in (3, 4, 5):  # lotki
        img.put(x, 6, trt.BONE[1])
        img.put(x, 9, trt.BONE[0])
    outline(img, OUT)
    return img


def urn(variant):
    img = Img(CELL, CELL)
    rx, ry = (8, 8) if variant == 0 else (7, 9)
    ellipse(img, 16, 17, rx, ry, band_shade(CLAY))
    # wylew: ciemny środek z obwódką (widok z góry)
    ellipse(img, 16, 15, 4, 3.5, lambda nx, ny: CLAY[3] if nx * nx + ny * ny > .5 else CLAY[0])
    # pasek zdobienia
    for x in range(16 - rx + 2, 16 + rx - 1):
        if (x % 3) and img.get(x, 21)[3]:
            img.put(x, 21, CLAY[1])
    outline(img, OUT)
    return img


def crate():
    img = Img(CELL, CELL)
    plate(img, 7, 7, 18, WOOD)
    for y in (12, 18):  # szpary między deskami
        for x in range(8, 24):
            img.put(x, y, WOOD[0])
    for x, y in ((8, 8), (23, 8), (8, 23), (23, 23)):  # okucia narożników
        img.put(x, y, IRON[1])
    for i in range(16):  # ukośna listwa
        img.put(8 + i, 8 + i, WOOD[4] if i % 4 else WOOD[3])
    outline(img, OUT)
    return img


def shards(ramp, seed):
    """Skorupy po rozbiciu: kilka małych odłamków rozrzuconych wokół środka (trwały ślad na podłodze)."""
    import random
    rng = random.Random(seed)
    img = Img(CELL, CELL)
    for _ in range(7):
        x, y = 16 + rng.randint(-8, 8), 16 + rng.randint(-7, 7)
        w, h = rng.randint(2, 3), rng.randint(1, 2)
        for dy in range(h):
            for dx in range(w):
                img.put(x + dx, y + dy, ramp[3] if dy == 0 else ramp[1])
    outline(img, OUT)
    return img


def planks():
    img = Img(CELL, CELL)
    for (x, y, w) in ((8, 10, 9), (14, 15, 10), (9, 20, 8), (18, 22, 6)):
        for dx in range(w):
            img.put(x + dx, y, WOOD[3])
            img.put(x + dx, y + 1, WOOD[1])
    outline(img, OUT)
    return img


def build():
    traps = [spike_frame(f) for f in range(5)] + [pressure_frame(False), pressure_frame(True), shooter_frame(False), shooter_frame(True)]
    breakables = [urn(0), urn(1), crate(), shards(CLAY, 1), shards(CLAY, 2), planks()]
    sheets = {}
    for name, frames, cell in (('ruins-traps.png', traps, CELL), ('ruins-breakables.png', breakables, CELL), ('dart.png', [dart()], 16)):
        sheet = Img(cell * len(frames), cell)
        for i, img in enumerate(frames):
            sheet.blit(img, i * cell, 0)
        sheets[name] = (sheet, frames, cell)
    return sheets


def validate(sheets):
    errors = []
    for name, (_, frames, cell) in sheets.items():
        for i, img in enumerate(frames):
            opaque = [(x, y, c) for y, row in enumerate(img.p) for x, c in enumerate(row) if c[3]]
            if any(c[3] != 255 for _, _, c in opaque):
                errors.append(f'{name} {i}: półprzezroczyste piksele')
            if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for _, _, c in opaque):
                errors.append(f'{name} {i}: czysta czerń/biel')
            if any(not (1 <= x <= cell - 2 and 1 <= y <= cell - 2) for x, y, _ in opaque):
                errors.append(f'{name} {i}: dotyka krawędzi komórki')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator rekwizytów ruin')
    ap.add_argument('--out', default=SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 4x')
    a = ap.parse_args()
    sheets = build()
    errors = validate(sheets)
    if errors:
        for e in errors:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for name, (sheet, frames, _) in sheets.items():
        sheet.pil().save(os.path.join(a.out, name))
        print(f'zapisano {name} {sheet.w}x{sheet.h}: {len(frames)} klatek')
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, PAL.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(os.path.join(a.preview, name.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

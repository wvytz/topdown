"""
Generator upiora zasadzek (krok 49): duch w łachmanach całunu, widziany z góry (przód = N), z falującym
trenem z tyłu i dłońmi wyciągniętymi do przodu. W grze świeci nad mrokiem; przenikanie (bezcielesność)
silnik pokazuje przezroczystością sprite'a — arkusz ma pełne piksele (STYLEGUIDE §6).

Użycie (z katalogu głównego repozytorium):
  python tools/ghost_sprites.py                       # arkusz do public/assets/sprites/
  python tools/ghost_sprites.py --preview tools/out   # dodatkowo podgląd 4x na posadzce ruin

ghost_float-grasp.png (384x384, komórka 48x48, 8 kierunków z obrotu, obrys po obrocie):
  kolumny 0–3 unoszenie (tren faluje na boki), 4–7 chwyt: dłonie cofnięte, wyrzut, pełny zasięg, powrót.
Kolory: blady błękit całunu (zimny, daleko od palety piaskowca), puste oczodoły z lodowym blaskiem (akcent).
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8
C = CELL / 2
SHROUD = (ok(.52, .040, 225), ok(.63, .045, 220), ok(.74, .045, 215), ok(.84, .035, 210), ok(.92, .020, 205))
HOLLOW = ok(.20, .030, 255)
GLOW = ok(.86, .110, 195)


def ghost_frame(f):
    img = Img(CELL, CELL)
    floating = f < 4
    sway = (0, 2, 0, -2)[f % 4] if floating else 0
    cy = C
    # tren całunu za plecami: trzy postrzępione pasma falujące na boki
    for k, dx in enumerate((-4, 0, 4)):
        wave = sway * (1 if k != 1 else -1)
        pts = [(C + dx * .6, cy + 3), (C + dx + wave * .5, cy + 8), (C + dx * 1.1 + wave, cy + 12)]
        stroke(img, pts, 3.2 - abs(dx) * .15, SHROUD[1], edge=SHROUD[2])
    # tułów: owal całunu
    ellipse(img, C, cy, 7.5, 7, band_shade(SHROUD))
    # ramiona i dłonie: przy unoszeniu luźno przy bokach, w chwycie wyrzucone do przodu
    reach = (0, 0, 0, 0, -2, 5, 7, 2)[f]
    for side in (-1, 1):
        if floating:
            hand = (C + side * 8, cy - 3 + (sway * side) * .3)
        else:
            hand = (C + side * (5 - reach * .2), cy - 6 - reach)
        stroke(img, [(C + side * 5.5, cy - 2), hand], 2.6, SHROUD[2], edge=SHROUD[3])
        img.put(int(hand[0]), int(hand[1]), SHROUD[4])
    # głowa w kapturze: jaśniejsza, z pustymi oczodołami i lodowym blaskiem
    hy = cy - 5
    ellipse(img, C, hy, 4.6, 4.2, band_shade(SHROUD, light=(-.4, -.6)))
    for ex in (-2, 1):
        img.put(int(C + ex), int(hy - 1), HOLLOW)
        img.put(int(C + ex + 1), int(hy - 1), HOLLOW)
        img.put(int(C + ex) + (1 if ex < 0 else 0), int(hy - 2), GLOW)
    return img


def build():
    sheet, frames = directional_sheet(CELL, ghost_frame, 8)
    return {'ghost_float-grasp.png': (sheet, frames, CELL, MARGIN)}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator upiora zasadzek')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheets = build()
    errors = validate(sheets)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for fname, (sheet, frames, _, _) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, trt.PALETTES['piaskowiec'].floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

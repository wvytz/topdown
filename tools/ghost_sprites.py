"""
Generator upiora zasadzek (krok 49; od kroku 183a duszek bez rąk): okrągła głowa z dużymi oczami i falujący
ogon z ektoplazmy, widziany z góry (przód = N); chwyt to zryw z otwartą buzią. W grze świeci nad mrokiem; przenikanie (bezcielesność)
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
# Krok 183a (ocena właściciela): duszek bez rąk — okrągła głowa i falujący ogon (jak kreskówkowy duszek),
# z ektoplazmy: miętowo-turkusowy, jasny, „żywy” jak lampki Grzybni; poświatę dorysowuje silnik (effects/Ectoplasm).
SHROUD = (ok(.60, .075, 180), ok(.72, .085, 176), ok(.82, .080, 172), ok(.90, .060, 168), ok(.96, .035, 165))
HOLLOW = ok(.18, .030, 230)
GLOW = ok(.98, .030, 170)
DRIP = ok(.84, .110, 170)


def ghost_frame(f):
    img = Img(CELL, CELL)
    floating = f < 4
    sway = (0, 2, 0, -2)[f % 4] if floating else 0
    # zryw (4–7): głowa wysuwa się do przodu (N), ogon się wyciąga, paszcza otwiera
    lunge = (0, 0, 0, 0, -1, 2, 3, 1)[f]
    cy = C - lunge
    # ciało-łza: kłęby coraz mniejsze ku tyłowi, koniec zawija się na bok (falowanie) — bez rąk
    for k, (dy, r) in enumerate(((3, 8.2), (6.5, 6.6), (9.5, 5.0), (12, 3.4), (13.8, 2.2))):
        bend = sway * (k * .45) + (lunge * .2 if k else 0)
        ellipse(img, C + bend, cy + dy + lunge * .25 * k, r, r * .9, band_shade(SHROUD))
    # głowa: duża, okrągła, z odblaskiem
    ellipse(img, C, cy - 2, 9, 8.5, band_shade(SHROUD))
    # oczy: pionowe, czarne owale z iskierką; w zrywie zmrużone
    tall = 3 if lunge <= 2 else 2
    for ex in (-4, 2):
        for dx in range(2):
            for dy in range(tall):
                img.put(int(C + ex + dx), int(cy - 6 + dy + (3 - tall)), HOLLOW)
        img.put(int(C + ex), int(cy - 6 + (3 - tall)), GLOW)
    # buzia: kropka „o”, w zrywie szeroko otwarta
    mouth = 1.0 if lunge <= 1 else 1.0 + lunge * .35
    ellipse(img, C, cy, mouth, mouth * .9, lambda nx, ny: HOLLOW)
    # kropla ektoplazmy odrywa się od boku (unoszenie)
    if floating:
        img.put(int(C + 8), int(cy + 3 + f), DRIP)
        img.put(int(C - 8), int(cy + 6 - f), DRIP)
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

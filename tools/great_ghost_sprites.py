"""
Generator Zaduchu (krok 183): wielki duch zasadzki w wersji „Zaduch”. Własny projekt w klimacie wieży po
katastrofie: napęczniały kłąb smogu z szybu wentylacyjnego, w pękniętej masce gazowej (dwa okrągłe szkła
z chorobliwie zielonym blaskiem, jedno pęknięte, puszka filtra wysunięta do przodu); zamiast rąk zwisają
urwane kable i węże z miedzianymi końcówkami, z tyłu postrzępiony tren dymu. Widok z góry (przód = N).

Użycie (z katalogu głównego repozytorium):
  python tools/great_ghost_sprites.py                       # arkusz do public/assets/sprites/
  python tools/great_ghost_sprites.py --preview tools/out   # dodatkowo podgląd 2x na posadzce ruin

great-ghost_float-grasp.png (768x768, komórka 96x96, 8 kierunków z obrotu, obrys po obrocie):
  kolumny 0–3 unoszenie (kłąb pulsuje, kable falują), 4–7 chwyt: kable cofnięte, wyrzut, pełny zasięg, powrót.
Kolory: szarozielony smog (z dala od palety piaskowca i od bladego błękitu zwykłych upiorów), ciemna guma maski,
miedź końcówek kabli, zielony blask szkieł (akcent). Pełne piksele — przezroczystość daje silnik (STYLEGUIDE §6).
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
CELL = 96
MARGIN = 4
C = CELL / 2
SMOG = (ok(.40, .030, 150), ok(.50, .035, 145), ok(.61, .038, 140), ok(.72, .034, 135), ok(.82, .024, 130))
RUBBER = (ok(.20, .012, 250), ok(.27, .014, 250), ok(.35, .016, 245))
COPPER = (ok(.52, .090, 50), ok(.66, .100, 60))
GLOW = (ok(.78, .160, 145), ok(.92, .110, 140))
CRACK = ok(.30, .020, 150)


def puff(img, cx, cy, r, ramp):
    ellipse(img, cx, cy, r, r * .92, band_shade(ramp))


def great_ghost_frame(f):
    img = Img(CELL, CELL)
    floating = f < 4
    pulse = (0, 1, 0, -1)[f % 4] if floating else 0
    sway = (0, 3, 0, -3)[f % 4] if floating else 0
    cy = C + 4
    # tren dymu za plecami (S): pięć postrzępionych pasm, falują na boki
    for k, dx in enumerate((-12, -6, 0, 6, 12)):
        wave = sway * (1 if k % 2 else -1)
        pts = [(C + dx * .7, cy + 12), (C + dx + wave * .5, cy + 22), (C + dx * 1.15 + wave, cy + 31)]
        stroke(img, pts, 6.5 - abs(dx) * .2, SMOG[1], edge=SMOG[2])
    # kłąb: duży owal i guzy smogu wokół (napęczniały, nieregularny)
    ellipse(img, C, cy, 22 + pulse, 20 + pulse, band_shade(SMOG))
    for ang, dist, r in ((200, 18, 9), (250, 19, 8), (290, 19, 8), (340, 18, 9), (160, 16, 8), (20, 16, 8), (110, 14, 9), (70, 14, 9)):
        a = math.radians(ang)
        puff(img, C + math.cos(a) * (dist + pulse), cy + math.sin(a) * (dist + pulse) * .9, r, SMOG)
    # kable zamiast rąk: dwa po bokach (guma z miedzianą końcówką), przy chwycie wyrzucone do przodu
    reach = (0, 0, 0, 0, -4, 10, 15, 4)[f]
    for side in (-1, 1):
        root = (C + side * 17, cy - 4)
        if floating:
            mid = (C + side * 25, cy + 2 + sway * side * .4)
            tip = (C + side * 27, cy + 12 + sway * side * .6)
        else:
            mid = (C + side * 18, cy - 16 - reach * .5)
            tip = (C + side * (12 - reach * .2), cy - 24 - reach)
        stroke(img, [root, mid, tip], 3.4, RUBBER[1], edge=RUBBER[2])
        ellipse(img, tip[0], tip[1], 2.4, 2.4, lambda nx, ny: COPPER[1] if nx + ny < 0 else COPPER[0])
        # krótszy, urwany wąż obok — postrzępiony koniec
        stub = (root[0] + side * 6, root[1] + 10 + sway * .3)
        stroke(img, [(root[0], root[1] + 3), stub], 2.6, RUBBER[0], edge=RUBBER[1])
    # maska gazowa z przodu (N): gumowy owal, dwa okrągłe szkła z blaskiem, jedno pęknięte, filtr wysunięty
    my = cy - 12
    ellipse(img, C, my, 13, 10, band_shade(RUBBER + RUBBER[1:], light=(-.4, -.6)))
    for ex, cracked in ((-6, False), (6, True)):
        ellipse(img, C + ex, my - 1, 4.4, 4.2, lambda nx, ny: GLOW[1] if nx * nx + ny * ny < .35 else GLOW[0])
        if cracked:
            for t in range(-3, 4):
                img.put(int(C + ex + t * .6), int(my - 1 + t), CRACK)
            img.put(int(C + ex + 2), int(my - 3), CRACK)
    # puszka filtra: krótki walec do przodu z miedzianą obręczą
    ellipse(img, C, my - 9, 4.6, 4, band_shade((RUBBER[0], RUBBER[1], RUBBER[2], COPPER[0], COPPER[1])))
    for x in range(-3, 4):
        img.put(int(C + x), int(my - 12), COPPER[1])
    return img


def build():
    sheet, frames = directional_sheet(CELL, great_ghost_frame, 8)
    return {'great-ghost_float-grasp.png': (sheet, frames, CELL, MARGIN)}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Zaduchu (wielkiego ducha zasadzki)')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 2x')
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

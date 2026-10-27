"""
Generator Gniazdownika i czerwia (krok 122): trzeci archetyp wroga — przywoływacz. Widok z góry, przód = N.

Gniazdownik: pękaty mięsisty worek na krótkich nóżkach, na grzbiecie trzy jaja z żółtozielonym blaskiem
(akcent — „to coś się wykluje”), z przodu mały pysk z żuwaczkami. Czerw: blady, różowawy, segmentowany
pędrak z ciemną główką.

Użycie (z katalogu głównego repozytorium):
  python tools/brood_sprites.py                       # arkusze do public/assets/sprites/
  python tools/brood_sprites.py --preview tools/out   # dodatkowo podglądy 2x na posadzce ruin

brood-sac_crawl-birth.png (384x384, komórka 48x48, 8 kierunków z obrotu, obrys po obrocie):
  kolumny 0–3 pełzanie (nóżki na zmianę, worek lekko pulsuje), 4–7 wylęg: worek pęcznieje, jaja jaśnieją,
  pysk się rozwiera (kolumna 7 — wyplucie).
grub_crawl-bite.png (384x384, komórka 48x48, 8 kierunków): 0–3 pełzanie (segmenty falują), 4–7 ugryzienie.
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok
from spider_sprites import band_shade, ellipse, mirror, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8
C = CELL / 2
# Mięso worka: przybrudzony róż-brąz (ciepły, ale ciemniejszy od piaskowca posadzki).
FLESH = (ok(.34, .050, 30), ok(.45, .065, 32), ok(.56, .075, 35), ok(.67, .065, 40), ok(.78, .045, 50))
# Jaja: żółtozielona żółć — jedyny nasycony akcent (to, co się wykluje).
EGG = (ok(.50, .090, 115), ok(.62, .120, 112), ok(.74, .130, 108), ok(.86, .100, 105), ok(.94, .050, 100))
MAW = ok(.22, .040, 20)
FANG = ok(.86, .030, 80)
# Czerw: blady, różowawy pędrak (jak mięso worka, ale jaśniejszy) z brązową główką — odcina się od piaskowca.
GRUB = (ok(.48, .060, 15), ok(.58, .070, 15), ok(.68, .070, 18), ok(.78, .055, 22), ok(.87, .035, 30))
HEAD = (ok(.30, .040, 45), ok(.40, .050, 48), ok(.50, .055, 50), ok(.60, .050, 55), ok(.70, .040, 60))

SAC_LEGS = [((19, 21), (15.5, 18)), ((18, 25), (13.5, 26)), ((19, 29), (15.5, 32))]


def ramp_shift(ramp, k):
    """Rampa przesunięta o k tonów w stronę światła (jaśnienie jaj przy wylęgu)."""
    return tuple(ramp[min(len(ramp) - 1, i + k)] for i in range(len(ramp)))


def sac_frame(f):
    img = Img(CELL, CELL)
    crawling = f < 4
    step = (0, -1.5, 0, 1.5)[f % 4] if crawling else 0
    swell = (0, .3, 0, -.3)[f] if crawling else (.6, 1.3, 2.0, .4)[f - 4]
    glow = 0 if crawling else (1, 2, 2, 1)[f - 4]
    # nóżki: trzy pary krótkich, grubych kikutów, na zmianę w przód i w tył
    for side in (1, -1):
        for i, (a, t) in enumerate(SAC_LEGS):
            dy = step if (i + (side > 0)) % 2 == 0 else -step
            pts = [a, (t[0], t[1] + dy)]
            if side < 0:
                pts = [mirror(p, C) for p in pts]
            stroke(img, pts, 2.6, FLESH[1], edge=FLESH[2])
    # worek: pękaty owal, przy wylęgu pęcznieje
    ellipse(img, C, C + 2, 9 + swell, 10 + swell, band_shade(FLESH))
    # fałdy między jajami — najciemniejszy ton mięsa
    for x0, y0, x1, y1 in ((C - 5, C + 1, C - 2, C + 7), (C + 5, C + 1, C + 2, C + 7)):
        stroke(img, [(x0, y0), (x1, y1)], 1.0, FLESH[0])
    # trzy jaja na grzbiecie (trójkąt, czubkiem do tyłu)
    eggs = ramp_shift(EGG, glow)
    for ex, ey, r in ((C - 4, C + 5, 3.0), (C + 4, C + 5, 3.0), (C, C + 10, 2.8)):
        ellipse(img, ex, ey, r + swell * .25, r + swell * .25, band_shade(eggs, light=(-.4, -.5)))
    # przód: pysk z żuwaczkami, przy wylęgu rozwarty
    open_ = 0 if crawling else (1, 2, 3, 1)[f - 4]
    hy = C - 8 - swell * .5
    ellipse(img, C, hy, 4.5, 3.5, band_shade(FLESH, light=(-.4, -.7)))
    for x in range(int(C - 1 - open_ * .5), int(C + 1 + open_ * .5)):
        for y in range(int(hy - 2), int(hy + 1)):
            img.put(x, y, MAW)
    for side in (-1, 1):
        tip = (C + side * (2.5 + open_ * .8), hy - 4.5)
        stroke(img, [(C + side * 2.5, hy - 1.5), tip], 1.4, FANG)
    if f == 7:
        # wyplucie: kropla żółci przed pyskiem
        ellipse(img, C, hy - 5.5, 1.5, 1.5, band_shade(EGG))
    return img


def grub_frame(f):
    img = Img(CELL, CELL)
    crawling = f < 4
    wave = (0, 1, 0, -1)[f % 4] if crawling else 0
    lunge = 0 if crawling else (-1, 2, 3, 1)[f - 4]
    # trzy segmenty ciała od tyłu (krótkie przesunięcia na boki — pełzanie falą)
    for i, (dy, r) in enumerate(((8, 3.2), (4.5, 3.8), (1, 4.0))):
        dx = wave * (1 if i % 2 == 0 else -1) * .8
        ellipse(img, C + dx, C + dy - lunge * .5, r, r * .9, band_shade(GRUB))
    # pierścienie między segmentami — najciemniejszy ton
    for dy in (6.5, 2.8):
        for x in range(int(C - 2), int(C + 3)):
            img.put(x, int(C + dy - lunge * .5), GRUB[0])
    # główka z żuwaczkami
    hy = C - 3 - lunge
    ellipse(img, C, hy, 3.2, 2.8, band_shade(HEAD, light=(-.4, -.7)))
    jaw = 1 if not crawling and f in (5, 6) else 0
    for side in (-1, 1):
        stroke(img, [(C + side * 1.5, hy - 2), (C + side * (1.5 + jaw), hy - 4)], 1.2, FANG)
    return img


def build():
    sac, sf = directional_sheet(CELL, sac_frame, 8)
    grub, gf = directional_sheet(CELL, grub_frame, 8)
    return {
        'brood-sac_crawl-birth.png': (sac, sf, CELL, MARGIN),
        'grub_crawl-bite.png': (grub, gf, CELL, MARGIN),
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Gniazdownika i czerwia')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 2x')
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

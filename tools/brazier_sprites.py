"""
Generator paleniska Piekła (krok 41b): żelazna misa z rozżarzonymi węglami, widziana z góry.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/brazier_sprites.py                       # arkusz do public/assets/sprites/
  python tools/brazier_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze Piekła

brazier.png (576x48, komórka 48x48, pivot 24,24, bez kierunków — misa jest okrągła), 12 klatek:
  0–3 tlenie (niskie języki ognia, węgle migoczą), 4–7 ostrzeżenie (płomień rośnie i jaśnieje),
  8–11 buchnięcie (słup ognia nad misą, języki na boki). Strefę buchnięcia w grze rysuje silnik.
Misa ma obrys #1b1a22 (STYLEGUIDE §3); ogień nie ma obrysu — krawędź płomienia to najciemniejszy ton
rampy ognia (§6b). Kolory: rampy ognia i żaru palety „krwawy bazalt” oraz żelazo (§4.3).
"""
import argparse
import math
import os
import random
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, IRON, Img, outline

PALETTE = trt.PALETTES['pieklo_bazalt']
FLAME = PALETTE.flame   # czerwień → pomarańcz → żółć → blask
EMBER = PALETTE.ember   # czerwień, pomarańcz, rozgrzany środek
SPRITES = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
OUT_NAME = 'brazier.png'
CELL = 48
C = CELL / 2
BOWL_R = 10
COALS_R = 7


def bowl():
    """Żelazna misa: brzeg (światło z lewej-góry, cień z prawej-dołu), w środku żarzące się węgle."""
    img = Img(CELL, CELL)
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - C, y + .5 - C
            d = math.hypot(dx, dy)
            if d > BOWL_R:
                continue
            if d > COALS_R:
                img.put(x, y, IRON[2] if dx + dy < -4 else (IRON[0] if dx + dy > 4 else IRON[1]))
            else:
                img.put(x, y, EMBER[0])
    # nity na brzegu: najciemniejszy ton żelaza (wewnętrzny detal)
    for a in range(0, 360, 60):
        r = math.radians(a)
        img.put(int(C + math.cos(r) * 8.6), int(C + math.sin(r) * 8.6), IRON[0])
    outline(img, OUT)
    return img


def coals(img, rng):
    """Węgle: plamki pomarańczu i rozgrzanego środka na czerwonym żarze."""
    for _ in range(14):
        a, d = rng.uniform(0, math.tau), rng.uniform(0, COALS_R - 1)
        x, y = int(C + math.cos(a) * d), int(C + math.sin(a) * d)
        img.put(x, y, EMBER[1] if rng.random() < .7 else EMBER[2])


def flames(img, rng, reach, tongues, bright):
    """Języki ognia z góry: promienie od środka misy o losowej długości do `reach` px.
    Środek najjaśniejszy, brzeg płomienia najciemniejszym tonem rampy (bez obrysu)."""
    lengths = [reach * rng.uniform(.55, 1.0) for _ in range(tongues)]
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - C, y + .5 - C
            d = math.hypot(dx, dy)
            if d > reach:
                continue
            a = (math.atan2(dy, dx) / math.tau) % 1 * tongues
            i = int(a)
            frac = a - i
            # długość języka w tym kierunku: interpolacja między sąsiednimi językami, ostre końce
            length = lengths[i] * (1 - frac) + lengths[(i + 1) % tongues] * frac
            length *= .75 + .25 * abs(math.cos(frac * math.pi))
            if d > length:
                continue
            t = d / max(length, 1)
            if t > .82:
                c = FLAME[0]
            elif t > .55:
                c = FLAME[1]
            elif t > .25 or not bright:
                c = FLAME[2]
            else:
                c = FLAME[3]
            img.put(x, y, c)


def frame(f):
    rng = random.Random(4100 + f)
    img = bowl()
    coals(img, rng)
    if f < 4:  # tlenie: niskie języki, węgle migoczą
        flames(img, rng, 5 + (f % 2), 5, bright=False)
    elif f < 8:  # ostrzeżenie: płomień rośnie
        flames(img, rng, 7 + (f - 4) * 2.2, 7, bright=f >= 6)
    else:  # buchnięcie: słup ognia nad misą, języki na boki
        flames(img, rng, (19, 21, 20, 16)[f - 8], 9, bright=True)
    return img


def build():
    frames = [frame(f) for f in range(12)]
    sheet = Img(CELL * len(frames), CELL)
    for i, img in enumerate(frames):
        sheet.blit(img, i * CELL, 0)
    return sheet, frames


def validate(frames):
    errors = []
    for i, img in enumerate(frames):
        opaque = [(x, y, c) for y, row in enumerate(img.p) for x, c in enumerate(row) if c[3]]
        if any(c[3] != 255 for _, _, c in opaque):
            errors.append(f'klatka {i}: półprzezroczyste piksele')
        if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for _, _, c in opaque):
            errors.append(f'klatka {i}: czysta czerń/biel')
        if any(not (2 <= x <= CELL - 3 and 2 <= y <= CELL - 3) for x, y, _ in opaque):
            errors.append(f'klatka {i}: ogień dotyka krawędzi komórki')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator paleniska Piekła')
    ap.add_argument('--out', default=SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheet, frames = build()
    errors = validate(frames)
    if errors:
        for e in errors:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    sheet.pil().save(os.path.join(a.out, OUT_NAME))
    print(f'zapisano {OUT_NAME} {sheet.w}x{sheet.h}: {len(frames)} klatek')
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        im = sheet.pil()
        bg = Image.new('RGBA', im.size, PALETTE.floor[2])
        bg.alpha_composite(im)
        bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
            os.path.join(a.preview, OUT_NAME.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

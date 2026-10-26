"""
Rewizja wyglądu Strażnika „Sludge King” (krok 110): gęsty, toksyczny szlam i brakujące animacje ataków.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/sludge_king_sprites.py                       # arkusz do public/assets/sprites/
  python tools/sludge_king_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze palety C

Źródło: wiersz N arkusza z paczki — public/assets/sprites/sludge-king_move-spit.png (zostaje bez zmian, czyta go
też tools/sludge_death.py). Z klatek N powstaje cały zestaw 8 kierunków z obrotu co 45° i obrysu po obrocie (§1, §3).

sludge-king_revamp.png (1536x768, komórka 96x96, pivot 48,48, 16 kolumn), wiersze = kierunki N…NW:
  0–3   chód: bąble i spływające krople szlamu (przy każdej klatce inne miejsca);
  4–7   plucie: jak wyżej, klatka 7 to wypluwka (kula ze starego arkusza, pocisk spawnuje gra);
  8–11  uderzenie (tupnięcie): 8 uniesienie, 9 wzniesienie, 10 uderzenie w ziemię, 11 uderzenie — rozprysk kropel
        i kałuża; trzyma się do końca telegrafu i rozlania;
  12–15 skok: 12–13 napinanie się (legi podkulone), 14 zwój, 15 wyrzut w powietrze. Silnik i tak dokłada przysiad
        i łuk lotu (`BOSS_LEAP_VISUAL`), więc klatki skoku są tylko pozą ciała.
Szlam to materiał amorficzny: brzegi kałuż przechodzą fiolet → brąz ditheringiem Bayera 4×4 (STYLEGUIDE §4.5, §5).
"""
import argparse
import math
import os
import random
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, SLIME, Img, outline
from loot_sprites import rotate45
from sludge_death import CELL, SOURCE, centroid, load_north, pool, scaled, validate

PALETTE = trt.PALETTES['piaskowiec']
SPRITES = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
OUT_NAME = 'sludge-king_revamp.png'
COLUMNS = 16

# Klatka: skala i przesunięcie ciała (sx, sy, sink), kałuża szlamu (promień), bąble, spływające krople,
# kropelki rozpryśnięte wokół (promień, liczba). `src` — kolumna wiersza N z paczki (korpus).
FRAMES = [
    # chód: bąble i krople zmieniają miejsca z klatki na klatkę
    {'src': 0, 'sx': 1.0, 'sy': 1.0, 'sink': 0, 'pool': 10, 'bubbles': 2, 'drips': 2, 'seed': 110},
    {'src': 1, 'sx': 1.02, 'sy': .98, 'sink': 1, 'pool': 11, 'bubbles': 3, 'drips': 3, 'seed': 111},
    {'src': 2, 'sx': 1.0, 'sy': 1.0, 'sink': 0, 'pool': 10, 'bubbles': 2, 'drips': 2, 'seed': 112},
    {'src': 3, 'sx': .98, 'sy': 1.02, 'sink': -1, 'pool': 11, 'bubbles': 3, 'drips': 3, 'seed': 113},
    # plucie: pysk gęstszy niż w paczce, klatka 7 — wypluwka
    {'src': 4, 'sx': 1.0, 'sy': 1.0, 'sink': 0, 'pool': 12, 'bubbles': 3, 'drips': 3, 'seed': 114},
    {'src': 5, 'sx': 1.03, 'sy': .97, 'sink': 1, 'pool': 13, 'bubbles': 3, 'drips': 3, 'seed': 115},
    {'src': 6, 'sx': 1.04, 'sy': .96, 'sink': 2, 'pool': 14, 'bubbles': 4, 'drips': 4, 'seed': 116},
    {'src': 7, 'sx': 1.0, 'sy': 1.0, 'sink': 0, 'pool': 14, 'bubbles': 4, 'drips': 4, 'seed': 117},
    # uderzenie: uniesienie, wzniesienie, uderzenie w ziemię, rozprysk i kałuża (klatka trzymana)
    {'src': 0, 'sx': .92, 'sy': 1.14, 'sink': -4, 'pool': 8, 'bubbles': 2, 'drips': 1, 'seed': 118},
    {'src': 0, 'sx': .86, 'sy': 1.26, 'sink': -7, 'pool': 6, 'bubbles': 1, 'drips': 1, 'seed': 119},
    {'src': 0, 'sx': 1.22, 'sy': .74, 'sink': 5, 'pool': 20, 'bubbles': 3, 'drips': 2, 'seed': 120,
     'droplets': (22, 6)},
    {'src': 0, 'sx': 1.3, 'sy': .62, 'sink': 7, 'pool': 27, 'bubbles': 4, 'drips': 3, 'seed': 121,
     'droplets': (31, 10)},
    # skok: napinanie się, zwój, wyrzut w powietrze (sprężyna — silnik dokłada przysiad i łuk lotu)
    {'src': 1, 'sx': 1.06, 'sy': 1.0, 'sink': 0, 'pool': 10, 'bubbles': 2, 'drips': 2, 'seed': 122},
    {'src': 2, 'sx': 1.1, 'sy': .94, 'sink': 2, 'pool': 12, 'bubbles': 3, 'drips': 2, 'seed': 123},
    {'src': 0, 'sx': .94, 'sy': 1.1, 'sink': -3, 'pool': 9, 'bubbles': 2, 'drips': 2, 'seed': 124},
    {'src': 0, 'sx': .9, 'sy': 1.16, 'sink': -6, 'pool': 7, 'bubbles': 1, 'drips': 1, 'seed': 125},
]


def bubble(img, x, y, r):
    """Pęcherz szlamu: jasny pierścień, ciemne wnętrze i błysk w lewym-górnym rogu (§4.5)."""
    for oy in range(-r, r + 1):
        for ox in range(-r, r + 1):
            d = math.hypot(ox, oy)
            if r - 1.5 < d <= r - .5:
                img.put(x + ox, y + oy, SLIME[3])
            elif d <= r - 1.5:
                img.put(x + ox, y + oy, SLIME[1])
    img.put(x - 1, y - 1, SLIME[4])


def lowest(img, x):
    """Najniżej położony nieprzezroczysty piksel kolumny `x` (dolny rant ciała) albo None."""
    for y in range(img.h - 1, -1, -1):
        c = img.get(x, y)
        if c and c[3]:
            return y
    return None


def drip(img, x, y, length):
    """Kropla spływająca w dół: pasmo `SLIME[2]` z jasną kroplą na końcu."""
    for i in range(length):
        img.put(x, y + i, SLIME[2])
    img.put(x, y + length, SLIME[4])


def droplets(img, cx, cy, radius, count, offset):
    """Rozprysk: kropelki szlamu 2×2 rozrzucone po okręgu wokół uderzenia."""
    for i in range(count):
        a = offset + i * math.tau / count
        x, y = round(cx + math.cos(a) * radius), round(cy + 4 + math.sin(a) * radius * .8)
        for ox, oy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            img.put(x + ox, y + oy, SLIME[3])
        img.put(x, y, SLIME[4])


def frame(spec, sources):
    body, puddle = sources[spec['src']]
    cx, cy = centroid(sources[0][0])
    sx, sy, sink = spec['sx'], spec['sy'], spec['sink']
    img = Img(CELL, CELL)
    # kałuża z paczki rozlewa się razem z ciałem, a pod nią leży kałuża szlamu (toksyczna plama)
    img.blit(scaled(puddle, (cx, cy), sx, sy, sink=sink), 0, 0)
    if spec['pool']:
        pool(img, cx, cy + 4, spec['pool'])
    melted = scaled(body, (cx, cy), sx, sy, sink=sink)
    img.blit(melted, 0, 0)
    r = random.Random(spec['seed'])
    for _ in range(spec['drips']):
        x = round(cx + r.uniform(-14, 14))
        y = lowest(melted, x)
        if y is not None:
            drip(img, x, y + 1, r.randint(3, 5))
    inside = [(x, y) for y in range(CELL) for x in range(CELL) if (c := melted.get(x, y)) and c[3] and c != OUT]
    for _ in range(spec['bubbles']):
        bx, by = r.choice(inside)
        bubble(img, bx, by, 2)
    if 'droplets' in spec:
        radius, count = spec['droplets']
        droplets(img, cx, cy, radius, count, r.uniform(0, math.tau))
    return img


def build():
    sources = {col: load_north(col) for col in {spec['src'] for spec in FRAMES} | {0}}
    local = [frame(spec, sources) for spec in FRAMES]
    sheet = Img(CELL * COLUMNS, CELL * 8)
    frames = []
    for col, base in enumerate(local):
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    return sheet, frames


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Rewizja wyglądu Strażnika (Sludge King): toksyczny szlam i ataki')
    ap.add_argument('--out', default=SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheet, frames = build()
    errors = validate(frames)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    sheet.pil().save(os.path.join(a.out, OUT_NAME))
    print(f'zapisano {OUT_NAME} {sheet.w}x{sheet.h}: {len(frames)} klatek ({SOURCE} → 8 kierunków)')
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

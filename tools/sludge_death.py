"""
Generator klatek śmierci Strażnika „Sludge King” (krok 40).

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/sludge_death.py                       # arkusz do public/assets/sprites/
  python tools/sludge_death.py --preview tools/out   # dodatkowo podgląd 4x na podłodze palety C

Źródło: wiersz N arkusza z paczki — public/assets/sprites/sludge-king_move-spit.png (Strażnik nie ma własnego
generatora). Klatki N rozbieramy z obrysu i dzielimy na ciało i kałużę błota (rampa kałuży, STYLEGUIDE §4.5);
ciało topnieje w kałużę szlamu, a 8 kierunków powstaje z obrotu co 45° z obrysem po obrocie (§1, §3).

sludge-king_death.png (768x768, komórka 96x96, pivot 48,48), 8 klatek bez pętli:
  0 ryk agonii (otwarta paszcza i uniesione ręce z klatki plucia), 1–3 ciało osiada i rozlewa się, oczy gasną,
  4–6 resztka ciała tonie w kałuży szlamu z bąblami, 7 sama kałuża. Potem plama `slime` w grze.
Szlam to materiał amorficzny: przejście fioletu w brąz na brzegu kałuży z ditheringiem Bayera 4×4 (§5).
"""
import argparse
import math
import os
import random
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, SLIME, DIRT, Img, hexes, outline
from loot_sprites import rotate45

PALETTE = trt.PALETTES['piaskowiec']
SPRITES = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
SOURCE = os.path.join(SPRITES, 'sludge-king_move-spit.png')
OUT_NAME = 'sludge-king_death.png'
CELL = 96
MARGIN = 8

# Szlam brązowy Sludge Kinga (STYLEGUIDE §4.5) — dolna część ciała i brzeg kałuży szlamu.
BROWN = hexes('#1e1510', '#3a271c', '#5a3e2a', '#7e5b3e', '#b08a64')
EYE = hexes('#f2c94a')[0]
PUDDLE = set(DIRT)
BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))

# Klatki: skala ciała, promień kałuży szlamu, oczy, bąble (liczba).
FRAMES = [
    {'src': 6, 'scale': 1.0, 'pool': 0, 'eyes': True, 'bubbles': 0},
    {'src': 0, 'scale': .9, 'pool': 12, 'eyes': True, 'bubbles': 0},
    {'src': 0, 'scale': .78, 'pool': 15, 'eyes': False, 'bubbles': 2},
    {'src': 0, 'scale': .64, 'pool': 18, 'eyes': False, 'bubbles': 3},
    {'src': 0, 'scale': .5, 'pool': 20, 'eyes': False, 'bubbles': 4},
    {'src': 0, 'scale': .36, 'pool': 21, 'eyes': False, 'bubbles': 4},
    {'src': 0, 'scale': .2, 'pool': 22, 'eyes': False, 'bubbles': 3},
    {'src': 0, 'scale': 0, 'pool': 22, 'eyes': False, 'bubbles': 1},
]


def load_north(col):
    """Klatka `col` z wiersza N, bez obrysu, rozdzielona na ciało i kałużę błota."""
    im = Image.open(SOURCE).convert('RGBA')
    body, puddle = Img(CELL, CELL), Img(CELL, CELL)
    for y in range(CELL):
        for x in range(CELL):
            c = im.getpixel((col * CELL + x, y))
            if c[3] and c != OUT:
                (puddle if c in PUDDLE else body).put(x, y, c)
    return body, puddle


def centroid(img):
    pts = [(x, y) for y in range(img.h) for x in range(img.w) if img.p[y][x][3]]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def scaled(img, center, sx, sy, sink=0.0):
    """Ciało skalowane wokół środka (najbliższy sąsiad); `sink` przesuwa je w dół (osiadanie)."""
    out = Img(img.w, img.h)
    if sx <= 0 or sy <= 0:
        return out
    cx, cy = center
    for y in range(img.h):
        for x in range(img.w):
            c = img.get(round(cx + (x - cx) / sx), round(cy + (y - cy - sink) / sy))
            if c and c[3]:
                out.put(x, y, c)
    return out


def pool(img, cx, cy, r):
    """Kałuża szlamu: fioletowy środek, brzeg przechodzi w brąz ditheringiem Bayera (amorficzny materiał)."""
    for y in range(img.h):
        for x in range(img.w):
            dx, dy = (x + .5 - cx) / r, (y + .5 - cy) / (r * .8)
            a = math.atan2(dy, dx)
            # nieregularny brzeg: szlam rozlewa się językami
            d = math.hypot(dx, dy) / (1 + .09 * math.sin(3 * a + .7) + .06 * math.sin(5 * a + 2))
            if d > 1:
                continue
            if d > .9:
                c = SLIME[0]
            elif d > .62:
                # przejście fiolet → brąz na brzegu: próg rośnie z odległością od środka
                c = BROWN[1] if (d - .62) / .28 * 16 > BAYER[y % 4][x % 4] else SLIME[1]
            else:
                # blask: krótki łuk po lewej-górze (światło w przestrzeni lokalnej), reszta baza
                c = SLIME[2] if .38 < d < .5 and -2.6 < a < -1.7 else SLIME[1]
            img.put(x, y, c)


def frame(f, sources):
    spec = FRAMES[f]
    body, puddle = sources[spec['src']]
    cx, cy = centroid(sources[0][0])
    img = Img(CELL, CELL)
    s = spec['scale']
    # kałuża błota z paczki kurczy się razem z ciałem — zastępuje ją kałuża szlamu
    img.blit(scaled(puddle, (cx, cy), s, s), 0, 0)
    if spec['pool']:
        pool(img, cx, cy + 4, spec['pool'])
    melted = scaled(body, (cx, cy), s * (1 + (1 - s) * .35), s, sink=(1 - s) * 6)
    if not spec['eyes']:
        for y in range(CELL):
            for x in range(CELL):
                if melted.p[y][x] == EYE:
                    melted.put(x, y, SLIME[0])
    img.blit(melted, 0, 0)
    r = random.Random(4000 + f)
    for _ in range(spec['bubbles']):  # bąble: pierścień jasnego szlamu z ciemnym środkiem
        a, d = r.uniform(0, math.tau), r.uniform(.3, .75) * spec['pool']
        bx, by = int(cx + math.cos(a) * d), int(cy + 4 + math.sin(a) * d * .8)
        for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            img.put(bx + ox, by + oy, SLIME[3])
        img.put(bx, by, SLIME[1])
        img.put(bx - 1, by - 1, SLIME[4])
    return img


def build():
    sources = {col: load_north(col) for col in {spec['src'] for spec in FRAMES}}
    local = [frame(f, sources) for f in range(len(FRAMES))]
    sheet = Img(CELL * 8, CELL * 8)
    frames = []
    for col, base in enumerate(local):
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    return sheet, frames


def validate(frames):
    errors = []
    for name, img in frames:
        opaque = [(x, y, c) for y, row in enumerate(img.p) for x, c in enumerate(row) if c[3]]
        if not opaque:
            errors.append(f'{name}: pusta klatka')
        if any(c[3] != 255 for _, _, c in opaque):
            errors.append(f'{name}: półprzezroczyste piksele')
        if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for _, _, c in opaque):
            errors.append(f'{name}: czysta czerń/biel')
        lo, hi = MARGIN - 1, CELL - MARGIN
        if any(not (lo <= x <= hi and lo <= y <= hi) for x, y, _ in opaque):
            errors.append(f'{name}: sylwetka wchodzi w margines {MARGIN} px')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator klatek śmierci Strażnika (Sludge King)')
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

"""
Generator sprite'ów łupów (krok 20): monety, mikstura, 12 przedmiotów, kapliczka, pocisk gracza,
znacznik celowania. Paleta C i narzędzia z tower_ruins_tiles.py (rampy, obrys, walidacja).

Użycie (z katalogu głównego repozytorium):
  python tools/loot_sprites.py                       # atlas do public/assets/sprites/loot.{png,json}
  python tools/loot_sprites.py --preview tools/out   # dodatkowo podgląd 6x

Ikony przedmiotów to siatki ASCII 12x12 (łatwe do ręcznej poprawki). Litery = role kolorów:
  . przezroczyste   D B L H  rampa koloru przedmiotu (cień, baza, światło, blask)
  s S T  stal (cień, baza, światło)   g G Y  złoto   w W u  drewno   j K k  kość/szkło   f F  ogień
Obrys 1 px #1b1a22 dokładamy automatycznie; przedmioty z efektem dostają dodatkowo złotą obwódkę.
"""
import argparse
import json
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import BONE, DIRT, FLAME, GOLD, IRON, OUT, Img, hx, ok, outline, to_hex

CELL = 16
SHRINE = 32
PALETTE = trt.PALETTES['piaskowiec']
OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')

# Kolory przedmiotów — te same co w src/config/lootConfig.ts (HUD); test pilnuje zgodności.
ITEMS = {
    'blade': ('#d8dce8', 'stat'),
    'heart': ('#ff5a7a', 'stat'),
    'boots': ('#7fd36b', 'stat'),
    'gloves': ('#f0a040', 'stat'),
    'hourglass': ('#6ec6ff', 'stat'),
    'shuriken': ('#c8d0e0', 'effect'),
    'electric-arrow': ('#fff06a', 'effect'),
    'fire-fist': ('#ff6a2a', 'effect'),
    'quiver': ('#b07a40', 'effect'),
    'vampire-fang': ('#b0203a', 'effect'),
    'storm-dash': ('#9a86ff', 'effect'),
    'frost-shard': ('#a8f0ff', 'effect'),
}
POTION_COLOR = '#ff4f5e'  # jaśniejsza od dawnego #d93a5a: na piaskowcu tamten miał tylko 1,44:1 (test WCAG)
SHOT_COLOR = '#5ee0c8'  # turkus jak ładunki w HUD

ICONS = {
    'blade': [
        '..........HB',
        '.........HBD',
        '........HBD.',
        '.......HBD..',
        '......HBD...',
        '.....HBD....',
        '..G.HBD.....',
        '..GGBD......',
        '...GG.......',
        '..wGGG......',
        '.wW..G......',
        'wW..........',
    ],
    'heart': [
        '............',
        '.BBB....BBB.',
        'BLHBB..BBBBD',
        'BHLBBBBBBBBD',
        'BLBBBBBBBBBD',
        'BBBBBBBBBBDD',
        '.BBBBBBBBBD.',
        '..BBBBBBBD..',
        '...BBBBBD...',
        '....BBBD....',
        '.....BD.....',
        '............',
    ],
    'boots': [
        '............',
        '...LBBB.....',
        '...LBBB.....',
        '...LBBB.....',
        '...LBBD.....',
        '...LBBD.....',
        '...LBBBBB...',
        '..LBBBBBBBD.',
        '..BBBBBBBBBD',
        '..DDDDDDDDDD',
        '..wwwwwwwww.',
        '............',
    ],
    'gloves': [
        '............',
        '...L.L.L....',
        '..LBLBLBB...',
        '..BBBBBBBD..',
        '..BBBBBBBBD.',
        '..LBBBBBBBD.',
        '..BBBBBBBBD.',
        '...BBBBBBD..',
        '...sSSSSSs..',
        '...sSTTSSs..',
        '...ssssss...',
        '............',
    ],
    'hourglass': [
        '.wWWWWWWWWw.',
        '..kLLLLLLk..',
        '..kLBBBBLk..',
        '...kLBBLk...',
        '....kBBk....',
        '.....kk.....',
        '.....kk.....',
        '....kBBk....',
        '...kBBBBk...',
        '..kBBBBBBk..',
        '..kBBBBBBk..',
        '.wWWWWWWWWw.',
    ],
    'shuriken': [
        '.....HL.....',
        '.....LB.....',
        '....LBBD....',
        '....LBBD....',
        '..LLBBBBDD..',
        'HLBBBssBBBBD',
        'LBBBBssBBBDD',
        '..DDBBBBDD..',
        '....DBBD....',
        '....DBBD....',
        '.....BD.....',
        '.....DD.....',
    ],
    'electric-arrow': [
        '......LHHB..',
        '.....LHBB...',
        '....LHBB....',
        '...LHBBBBBD.',
        '..LBBBBBBD..',
        '.....LBBD...',
        '....LBBD....',
        '...LBBD.....',
        '..LBD.......',
        '.sTS........',
        'sTS.........',
        'SS..........',
    ],
    'fire-fist': [
        '...F...F....',
        '..FfF.FfF.F.',
        '..fFffFFfFf.',
        '...ffffffF..',
        '..LBLBLBB...',
        '..BBBBBBBD..',
        '..BBBBBBBBD.',
        '..LBBBBBBBD.',
        '..BBBBBBBBD.',
        '...BBBBBBD..',
        '...DDDDDDD..',
        '............',
    ],
    'quiver': [
        '..T..T..T...',
        '..s..s..s...',
        '..W..W..W...',
        '.LBBBBBBBD..',
        '.LBBBBBBBD..',
        '.LBgGGGgBD..',
        '.LBBBBBBBD..',
        '.LBBBBBBBD..',
        '.LBBBBBBBD..',
        '.LBgGGGgBD..',
        '.LBBBBBBBD..',
        '..DDDDDDD...',
    ],
    'vampire-fang': [
        '............',
        '..kkkkkk....',
        '..kKKKKKj...',
        '..kKKKKKj...',
        '...kKKKj....',
        '...kKKKj....',
        '....kKj..B..',
        '....kKj.BLB.',
        '.....kj.BBB.',
        '.....j..DBD.',
        '.........D..',
        '............',
    ],
    'storm-dash': [
        '............',
        '......LHB...',
        '.....LHB....',
        'BBBB.LBBBBD.',
        '....LBBBBD..',
        'BBBBBBBBD...',
        '......LBD...',
        'BBBB.LBD....',
        '....LBD.....',
        '...LBD......',
        '...BD.......',
        '............',
    ],
    'frost-shard': [
        '.....HL.....',
        '....HLBD....',
        '....LBBD....',
        '...HLBBBD...',
        '...LBBBBD...',
        '..HLBBBBBD..',
        '..LBBHBBBD..',
        '..LBBLBBBD..',
        '...LBBBBD...',
        '...LBBBDD...',
        '....LBDD....',
        '.....DD.....',
    ],
}

POTION = [
    '....ww....',
    '....WW....',
    '....kk....',
    '...kBBk...',
    '..kLBBBk..',
    '.kLHBBBBk.',
    '.kLBBBBBk.',
    '.kBBBBBDk.',
    '.kBBBBDDk.',
    '..kDDDDk..',
    '...kkkk...',
]

AIM = [
    '...H...',
    '..HLH..',
    '.HL.LH.',
    'HL...LH',
]


# ---------------- kolory ----------------
def oklch_of(c):
    """sRGB → OKLCH (odwrotność trt.ok), do budowy ramp z koloru przedmiotu."""
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in c[:3])
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def ramp_from(hex_color):
    """Rampa 4 tonów z koloru przedmiotu: cień chłodniejszy i ciemniejszy, światło cieplejsze (STYLEGUIDE §4.1)."""
    L, C, h = oklch_of(hx(hex_color))
    clampL = lambda v: max(.18, min(.95, v))
    return {
        'D': ok(clampL(L - .17), C * .95, h - 12),
        'B': hx(hex_color),
        'L': ok(clampL(L + .08), C * .85, h + 8),
        'H': ok(clampL(L + .16), C * .45, h + 12),
    }


SHARED = {
    's': IRON[0], 'S': IRON[1], 'T': IRON[2],
    'g': GOLD[0], 'G': GOLD[1], 'Y': GOLD[2],
    'w': DIRT[2], 'W': DIRT[3], 'u': DIRT[4],
    'j': BONE[0], 'K': BONE[1], 'k': BONE[2],
    'f': FLAME[1], 'F': FLAME[2],
}


def from_ascii(rows, colors, size=CELL):
    img = Img(size, size)
    h, w = len(rows), len(rows[0])
    ox, oy = (size - w) // 2, (size - h) // 2
    for y, row in enumerate(rows):
        assert len(row) == w, f'wiersz o złej długości: {row!r}'
        for x, ch in enumerate(row):
            if ch != '.':
                img.put(ox + x, oy + y, colors[ch])
    return img


def rotate45(img, k):
    """Obrót o k·45° wokół środka, najbliższy sąsiad (STYLEGUIDE §1); obrys nakładamy po obrocie."""
    out = Img(img.w, img.h)
    a = -math.radians(45 * k)
    cx, cy = (img.w - 1) / 2, (img.h - 1) / 2
    for y in range(img.h):
        for x in range(img.w):
            dx, dy = x - cx, y - cy
            sx = round(cx + dx * math.cos(a) - dy * math.sin(a))
            sy = round(cy + dx * math.sin(a) + dy * math.cos(a))
            c = img.get(sx, sy)
            if c and c[3]:
                out.put(x, y, c)
    return out


# ---------------- sprite'y ----------------
def item_frames(item_id):
    color, kind = ITEMS[item_id]
    base = from_ascii(ICONS[item_id], {**SHARED, **ramp_from(color)})
    outline(base, OUT)
    if kind == 'stat':
        return [base]
    outline(base, GOLD[2])  # złota obwódka = przedmiot z efektem (ten sam język co dawne gwiazdy)
    frames = []
    for f in range(4):  # iskra w prawym górnym rogu: brak, punkt, krzyżyk, punkt
        img = Img(CELL, CELL)
        img.blit(base, 0, 0)
        if f in (1, 3):
            img.put(13, 2, GOLD[3])
        elif f == 2:
            for x, y in ((13, 1), (12, 2), (13, 2), (14, 2), (13, 3)):
                img.put(x, y, GOLD[3])
            img.put(13, 2, BONE[2])
        frames.append(img)
    return frames


def coin_frames():
    frames = []
    for half_w in (4, 3, 1, 3):  # obrót: pełna tarcza, skos, krawędź, skos
        img = Img(CELL, CELL)
        for y in range(4, 12):
            for x in range(8 - half_w, 8 + half_w):
                dx = (x + .5 - 8) / half_w
                dy = (y + .5 - 8) / 4
                if dx * dx + dy * dy > 1.05:
                    continue
                c = GOLD[2]
                if dy < -.45 and dx < .2:
                    c = GOLD[3]
                elif dx > .55 or dy > .6:
                    c = GOLD[1]
                img.put(x, y, c)
        if half_w == 4:
            for y in range(6, 10):
                img.put(8, y, GOLD[1])
        outline(img, OUT)
        frames.append(img)
    return frames


def potion_frame():
    img = from_ascii(POTION, {**SHARED, **ramp_from(POTION_COLOR)})
    outline(img, OUT)
    return img


def shot_frames():
    ramp = ramp_from(SHOT_COLOR)
    frames = []
    for f in range(4):  # blask krąży po obwodzie — orb „toczy się”
        img = Img(CELL, CELL)
        for y in range(CELL):
            for x in range(CELL):
                d = math.hypot(x + .5 - 8, y + .5 - 8)
                if d <= 3.6:
                    img.put(x, y, ramp['B'] if d > 2 else ramp['L'])
        ang = math.radians(225 + 90 * f)
        img.put(round(8 + 2 * math.cos(ang) - .5), round(8 + 2 * math.sin(ang) - .5), ramp['H'])
        outline(img, OUT)
        frames.append(img)
    return frames


def pierce_frames():
    """Przebijający strzał (Szuriken): gwiazdka w turkusie, obrót co 45° (bez obrotu o dowolny kąt)."""
    ramp = ramp_from(SHOT_COLOR)
    star = Img(CELL, CELL)
    for i in range(-4, 5):
        star.put(8 + i, 8, ramp['B'])
        star.put(8, 8 + i, ramp['B'])
    for i in (-1, 0, 1):
        star.put(8 + i, 8, ramp['L'])
        star.put(8, 8 + i, ramp['L'])
    star.put(8, 8, ramp['H'])
    frames = []
    for k in (0, 1, 0, 1):
        img = rotate45(star, k)
        outline(img, OUT)
        frames.append(img)
    return frames


def aim_frames():
    """Znacznik celowania w 8 kierunkach (N, NE, … NW — kolejność jak wiersze postaci)."""
    arrow = from_ascii(AIM, {'H': BONE[2], 'L': BONE[1]})
    frames = []
    for k in range(8):
        img = rotate45(arrow, k)
        outline(img, OUT)
        frames.append(img)
    return frames


def shrine_frames():
    """Kapliczka 32x32: kamienny postument w palecie C i kula — aktywna (puls 4 klatki) albo zgasła."""
    W = PALETTE.wall_top

    def pedestal():
        img = Img(SHRINE, SHRINE)
        for y in range(20, 29):
            for x in range(7, 25):
                img.put(x, y, W[3] if y == 20 else (W[1] if y >= 27 else W[2]))
        for y in range(14, 20):
            for x in range(11, 21):
                img.put(x, y, W[4] if y == 14 else (W[1] if x == 20 else W[2]))
        for x in range(9, 23, 4):
            img.put(x, 24, W[1])
        return img

    def orb(img, ramp):
        for y in range(SHRINE):
            for x in range(SHRINE):
                d = math.hypot(x + .5 - 16, y + .5 - 9)
                if d <= 4.6:
                    c = ramp[2] if d < 2.5 else ramp[1]
                    if d < 1.6 and x < 16 and y < 9:
                        c = ramp[3]
                    img.put(x, y, c)

    frames = []
    for f in range(4):
        img = pedestal()
        orb(img, (GOLD[0], GOLD[1], GOLD[2], GOLD[3]))
        outline(img, OUT)
        rad = (6, 7, 8, 7)[f]
        for a in range(0, 360, 30):  # przerywany pierścień blasku po obrysie: blask nie ma konturu
            ang = math.radians(a + 15 * f)
            x, y = round(16 + rad * math.cos(ang) - .5), round(9 + rad * math.sin(ang) - .5)
            if not img.get(x, y)[3]:
                img.put(x, y, GOLD[3] if f == 2 else GOLD[2])
        frames.append(('shrine_active_%d' % f, img))
    used = pedestal()
    orb(used, (IRON[0], IRON[0], IRON[1], IRON[2]))
    outline(used, OUT)
    frames.append(('shrine_used_0', used))
    return frames


# ---------------- atlas ----------------
def build():
    small = [(f'coin_{i}', img) for i, img in enumerate(coin_frames())]
    small.append(('potion_0', potion_frame()))
    for item_id in ITEMS:
        small += [(f'item_{item_id}_{i}', img) for i, img in enumerate(item_frames(item_id))]
    small += [(f'shot_{i}', img) for i, img in enumerate(shot_frames())]
    small += [(f'shot_pierce_{i}', img) for i, img in enumerate(pierce_frames())]
    small += [(f'aim_{i}', img) for i, img in enumerate(aim_frames())]
    big = shrine_frames()

    cols = 16
    small_rows = (len(small) + cols - 1) // cols
    width = cols * CELL
    height = small_rows * CELL + SHRINE
    sheet = Img(width, height)
    frames = {}
    for i, (name, img) in enumerate(small):
        x, y = (i % cols) * CELL, (i // cols) * CELL
        sheet.blit(img, x, y)
        frames[name] = (x, y, CELL, CELL)
    for i, (name, img) in enumerate(big):
        x, y = i * SHRINE, small_rows * CELL
        sheet.blit(img, x, y)
        frames[name] = (x, y, SHRINE, SHRINE)

    atlas = {
        'frames': {
            name: {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                   'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
            for name, (x, y, w, h) in frames.items()
        },
        'meta': {
            'app': 'tools/loot_sprites.py', 'version': '1', 'image': 'loot.png', 'format': 'RGBA8888',
            'size': {'w': width, 'h': height}, 'scale': '1',
            'items': {item_id: color for item_id, (color, _) in ITEMS.items()},
        },
    }
    return sheet, atlas, small + big


def validate(named):
    errors = []
    for name, img in named:
        opaque = [c for row in img.p for c in row if c[3]]
        if not opaque:
            errors.append(f'{name}: pusta klatka')
        if any(c[3] != 255 for c in opaque):
            errors.append(f'{name}: półprzezroczyste piksele')
        if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for c in opaque):
            errors.append(f'{name}: czysta czerń/biel')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator sprite\'ów łupów (krok 20)')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 6x')
    a = ap.parse_args()
    sheet, atlas, named = build()
    errors = validate(named)
    if errors:
        for e in errors:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    sheet.pil().save(os.path.join(a.out, 'loot.png'))
    with open(os.path.join(a.out, 'loot.json'), 'w', encoding='utf-8') as f:
        json.dump(atlas, f, indent=1, ensure_ascii=False)
    print(f"zapisano loot.png {atlas['meta']['size']['w']}x{atlas['meta']['size']['h']}: {len(atlas['frames'])} klatek")
    if a.preview:
        from PIL import Image
        os.makedirs(a.preview, exist_ok=True)
        im = sheet.pil()
        bg = Image.new('RGBA', im.size, PALETTE.floor[2])
        bg.alpha_composite(im)
        bg.resize((im.width * 6, im.height * 6), Image.NEAREST).save(os.path.join(a.preview, 'loot_preview.png'))
    return 0


if __name__ == '__main__':
    sys.exit(main())

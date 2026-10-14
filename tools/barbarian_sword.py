"""
Generator arkusza barbarzyńcy z mieczem (krok 21): chód z mieczem w prawej dłoni + 4 klatki ciosu.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/barbarian_sword.py                       # arkusz do public/assets/sprites/
  python tools/barbarian_sword.py --preview tools/out   # dodatkowo podgląd 4x na podłodze palety C

Źródło: wiersz N arkusza z paczki („bez miecza”) — public/assets/sprites/blond-barbarian_walk.png.
Klatki N rozbieramy z obrysu, dorysowujemy miecz (a w ciosie nową prawą rękę), a 8 kierunków
powstaje z obrotu co 45° (najbliższy sąsiad) z obrysem po obrocie — STYLEGUIDE §1, §3.
Obrót samego źródła odtwarza wiersze paczki (porównane w powiększeniu), więc chód wygląda jak dotąd.

Arkusz blond-barbarian_walk-attack.png (384x384, komórka 48x48, pivot 24,24):
  kolumny 0–3 chód z mieczem (klatka 0 = stanie), 4–7 cios prawą ręką od prawej do lewej
  (klatka 5 = ostrze na wprost, chwila trafienia). Tempo ciosu ustala gra (spriteConfig).

Wyjątek od marginesu 8 px (STYLEGUIDE §11): ostrze może w niego wejść, ale cały sprite mieści się
w promieniu MAX_RADIUS od pivota, więc nie wychodzi poza komórkę w żadnym kierunku.
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, Img, hx, outline
from loot_sprites import rotate45

PALETTE = trt.PALETTES['piaskowiec']
SPRITES = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
SOURCE = os.path.join(SPRITES, 'blond-barbarian_walk.png')
OUT_NAME = 'blond-barbarian_walk-attack.png'
CELL = 48
CENTER = (CELL - 1) / 2
# Najdalszy piksel (ze środkiem piksela) od środka komórki przed obrysem: po obrocie i obrysie zostaje w komórce.
MAX_RADIUS = 21.5

# Paleta barbarzyńcy (STYLEGUIDE §4.4) — ostrze było w niej „wyłączone”, krok 21 je włącza.
SKIN_HI, SKIN, SKIN_SH = hx('#efb985'), hx('#d9955f'), hx('#a8683c')
FUR = hx('#8a6a44')
LEATHER = hx('#5a3a22')
BLADE_HI, BLADE_SH = hx('#d7dde4'), hx('#8f99a6')

# Prawa dłoń na N (kolumny wypełnienia pięści) i ramię, które w ciosie rysujemy od nowa.
FIST_COLUMNS = (33, 34, 35)
ARM_ERASE_X = 32  # w ciosie: wszystko od tej kolumny w prawo …
ARM_ERASE_Y = 20  # … i powyżej tego wiersza to prawe przedramię z paczki
SHOULDER = (34.0, 20.5)

WALK_BLADE = 6
ATTACK_BLADE = 7
# Cios na N: pięść (px komórki) zatacza łuk przed głową od prawej do lewej, ostrze φ w stopniach
# zgodnie z zegarem od N. Ramię zawsze z prawego barku — przy lewym końcu łuku przechodzi przed głową.
SWING = [
    {'fist': (36.0, 17.5), 'blade': 15},   # 4: zamach z prawej
    {'fist': (32.5, 13.5), 'blade': -12},  # 5: ostrze na wprost — trafienie
    {'fist': (25.0, 11.0), 'blade': -70},  # 6: przeciągnięcie w lewo przed głową
    {'fist': (30.5, 13.5), 'blade': -35},  # 7: powrót
]


def direction(deg):
    a = math.radians(deg)
    return math.sin(a), -math.cos(a)


def load_north():
    """Cztery klatki chodu z wiersza N, bez obrysu (obrys wraca po obrocie)."""
    im = Image.open(SOURCE).convert('RGBA')
    frames = []
    for col in range(4):
        img = Img(CELL, CELL)
        for y in range(CELL):
            for x in range(CELL):
                c = im.getpixel((col * CELL + x, y))
                if c[3] and c != OUT:
                    img.put(x, y, c)
        frames.append(img)
    return frames


def fist_top(img):
    """Najwyższy wiersz wypełnienia prawej pięści na N."""
    for y in range(CELL // 2):
        if any(img.p[y][x][3] for x in FIST_COLUMNS):
            return y
    raise ValueError('nie znaleziono prawej pięści')


def sword(img, base, deg, length):
    """Jelec (skóra pasa) w `base` i ostrze 2 px w kierunku `deg`; jasna krawędź po lewej stronie ostrza."""
    ux, uy = direction(deg)
    px, py = -uy, ux  # w prawo od ostrza
    bx, by = base
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - bx, y + .5 - by
            t = dx * ux + dy * uy
            s = dx * px + dy * py
            if abs(t) <= .6 and abs(s) <= 2.4:
                img.put(x, y, LEATHER)
            elif .6 < t <= length - 1 and -1 <= s < 1:
                img.put(x, y, BLADE_HI if s < 0 else BLADE_SH)
            elif length - 1 < t <= length and abs(s) <= .55:
                img.put(x, y, BLADE_HI)


def arm(img, shoulder, fist):
    """Przedramię 3 px (skóra z cieniem i światłem), karwasz z futra przy dłoni i pięść."""
    sx, sy = shoulder
    fx, fy = fist
    length = math.hypot(fx - sx, fy - sy)
    ux, uy = (fx - sx) / length, (fy - sy) / length
    px, py = -uy, ux
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - sx, y + .5 - sy
            t = dx * ux + dy * uy
            s = dx * px + dy * py
            if -.5 <= t <= length and abs(s) <= 1.5:
                if t > length - 3.2:
                    img.put(x, y, FUR)
                else:
                    img.put(x, y, SKIN_HI if s < -.6 else SKIN_SH if s > .6 else SKIN)
            if (x + .5 - fx) ** 2 + (y + .5 - fy) ** 2 <= 2.3:
                img.put(x, y, SKIN_HI if (x + .5 - fx) + (y + .5 - fy) < -.5 else SKIN)


def walk_frame(src):
    img = Img(CELL, CELL)
    img.blit(src, 0, 0)
    top = fist_top(src)
    sword(img, (FIST_COLUMNS[1] + 1, top - .5), 0, WALK_BLADE)
    return img


def attack_frame(src, pose):
    img = Img(CELL, CELL)
    for y in range(CELL):
        for x in range(CELL):
            c = src.p[y][x]
            if c[3] and not (x >= ARM_ERASE_X and y < ARM_ERASE_Y):
                img.put(x, y, c)
    fist = pose['fist']
    bx, by = direction(pose['blade'])
    sword(img, (fist[0] + bx * 2.2, fist[1] + by * 2.2), pose['blade'], ATTACK_BLADE)
    arm(img, SHOULDER, fist)
    return img


def build():
    north = load_north()
    local = [walk_frame(f) for f in north] + [attack_frame(north[0], pose) for pose in SWING]
    sheet = Img(CELL * 8, CELL * 8)
    frames = []
    for col, base in enumerate(local):
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    return sheet, local, frames


def validate(local, frames):
    errors = []
    for col, img in enumerate(local):
        for y in range(CELL):
            for x in range(CELL):
                if img.p[y][x][3] and math.hypot(x - CENTER, y - CENTER) > MAX_RADIUS:
                    errors.append(f'kolumna {col}: piksel ({x},{y}) dalej niż {MAX_RADIUS} px od pivota')
    for name, img in frames:
        opaque = [c for row in img.p for c in row if c[3]]
        if not opaque:
            errors.append(f'{name}: pusta klatka')
        if any(c[3] != 255 for c in opaque):
            errors.append(f'{name}: półprzezroczyste piksele')
        if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for c in opaque):
            errors.append(f'{name}: czysta czerń/biel')
        if any(img.p[y][x][3] for y in range(CELL) for x in (0, CELL - 1)) or \
                any(img.p[y][x][3] for y in (0, CELL - 1) for x in range(CELL)):
            errors.append(f'{name}: sprite dotyka krawędzi komórki')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator arkusza barbarzyńcy z mieczem')
    ap.add_argument('--out', default=SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheet, local, frames = build()
    errors = validate(local, frames)
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

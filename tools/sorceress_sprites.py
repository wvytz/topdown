"""
Generator sprite'ów Czarodziejki, drugiej bohaterki: arkusz postaci i kula energii.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/sorceress_sprites.py                       # arkusze do public/assets/sprites/
  python tools/sorceress_sprites.py --preview tools/out   # dodatkowo podglądy 4x na podłodze palety C

Postać rysujemy z brył raz, zwróconą na N; 8 kierunków powstaje z obrotu co 45° (najbliższy sąsiad),
a obrys #1b1a22 nakładamy po obrocie — STYLEGUIDE §1, §3. Cieniowanie w przestrzeni lokalnej,
światło z lewej-przodu, płaskie pasma bez ditheringu (§5).

sorceress_walk-cast.png (384x384, komórka 48x48, pivot 24,24):
  kolumny 0–3 chód (0 = stanie): suknia prawie nieruchoma (przód rąbka ±1 px), włosy mocno falują;
  kolumny 4–7 rzut zaklęcia: zamach, pchnięcie kosturem, rozbłysk kryształu, powrót.
  Kula wylatuje w kolumnie 7 (§8), w odległości FORWARD od pivota. Tempo ataku ustala gra.

sorceress_orb.png (64x16, komórka 16x16, pivot 8,8, rotate: false): kula energii w rampie kryształu,
  blask okrąża obwód co 90° (4 klatki pętli).

Wyjątek od marginesu 8 px (STYLEGUIDE §11, jak ostrze barbarzyńcy): kryształ w pchnięciu wchodzi
w margines, ale ciało mieści się w promieniu MAX_RADIUS od pivota, a iskry rozbłysku w SPARK_RADIUS.
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, Img, hexes, outline
from loot_sprites import rotate45

PALETTE = trt.PALETTES['piaskowiec']
SPRITES = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
SHEET_NAME = 'sorceress_walk-cast.png'
ORB_NAME = 'sorceress_orb.png'
CELL = 48
ORB_CELL = 16
CENTER = (CELL - 1) / 2
MAX_RADIUS = 21.5
SPARK_RADIUS = 22.5
# Odległość spawnu kuli od pivota w kierunku patrzenia (kryształ w klatce 7) — do spriteConfig.
FORWARD = 17
# Czubek kostura (y lokalne w spoczynku) i środek kryształu względem czubka.
STAFF_TOP = -13
CRYSTAL_DY = -2.5

# Rampy (plan zaakceptowany przez właściciela): ciemny → jasny.
HAIR = hexes('#282a3c', '#353b55', '#48516f', '#63708f')            # D, baza, L, H
DRESS = hexes('#1c1f5a', '#23378f', '#2d56b9', '#3d7bd3', '#7fb4ec')  # deep, D, baza, L, H
SKIN = hexes('#b9805e', '#e8b892')                                   # cień, baza
WOOD = hexes('#4a3020', '#5a3a22', '#5b3e27')                        # D (okucie), baza, L (słój)
CRYSTAL = hexes('#1d7f9c', '#39c0d8', '#8ae6ef', '#e4fbfb')          # D, baza, L, H
PALETTE_COLORS = {OUT, *HAIR, *DRESS, *SKIN, *WOOD, *CRYSTAL}

# Klatki: przesunięcie kostura (y lokalne, + = do tyłu, − = do przodu), przód rąbka (x),
# włosy (wychylenie końca w x, wydłużenie, rozszczepienie na 2 pasma) i stan kryształu.
FRAMES = [
    {'staff': 0, 'hem': 0, 'hair': (0, 0, 0), 'crystal': 'rest'},     # 0: stanie
    {'staff': 1, 'hem': 1, 'hair': (3, 0, 0), 'crystal': 'rest'},     # 1: krok P, fala w prawo
    {'staff': 0, 'hem': 0, 'hair': (0, 3, 1), 'crystal': 'rest'},     # 2: przejście, włosy rozwiane
    {'staff': 1, 'hem': -1, 'hair': (-3, 0, 0), 'crystal': 'rest'},   # 3: krok L, fala w lewo
    {'staff': 1, 'hem': 0, 'hair': (0, -1, 0), 'crystal': 'charge'},  # 4: zamach, ładowanie
    {'staff': -2, 'hem': 0, 'hair': (0, 2, 0), 'crystal': 'bright'},  # 5: pchnięcie
    {'staff': -2, 'hem': 0, 'hair': (0, 1, 2), 'crystal': 'flash'},   # 6: rozbłysk, włosy na boki
    {'staff': -1, 'hem': 0, 'hair': (0, 0, 0), 'crystal': 'rest'},    # 7: powrót, wylot kuli
]


def local(x, y):
    """Środek piksela względem pivota (y ujemne = przód postaci)."""
    return x + .5 - CELL / 2, y + .5 - CELL / 2


def in_ellipse(dx, dy, cx, cy, rx, ry):
    return ((dx - cx) / rx) ** 2 + ((dy - cy) / ry) ** 2 <= 1


def dress(img, hem):
    """Suknia z góry: elipsa zakrywająca stopy, fałdy w tonie deep, rąbek z tyłu w D, światło z lewej-przodu."""
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            sx = dx - hem if dy < -4 else dx  # w kroku przesuwa się tylko przód rąbka
            if not in_ellipse(sx, dy, 0, 2, 11, 10):
                continue
            inner = in_ellipse(sx, dy, 0, 2, 9.6, 8.6)
            c = DRESS[2]
            if not inner and dy > 3:
                c = DRESS[1]
            elif not inner and dy < 0 and sx < 0:
                c = DRESS[3]
            elif sx > 5 and dy > -2:
                c = DRESS[1]
            # fałdy: promienie z talii w tył i na boki
            for ang in (145, 180, 215):
                a = math.radians(ang)
                ux, uy = math.sin(a), -math.cos(a)
                t = sx * ux + (dy - 1) * uy
                s = sx * uy - (dy - 1) * ux
                if 5.5 < t and abs(s) < .5:
                    c = DRESS[0]
                elif 5.5 < t and -1.5 < s <= -.5 and ang == 215:
                    c = DRESS[3]
            img.put(x, y, c)
    # blask krawędzi fałdy po lewej-przodu
    for x, y in ((14, 21), (15, 20)):
        img.put(x, y, DRESS[4])


def hair(img, sway, extra, split):
    """Grzywa opadająca na plecy: pasma wzdłuż krzywej, koniec wychyla się o `sway`, `split` rozdziela pasma."""
    length = 10 + extra
    strands = [(0, 1.0)] if not split else [(-split - .5, .62), (split + .5, .62)]
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            best = None
            for off, wscale in strands:
                for i in range(41):
                    t = i / 40
                    cx = sway * t * t + off * t
                    cy = -1 + length * t
                    r = (5.2 - 2.4 * t) * (wscale if t > .25 else 1)
                    d = math.hypot(dx - cx, dy - cy)
                    if d <= r and (best is None or t > best[0]):
                        best = (t, dx - cx, r)
            if best is None:
                continue
            t, side, r = best
            c = HAIR[1]
            if side < -r * .45:
                c = HAIR[2]
            elif side > r * .45:
                c = HAIR[0]
            if t > .35 and abs(side) < .5 and not split:
                c = HAIR[0]  # podział pasm
            if r - math.hypot(side, 0) < .9 and t > .2:
                c = HAIR[0]  # brzeg grzywy oddziela ją od sukni
            img.put(x, y, c)


def bodice(img):
    """Ramiona i gorset w świetle sukni."""
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            if in_ellipse(dx, dy, 0, -2, 7, 3.5):
                img.put(x, y, DRESS[3] if dx < 3 else DRESS[2])


def head(img):
    """Czubek głowy z góry: włosy z przedziałkiem i połyskiem, skrawek czoła z przodu."""
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            d = math.hypot(dx, dy + 1)
            if d > 5.1:
                continue
            c = HAIR[1]
            if dx < -1 and dy < 0:
                c = HAIR[2]
            elif dx > 2:
                c = HAIR[0]
            if d > 4.3 and dy > -3:
                c = HAIR[0]  # brzeg głowy na tle sukni
            if dy < -4.6 and -2 < dx < 1:
                c = SKIN[1]
            img.put(x, y, c)
    img.put(21, 20, HAIR[3])
    img.put(22, 19, HAIR[3])
    img.put(23, 21, HAIR[0])  # przedziałek
    img.put(23, 22, HAIR[0])


def sleeve(img, a, b):
    """Rękaw 2 px od barku do dłoni."""
    (ax, ay), (bx, by) = a, b
    n = 24
    for i in range(n + 1):
        t = i / n
        px, py = ax + (bx - ax) * t, ay + (by - ay) * t
        for ox, oy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            x, y = int(px + CELL / 2 - .5 + ox), int(py + CELL / 2 - .5 + oy)
            img.put(x, y, DRESS[3] if ax < 0 else DRESS[2])


def staff(img, off, state):
    """Kostur 2 px trzymany oburącz przed sobą, okucie i kryształ na czubku."""
    top = STAFF_TOP + off
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            if .5 <= dx <= 2.5 and top <= dy <= -3 + off:
                img.put(x, y, WOOD[2] if dx < 1.5 else WOOD[1])
            if -.5 <= dx <= 3.5 and top - .5 <= dy <= top + .5:
                img.put(x, y, WOOD[0])
    # dłonie: dolna i górna, z cieniem palców
    for hy in (-6 + off, -9 + off):
        for y in range(CELL):
            for x in range(CELL):
                dx, dy = local(x, y)
                if -.5 <= dx <= 3.5 and hy - 1 <= dy <= hy + 1:
                    img.put(x, y, SKIN[0] if dy > hy else SKIN[1])
    crystal(img, 1.5, top + CRYSTAL_DY, state)


def crystal(img, cx, cy, state):
    """Romb 4×5 px: lewa ściana w świetle, prawa w cieniu, blask w środku sylwetki."""
    tones = {
        'rest': (CRYSTAL[0], CRYSTAL[1], CRYSTAL[2], CRYSTAL[3]),
        'charge': (CRYSTAL[0], CRYSTAL[0], CRYSTAL[1], CRYSTAL[2]),
        'bright': (CRYSTAL[1], CRYSTAL[2], CRYSTAL[3], CRYSTAL[3]),
        'flash': (CRYSTAL[2], CRYSTAL[3], CRYSTAL[3], CRYSTAL[3]),
    }[state]
    dark, base, light, glint = tones
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = local(x, y)
            if abs(dx - cx) / 2.6 + abs(dy - cy) / 3.1 > 1:
                continue
            img.put(x, y, light if dx < cx and dy < cy + 1 else dark if dx > cx + .5 else base)
    img.put(int(cx + CELL / 2 - 1), int(cy + CELL / 2 - 1), glint)


def sparks(off):
    """Iskry rozbłysku (pełne piksele bez obrysu, §6c) wokół kryształu: krzyż 4 punktów."""
    img = Img(CELL, CELL)
    cx, cy = 1.5, STAFF_TOP + CRYSTAL_DY + off
    for ox, oy, c in ((0, -4, CRYSTAL[3]), (-4, 0, CRYSTAL[2]), (4, 0, CRYSTAL[2]), (-3, -3, CRYSTAL[3]), (3, -3, CRYSTAL[3])):
        img.put(int(cx + ox + CELL / 2 - .5), int(cy + oy + CELL / 2 - .5), c)
    return img


def body_frame(f):
    img = Img(CELL, CELL)
    dress(img, f['hem'])
    sway, extra, split = f['hair']
    hair(img, sway, extra, split)
    bodice(img)
    head(img)
    off = f['staff']
    sleeve(img, (-5.5, -2.5), (-.5, -6 + off))
    sleeve(img, (4.5, -2.5), (3, -9 + off))
    staff(img, off, f['crystal'])
    return img


def orb_frame(k):
    """Kula 10 px: obręcz D, baza, rdzeń L; blask H 2 px okrąża obwód co 90°."""
    img = Img(ORB_CELL, ORB_CELL)
    c = ORB_CELL / 2
    for y in range(ORB_CELL):
        for x in range(ORB_CELL):
            d = math.hypot(x + .5 - c, y + .5 - c)
            if d <= 5:
                img.put(x, y, CRYSTAL[0] if d > 4.1 else CRYSTAL[1] if d > 2.2 else CRYSTAL[2])
    ang = math.radians(-45 + 90 * k)  # lewy-górny, prawy-górny, prawy-dolny, lewy-dolny
    hx_, hy_ = c + 3 * math.sin(ang) - .5, c - 3 * math.cos(ang) - .5
    img.put(int(round(hx_)), int(round(hy_)), CRYSTAL[3])
    img.put(int(round(hx_ - 1.2 * math.sin(ang))), int(round(hy_ + 1.2 * math.cos(ang))), CRYSTAL[3])
    outline(img, OUT)
    return img


def build():
    local_frames = [body_frame(f) for f in FRAMES]
    sheet = Img(CELL * 8, CELL * 8)
    frames = []
    for col, base in enumerate(local_frames):
        extra = sparks(FRAMES[col]['staff']) if FRAMES[col]['crystal'] == 'flash' else None
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            if extra:
                img.blit(rotate45(extra, row), 0, 0)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    orb = Img(ORB_CELL * 4, ORB_CELL)
    orbs = [orb_frame(k) for k in range(4)]
    for k, o in enumerate(orbs):
        orb.blit(o, k * ORB_CELL, 0)
    return sheet, local_frames, frames, orb, orbs


def validate(local_frames, frames, orbs):
    errors = []
    for col, img in enumerate(local_frames):
        for y in range(CELL):
            for x in range(CELL):
                if img.p[y][x][3] and math.hypot(x - CENTER, y - CENTER) > MAX_RADIUS:
                    errors.append(f'kolumna {col}: piksel ({x},{y}) dalej niż {MAX_RADIUS} px od pivota')
        s = sparks(FRAMES[col]['staff']) if FRAMES[col]['crystal'] == 'flash' else Img(CELL, CELL)
        for y in range(CELL):
            for x in range(CELL):
                if s.p[y][x][3] and math.hypot(x - CENTER, y - CENTER) > SPARK_RADIUS:
                    errors.append(f'kolumna {col}: iskra ({x},{y}) dalej niż {SPARK_RADIUS} px')
    named = frames + [(f'orb{k}', o) for k, o in enumerate(orbs)]
    for name, img in named:
        opaque = [c for row in img.p for c in row if c[3]]
        if not opaque:
            errors.append(f'{name}: pusta klatka')
        if any(c[3] != 255 for c in opaque):
            errors.append(f'{name}: półprzezroczyste piksele')
        extra = {c for c in opaque if c not in PALETTE_COLORS}
        if extra:
            errors.append(f'{name}: kolory spoza palety {sorted(extra)[:3]}')
        n = img.w
        if any(img.p[y][x][3] for y in range(n) for x in (0, n - 1)) or \
                any(img.p[y][x][3] for y in (0, n - 1) for x in range(n)):
            errors.append(f'{name}: sprite dotyka krawędzi komórki')
    return errors


def save_preview(img, path):
    im = img.pil()
    bg = Image.new('RGBA', im.size, PALETTE.floor[2])
    bg.alpha_composite(im)
    bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(path)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator sprite\'ów Czarodziejki')
    ap.add_argument('--out', default=SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 4x')
    a = ap.parse_args()
    sheet, local_frames, frames, orb, orbs = build()
    errors = validate(local_frames, frames, orbs)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    sheet.pil().save(os.path.join(a.out, SHEET_NAME))
    orb.pil().save(os.path.join(a.out, ORB_NAME))
    print(f'zapisano {SHEET_NAME} {sheet.w}x{sheet.h}: {len(frames)} klatek; {ORB_NAME} {orb.w}x{orb.h}')
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        save_preview(sheet, os.path.join(a.preview, SHEET_NAME.replace('.png', '_preview.png')))
        save_preview(orb, os.path.join(a.preview, ORB_NAME.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

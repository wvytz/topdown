"""
Generator Palacza (krok 182, `#palacz`): boss Piekła na piętrze 4 zamiast Kata Otchłani. Piekło to kotłownia wieży:
w jej piecach pali się zmarłych z Cmentarzyska piętro niżej, żeby ogrzać ostatnich żywych wyżej. Palacz to olbrzym
w okopconym skórzanym fartuchu i goglach spawalniczych; na plecach nosi własny piec z kominem, w lewej ręce drzwiczki
pieca (tarcza: żeliwo z trzema szczelinami żaru), w prawej szuflę do węgla.

Użycie (z katalogu głównego repozytorium):
  python tools/stoker_sprites.py                       # arkusze do public/assets/sprites/
  python tools/stoker_sprites.py --preview tools/out   # dodatkowo podgląd 2x na posadzce Piekła

stoker_walk-swing-throw-stomp-belch.png (1920x768, komórka 96, 8 kierunków z obrotu, obrys po obrocie):
  0–3 chód, 4–7 zamach szuflą (z prawej przed drzwiczkami w lewo), 8–11 rzut żarem (nabranie, zamach, wyrzut,
  powrót), 12–15 ruszt (szufla w górę, uderzenie w posadzkę, iskry, powrót), 16–19 buchnięcie pieca na plecach.
stoker-grate.png (192x32, komórka 32): ruszt w posadzce areny — 0 tlenie, 1–2 ostrzeżenie (żar jaśnieje),
  3–5 płomienie nad prętami (pętla). Pręty poziome sięgają krawędzi, więc kafle łączą się w pas.
stoker-coal.png (64x16, komórka 16): bryła żaru w locie, 4 klatki (iskra obiega bryłę).
stoker-furnace.png (384x64, komórka 96x64): paszcza wielkiego pieca w północnym murze areny, 4 klatki migotania.
stoker-props.png (256x48, komórka 64x48, krok 182a): 0–1 stoły do krojenia (tasak; hak i kości), 2 sterta węgla
  z szuflą, 3 łańcuch z kajdanami na licu muru.
Kolory: żelazo z kroku 41f, skóra i fartuch w okopconych brązach, żar palety „krwawy bazalt”.
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import CLR as CLEAR, Img, ok
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 96
MARGIN = 6
C = CELL / 2

HELL = trt.PALETTES['pieklo_bazalt']
EMBER = HELL.ember
FLAME = HELL.flame
IRON = (ok(.20, .010, 260), ok(.27, .012, 255), ok(.36, .014, 250), ok(.47, .016, 245), ok(.60, .014, 240))
# Okopcona skóra (ręce) i skórzany fartuch.
SKIN = (ok(.30, .040, 40), ok(.38, .050, 45), ok(.46, .055, 50), ok(.55, .055, 55), ok(.64, .050, 60))
LEATHER = (ok(.22, .030, 45), ok(.29, .038, 50), ok(.36, .045, 55), ok(.44, .048, 60), ok(.53, .045, 65))
WOOD = (ok(.40, .060, 60), ok(.52, .065, 70))
COAL = (ok(.16, .010, 30), ok(.24, .012, 30))


def door(img, cx, cy, w, h, glow):
    """Drzwiczki pieca z góry: gruby prostokąt żeliwa, nity, trzy szczeliny żaru (glow 0–2)."""
    for y in range(int(cy - h / 2), int(cy + h / 2) + 1):
        for x in range(int(cx - w / 2), int(cx + w / 2) + 1):
            edge = x <= cx - w / 2 + 1 or y <= cy - h / 2 + 1
            far = x >= cx + w / 2 - 1 or y >= cy + h / 2 - 1
            img.put(x, y, IRON[4] if edge else (IRON[1] if far else IRON[3]))
    for x in (int(cx - w / 2 + 2), int(cx + w / 2 - 2)):
        for y in (int(cy - h / 2 + 2), int(cy + h / 2 - 2)):
            img.put(x, y, IRON[0])
    slit = (EMBER[0], EMBER[1], EMBER[2])[glow]
    for k in (-1, 0, 1):
        x0 = int(cx + k * 9 - 3)
        for x in range(x0, x0 + 6):
            img.put(x, int(cy), slit)
            if glow == 2:
                img.put(x, int(cy - 1), EMBER[1])
    # uchwyt drzwiczek
    img.put(int(cx), int(cy + h / 2 - 3), IRON[4])


def shovel(img, hand, tip, coal=False):
    """Szufla: drewniany trzonek od dłoni do ostrza, żelazne ostrze (z żarem przy rzucie)."""
    stroke(img, [hand, tip], 2.6, WOOD[0], edge=WOOD[1])
    ang = math.atan2(tip[1] - hand[1], tip[0] - hand[0])
    bx, by = tip[0] + math.cos(ang) * 4, tip[1] + math.sin(ang) * 4
    ux, uy = math.cos(ang), math.sin(ang)
    for i in range(-4, 4):  # płaskie ostrze: prostokąt wzdłuż trzonka, szerszy w poprzek
        for j in range(-5, 6):
            x, y = bx + ux * i - uy * j, by + uy * i + ux * j
            rim = abs(j) == 5 or i == 3
            img.put(int(round(x)), int(round(y)), IRON[1] if rim else (IRON[3] if j < 0 else IRON[2]))
    if coal:
        for dx, dy, c in ((-1, -1, EMBER[2]), (1, 0, EMBER[1]), (0, 1, EMBER[1]), (-2, 1, COAL[1]), (2, -2, COAL[1])):
            img.put(int(bx + dx), int(by + dy), c)


def sparks(img, cx, cy, r, n, phase, color=None):
    for i in range(n):
        a = phase + i * 2 * math.pi / n
        img.put(int(cx + math.cos(a) * r), int(cy + math.sin(a) * r), color or EMBER[2])
        img.put(int(cx + math.cos(a) * (r - 2)), int(cy + math.sin(a) * (r - 2)), EMBER[1])


def stoker_frame(f):
    img = Img(CELL, CELL)
    walk = f < 4
    swing = 4 <= f < 8
    throw = 8 <= f < 12
    stomp = 12 <= f < 16
    belch = f >= 16
    step = (0, 2, 0, -2)[f] if walk else 0
    cy = C + 4
    hunch = 2 if belch and f in (17, 18) else 0

    # piec na plecach (z tyłu = dół komórki) z kominem; we wściekłym buchnięciu płonie
    flare = 2 if belch and f in (17, 18) else (1 if belch or (stomp and f == 14) else 0)
    for y in range(int(cy + 9), int(cy + 21)):
        for x in range(int(C - 11), int(C + 12)):
            edge = x <= C - 10 or y <= cy + 9
            img.put(x, y, IRON[3] if edge else IRON[1])
    for k in (-1, 0, 1):
        for x in range(int(C + k * 6 - 2), int(C + k * 6 + 2)):
            img.put(x, int(cy + 15), (EMBER[0], EMBER[1], EMBER[2])[flare])
    ellipse(img, C + 8, cy + 22, 3.4, 3.4, lambda nx, ny: IRON[4] if nx + ny < -.6 else IRON[0])
    img.put(int(C + 8), int(cy + 22), EMBER[1] if flare else COAL[1])
    if belch and f in (17, 18):  # buchnięcie: pierścień płomieni dookoła
        sparks(img, C, cy + 4, 30 if f == 17 else 32, 14, f * .4, FLAME[3])
        sparks(img, C, cy + 4, 25, 10, f * .7, FLAME[2])

    # nogi
    for side, dy in ((-1, step), (1, -step)):
        ellipse(img, C + side * 10, cy + 10 + dy, 5, 6, band_shade(LEATHER))
    # tułów: fartuch, potężne barki
    ellipse(img, C, cy + hunch, 21, 14, band_shade(SKIN))
    ellipse(img, C, cy + 1 + hunch, 15, 11, band_shade(LEATHER))
    for side in (-1, 1):
        ellipse(img, C + side * 18, cy - 2 + hunch, 8, 7.5, band_shade(SKIN))
        img.put(int(C + side * 18), int(cy - 6 + hunch), SKIN[4])
    # paski fartucha na plecach (krzyż)
    for t in range(12):
        img.put(int(C - 8 + t * 1.4), int(cy + 3 + t * .5), LEATHER[0])
        img.put(int(C + 8 - t * 1.4), int(cy + 3 + t * .5), LEATHER[0])

    # prawa ręka i szufla
    shoulder = (C + 18, cy - 1)
    if swing:
        a = math.radians((-15, -55, -120, -160)[f - 4])
        hand = (C + math.cos(a) * 20, cy + math.sin(a) * 20)
        tip = (C + math.cos(a) * 30, cy + math.sin(a) * 30)
        if f == 6:
            sparks(img, tip[0], tip[1], 6, 5, 1.1)
    elif throw:
        a = math.radians((35, -30, -90, -50)[f - 8])
        reach = (24, 28, 30, 26)[f - 8]
        hand = (C + 14 + math.cos(a) * 8, cy + math.sin(a) * 10)
        tip = (C + 6 + math.cos(a) * reach, cy + math.sin(a) * reach)
        if f == 10:
            for dx, dy in ((-3, -5), (3, -6), (0, -8), (-5, -7), (4, -8)):
                img.put(int(tip[0] + dx), int(tip[1] + dy), EMBER[2])
                img.put(int(tip[0] + dx + 1), int(tip[1] + dy), EMBER[1])
    elif stomp:
        hand = ((C + 16, cy - 16), (C + 16, cy - 20), (C + 16, cy - 20), (C + 20, cy - 10))[f - 12]
        tip = ((C + 18, cy - 8), (C + 16, cy - 30), (C + 16, cy - 30), (C + 22, cy - 28))[f - 12]
        if f in (13, 14):
            sparks(img, tip[0], tip[1] - 4, 7 if f == 13 else 10, 7, f)
    else:
        hand = (C + 20, cy - 6 + step * .5)
        tip = (C + 21, cy - 26 + step)
    stroke(img, [shoulder, hand], 6, SKIN[2], edge=SKIN[3])
    shovel(img, hand, tip, coal=throw and f in (8, 9))

    # lewa ręka trzyma drzwiczki przed sobą
    thrust = (0, -3, -5, -1)[f - 4] if swing else 0
    sy = cy - 26 + thrust + hunch
    stroke(img, [(C - 18, cy - 2), (C - 16, sy + 8), (C - 10, sy + 4)], 6, SKIN[2], edge=SKIN[3])
    # głowa: skórzany kaptur, gogle spawalnicze (dwa żarzące się szkła)
    hy = cy - 11 + hunch
    ellipse(img, C, hy, 8, 7.5, band_shade(LEATHER, light=(-.4, -.6)))
    ellipse(img, C, hy - 2, 5.5, 3.5, band_shade(IRON))
    lens = EMBER[2] if belch or stomp else EMBER[1]
    for dx in (-2, 2):
        img.put(int(C + dx), int(hy - 4), lens)
        img.put(int(C + dx), int(hy - 3), EMBER[0])
    glow = 2 if belch and f in (17, 18) else (1 if throw or stomp else 0)
    door(img, C - 1, sy, 36, 11, glow)
    return img


def grate_frame(f):
    """Ruszt 32×32: pręty poziome przez całą szerokość, między nimi kanał z żarem; f≥3 — płomienie."""
    img = Img(32, 32)
    hot = (COAL[1], EMBER[0], EMBER[1], EMBER[2], EMBER[2], EMBER[2])[f]
    deep = (EMBER[0], COAL[1], EMBER[0], EMBER[1], EMBER[1], EMBER[1])[f]
    for y in range(32):
        for x in range(32):
            if y < 3 or y > 28:
                img.put(x, y, IRON[1] if y in (0, 31) else IRON[3] if y in (1, 29) else IRON[2])
                continue
            bar = (y - 3) % 6 in (0, 1)
            if bar:
                img.put(x, y, IRON[3] if (y - 3) % 6 == 0 else IRON[2])
            else:
                img.put(x, y, hot if (x * 7 + y * 3 + f) % 5 else deep)
    # nity na obrzeżu co 8 px (łączą się w pas)
    for x in range(4, 32, 8):
        img.put(x, 1, IRON[4])
        img.put(x, 30, IRON[0])
    if f >= 3:  # języki płomieni nad prętami
        for i, x in enumerate(range(2, 32, 5)):
            h = 5 + ((i * 3 + f * 2) % 5)
            base = 22 + (i + f) % 3 * 2
            for dy in range(h):
                c = FLAME[3] if dy < h // 3 else FLAME[2] if dy < 2 * h // 3 else FLAME[1]
                img.put(x, base - dy * 2, c)
                img.put(x + 1, base - dy * 2 - 1, FLAME[1] if dy % 2 else c)
    return img


def coal_frame(f):
    img = Img(16, 16)
    ellipse(img, 8, 8, 5, 4.5, lambda nx, ny: COAL[1] if nx + ny < -.4 else COAL[0])
    for dx, dy in ((-1, 0), (1, 1), (0, -1), (2, -1)):
        img.put(8 + dx, 8 + dy, EMBER[1])
    img.put(8, 8, EMBER[2])
    a = f * math.pi / 2
    img.put(int(8 + math.cos(a) * 6.5), int(8 + math.sin(a) * 6.5), FLAME[3])
    return img


def furnace_frame(f):
    """Paszcza pieca 96×64: łuk z bazaltowych cegieł, żeliwna rama, ogień w środku (migocze), węgiel u stóp."""
    img = Img(96, 64)
    wall = HELL.wall_top
    cx, base = 48, 62
    for y in range(4, 64):
        for x in range(4, 92):
            dx = (x - cx) / 44
            top = 4 + 26 * (dx * dx)
            if y < top:
                continue
            brick = ((y // 6) + (x // 12 + (y // 6) % 2)) % 2
            mortar = y % 6 == 0 or (x + (y // 6) % 2 * 6) % 12 == 0
            img.put(x, y, wall[1] if mortar else (wall[3] if brick else wall[2]))
    # otwór: łuk wewnętrzny, ogień od dołu jaśniejszy
    for y in range(18, base):
        for x in range(18, 78):
            dx = (x - cx) / 30
            top = 18 + 16 * (dx * dx)
            if y < top:
                continue
            frame = y < top + 2 or x in (18, 19, 76, 77)
            if frame:
                img.put(x, y, IRON[3] if x < cx else IRON[2])
                continue
            t = (y - 18) / (base - 18)
            wob = math.sin(x * .45 + f * 1.7) * .12 + math.sin(x * .19 - f) * .08
            v = t + wob
            c = FLAME[3] if v > .82 else FLAME[2] if v > .62 else FLAME[1] if v > .42 else EMBER[1] if v > .25 else EMBER[0]
            img.put(x, y, c)
    # ruszt w paszczy i węgiel
    for x in range(20, 76):
        img.put(x, 54, IRON[1])
        if x % 5 == 0:
            for y in range(46, 55):
                img.put(x, y, IRON[2])
    for i in range(14):
        x = 22 + i * 4 + (f + i) % 2
        img.put(x, 56, COAL[1])
        img.put(x + 1, 57, EMBER[1] if (i + f) % 4 == 0 else COAL[0])
    return img


STAIN = HELL.stain
BONE = HELL.bone


def table_frame(variant):
    """Stół do krojenia 64×48 z góry: grube deski, przednia krawędź w cieniu, plamy krwi, tasak (albo hak i kości)."""
    img = Img(64, 48)
    x0, x1, y0, y1 = 6, 58, 12, 34
    for y in range(y0, y1 + 5):
        for x in range(x0, x1 + 1):
            if y > y1:  # przednia krawędź blatu (3/4)
                img.put(x, y, LEATHER[0] if y == y1 + 4 else WOOD[0] if x % 13 else LEATHER[1])
                continue
            plank = (y - y0) // 6
            seam = (y - y0) % 6 == 5
            light = x == x0 or y == y0
            img.put(x, y, WOOD[1] if light else (LEATHER[2] if seam else (WOOD[0] if (plank + x // 17) % 2 else LEATHER[3])))
    # plamy krwi: nieregularne krople
    for cx, cy, r in ((20 + variant * 14, 20, 5.5), (40 - variant * 12, 27, 3.5), (28, 16, 2.2)):
        ellipse(img, cx, cy, r * 1.3, r, lambda nx, ny: STAIN[1] if nx * nx + ny * ny < .45 else STAIN[0])
    if variant == 0:  # tasak: ostrze z żelaza, trzonek z drewna
        for y in range(17, 25):
            for x in range(40, 50):
                img.put(x, y, IRON[4] if y == 17 else IRON[3] if x < 47 else IRON[2])
        stroke(img, [(50, 21), (56, 21)], 2.4, LEATHER[0])
    else:  # hak rzeźniczy i kości
        stroke(img, [(42, 18), (48, 18), (50, 22), (47, 25)], 1.6, IRON[3])
        for bx, by in ((16, 28), (22, 26)):
            stroke(img, [(bx, by), (bx + 7, by - 3)], 2.2, BONE[1])
            img.put(bx, by, BONE[2])
            img.put(bx + 7, by - 3, BONE[2])
    trt.outline(img, trt.OUT)
    return img


def coal_heap_frame(_f):
    """Sterta węgla 64×48: kopiec brył w dwóch tonach, kilka tlących się żarem, szufla wbita z boku."""
    img = Img(64, 48)
    for i in range(159, -1, -1):
        a = (i * 2.399) % (2 * math.pi)
        r = math.sqrt(i / 160)
        x = 32 + math.cos(a) * r * 24
        y = 30 + math.sin(a) * r * 12 - (1 - r) * 8
        ellipse(img, x, y, 3.4, 2.8, lambda nx, ny, r=r: IRON[2] if nx + ny < -.9 else (IRON[0] if nx + ny < -.1 and r < .7 else (COAL[1] if nx + ny < .5 else COAL[0])))
    for i in (7, 23, 41, 66, 90):
        a = (i * 2.399) % (2 * math.pi)
        r = math.sqrt(i / 160)
        img.put(int(32 + math.cos(a) * r * 24), int(30 + math.sin(a) * r * 12 - (1 - r) * 8), EMBER[1] if i % 2 else EMBER[2])
    stroke(img, [(52, 30), (58, 12)], 2.4, WOOD[0], edge=WOOD[1])
    for y in range(8, 13):
        for x in range(55, 62):
            img.put(x, y, IRON[3] if x < 59 else IRON[2])
    trt.outline(img, trt.OUT)
    return img


def chain_frame(_f):
    """Łańcuch z kajdanami na licu muru (64×48, rysunek 16 px szeroki pośrodku): kółko w murze, ogniwa, dwie obręcze."""
    img = Img(64, 48)
    cx = 32
    ellipse(img, cx, 4, 3.2, 3.2, lambda nx, ny: IRON[4] if nx + ny < -.5 else (CLEAR if nx * nx + ny * ny < .3 else IRON[2]))
    for side, end in ((-1, 34), (1, 30)):
        for i, y in enumerate(range(7, end, 3)):
            x = cx + side * (i * .55)
            c = IRON[3] if i % 2 else IRON[1]
            img.put(int(x), y, c)
            img.put(int(x), y + 1, c)
            img.put(int(x) + (1 if i % 2 else 0), y + 2, IRON[2])
        # kajdany: obręcz z rdzawą plamą
        ex = cx + side * ((end - 7) / 3 * .55)
        ellipse(img, ex, end + 4, 4, 3.5, lambda nx, ny: CLEAR if nx * nx + ny * ny < .35 else (IRON[4] if ny < -.3 else IRON[2]))
        img.put(int(ex + 1), end + 6, STAIN[1])
    trt.outline(img, trt.OUT)
    return img


def props_frame(f):
    return (lambda: table_frame(0), lambda: table_frame(1), lambda: coal_heap_frame(0), lambda: chain_frame(0))[f]()


def strip(w, h, fn, cols):
    sheet = Img(w * cols, h)
    frames = []
    for col in range(cols):
        img = fn(col)
        trt.outline(img, trt.OUT) if fn is coal_frame else None
        sheet.blit(img, col * w, 0)
        frames.append((f'c{col}', img))
    return sheet, frames


def build():
    boss, bf = directional_sheet(CELL, stoker_frame, 20)
    return {
        'stoker_walk-swing-throw-stomp-belch.png': (boss, bf, CELL, MARGIN),
        'stoker-grate.png': (*strip(32, 32, grate_frame, 6), 32, 0),
        'stoker-coal.png': (*strip(16, 16, coal_frame, 4), 16, 1),
        'stoker-furnace.png': (*strip(96, 64, furnace_frame, 4), 96, 0),
        'stoker-props.png': (*strip(64, 48, props_frame, 4), 64, 0),
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Palacza (Piekło)')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 2x')
    a = ap.parse_args()
    sheets = build()
    errors = [e for e in validate({k: v for k, v in sheets.items() if k.startswith('stoker_')})]
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for fname, (sheet, frames, _, _) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
        if a.preview:
            from PIL import Image
            os.makedirs(a.preview, exist_ok=True)
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, HELL.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

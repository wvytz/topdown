"""
Postacie 2.0 (krok U5a, STYLEGUIDE §13.9): nowe stany bohaterów — bezruch, trafienie, dash i śmierć —
oraz akcent barwy klasy (karwasze i rzemień, ok. 10% sylwetki). Pilot: barbarzyńca.

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/hero_v2_sprites.py                       # arkusz do public/assets/sprites/
  python tools/hero_v2_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze palety C

Źródło: klatki N z `barbarian_sword.py` (chód z mieczem i cios). Nowe klatki powstają na N z przesunięć
części ciała (barki, przedramiona, głowa) i rysunku leżącej postaci, a 8 kierunków — z obrotu co 45°
z obrysem po obrocie, jak w kroku 21. Stary arkusz `blond-barbarian_walk-attack.png` zostaje bez zmian.

Arkusz blond-barbarian_v2.png (1008x384, komórka 48x48, pivot 24,24), kolumny:
  0–3 chód, 4–7 cios (jak w kroku 21, z akcentem), 8–10 bezruch (oddech), 11–12 trafienie,
  13–14 dash, 15–20 śmierć (ostatnia klatka zostaje na podłodze).
"""
import argparse
import colorsys
import math
import os
import sys

from PIL import Image

import barbarian_sword as bs
from barbarian_sword import CELL, SKIN, SKIN_HI, SKIN_SH, FUR, LEATHER, BLADE_HI, BLADE_SH
from tower_ruins_tiles import OUT, Img, hx, outline
from loot_sprites import rotate45

OUT_NAME = 'blond-barbarian_v2.png'
COLUMNS = 21

# Włosy barbarzyńcy (z paczki) — po nich rozpoznajemy głowę.
HAIR = {hx('#f2d064'), hx('#c99a2e'), hx('#fbeaa6'), hx('#7a5418')}
HAIR_DARK, HAIR_MID, HAIR_HI = hx('#7a5418'), hx('#c99a2e'), hx('#f2d064')
BOOT = hx('#3b2a1e')


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return (round(r * 255), round(g * 255), round(b * 255), 255)


# Barwa klasy (config/heroColorConfig.ts: HERO_HUES 38°, rola dominująca) — rampa barwionej skóry.
CLASS_HUE = 38
ACCENT = (hsl(CLASS_HUE, .62, .26), hsl(CLASS_HUE, .66, .42), hsl(CLASS_HUE, .72, .58))


def accent(img):
    """Futro karwaszy i rzemienie → barwiona skóra w barwie klasy (ciemna / średnia / jasna)."""
    for y in range(CELL):
        for x in range(CELL):
            c = img.p[y][x]
            if c == FUR:
                img.p[y][x] = ACCENT[1] if (x + y) % 3 else ACCENT[2]
            elif c == LEATHER:
                img.p[y][x] = ACCENT[0]
    return img


def copy(img):
    out = Img(CELL, CELL)
    out.blit(img, 0, 0)
    return out


def move(img, region, dx, dy):
    """Przesuwa piksele, dla których `region(x, y, c)` jest prawdą; reszta zostaje pod spodem."""
    out = Img(CELL, CELL)
    moved = []
    for y in range(CELL):
        for x in range(CELL):
            c = img.p[y][x]
            if not c[3]:
                continue
            if region(x, y, c):
                moved.append((x + dx, y + dy, c))
            else:
                out.put(x, y, c)
    for x, y, c in moved:
        out.put(x, y, c)
    return out


def left_arm(x, y, c):
    return x < 19 and c not in HAIR


def right_arm(x, y, c):
    return x >= 29 and c not in HAIR


def forearm(x, y, c):
    return (x < 19 or x >= 29) and y < 19 and c not in HAIR


def head(x, y, c):
    return c in HAIR


def idle_frames(base):
    """Oddech: barki rozchodzą się o piksel, potem miecz unosi się o piksel."""
    f0 = copy(base)
    f1 = move(move(base, left_arm, -1, 0), right_arm, 1, 0)
    f2 = move(f1, forearm, 0, -1)
    return [f0, f1, f2]


def hit_frames(base):
    """Trafienie: cała postać odskakuje do tyłu, głowa odchyla się mocniej, ramiona rozrzucone."""
    back = move(base, lambda x, y, c: True, 0, 1)
    h0 = move(move(move(back, left_arm, -2, 1), right_arm, 2, 1), head, 0, 1)
    h1 = move(move(back, left_arm, -1, 0), right_arm, 1, 0)
    return [h0, h1]


def dash_frames(base):
    """Dash: głowa w przód, przedramiona odrzucone w tył i do ciała, plecy ciągną się za postacią."""
    lean = move(base, head, 0, -1)
    d0 = move(move(lean, lambda x, y, c: x < 19 and y < 22 and c not in HAIR, 1, 4),
              lambda x, y, c: x >= 29 and y < 22 and c not in HAIR, -1, 4)
    d1 = move(d0, lambda x, y, c: y >= 27 and 18 <= x < 30, 0, 1)
    return [d0, d1]


def ellipse(img, cx, cy, rx, ry, fn):
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if dx * dx + dy * dy <= 1:
                c = fn(x, y, dx, dy)
                if c:
                    img.put(x, y, c)


def limb(img, a, b, half, fn):
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / length, (by - ay) / length
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - ax, y + .5 - ay
            t = dx * ux + dy * uy
            s = -dx * uy + dy * ux
            if -.4 <= t <= length + .4 and abs(s) <= half:
                img.put(x, y, fn(t / length, s))


def skin(t, s):
    return SKIN_HI if s < -.6 else SKIN_SH if s > .6 else SKIN


def prone(spread, sword_off):
    """Leżący twarzą w dół (głowa na N): plecy z futrem, ramiona rozrzucone, nogi, miecz obok."""
    img = Img(CELL, CELL)
    # nogi w skórzanych spodniach i buty
    for lx in (21.5, 26.5):
        limb(img, (lx, 27), (lx + (lx - 24) * .5, 36.5), 1.6,
             lambda t, s: BOOT if t > .78 else ACCENT[0] if s > .5 else LEATHER)
    # ramiona — od barków na boki i w przód
    hands = ((18 - 7 * spread, 19 - 3 * spread), (30 + 7 * spread, 21 + 3 * spread))
    limb(img, (19, 20), hands[0], 1.5, skin)
    limb(img, (29, 20), hands[1], 1.5, skin)
    for fx, fy in hands:
        ellipse(img, fx, fy, 1.6, 1.6, lambda x, y, dx, dy: SKIN_HI if dx + dy < -.4 else SKIN)
    # plecy: futrzana narzuta na skórze, rzemień w barwie klasy po skosie
    ellipse(img, 24, 23, 6.2, 6.8, lambda x, y, dx, dy: FUR if dy < .35 else LEATHER)
    ellipse(img, 24, 21.5, 4.6, 4, lambda x, y, dx, dy: SKIN_SH if dy > .3 else SKIN)
    limb(img, (20.5, 19.5), (27.5, 27.5), .6, lambda t, s: ACCENT[1])
    # głowa (potylica, włosy)
    ellipse(img, 24, 14.5, 4.4, 4.2,
            lambda x, y, dx, dy: HAIR_HI if dx + dy < -.5 else HAIR_DARK if dx + dy > .9 else HAIR_MID)
    # miecz wypadł z ręki — leży obok
    ox, oy = sword_off
    limb(img, (ox, oy), (ox - 2, oy + 8), .9, lambda t, s: BLADE_HI if s < 0 else BLADE_SH)
    limb(img, (ox - .6, oy - 1.2), (ox + .4, oy - 1.6), 1.6, lambda t, s: LEATHER)
    return accent(img)


def death_frames(base, hit):
    """Śmierć: trafienie, osunięcie na kolana, pad w przód i leżąca postać (ostatnia klatka zostaje)."""
    kneel = move(move(move(hit, left_arm, 0, 2), right_arm, 0, 2), head, 0, 1)
    slump = move(kneel, head, 0, -2)
    return [hit, kneel, slump, prone(.55, (39, 23)), prone(.85, (40, 24)), prone(1, (40, 24))]


def build():
    _, local, _ = bs.build()
    base = [accent(copy(f)) for f in local]  # 0–3 chód, 4–7 cios
    walk0 = base[0]
    hits = hit_frames(walk0)
    columns = base + idle_frames(walk0) + hits + dash_frames(walk0) + death_frames(walk0, hits[0])
    assert len(columns) == COLUMNS
    sheet = Img(CELL * COLUMNS, CELL * 8)
    frames = []
    for col, img_n in enumerate(columns):
        for row in range(8):
            img = rotate45(img_n, row)
            outline(img, OUT)
            sheet.blit(img, col * CELL, row * CELL)
            frames.append((f'r{row}c{col}', img))
    return sheet, columns, frames


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator arkusza barbarzyńcy 2.0 (krok U5a)')
    ap.add_argument('--out', default=bs.SPRITES)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheet, local, frames = build()
    errors = bs.validate(local, frames)
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
        bg = Image.new('RGBA', im.size, bs.PALETTE.floor[2])
        bg.alpha_composite(im)
        bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
            os.path.join(a.preview, OUT_NAME.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

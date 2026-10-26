"""
Generator kapliczki-pułapki (mini boss): kapliczka, która w trakcie wykupu przedmiotu wyrasta nogi
i atakuje gracza. Paleta i narzędzia z tower_ruins_tiles.py / loot_sprites.py (rampy, obrys 1 px #1b1a22,
obrót co 45°, walidacja). Ten sam kształt ciała używa kafla kapliczki w atlasie łupów (`shrine_body`).

Użycie (z katalogu głównego repozytorium):
  python tools/shrine_mimic_sprites.py                       # arkusz do public/assets/sprites/
  python tools/shrine_mimic_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze palety C

Arkusz (STYLEGUIDE §2, §8, §10), 80x80 na komórkę, 8 kierunków (wiersze N…NW):
  shrine-mimic_walk-unfold-attack.png   960x640; kolumny 0–3 chód na nogach (pętla),
                                        4–7 rozkładanie się z kapliczki (bez pętli, 4 = złożona, 7 = rozłożona),
                                        8–11 atak przednimi nogami (8 zamach, 9–10 cios, 10 rzut monetami, 11 powrót)

Postać rysujemy raz, na północ, w przestrzeni lokalnej; kierunki z obrotu (najbliższy sąsiad), obrys po obrocie.
Czytelność: kapliczka ma łukowaty dach z góry (północ = łuk), złotą kulę i ciemne nogi z kośćmi na końcach.
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import BONE, GOLD, IRON, OUT, Img, outline
from loot_sprites import rotate45

PALETTE = trt.PALETTES['piaskowiec']
OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 80
CENTER = CELL / 2  # pivot 40,40 — w środku komórki (ten sam pivot co u Matki Pająków)
MARGIN = 8

# Ciało z góry: łuk (półkole) na północ i prostokąt pod nim. Wartości w pikselach dla skali 1.
BODY_R = 12.0  # promień łuku = połowa szerokości
BODY_HB = 10.0  # długość prostokąta pod łukiem
ORB_R = 5.0  # złota kula w środku
ROOT_R = 11.0  # nogi startują pod krawędzią ciała, żeby ciało je przykrywało

# Nogi: (kąt od północy w stopniach, + w prawo; rząd 0 = przód, 1 = środek, 2 = tył).
LEGS = [(-38, 0), (38, 0), (-78, 1), (78, 1), (-122, 2), (122, 2)]

# Monety rzucane w ciosie (kąt, promień środka monety).
COIN_THROW = [(-14, 25.0), (0, 27.0), (14, 25.0)]


def lerp(a, b, t):
    return a + (b - a) * t


def polar(c, deg, r):
    """Punkt w odległości r od środka c, pod kątem deg od północy (0 = góra, + w prawo)."""
    a = math.radians(deg)
    return (c[0] + math.sin(a) * r, c[1] - math.cos(a) * r)


# ---------------- narzędzia rysunku ----------------
def disc_at(img, x, y, r, col):
    for yy in range(int(y - r) - 1, int(y + r) + 2):
        for xx in range(int(x - r) - 1, int(x + r) + 2):
            if (xx + .5 - x) ** 2 + (yy + .5 - y) ** 2 <= r * r:
                img.put(xx, yy, col)


def stroke(img, pts, r, col):
    """Linia o promieniu r (≈ 2 px szerokości przy r ≈ 1) przez kolejne punkty."""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(steps + 1):
            t = i / steps
            disc_at(img, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, col)


def shrine_body(img, cx, cy, s=1.0, orb=GOLD, glow=None):
    """Kapliczka z góry: łukowaty dach, kamienne ciało w palecie C i złota kula.

    s skaluje wszystkie wymiary (kafel 32x32 bierze s ≈ 0.6). glow: kolor pierścienia wokół kuli
    (animacja kafla zmienia go między klatkami, bez zmiany rozmiaru — STYLEGUIDE §6c).
    """
    # Ciemniejsza część rampy kamienia: na jasnej podłodze palety C ciało musi mieć kontrast (test czytelności).
    W = PALETTE.wall_top
    r = BODY_R * s
    hb = BODY_HB * s
    orb_r = ORB_R * s
    orb_cy = cy - 2 * s  # kula przesunięta lekko w stronę łuku
    for y in range(img.h):
        for x in range(img.w):
            px, py = x + .5 - cx, y + .5 - cy
            in_rect = abs(px) <= r and -hb <= py <= hb
            in_arch = px * px + (py + hb) ** 2 <= r * r
            if not (in_rect or in_arch):
                continue
            d = math.hypot(x + .5 - cx, y + .5 - orb_cy)
            if d <= orb_r:
                if d < orb_r * .45:
                    c = orb[3]
                elif d < orb_r * .75:
                    c = orb[2]
                else:
                    c = orb[1]
                img.put(x, y, c)
                continue
            if glow is not None and orb_r < d <= orb_r + 1.0:
                img.put(x, y, glow)
                continue
            # Światło z lewej-przodu (północny zachód), cieniowanie pasmowe bez ditheringu.
            light = -(0.6 * px / r + 0.5 * (py + hb) / (hb + r))
            if py > hb - 1.0 * s:
                c = W[0]  # dolna krawędź w cieniu
            elif light > .55:
                c = W[3]
            elif light > .2:
                c = W[2]
            elif light > -.25:
                c = W[1]
            else:
                c = W[0]
            img.put(x, y, c)


def leg(img, c, theta, open_, reach=0.0, ang=0.0):
    """Noga od ciała do stopy. theta: kąt od północy; open_: 0 złożona pod ciałem, 1 rozłożona.

    reach (px) i ang (°) to przesunięcia stopy: chód i ciosy. Kolana to ciemny stawy, stopa kończy się kością.
    """
    sgn = 1 if theta >= 0 else -1
    knee_r = lerp(14.0, 22.0, open_)
    foot_r = lerp(17.0, 25.0, open_) + reach
    splay = lerp(0.0, 12.0, open_)
    root = polar(c, theta, ROOT_R)
    knee = polar(c, theta + sgn * splay * .5, knee_r)
    foot = polar(c, theta + sgn * (splay + ang), foot_r)
    stroke(img, [root, knee], .95, IRON[2])
    stroke(img, [knee, foot], .85, IRON[1])
    disc_at(img, knee[0], knee[1], 1.0, IRON[0])
    disc_at(img, foot[0], foot[1], 1.2, BONE[1])


def mimic_frame(open_=1.0, walk=None, glow=None, front=None, coins=False):
    """Klatka kapliczki-pająka (kierunek N). walk = faza chodu (rad) albo None; front = (reach, ang) dla przednich nóg."""
    img = Img(CELL, CELL)
    c = (CENTER, CENTER)
    for theta, row in LEGS:
        # Dwie grupy kroku po przekątnej: przód-L, środek-P, tył-L kroczą razem, reszta w przeciwfazie.
        group = 0 if (theta < 0) == (row % 2 == 0) else 1
        reach, ang = 0.0, 0.0
        if walk is not None:
            ph = walk + (0.0 if group == 0 else math.pi)
            reach, ang = 2.0 * math.sin(ph), 4.0 * math.sin(ph)
        if row == 0 and front is not None:
            reach, ang = front
        leg(img, c, theta, open_, reach, ang)
    shrine_body(img, c[0], c[1], 1.0, GOLD, glow)
    if coins:
        for deg, r in COIN_THROW:
            x, y = polar(c, deg, r)
            for dy in (0, 1):
                for dx in (0, 1):
                    img.put(int(x) - 1 + dx, int(y) - 1 + dy, GOLD[2])
    return img


def frames_for_sheet():
    """Trzy grupy po 4 klatki: chód, rozkładanie, atak. Zwraca listę (nazwa, funkcja klatki)."""
    cols = []
    for f in range(4):
        cols.append(('walk_%d' % f, lambda f=f: mimic_frame(walk=f * math.pi / 2)))
    # Rozkładanie: nogi rosną, a pierścień kuli rozbłyskuje dopiero przy pełnym rozłożeniu.
    unfold = [(0.0, None), (0.35, None), (0.7, GOLD[2]), (1.0, GOLD[3])]
    for u, (open_, glow_col) in enumerate(unfold):
        cols.append(('unfold_%d' % u, lambda o=open_, g=glow_col: mimic_frame(open_=o, glow=g)))
    attack = [
        (-4.0, -14.0),  # 8: zamach — przednie nogi cofnięte (reach px, ang °)
        (2.0, 10.0),  # 9: wymach w przód
        (3.0, 12.0),  # 10: cios z rzutem monet
        None,  # 11: powrót do pozycji chodu
    ]
    for a, front in enumerate(attack):
        cols.append(('attack_%d' % a, lambda fr=front, a=a: mimic_frame(
            walk=None if fr is None else 0.0, front=fr, coins=(a == 2))))
    return cols


def directional_sheet(size, cols_fn):
    """8 kierunków z obrotu; obrys nakładamy po obrocie. Zwraca arkusz i listę klatek do walidacji."""
    specs = cols_fn()
    sheet = Img(size * len(specs), size * 8)
    frames = []
    for col, (name, fn) in enumerate(specs):
        base = fn()
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            sheet.blit(img, col * size, row * size)
            frames.append((f'r{row}_{name}', img))
    return sheet, frames


def build():
    sheet, frames = directional_sheet(CELL, frames_for_sheet)
    return {'shrine-mimic_walk-unfold-attack.png': (sheet, frames, CELL)}


def validate(sheets):
    errors = []
    for fname, (_, frames, size) in sheets.items():
        for name, img in frames:
            opaque = [(x, y, c) for y, row in enumerate(img.p) for x, c in enumerate(row) if c[3]]
            if not opaque:
                errors.append(f'{fname} {name}: pusta klatka')
                continue
            if any(c[3] != 255 for _, _, c in opaque):
                errors.append(f'{fname} {name}: półprzezroczyste piksele')
            if any(c[:3] in ((0, 0, 0), (255, 255, 255)) for _, _, c in opaque):
                errors.append(f'{fname} {name}: czysta czerń/biel')
            lo, hi = MARGIN - 1, size - MARGIN
            if any(not (lo <= x <= hi and lo <= y <= hi) for x, y, _ in opaque):
                errors.append(f'{fname} {name}: sylwetka wchodzi w margines {MARGIN} px')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator kapliczki-pająka (mini boss)')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 4x')
    a = ap.parse_args()
    sheets = build()
    errors = validate(sheets)
    if errors:
        for e in errors[:30]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    for fname, (sheet, frames, _) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
    if a.preview:
        from PIL import Image
        os.makedirs(a.preview, exist_ok=True)
        for fname, (sheet, _, _) in sheets.items():
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, PALETTE.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""
Generator wrogów Piekła (krok 41d): piekielny ogar (wariant Rushera) i kultysta popiołu (wariant Kitera)
oraz bomba smolna kultysty. Narzędzia z tower_ruins_tiles.py / spider_sprites.py / lair_enemies.py.

Użycie (z katalogu głównego repozytorium):
  python tools/infernal_enemies.py                       # arkusze do public/assets/sprites/
  python tools/infernal_enemies.py --preview tools/out   # dodatkowo podglądy 4x na podłodze Piekła

Arkusze (STYLEGUIDE §2, §8, §10; wiersze = 8 kierunków N..NW z obrotu, obrys po obrocie), komórka 48x48:
  hellhound_run-pounce.png  kolumny 0–3 bieg (łapy naprzemiennie), 4–7 skok: przysiad, wybicie, lot, lądowanie
  cultist_walk-throw.png    kolumny 0–3 chód, 4–7 rzut: naczynie odchylone w tył, nad głową, wyrzut,
                            puste dłonie (bomba wylatuje w kolumnie 7)
  tar-bomb.png              16x16, 4 klatki, bez obrotu: żelazny garnek ze smołą, iskra lontu migocze

Czytelność na palecie A „krwawy bazalt” (ciemna, czerwonawa podłoga): ogar ma popielatą sierść (jaśniejszą
od podłogi) i żarzącą się szczelinę wzdłuż grzbietu; kultysta — szaty z wypłowiałego popiołu i czerwona szarfa.
Akcenty (max 2 na postać, §4.1): żar (pomarańcz palety) i oczy (czerwień żaru).
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import IRON, OUT, Img, ok, outline
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8

HELL = trt.PALETTES['pieklo_bazalt']
EMBER = HELL.ember      # czerwień, pomarańcz, rozgrzany środek
FLAME = HELL.flame
BLOOD = HELL.stain
# Sierść ogara: popielata szarość z nutą brązu — jaśniejsza od podłogi (czytelność ciała).
FUR = (ok(.40, .016, 40), ok(.48, .018, 45), ok(.56, .020, 50), ok(.64, .020, 55), ok(.73, .018, 60))
CLAW = HELL.bone
# Szaty kultysty: wypłowiały popiół (ciepła, jasna szarość); kaptur ciemniejszy w środku.
ROBE = (ok(.42, .020, 70), ok(.50, .022, 72), ok(.58, .024, 75), ok(.66, .024, 78), ok(.75, .022, 80))
HOOD_IN = (ok(.16, .012, 30), ok(.22, .014, 30))
SKIN = (ok(.45, .040, 40), ok(.55, .045, 45))  # osmalone dłonie


# ---------------- piekielny ogar (Rusher) ----------------
def hound_frame(f):
    """Ogar z góry (przód = N): wydłużony tułów, głowa z pyskiem i uszami, cztery łapy, ogon.
    f 0–3 bieg; f 4–7 skok: 4 przysiad (krótszy, łapy rozstawione), 5 wybicie, 6 lot (wyciągnięty), 7 lądowanie."""
    img = Img(CELL, CELL)
    c = CELL / 2
    run = f < 4
    step = (0, 2, 0, -2)[f] if run else 0
    body_ry = 7 if run else (6, 7.5, 8, 7)[f - 4]
    cy = c + 1
    # łapy: przód (y-), tył (y+); w biegu naprzemiennie, w skoku wg fazy
    if run:
        legs = [((-4, -4), (-6, -7 + step)), ((4, -4), (6, -7 - step)), ((-4, 4), (-6, 7 - step)), ((4, 4), (6, 7 + step))]
    else:
        legs = {
            4: [((-4, -3), (-8, -5)), ((4, -3), (8, -5)), ((-4, 3), (-8, 6)), ((4, 3), (8, 6))],
            5: [((-4, -4), (-5, -10)), ((4, -4), (5, -10)), ((-4, 4), (-5, 10)), ((4, 4), (5, 10))],
            6: [((-3, -5), (-4, -10)), ((3, -5), (4, -10)), ((-3, 5), (-3, 11)), ((3, 5), (3, 11))],
            7: [((-4, -4), (-7, -7)), ((4, -4), (7, -7)), ((-4, 4), (-6, 7)), ((4, 4), (6, 7))],
        }[f]
    for (ax, ay), (fx, fy) in legs:
        stroke(img, [(c + ax, cy + ay), (c + fx, cy + fy)], 2.4, FUR[1], edge=FUR[3])
        img.put(int(c + fx), int(cy + fy), CLAW[1])
    # ogon za tułowiem
    tail_end = (c + (step * .8 if run else 0), cy + body_ry + 3)
    stroke(img, [(c, cy + body_ry - 1), tail_end], 2.0, FUR[1])
    img.put(int(tail_end[0]), int(tail_end[1]), EMBER[1])  # żarzący się koniec ogona
    # tułów
    ellipse(img, c, cy, 5.2, body_ry, band_shade(FUR))
    # żebra: krótkie kreski najciemniejszym tonem (wewnętrzne linie podziału, §3)
    for dy in (-3, 0, 3):
        img.put(int(c - 3), int(cy + dy), FUR[0])
        img.put(int(c + 3), int(cy + dy), FUR[0])
    # szczelina żaru wzdłuż grzbietu (akcent 1)
    for y in range(int(cy - body_ry + 2), int(cy + body_ry - 1)):
        img.put(int(c), y, EMBER[1] if (y % 3) else EMBER[2])
        img.put(int(c) - 1, y, EMBER[0])
    # głowa z pyskiem i uszami
    hy = cy - body_ry - 2
    ellipse(img, c, hy, 4.0, 3.8, band_shade(FUR, light=(-.4, -.6)))
    ellipse(img, c, hy - 3.8, 2.2, 2.2, lambda nx, ny: FUR[2] if ny < 0 else FUR[1])  # pysk
    for s in (-1, 1):  # uszy, kły
        stroke(img, [(c + s * 2.5, hy + 1), (c + s * 4.5, hy + 4)], 1.6, FUR[0])
        img.put(int(c + s * 1.5 - (1 if s < 0 else 0)), int(hy - 5), CLAW[2])
    # oczy (akcent 2): czerwień żaru, w środku sylwetki
    img.put(int(c - 2), int(hy - 1), EMBER[0])
    img.put(int(c + 1), int(hy - 1), EMBER[0])
    if not run and f == 4:  # przysiad: oczy rozbłyskują (telegraf skoku)
        img.put(int(c - 2), int(hy - 1), EMBER[2])
        img.put(int(c + 1), int(hy - 1), EMBER[2])
    return img


# ---------------- kultysta popiołu (Kiter) ----------------
def pot(img, x, y, r=3.0, lit=True):
    """Żelazne naczynie ze smołą, z góry: obręcz żelaza, smoła w środku, iskra lontu."""
    ellipse(img, x, y, r, r, lambda nx, ny: IRON[2] if nx + ny < -.6 else (IRON[1] if nx * nx + ny * ny > .45 else HELL.deep[1]))
    if lit:
        img.put(int(x), int(y), EMBER[2])
        img.put(int(x) + 1, int(y), EMBER[1])


def cultist_frame(f):
    """Kultysta z góry (przód = N): szata z kapturem, czerwona szarfa, naczynie ze smołą trzymane oburącz.
    f 0–3 chód; f 4–7 rzut: 4 naczynie odchylone w tył, 5 nad głową, 6 wyrzut przed siebie, 7 puste dłonie."""
    img = Img(CELL, CELL)
    c = CELL / 2
    walk = f < 4
    sway = (0, 1, 0, -1)[f] if walk else 0
    cy = c + 2
    # szata (obszerna, rąbek kołysze się w chodzie)
    ellipse(img, c + sway * .5, cy + 1, 8.2, 6.6, band_shade(ROBE))
    for x in range(int(c - 7), int(c + 8)):  # szarfa przez pierś
        y = int(cy - 1 + (x - c) * .35)
        img.put(x, y, BLOOD[1])
        img.put(x, y + 1, BLOOD[0])
    # ręce i naczynie
    if walk:
        hands = ((c - 3, cy - 7), (c + 3, cy - 7))
        pot_at = (c, cy - 9)
    else:
        hands, pot_at = {
            4: (((c + 4, cy + 1), (c + 7, cy - 1)), (c + 8, cy + 2)),
            5: (((c - 2, cy - 4), (c + 2, cy - 4)), (c, cy - 3)),
            6: (((c - 1, cy - 10), (c + 2, cy - 11)), (c + 1, cy - 14)),
            7: (((c - 2, cy - 11), (c + 2, cy - 11)), None),
        }[f]
    for side, (hx, hy) in zip((-1, 1), hands):
        stroke(img, [(c + side * 6, cy - 1), (hx, hy)], 2.4, ROBE[1], edge=ROBE[3])
        img.put(int(hx), int(hy), SKIN[1])
    # kaptur: brzeg szaty, ciemne wnętrze, żarzące się oczy
    hy = cy - 4
    ellipse(img, c, hy, 4.6, 4.3, band_shade(ROBE, light=(-.4, -.6)))
    ellipse(img, c, hy - 1.5, 2.6, 2.2, lambda nx, ny: HOOD_IN[0] if ny < .2 else HOOD_IN[1])
    img.put(int(c - 1), int(hy - 2), EMBER[1])
    img.put(int(c + 1), int(hy - 2), EMBER[1])
    if pot_at:
        pot(img, *pot_at, r=3.0, lit=True)
    return img


# ---------------- bomba smolna (pocisk, bez obrotu) ----------------
def bomb_frame(k):
    img = Img(16, 16)
    pot(img, 8, 8.5, r=4.2, lit=False)
    # iskra lontu na brzegu naczynia migocze (§6c: pełne piksele bez obrysu dorysowane po obrysie)
    outline(img, OUT)
    sparks = (((9, 4), EMBER[2]), ((10, 3), EMBER[1]), ((9, 3), FLAME[3]), ((10, 4), EMBER[1]))
    (x, y), col = sparks[k]
    img.put(x, y, col)
    img.put(9, 5, EMBER[1])
    return img


def build():
    hound, hf = directional_sheet(CELL, hound_frame, 8)
    cultist, cf = directional_sheet(CELL, cultist_frame, 8)
    bomb = Img(64, 16)
    bombs = []
    for k in range(4):
        b = bomb_frame(k)
        bomb.blit(b, k * 16, 0)
        bombs.append((f'c{k}', b))
    return {
        'hellhound_run-pounce.png': (hound, hf, CELL, MARGIN),
        'cultist_walk-throw.png': (cultist, cf, CELL, MARGIN),
        'tar-bomb.png': (bomb, bombs, 16, 1),
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator wrogów Piekła')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 4x')
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
        from PIL import Image
        os.makedirs(a.preview, exist_ok=True)
        for fname, (sheet, _, _, _) in sheets.items():
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, HELL.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

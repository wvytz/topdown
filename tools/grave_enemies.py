"""
Generator wrogów Cmentarzyska (krok 32b): zarażony (wariant Rushera) i siewca (wariant Kitera) — ludzie zatruci
grzybem z Grzybni, którzy zmieniają się w grzybowe zombie. Narzędzia z tower_ruins_tiles.py / spider_sprites.py /
lair_enemies.py; kula siewcy to kula zarodników grzybca (spore-ball.png).

Użycie (z katalogu głównego repozytorium):
  python tools/grave_enemies.py                       # arkusze do public/assets/sprites/
  python tools/grave_enemies.py --preview tools/out   # dodatkowo podglądy 4x na podłodze Cmentarzyska

Arkusze (STYLEGUIDE §2, §8, §10; wiersze = 8 kierunków N..NW z obrotu, obrys po obrocie), komórka 48x48:
  zombie_walk-claw.png   kolumny 0–3 chód (ręce wyciągnięte przed siebie), 4–7 zamach pazurami
                         (cofnięcie, uniesienie, cios, skrzyżowane dłonie w chwili trafienia)
  sower_walk-spit.png    kolumny 0–3 chód, 4–7 plucie (kapelusz nabrzmiewa, kula wylatuje w kolumnie 7)

Czytelność na palecie C „trupia zieleń” (oliwkowa podłoga): rdzawe łachmany i blada, zimna skóra zarażonego;
fioletowy kapelusz siewcy (barwa najdalej od oliwki). Grzybki na barku i świecąca grzybnia: grzyb ledwo tu dociera.
"""
import argparse
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import ok
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8

GRAVE = trt.PALETTES['cmentarz_trupi']
BONE = GRAVE.bone     # grzybki: kapelusz cień → blask
MYCEL = GRAVE.mycel   # strzępka, świecąca końcówka
# Łachmany: rdza (barwa daleko od oliwkowej podłogi), 5 tonów do cieniowania pasmowego.
RAGS = (ok(.26, .050, 28), ok(.32, .062, 30), ok(.38, .072, 32), ok(.45, .074, 36), ok(.53, .070, 40))
# Skóra zmarłego: blada, zimna szarość z błękitem — jaśniejsza od podłogi.
SKIN = (ok(.50, .018, 235), ok(.60, .020, 230), ok(.70, .022, 225), ok(.79, .020, 220), ok(.87, .016, 215))
HAIR = (ok(.20, .015, 40), ok(.27, .018, 40))
# Kapelusz siewcy: fiolet Grzybni (grzyb, który wyrósł zamiast głowy).
CAP = (ok(.30, .085, 308), ok(.39, .105, 310), ok(.48, .115, 312), ok(.58, .105, 316), ok(.70, .080, 320))
GILLS = (ok(.66, .030, 320), ok(.78, .024, 322))
VENOM = (ok(.55, .150, 140), ok(.70, .180, 138), ok(.84, .150, 135))


def shroom(img, cx, cy, r):
    """Mały blady grzybek na ciele (z góry): kapelusz z jaśniejszą plamką."""
    ellipse(img, cx, cy, r, r * .85, lambda nx, ny: BONE[2] if nx + ny < -.5 else (BONE[1] if ny < .4 else BONE[0]))


def torso(img, c, cy, step):
    """Tułów w łachmanach z dziurami, przez które widać skórę; stopy pod spodem (chód naprzemienny)."""
    for side, dy in ((-1, step), (1, -step)):  # stopy
        ellipse(img, c + side * 3.2, cy + 5.5 + dy, 2.2, 2.6, lambda nx, ny: HAIR[1] if ny < 0 else HAIR[0])
    ellipse(img, c, cy + 1, 7.6, 4.9, band_shade(RAGS))
    for x, y in ((c - 3, cy + 2), (c + 2, cy + 3), (c + 4, cy)):  # dziury w łachmanie
        img.put(int(x), int(y), SKIN[1])
    # Grzyb na prawym barku i strzępki ze świecącą końcówką — grzyb ledwo tu dociera.
    shroom(img, c + 6, cy + 2, 2.0)
    shroom(img, c + 4.2, cy + 4.2, 1.4)
    img.put(int(c + 7), int(cy + 5), MYCEL[0])
    img.put(int(c + 8), int(cy + 5), MYCEL[1])


def head(img, c, cy):
    """Głowa z góry: blada skóra, ciemne kępki włosów z tyłu, mały grzybek na ciemieniu."""
    ellipse(img, c, cy, 3.9, 3.7, band_shade(SKIN, light=(-.4, -.6)))
    for x, y in ((c - 2, cy + 2), (c, cy + 3), (c + 2, cy + 2), (c + 1, cy + 1)):
        img.put(int(x), int(y), HAIR[0])
    shroom(img, c - 1.5, cy - .5, 1.3)


# ---------------- zarażony (Rusher) ----------------
def zombie_frame(f):
    """Zarażony w rzucie z góry (przód = N). f 0–3: chód z rękami wyciągniętymi przed siebie (kołysanie ±1 px);
    f 4–7: zamach pazurami — ręce cofnięte, uniesione szeroko, cios do środka, dłonie skrzyżowane przed twarzą."""
    img = trt.Img(CELL, CELL)
    c = CELL / 2
    walk = f < 4
    step = (0, 1, 0, -1)[f] if walk else 0
    cy = c + 1
    lean = (0, 0, -1, -2)[f - 4] if not walk else 0  # w ciosie tułów pochyla się naprzód
    torso(img, c, cy + lean, step)
    if walk:
        sway = step
        hands = ((c - 5 + sway, cy - 10), (c + 5 + sway, cy - 10 - sway))
    else:
        hands = (((c - 8, cy - 4), (c + 8, cy - 4)),
                 ((c - 10, cy - 9), (c + 10, cy - 9)),
                 ((c - 4, cy - 13), (c + 4, cy - 13)),
                 ((c + 1, cy - 13), (c - 1, cy - 14)))[f - 4]
    for side, (hx, hy) in zip((-1, 1), hands):
        shoulder = (c + side * 6.5, cy - 1 + lean)
        stroke(img, [shoulder, (hx, hy)], 2.4, SKIN[1], edge=SKIN[2])
        img.put(int(hx), int(hy), SKIN[4])  # blade palce
        if not walk and f >= 6:  # pazury w chwili ciosu
            img.put(int(hx), int(hy) - 1, SKIN[3])
    head(img, c, cy - 3 + lean)
    return img


# ---------------- siewca (Kiter) ----------------
def sower_frame(f):
    """Siewca: zombie, któremu zamiast głowy wyrósł wielki fioletowy kapelusz (blaszki od przodu),
    ręce zwisają po bokach. f 0–3 chód; f 4–7 plucie — kapelusz nabrzmiewa, przed blaszkami rośnie obłok jadu."""
    img = trt.Img(CELL, CELL)
    c = CELL / 2
    walk = f < 4
    step = (0, 1, 0, -1)[f] if walk else 0
    swell = 0 if walk else (0, 1, 2, 0)[f - 4]
    cy = c + 2
    torso(img, c, cy, step)
    for side in (-1, 1):  # ręce zwisają, lekko kołyszą się w chodzie
        hx, hy = c + side * 8, cy + 3 + (step * side if walk else 0)
        stroke(img, [(c + side * 6.5, cy), (hx, hy)], 2.2, SKIN[1], edge=SKIN[2])
        img.put(int(hx), int(hy), SKIN[3])
    rx, ry = 7 + swell, 6 + swell
    hy = cy - 4
    ellipse(img, c, hy, rx + 1, ry + 1, lambda nx, ny: GILLS[1] if ny < -.2 else GILLS[0])  # blaszki pod kapeluszem
    ellipse(img, c, hy + .5, rx, ry, band_shade(CAP))
    r = random.Random(3200)
    for _ in range(5):  # blade łatki na kapeluszu
        x, y = c + r.uniform(-rx * .6, rx * .6), hy + r.uniform(-ry * .5, ry * .6)
        img.put(int(x), int(y), BONE[1])
    img.put(int(c + 2), int(hy - 2), MYCEL[1])  # świecąca plamka grzybni
    if not walk and f >= 5:  # obłok zarodników przed blaszkami (kolumny 5–7)
        rr = (0, 1.6, 2.2, 2.6)[f - 4]
        front = hy - ry - 1.5
        ellipse(img, c, front - rr * .6, rr + .8, rr, lambda nx, ny: VENOM[2] if nx + ny < -.4 else VENOM[1])
    return img


def build():
    zombie, zf = directional_sheet(CELL, zombie_frame, 8)
    sower, sf = directional_sheet(CELL, sower_frame, 8)
    return {
        'zombie_walk-claw.png': (zombie, zf, CELL, MARGIN),
        'sower_walk-spit.png': (sower, sf, CELL, MARGIN),
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator wrogów Cmentarzyska')
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
            bg = Image.new('RGBA', im.size, GRAVE.floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

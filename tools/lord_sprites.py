"""
Generator bossa Cmentarzyska „Wampirzy Lord” (krok 33): zainfekowany arystokrata, który hoduje zombiaki
w kokonach i je zjada. Pomysł właściciela: nie typowy wampir, zamiast głowy wielka szczęka, w ręce tasak.
Narzędzia i rampy z tower_ruins_tiles.py / spider_sprites.py (obrót co 45°, obrys po obrocie).

Użycie (z katalogu głównego repozytorium):
  python tools/lord_sprites.py                       # arkusz do public/assets/sprites/
  python tools/lord_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze Cmentarzyska

Arkusz (STYLEGUIDE §2, §8, §10), komórka 112x112, 8 kierunków (wiersze N..NW), przód = N:
  vampire-lord_walk-cleave-bite.png
    kolumny 0–3   chód: płaszcz z wysokim kołnierzem faluje, buty spod płaszcza
    kolumny 4–7   cios tasakiem: tasak za bark, zamach w bok, cięcie łukiem przed sobą, wybrzmienie
    kolumny 8–11  kąsanie: szczęka rozwiera się, wypad naprzód, kłapnięcie, powrót

Wygląd: wychudzony arystokrata w podartym, winnym płaszczu z wysokim kołnierzem (sylwetka wampira), czarny surdut
ze śniedziałym złotym obszyciem. Zamiast głowy wielka, zainfekowana szczęka: kościana żuchwa w kształcie podkowy
otwarta do przodu, dziąsła, rzędy zębów, a na karku grzybnia ze świecącymi końcówkami (grzyb z Grzybni).
W prawej ręce tasak (żelazo, rdzawe zacieki), lewa dłoń szponiasta.
"""
import argparse
import math
import random
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import ok
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
LORD = 112
MARGIN = 8
C = LORD // 2

GRAVE = trt.PALETTES['cmentarz_trupi']
BONE = GRAVE.bone
MYCEL = GRAVE.mycel
GOLD = trt.GOLD
IRON = trt.IRON
# Płaszcz: głębokie wino (barwa daleko od oliwkowej podłogi), podszewka karmazynowa.
CAPE = (ok(.20, .060, 15), ok(.26, .080, 18), ok(.33, .100, 20), ok(.41, .110, 22), ok(.50, .100, 25))
LINING = (ok(.36, .130, 22), ok(.45, .140, 25))
# Surdut: prawie czarny fiolet.
COAT = (ok(.16, .016, 300), ok(.22, .020, 300), ok(.29, .022, 300), ok(.37, .022, 300), ok(.46, .020, 300))
SKIN = (ok(.50, .018, 235), ok(.60, .020, 230), ok(.70, .022, 225), ok(.79, .020, 220), ok(.87, .016, 215))
GUMS = (ok(.40, .110, 15), ok(.50, .130, 18), ok(.60, .120, 20))
MAW = ok(.14, .040, 15)
RUST = ok(.38, .090, 32)
BOOT = (ok(.18, .012, 40), ok(.26, .014, 40))


def cape(img, sway):
    """Płaszcz spływa za postacią (na S): od barków rozkloszowany, trzy szerokie fałdy (jasna strona fałdy od
    lewej), nieregularnie postrzępiony dół falujący przy chodzie. Krawędzie odsłaniają karmazynową podszewkę."""
    top, bottom = C - 6, C + 24
    r = random.Random(3300)
    teeth = [r.choice((0, 1, 2, 3, 4, 6)) for _ in range(LORD)]
    for y in range(top, bottom + 1):
        t = (y - top) / (bottom - top)
        half = 16 + 10 * t * t
        shift = sway * t
        for x in range(int(C - half - 2), int(C + half + 3)):
            dx = x + .5 - (C + shift)
            if abs(dx) > half or y > bottom - teeth[x] * t:
                continue
            u = (dx + half) / (2 * half)          # 0..1 w poprzek płaszcza
            phase = (u * 3) % 1                   # trzy fałdy
            if abs(dx) > half - 1.5:
                c = LINING[0] if dx < 0 else CAPE[0]
            elif t < .12:
                c = CAPE[3]
            elif phase < .18:
                c = CAPE[0]                       # cień w zagłębieniu fałdy
            elif phase < .55:
                c = CAPE[2] if u < .5 else CAPE[1]
            else:
                c = CAPE[1]
            img.put(x, y, c)
    for side in (-1, 1):  # wysoki kołnierz: dwa skrzydła za karkiem
        stroke(img, [(C + side * 10, C - 6), (C + side * 17, C - 15), (C + side * 15, C - 22)], 3.6, CAPE[2], edge=CAPE[4])
        stroke(img, [(C + side * 11, C - 8), (C + side * 15, C - 17)], 1.6, LINING[1])


def coat(img, lean=0):
    """Barki i tułów w czarnym surducie ze złotym obszyciem."""
    ellipse(img, C, C - 3 + lean, 16, 8.5, band_shade(COAT))
    for x in range(int(C - 14), int(C + 15)):  # obszycie wzdłuż barków
        y = C - 3 + lean - round(7.9 * math.sqrt(max(0, 1 - ((x + .5 - C) / 16) ** 2)))
        img.put(x, y + 1, GOLD[1] if x % 3 else GOLD[2])
    for y in range(int(C - 6 + lean), int(C + 3 + lean)):  # zapięcie
        img.put(int(C), y, GOLD[0])


def jaw(img, cy, gape):
    """Szczęka zamiast głowy: kościana żuchwa-podkowa otwarta do przodu (N), dziąsła i zęby; z tyłu grzybnia.
    gape 0–1: rozwarcie (0 = zamknięta, 1 = szeroko otwarta)."""
    rx, ry = 11 + 2 * gape, 9 + 2 * gape
    # tył szczęki i kark porośnięty grzybnią
    ellipse(img, C, cy + 3, 9, 6, band_shade(COAT))
    ellipse(img, C, cy, rx, ry, lambda nx, ny: BONE[2] if nx + ny < -.7 else (BONE[1] if ny < .45 else BONE[0]))
    for side in (-1, 1):  # zawiasy żuchwy wystające po bokach
        ellipse(img, C + side * (rx - 1), cy + 2, 3, 3.5, lambda nx, ny: BONE[1] if ny < 0 else BONE[0])
    # paszcza: otwarta ku przodowi
    mw, mh = rx - 3.2, ry - 3 + gape * 1.5
    ellipse(img, C, cy - 1.5 - gape, mw, mh, lambda nx, ny: GUMS[1] if nx * nx + ny * ny > .55 else (GUMS[0] if ny > 0 else MAW))
    # zęby wzdłuż wewnętrznej krawędzi dziąseł
    for i in range(14):
        a = math.pi * (i / 13) + math.pi  # górny łuk (przód)
        for k, (sx, sy) in enumerate(((math.cos(a), math.sin(a)), (math.cos(a), -math.sin(a) * .6))):
            x = C + sx * (mw - 1.2)
            y = cy - 1.5 - gape + sy * (mh - 1.2)
            img.put(int(x), int(y), BONE[2] if k == 0 else BONE[1])
    for i in (2, 5, 8, 11):  # wielkie kły na przednim łuku, sterczą na zewnątrz
        a = math.pi * (i / 13) + math.pi
        x0, y0 = C + math.cos(a) * (mw - .5), cy - 1.5 - gape + math.sin(a) * (mh - .5)
        stroke(img, [(x0, y0), (x0 + math.cos(a) * 3, y0 + math.sin(a) * 3)], 1.6, BONE[2])
    # grzybnia na karku: strzępki ze świecącymi końcówkami i dwa blade grzybki
    for ox, length in ((-6, 4), (-2, 6), (3, 5), (7, 3)):
        for j in range(length):
            img.put(int(C + ox + (j % 2)), int(cy + 7 + j), MYCEL[0])
        img.put(int(C + ox), int(cy + 7 + length), MYCEL[1])
    for gx, gy, r in ((C + 7, cy + 5, 1.8), (C - 8, cy + 4, 1.4)):
        ellipse(img, gx, gy, r, r * .85, lambda nx, ny: BONE[2] if nx + ny < -.5 else BONE[1])


def cleaver(img, hand, angle):
    """Tasak: krótki trzonek i szerokie prostokątne ostrze w kierunku `angle` (rad, 0 = N); ostrze po prawej."""
    dx, dy = math.sin(angle), -math.cos(angle)  # kierunek ostrza
    px, py = -dy, dx                            # prostopadle (strona ostrza)
    hx, hy = hand
    stroke(img, [(hx - dx * 3, hy - dy * 3), (hx + dx * 3, hy + dy * 3)], 2.2, BOOT[1])  # trzonek
    for y in range(LORD):
        for x in range(LORD):
            rx, ry = x + .5 - hx, y + .5 - hy
            along = rx * dx + ry * dy
            side = rx * px + ry * py
            if 3 <= along <= 25 and -1 <= side <= 9:
                if side >= 8:
                    c = IRON[2]  # naostrzona krawędź
                elif along > 20 and side > 3:
                    c = RUST  # rdzawy zaciek przy czubku
                else:
                    c = IRON[1] if side > 1 else IRON[0]
                img.put(x, y, c)


def claw_hand(img, shoulder, hand):
    stroke(img, [shoulder, hand], 3.0, COAT[2], edge=COAT[3])  # rękaw
    hx, hy = hand
    ellipse(img, hx, hy, 2.2, 2.2, band_shade(SKIN))
    for ox in (-2, 0, 2):  # długie szpony
        stroke(img, [(hx + ox, hy - 1), (hx + ox * 1.3, hy - 5)], 1.0, SKIN[3])


# Pozy ręki z tasakiem: (dłoń, kąt ostrza)
CLEAVER_WALK = ((C + 19, C - 12), math.radians(10))
CLEAVER_POSES = (
    ((C + 18, C + 3), math.radians(160)),   # 4: tasak za barkiem, ostrze w tył
    ((C + 14, C - 6), math.radians(75)),    # 5: zamach w bok
    ((C + 6, C - 26), math.radians(-60)),   # 6: cięcie łukiem przed sobą
    ((C - 16, C - 18), math.radians(-120)), # 7: wybrzmienie po lewej
)


def lord_frame(f):
    img = trt.Img(LORD, LORD)
    walk = f < 4
    cleave = 4 <= f < 8
    bite = f >= 8
    step = (0, 1, 0, -1)[f] if walk else 0
    gape = (0, 0, 0, 0)[f] if walk else ((.2, .3, .1, .2)[f - 4] if cleave else (.6, 1.0, .1, .3)[f - 8])
    lunge = (0, 4, 6, 2)[f - 8] if bite else 0
    lean = (0, 0, -2, -1)[f - 4] if cleave else -lunge // 2
    for side, dy in ((-1, step), (1, -step)):  # buty spod płaszcza
        ellipse(img, C + side * 6, C + 9 + dy * 2, 3, 4, lambda nx, ny: BOOT[1] if ny < 0 else BOOT[0])
    cape(img, step * 2)
    coat(img, lean)
    # lewa ręka ze szponami
    left = (C - 20, C - 12 - (lunge * 1.5 if bite else 0)) if not cleave else (C - 18, C - 6)
    claw_hand(img, (C - 13, C - 4 + lean), left)
    # prawa ręka z tasakiem
    hand, angle = CLEAVER_POSES[f - 4] if cleave else CLEAVER_WALK
    if walk:
        hand = (hand[0], hand[1] + step)
    stroke(img, [(C + 13, C - 4 + lean), hand], 3.0, COAT[2], edge=COAT[3])
    cleaver(img, hand, angle)
    ellipse(img, hand[0], hand[1], 2.2, 2.2, band_shade(SKIN))
    jaw(img, C - 15 + lean - lunge, gape)
    # pojedyncze piksele bez sąsiadów (ząbki płaszcza) dałyby po obrysie „krzyżyki”
    lone = [(x, y) for y in range(LORD) for x in range(LORD) if img.p[y][x][3]
            and not any((img.get(x + dx, y + dy) or (0, 0, 0, 0))[3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in lone:
        img.put(x, y, (0, 0, 0, 0))
    return img


def build():
    sheet, frames = directional_sheet(LORD, lord_frame, 12)
    return {'vampire-lord_walk-cleave-bite.png': (sheet, frames, LORD, MARGIN)}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Wampirzego Lorda (Cmentarzysko)')
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
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

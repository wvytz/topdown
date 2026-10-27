"""
Generator bossów Lustrzanej komnaty — dwóch Sprzątaczek (propozycja do oceny właściciela, koncept: docs/SPRZATACZKI.md).
Młode, szczupłe kobiety we wspólnym modelu: czarne legginsy i obcisła czarna bluzka, żółte gumowe rękawice, białe trampki,
zwykła miotła z czarnym włosiem i plastikowe wiadro. Polerują posadzkę tak długo, że świeci.
  - Blondynka (piętro A): trochę wyższa (skala 1,10), kucyk, czerwony plastikowy trzonek, niebieskie wiadro.
  - Brunetka (piętro B): czarny warkocz, drewniany trzonek, czerwone wiadro.

Użycie (z katalogu głównego repozytorium):
  python tools/cleaner_sprites.py                       # arkusze do public/assets/sprites/
  python tools/cleaner_sprites.py --preview tools/out   # dodatkowo podgląd 2x na tonie lustrzanej posadzki

cleaner-{blonde,dark}_walk-polish-spill-bucket-broom-tangle-shout.png (3584x1024, komórka 128x128, pivot 64,64,
  8 kierunków z obrotu): kolumny 0–3 chód, 4–7 polerowanie (miotła zamiata na boki), 8–11 chlust z wiadra (zamach,
  przechył, chlust, powrót), 12–15 wiadro na sznurze (zamach, rzut — dłoń trzyma sam sznur, ściąganie z odchyleniem,
  złapanie), 16–19 cios miotłą (zamach za plecy, cięcie z boku, uderzenie, powrót), 20–23 plątanie (miotła pionowo,
  wbicie w posadzkę, włosie się rozchodzi, trzymanie), 24–27 krzyk (dłonie przy ustach, pochylenie — napis rysuje gra).
cleaner-{blonde,dark}_death.png (1024x1024, komórka 128): 8 klatek bez pętli — 0 poślizg na mokrym, 1 lot do tyłu,
  2 uderzenie o posadzkę, 3–7 leży, przewrócone wiadro rozlewa wodę, miotła obok.
soap-puddle.png (768x96, komórka 96): rozlana woda — 0–5 kałuża rośnie (promień = strefa poślizgu w grze), 6–7 połysk w pętli.
water-splash.png (128x32): chlust przy uderzeniu wody / wiadra, 4 klatki bez pętli.
plastic-bucket.png (192x24, komórka 24): wiadro w locie — 0–3 niebieskie (blondynka), 4–7 czerwone (brunetka), obrót
  co 90° (sznur rysuje gra linią od dłoni).
broom-tangle.png (384x48, komórka 48): czarne włosie oplata stopy bohatera — 0–3 wyrasta, 4–5 trzyma (pętla), 6–7 pęka.
polish-sparkle.png (64x16, komórka 16): błysk wypolerowanej posadzki pod miotłą, 4 klatki.
Dominująca cecha: jasny kucyk / czarny warkocz za głową + miotła; akcenty: żółte rękawice i błękit wody.
"""
import argparse
import math
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, strip_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 128
C = CELL / 2

# Obcisły strój i legginsy: czerń z chłodnym połyskiem (jasne pasma czytają się na lustrzanej posadzce).
SUIT = (ok(.15, .010, 280), ok(.19, .012, 280), ok(.24, .014, 280), ok(.32, .018, 280), ok(.42, .020, 275))
SKIN = (ok(.60, .060, 50), ok(.70, .065, 55), ok(.79, .060, 60), ok(.86, .045, 66))
GLOVE = (ok(.66, .140, 92), ok(.78, .160, 98), ok(.88, .120, 102))  # akcent: żółte gumowe rękawice
SHOE = (ok(.70, .008, 250), ok(.84, .008, 250), ok(.93, .006, 250))  # białe trampki (bez czystej bieli)
BRISTLE = (ok(.13, .010, 280), ok(.19, .012, 280), ok(.27, .014, 280))  # czarne włosie miotły
WATER = (ok(.48, .070, 220), ok(.60, .090, 214), ok(.73, .085, 208), ok(.86, .045, 205), ok(.94, .015, 200))
SHOUT = ok(.94, .010, 95)  # kreski krzyku przed twarzą
OPAL = (ok(.90, .060, 350), ok(.90, .060, 200), ok(.86, .065, 300), ok(.93, .065, 95))
FLOOR = ok(.80, .020, 244)  # tło podglądu: ton posadzki lustrzanej komnaty

VARIANTS = {
    'blonde': {
        'scale': 1.85,  # „ciut wyższa”
        'hair': (ok(.58, .095, 82), ok(.70, .115, 88), ok(.81, .110, 93), ok(.90, .075, 97)),
        'style': 'ponytail',
        'handle': (ok(.40, .150, 25), ok(.50, .170, 28), ok(.61, .160, 32)),  # czerwony plastik
        'bucket': (ok(.40, .120, 252), ok(.50, .140, 250), ok(.62, .130, 246), ok(.73, .100, 242)),
    },
    'dark': {
        'scale': 1.7,
        'hair': (ok(.12, .012, 275), ok(.19, .018, 272), ok(.28, .026, 266), ok(.42, .034, 258)),
        'style': 'braid',
        'handle': (ok(.30, .055, 55), ok(.40, .070, 58), ok(.50, .075, 62)),  # drewno
        'bucket': (ok(.38, .130, 25), ok(.48, .155, 28), ok(.58, .150, 32), ok(.68, .120, 38)),
    },
}


def vec(angle_deg):
    """Kierunek w przestrzeni lokalnej (0° = N, zgodnie z ruchem wskazówek zegara)."""
    a = math.radians(angle_deg)
    return math.sin(a), -math.cos(a)


def broom(img, hand, angle, v, s, splay=1.0, front=10, back=4):
    """Zwykła miotła: trzonek przez dłoń, z przodu plastikowa główka i wachlarz czarnego włosia."""
    H = v['handle']
    dx, dy = vec(angle)
    px, py = -dy, dx
    a = (hand[0] + dx * front * s, hand[1] + dy * front * s)
    b = (hand[0] - dx * back * s, hand[1] - dy * back * s)
    stroke(img, [b, a], 1.6 * s, H[1], edge=H[2])
    for i in range(-int(3.6 * s * (0.8 + .2 * splay)), int(3.6 * s * (0.8 + .2 * splay)) + 1):  # włosie
        t = i / (3.6 * s)
        length = (4.2 + (abs(i) % 2) * .6) * s
        fan = t * splay * 2.2 * s
        p0 = (a[0] + px * i * .75, a[1] + py * i * .75)
        p1 = (p0[0] + dx * length + px * fan, p0[1] + dy * length + py * fan)
        stroke(img, [p0, p1], 1.3, BRISTLE[1] if i % 2 else BRISTLE[0])
        img.put(int(p0[0] + dx * 1.5), int(p0[1] + dy * 1.5), BRISTLE[2])
    for i in range(-int(3.4 * s), int(3.4 * s) + 1):  # plastikowa główka w kolorze trzonka
        for j in (0, 1):
            img.put(int(a[0] + px * i * .8 + dx * j), int(a[1] + py * i * .8 + dy * j), H[0] if j else H[2])
    return a


def bucket(img, x, y, v, s, tilt=0.0, handle=True):
    """Plastikowe wiadro z góry: gruby kolorowy rant, w środku mydliny z pianą; `tilt` spłaszcza otwór."""
    B = v['bucket']
    r = 4.6 * s / 1.25
    ellipse(img, x, y, r, r, band_shade(B + (B[3],), light=(-.4, -.5)))
    ellipse(img, x, y - tilt * 2, r - 1.6, (r - 1.6) * (1 - tilt * .45),
            lambda nx, ny: WATER[3] if nx + ny < -.6 else (WATER[2] if ny < .3 else WATER[1]))
    for bx, by in ((-2, -1), (1, -2)):
        img.put(int(x + bx), int(y + by - tilt * 2), WATER[4])
    if handle:  # cienki pałąk
        for k in range(-int(r), int(r) + 1):
            img.put(int(x + k), int(y + r + 1 + (r * r - k * k) * .06), B[0])


def figure(img, f, v, death_pose=None):
    """Sprzątaczka na N, rysowana w jednostkach lokalnych × skala wariantu. death_pose: None | 'slip'."""
    s = v['scale']
    k = f % 4
    walk = f < 4
    polish = 4 <= f < 8
    spill = 8 <= f < 12
    pull = 12 <= f < 16
    strike = 16 <= f < 20
    tangle = 20 <= f < 24
    shout = f >= 24
    st = (0, 1, 0, -1)[k] if walk else 0
    lean = 0
    if pull:
        lean = (2, -2, 3, 0)[k]
    if strike:
        lean = (2, 0, -3, -1)[k]
    if tangle:
        lean = (0, -2, -2, -1)[k]
    if shout:
        lean = (-1, -3, -3, -2)[k]
    cy = C + 4
    P = lambda x, y: (C + x * s, cy + (y + lean) * s)

    # nogi: legginsy od bioder do trampek (krok przód-tył), smukłe
    feet = [(-3.2, -3 - st * 3.5), (3.2, -3 + st * 3.5)]
    if strike or tangle:
        feet = [(-4.5, -6), (4, 1)]  # wykrok
    if death_pose == 'slip':
        feet = [(-3, -12), (4, -2)]  # noga ucieka do przodu
    for fx, fy in feet:
        stroke(img, [P(fx * .7, 2), P(fx, fy)], 3.0 * s, SUIT[2], edge=SUIT[3])
        ellipse(img, *P(fx, fy - 1.5), 1.8 * s, 2.6 * s, lambda nx, ny: SHOE[2] if ny < -.2 else SHOE[1])
    # biodra i tułów: wąskie, obcisła bluzka (jasny pas połysku po stronie światła)
    ellipse(img, *P(0, 2.5), 5.8 * s, 3.8 * s, band_shade(SUIT))
    ellipse(img, *P(0, .5), 9.5 * s, 5.4 * s, band_shade(SUIT, light=(-.5, -.7)))
    for side in (-1, 1):  # ramiona: jaśniejsze szwy obcisłej bluzki oddzielają głowę od tułowia
        stroke(img, [P(side * 4.5, -1.5), P(side * 8, -.5)], 1.0, SUIT[4])

    # dłonie: prawa — miotła, lewa — wiadro
    rh, lh = (9, -3 + st), (-10, 1 - st)
    b_angle, splay, broom_hand = 25, 0.6, None
    bucket_on, tilt = True, 0.0
    if polish:
        b_angle = (-25, 5, 35, 5)[k]
        rh = ((6, -6), (8, -7), (10, -6), (8, -7))[k]
        splay = 1.0
    if spill:
        lh = ((-10, 4), (-8, -5), (-4, -11), (-9, -2))[k]
        tilt = (0.1, 0.6, 1.0, 0.1)[k]
    if pull:
        lh = ((-12, 7), (-3, -14), (-8, -5), (-10, -1))[k]
        bucket_on = k in (0, 3)
    if strike:
        b_angle = (150, 80, 0, 30)[k]
        rh = ((7, 3), (9, -4), (3, -9), (8, -6))[k]
        lh = (rh[0] - 4, rh[1] + 2)
        splay = (0.4, 0.6, 1.6, 0.9)[k]
        bucket_on = False
    if tangle:
        b_angle = 0
        rh = ((2, -8), (1, -10), (1, -10), (1, -10))[k]
        lh = (rh[0] - 3, rh[1] + 3)
        splay = (0.6, 2.0, 2.6, 2.3)[k]
        bucket_on = False
    if shout:
        rh, lh = (3, -8), (-3, -8)
        bucket_on = False
        b_angle = 160  # miotła oparta o ramię, włosiem do tyłu
    if death_pose == 'slip':
        rh, lh = (11, -9), (-12, -8)  # ręce wymachują
        bucket_on = False
    # ramiona: cienkie, czarne rękawy, żółte rękawice
    for shoulder, hand in ((P(-8, 0), P(*lh)), (P(8, 0), P(*rh))):
        mid = ((shoulder[0] + hand[0]) / 2 + (2 if hand[0] > shoulder[0] else -2), (shoulder[1] + hand[1]) / 2 + 2)
        stroke(img, [shoulder, mid, hand], 2.4 * s, SUIT[2], edge=SUIT[3])
    if death_pose != 'slip':
        if shout:
            broom(img, P(8, 0), b_angle, v, s, 0.5, front=12, back=4)
        else:
            broom(img, P(*rh), b_angle, v, s, splay)
    for hand in (P(*lh), P(*rh)):
        ellipse(img, hand[0], hand[1], 1.9 * s, 1.9 * s, lambda nx, ny: GLOVE[2] if nx + ny < -.3 else GLOVE[1])
    if bucket_on:
        bucket(img, P(*lh)[0] - s, P(*lh)[1] - 3 * s, v, s, tilt)
    if pull and not bucket_on:  # dłoń ściska sznur — w grze sznur ciągnie się do wiadra
        hx, hy = P(*lh)
        for i in range(2, 10):
            img.put(int(hx + (.2 if k == 2 else 0) * i), int(hy - i), v['handle'][0])
    if spill and k >= 2:  # chlust mydlin przed sobą
        for i in range(5 if k == 2 else 3):
            x, y = P(-4 + i * 1.8, -16 - i * 2.4)
            ellipse(img, x, y, 2.6 + i * .4, 2.0 + i * .3, lambda nx, ny: WATER[3] if nx + ny < -.3 else WATER[2])
            img.put(int(x), int(y - 1), WATER[4])

    # głowa: włosy z przodkiem (twarz widać tylko od czoła w dół), kucyk albo warkocz za głową
    H = v['hair']
    sway = (0, 1.2, 0, -1.2)[k] if (walk or polish) else ((0, 1, 1, 0)[k] if shout else 0)
    if v['style'] == 'ponytail':
        for i in range(6):  # kucyk: gruby u gumki, zwęża się ku końcowi, jasne pasma po stronie światła
            x, y = P(sway * i * .28, 4.2 + i * 1.7)
            w = (2.4 - i * .3) * s
            ellipse(img, x, y, w, 1.4 * s, lambda nx, ny: H[3] if nx < -.4 else (H[2] if nx < .3 else H[1]))
        ellipse(img, *P(sway * 1.7, 14.2), .9 * s, 1.2 * s, lambda nx, ny: H[0])
    else:
        for i in range(6):  # warkocz: splecione ogniwa
            x, y = P(sway * i * .25, 4 + i * 2.1)
            ellipse(img, x, y, (2.1 - i * .12) * s, 1.3 * s, lambda nx, ny: H[3] if nx < -.2 else (H[1] if ny < .3 else H[0]))
        ellipse(img, *P(sway * 1.5, 16.6), 1.1 * s, 1.4 * s, lambda nx, ny: H[0])
    hx, hy = P(0, -1)
    ellipse(img, hx, hy - 1.9 * s, 3.2 * s, 2.4 * s, lambda nx, ny: SKIN[2] if nx < .3 else SKIN[1])  # twarz z przodu
    ellipse(img, hx, hy, 4.2 * s, 4.1 * s, band_shade(H + (H[3],), light=(-.45, -.35)))  # czubek głowy
    for i in range(-3, 4):  # przedziałek i pasma
        img.put(int(hx + i * s * .9), int(hy + (2 if i % 2 else 1) * s), H[0])
    img.put(int(hx), int(hy - 1 * s), H[0])
    if v['style'] == 'ponytail':  # gumka do włosów w kolorze rękawic
        x, y = P(0, 3.6)
        for dx in (-1, 0, 1):
            img.put(int(x + dx), int(y), GLOVE[0])
    img.put(int(hx), int(hy - 5.9 * s), SKIN[0])  # nos przy krawędzi
    if shout and k in (1, 2):  # krzyk: kreski przed twarzą (napis dorysuje gra)
        for side in (-1, 0, 1):
            for i in range(3):
                img.put(int(hx + side * (3 + i) * s), int(hy - (9 + i * 1.4) * s + abs(side) * 2), SHOUT)
    return img


def frame_fn(v):
    return lambda f: figure(Img(CELL, CELL), f, v)


# ---------------- śmierć: poślizg na mokrym i upadek na plecy ----------------
def puddle_blob(img, cx, cy, r, seed):
    rr = random.Random(seed)
    ph = [rr.uniform(0, math.tau) for _ in range(2)]
    for y in range(img.h):
        for x in range(img.w):
            dx, dy = (x + .5 - cx) / r, (y + .5 - cy) / (r * .8)
            a = math.atan2(dy, dx)
            d = math.hypot(dx, dy) / (1 + .12 * math.sin(3 * a + ph[0]) + .07 * math.sin(5 * a + ph[1]))
            if d <= 1:
                img.put(x, y, WATER[3] if d > .88 else (WATER[2] if (x - y) % 9 else WATER[3]))


def lying(img, v, s, squash=1.0, puddle=0):
    """Leży na plecach: głowa na S (upadła do tyłu), nogi do przodu, ręce rozrzucone, włosy rozsypane."""
    cy = C + 2
    P = lambda x, y: (C + x * s, cy + y * s * squash)
    if puddle:  # przewrócone wiadro przy lewej dłoni, woda rozlewa się pod nią
        puddle_blob(img, *P(-9, -4), puddle * s, 9700 + puddle)
    H = v['hair']
    for i in range(9):  # rozsypane włosy wokół głowy
        a = math.radians(-60 + i * 15 + 90)
        stroke(img, [P(0, 13), P(math.cos(a) * 7, 13 + math.sin(a) * 6)], 2.2 * s, H[1 + i % 3])
    for fx in (-3, 3):  # nogi w legginsach, trampki czubkami do góry
        stroke(img, [P(fx * .6, 3), P(fx * 1.2, -10)], 3.0 * s, SUIT[2], edge=SUIT[3])
        ellipse(img, *P(fx * 1.2, -11.5), 2.2 * s, 1.8 * s, lambda nx, ny: SHOE[2] if ny < 0 else SHOE[1])
    ellipse(img, *P(0, 2), 5.4 * s, 4 * s, band_shade(SUIT))  # biodra
    ellipse(img, *P(0, 7), 7.5 * s, 4.6 * s, band_shade(SUIT, light=(-.5, -.7)))  # tułów
    for side in (-1, 1):  # rozrzucone ręce
        hand = P(side * 13, 4)
        stroke(img, [P(side * 6, 7), P(side * 10, 8), hand], 2.4 * s, SUIT[2], edge=SUIT[3])
        ellipse(img, hand[0], hand[1], 1.9 * s, 1.9 * s, lambda nx, ny: GLOVE[1])
    ellipse(img, *P(0, 12.5), 4.4 * s, 4.2 * s, lambda nx, ny: SKIN[2] if ny < .1 else SKIN[1])  # twarz do góry
    for side in (-1, 1):  # zamknięte oczy
        img.put(int(P(side * 1.6, 12)[0]), int(P(0, 12)[1]), SKIN[0])
    ellipse(img, *P(0, 14.6), 4.2 * s, 2.0 * s, band_shade(H + (H[3],)))  # włosy przy czole


def death_frame(v):
    s = v['scale']

    def fn(f):
        img = Img(CELL, CELL)
        if f == 0:
            return figure(img, 0, v, death_pose='slip')
        if f >= 2:  # miotła leży obok, wiadro przewrócone
            broom(img, (C + 13 * s, C - 4 * s), 200, v, s, 0.5, front=12, back=5)
        lying(img, v, s, squash=(0.7 if f == 1 else 1.0), puddle=(0, 0, 0, 5, 7, 8, 9, 9)[f])
        if f >= 3:
            bucket(img, C - 12 * s, C - 5 * s, v, s, tilt=0.9, handle=False)
        if f == 2:  # uderzenie: plusk dookoła
            for i in range(8):
                a = i * math.tau / 8
                img.put(int(C + math.cos(a) * 15 * s), int(C + 4 + math.sin(a) * 12 * s), WATER[3])
        return img
    return fn


# ---------------- efekty ataków ----------------
PUDDLE = 96
# Promienie klatek = promień strefy poślizgu w grze (do wpisania w config bossa: 16 → 44 px).
PUDDLE_RADII = (16, 22, 28, 34, 40, 44, 44, 44)


def puddle_frame(f):
    """Rozlane mydliny (96x96): jasny błękit z pianą na brzegu; 0–5 rośnie, 6–7 połysk przesuwa się (pętla)."""
    img = Img(PUDDLE, PUDDLE)
    c = PUDDLE / 2
    rad = PUDDLE_RADII[f]
    r = random.Random(9610)
    lobes = [(r.uniform(0, math.tau), r.uniform(.05, .12)) for _ in range(3)]
    shine = (f - 6) * 4 if f >= 6 else 0
    for y in range(PUDDLE):
        for x in range(PUDDLE):
            dx, dy = (x + .5 - c) / rad, (y + .5 - c) / (rad * .86)
            a = math.atan2(dy, dx)
            reach = 1 + sum(w * math.sin((i + 2) * a + ph) for i, (ph, w) in enumerate(lobes))
            d = math.hypot(dx, dy) / reach
            if d > 1:
                continue
            if d > .9:
                col = WATER[3] if (x * 3 + y * 5) % 7 < 3 else WATER[2]  # piana na brzegu
            elif d > .78:
                col = WATER[2]
            else:
                col = WATER[1]
                if (x - y + shine) % 23 in (0, 1) and d < .7:  # ukośne pasy połysku
                    col = WATER[3]
            img.put(x, y, col)
    for _ in range(4 + f):  # bąble piany
        a, d = r.uniform(0, math.tau), r.uniform(.2, .85)
        bx, by = int(c + math.cos(a) * d * rad), int(c + math.sin(a) * d * rad * .86)
        img.put(bx, by, WATER[4])
        img.put(bx + 1, by, WATER[3])
    return img


def splash_frame(k):
    """Chlust (32x32): krople rozpryskują się promieniście i opadają."""
    img = Img(32, 32)
    rad = (4, 8, 11, 12)[k]
    for i in range(10):
        a = i * math.tau / 10 + (.3 if i % 2 else 0)
        d = rad * (1 if i % 2 else .7)
        size = (2.6, 2.2, 1.6, 1.0)[k]
        ellipse(img, 16 + math.cos(a) * d, 16 + math.sin(a) * d, size, size,
                lambda nx, ny: WATER[3] if nx + ny < 0 else WATER[2])
    if k < 2:
        ellipse(img, 16, 16, 5 - k * 2, 5 - k * 2, lambda nx, ny: WATER[3] if nx + ny < -.2 else WATER[1])
    return img


def bucket_frame(col):
    """Wiadro w locie (24x24): 0–3 niebieskie, 4–7 czerwone; obraca się co 90°, chlapie kroplami."""
    v = VARIANTS['blonde' if col < 4 else 'dark']
    k = col % 4
    src = Img(24, 24)
    bucket(src, 12, 11, v, 1.25 * 5.6 / 4.6)
    img = Img(24, 24)
    for y in range(24):
        for x in range(24):
            dx, dy = x - 11.5, y - 11.5
            for _ in range(k):
                dx, dy = -dy, dx
            cc = src.get(round(11.5 + dx), round(11.5 + dy))
            if cc and cc[3]:
                img.put(x, y, cc)
    img.put(3 + k * 2, 3, WATER[3])
    img.put(20, 4 + k * 3, WATER[2])
    return img


def tangle_frame(f):
    """Plątanie (48x48): czarne włosie miotły wyrasta z posadzki wokół stóp (środek wolny na bohatera)."""
    img = Img(48, 48)
    c = 24
    grow = (.3, .55, .8, 1.0, 1.0, 1.0, .9, .6)[f]
    wiggle = (0, 0, 0, 0, .25, -.25, 0, 0)[f]
    broken = f >= 6
    r = random.Random(9640)
    for i in range(12):
        a = i * math.tau / 12 + r.uniform(-.2, .2)
        base = (c + math.cos(a) * 15, c + math.sin(a) * 15)
        bend = a + 2.2 + wiggle  # zagięte do środka — oplatają nogi
        L = 11 * grow
        mid = (base[0] + math.cos(a + math.pi) * L * .5, base[1] + math.sin(a + math.pi) * L * .5)
        tip = (mid[0] + math.cos(bend) * L * .55, mid[1] + math.sin(bend) * L * .55)
        if broken and i % 3 == 0:  # pęknięte włosie: tylko kikut
            stroke(img, [base, mid], 1.6, BRISTLE[1])
            continue
        stroke(img, [base, mid, tip], 1.6, BRISTLE[1], edge=BRISTLE[2])
        img.put(int(base[0]), int(base[1]), BRISTLE[0])
    for i in range(12):  # okruchy połysku u podstawy
        a = i * math.tau / 12 + .26
        img.put(int(c + math.cos(a) * 17), int(c + math.sin(a) * 17), OPAL[i % 4])
    if broken:
        for _ in range(6):
            a, d = r.uniform(0, math.tau), r.uniform(17, 21)
            img.put(int(c + math.cos(a) * d), int(c + math.sin(a) * d), BRISTLE[2])
    return img


def sparkle_frame(k):
    """Błysk wypolerowanej posadzki (16x16): czteroramienna gwiazdka w barwach opalu, rośnie i gaśnie."""
    img = Img(16, 16)
    arm = (2, 4, 6, 3)[k]
    col = OPAL[k]
    for i in range(-arm, arm + 1):
        img.put(8 + i, 8, col if abs(i) > 1 else OPAL[3])
        img.put(8, 8 + i, col if abs(i) > 1 else OPAL[3])
    if k in (1, 2):
        for dx, dy in ((-2, -2), (2, -2), (-2, 2), (2, 2)):
            img.put(8 + dx, 8 + dy, OPAL[(k + 1) % 4])
    return img


def build():
    sheets = {}
    for key, v in VARIANTS.items():
        boss, bf = directional_sheet(CELL, frame_fn(v), 28)
        death, df = directional_sheet(CELL, death_frame(v), 8)
        sheets[f'cleaner-{key}_walk-polish-spill-bucket-broom-tangle-shout.png'] = (boss, bf, CELL, 8)
        sheets[f'cleaner-{key}_death.png'] = (death, df, CELL, 8)
    puddle, pf = strip_sheet(PUDDLE, puddle_frame, 8)
    splash, sf = strip_sheet(32, splash_frame, 4)
    buck, buf = strip_sheet(24, bucket_frame, 8)
    tangle, tf = strip_sheet(48, tangle_frame, 8)
    sparkle, spf = strip_sheet(16, sparkle_frame, 4)
    sheets.update({
        'soap-puddle.png': (puddle, pf, PUDDLE, 1),
        'water-splash.png': (splash, sf, 32, 1),
        'plastic-bucket.png': (buck, buf, 24, 1),
        'broom-tangle.png': (tangle, tf, 48, 1),
        'polish-sparkle.png': (sparkle, spf, 16, 1),
    })
    return sheets


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Sprzątaczek (bossów Lustrzanej komnaty) i efektów ich ataków')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podgląd 2x')
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
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, FLOOR)
            bg.alpha_composite(im)
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

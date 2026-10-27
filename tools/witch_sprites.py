"""
Generator bossa „Wiedźma Mopa” (propozycja do oceny właściciela, koncept: docs/WIEDZMA.md): zgarbiona staruszka
w szerokim, spiczastym kapeluszu, z wiadrem mydlin w lewej ręce i „mopomiotłą” w prawej — długi kij z mopem na
jednym końcu i brzozową miotłą na drugim. Faza 1 walczy mopem i wiadrem (rozlana woda, ściąganie wiadrem na sznurze),
faza 2 obraca kij i walczy miotłą (zamach, plątanie witkami). Do tego efekty ataków.

Użycie (z katalogu głównego repozytorium):
  python tools/witch_sprites.py                       # arkusze do public/assets/sprites/
  python tools/witch_sprites.py --preview tools/out   # dodatkowo podgląd 2x na podłodze lustrzanej komnaty

mop-witch_walk-spill-bucket-broom-tangle-flip.png (3072x1024, komórka 128x128, pivot 64,64, 8 kierunków z obrotu):
  kolumny 0–3 chód (szuranie, wiadro się kołysze), 4–7 rozlanie (uniesienie wiadra, przechył, chlust, powrót),
  8–11 wiadro na sznurze (zamach, rzut — ręka trzyma sam sznur, ściąganie z odchyleniem, złapanie),
  12–15 cios miotłą (zamach za plecy, cięcie z boku, uderzenie z rozczapierzonymi witkami, powrót),
  16–19 plątanie (miotła pionowo, wbicie w posadzkę, witki rozchodzą się, trzymanie),
  20–23 przejście w fazę 2 (rechot, kij obraca się mopem do tyłu, miotłą do przodu).
mop-witch_death.png (1024x1024, komórka 128): 8 klatek bez pętli — 0 krzyk z rękami w górze, 1–6 topnieje w kałużę
  brudnej wody („topię się!”), 7 na kałuży pływa sam kapelusz, obok leży mopomiotła.
soap-puddle.png (768x96, komórka 96): rozlana woda — 0–5 kałuża rośnie (promień = strefa poślizgu w grze), 6–7 połysk w pętli.
water-splash.png (128x32): chlust przy uderzeniu wody / wiadra, 4 klatki bez pętli.
bucket.png (96x24): wiadro w locie, 4 klatki obrotu co 90° (sznur rysuje gra linią od dłoni).
broom-tangle.png (384x48, komórka 48): witki i sznurki mopa oplatają stopy bohatera — 0–3 wyrastają, 4–5 trzymają
  (pętla), 6–7 pękają.
Dominująca cecha: szerokie rondo kapelusza z wygiętym szpicem + wiadro z jasnymi mydlinami.
Akcenty: błękit mydlin (woda, wiadro) i żółte ślepia spod ronda.
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
from smoker_sprites import rect, centroid, scaled

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 128
C = CELL / 2

# Suknia: wyblakła śliwka (fiolet to barwa wrogów — boss go nosi, podłoga nie).
DRESS = (ok(.20, .040, 320), ok(.26, .050, 320), ok(.32, .055, 318), ok(.40, .055, 315), ok(.48, .050, 310))
# Fartuch: brudny krem z zaciekami.
APRON = (ok(.46, .030, 75), ok(.54, .034, 78), ok(.62, .035, 80), ok(.70, .030, 84), ok(.78, .025, 88))
# Kapelusz: prawie czarny z nutą śliwki; rondo musi odciąć się od jasnej, lustrzanej posadzki.
HAT = (ok(.14, .020, 300), ok(.18, .024, 300), ok(.23, .028, 300), ok(.30, .030, 300), ok(.38, .030, 300))
BAND = (ok(.48, .070, 80), ok(.66, .090, 88))  # zaśniedziała mosiężna klamra
SKIN = (ok(.50, .040, 105), ok(.60, .045, 102), ok(.70, .045, 98))  # ziemista skóra (nos, dłonie)
HAIR = (ok(.50, .008, 250), ok(.62, .008, 250), ok(.74, .008, 250))  # siwe strąki spod ronda
WOOD = (ok(.28, .050, 55), ok(.36, .065, 55), ok(.45, .075, 55), ok(.54, .075, 58))
MOP = (ok(.38, .030, 70), ok(.50, .016, 90), ok(.62, .018, 90), ok(.74, .018, 92))  # brudne końce → jasne sznurki
STRAW = (ok(.42, .070, 70), ok(.54, .085, 78), ok(.66, .100, 85), ok(.78, .095, 92))
TWINE = ok(.36, .060, 45)
IRON = (ok(.34, .010, 240), ok(.46, .012, 240), ok(.60, .012, 240), ok(.76, .010, 240))
# Mydliny: akcent 1 — błękit, piana jaśniejsza (bez czystej bieli).
WATER = (ok(.48, .070, 220), ok(.60, .090, 214), ok(.73, .085, 208), ok(.86, .045, 205), ok(.94, .015, 200))
EYE = ok(.84, .160, 98)  # akcent 2: żółte ślepia
# Kałuża po śmierci: brudna woda (szarozielony błękit), ciemny brzeg.
SLOP = (ok(.30, .030, 200), ok(.40, .040, 205), ok(.52, .050, 208), ok(.64, .055, 210), ok(.78, .040, 205))
FLOOR = ok(.80, .020, 240)  # tło podglądu: ton posadzki lustrzanej komnaty


def vec(angle_deg):
    """Kierunek w przestrzeni lokalnej (0° = N, zgodnie z ruchem wskazówek zegara)."""
    a = math.radians(angle_deg)
    return math.sin(a), -math.cos(a)


def mop_head(img, x, y, angle, splay=1.0, wet=True):
    """Mop: pęk sznurków rozchodzący się w kierunku `angle`; brudne końce, kropla mydlin."""
    dx, dy = vec(angle)
    px, py = -dy, dx
    for i in range(-4, 5):
        spread = i * 1.3 * splay
        length = 9 + (2 - abs(i) % 3)
        pts = [(x + px * i * .6, y + py * i * .6),
               (x + dx * length * .55 + px * spread, y + dy * length * .55 + py * spread),
               (x + dx * length + px * spread * 1.4 + px * math.sin(i) * 1.5, y + dy * length + py * spread * 1.4)]
        stroke(img, pts, 1.6, MOP[2 if i % 2 else 1])
        img.put(int(pts[-1][0]), int(pts[-1][1]), MOP[0])
    ellipse(img, x, y, 3.2, 3.2, lambda nx, ny: MOP[3] if nx + ny < 0 else MOP[2])  # oprawa sznurków
    if wet:
        img.put(int(x + dx * 12), int(y + dy * 12), WATER[2])
        img.put(int(x + dx * 10 + px * 3), int(y + dy * 10 + py * 3), WATER[3])


def broom_head(img, x, y, angle, splay=1.0):
    """Miotła: wiązka witek przewiązana sznurkiem, wachlarz rośnie ze `splay` (uderzenie = szeroko)."""
    dx, dy = vec(angle)
    px, py = -dy, dx
    for i in range(-5, 6):
        fan = i * (0.9 + 0.9 * splay)
        length = 11 + (i * 7 % 3)
        pts = [(x + px * i * .4, y + py * i * .4),
               (x + dx * length + px * fan, y + dy * length + py * fan)]
        stroke(img, pts, 1.4, STRAW[1 + (i % 3)] if i % 3 else STRAW[1])
        img.put(int(pts[-1][0]), int(pts[-1][1]), STRAW[0])
    for k in (1, 3):  # dwa sznurki wiązania
        for j in range(-3, 4):
            img.put(int(x + dx * k + px * j * .9), int(y + dy * k + py * j * .9), TWINE)


def mop_broom(img, hand, angle, front='mop', splay=1.0, front_len=19, back_len=14):
    """Kij przechodzi przez dłoń: z przodu (kierunek `angle`) `front`, z tyłu drugi koniec."""
    dx, dy = vec(angle)
    a = (hand[0] + dx * front_len, hand[1] + dy * front_len)
    b = (hand[0] - dx * back_len, hand[1] - dy * back_len)
    stroke(img, [b, a], 2.6, WOOD[1], edge=WOOD[3])
    if front == 'mop':
        broom_head(img, b[0], b[1], angle + 180, 0.3)
        mop_head(img, a[0], a[1], angle, splay)
    else:
        mop_head(img, b[0], b[1], angle + 180, 0.5, wet=False)
        broom_head(img, a[0], a[1], angle, splay)
    return a


def bucket(img, x, y, tilt=0.0, water=True, handle_up=True):
    """Wiadro z góry: obręcz z blachy, w środku mydliny z pianą; `tilt` spłaszcza otwór (przechył do przodu)."""
    ry = 6.5 * (1 - tilt * .45)
    ellipse(img, x, y, 7, 7, band_shade(IRON + (IRON[3],), light=(-.4, -.5)))
    ellipse(img, x, y - tilt * 2, 5.2, ry - 1.6, lambda nx, ny: WATER[3] if nx + ny < -.6 else (WATER[2] if ny < .3 else WATER[1]))
    if water:
        for bx, by in ((-2, -1), (1, -2), (2, 1)):  # bąble piany
            img.put(int(x + bx), int(y + by - tilt * 2), WATER[4])
    if handle_up:  # pałąk po stronie ręki
        for k in range(-5, 6):
            img.put(int(x + k), int(y + 7 + (25 - k * k) * .12), IRON[0])


def witch_frame(f, death_pose=False):
    """Wiedźma na N. f: 0–3 chód, 4–7 rozlanie, 8–11 wiadro na sznurze, 12–15 cios miotłą, 16–19 plątanie,
    20–23 przejście w fazę 2."""
    img = Img(CELL, CELL)
    walk = f < 4
    spill = 4 <= f < 8
    pull = 8 <= f < 12
    strike = 12 <= f < 16
    tangle = 16 <= f < 20
    flip = f >= 20
    k = f % 4
    step = (0, 2, 0, -2)[k] if walk else 0
    cy = C + 6
    lean = 0
    if pull:
        lean = (2, -3, 4, 1)[k]  # przy ściąganiu odchyla się do tyłu (dodatnie = na S)
    if strike:
        lean = (2, 0, -4, -1)[k]
    if tangle:
        lean = (0, -3, -2, -1)[k]
    by = cy + lean

    # buty spod sukni (spiczaste czubki), naprzemiennie
    for side, dy in ((-1, step), (1, -step)):
        ellipse(img, C + side * 8, by - 12 + dy, 3.6, 5, lambda nx, ny: HAT[1] if ny > -.3 else HAT[3])
    # suknia: szeroka, poszarpany dół (garby na obwodzie), garb pleców od S
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - C, y + .5 - by
            a = math.atan2(dy, dx)
            reach = 1 + .07 * math.sin(7 * a + k * .8) + .04 * math.sin(13 * a)
            nx, ny = dx / (22 * reach), dy / (19 * reach)
            if nx * nx + ny * ny <= 1:
                img.put(x, y, band_shade(DRESS)(nx, ny))
    ellipse(img, C + 1, by + 10, 14, 8, band_shade(DRESS, light=(-.6, -.8)))  # garb pod chustą
    # łaty na sukni (jaśniejszy ton, ciemny ścieg)
    for px, py in ((C + 12, by + 6), (C - 14, by + 2)):
        rect(img, px - 2, py - 2, px + 2, py + 2, DRESS[3])
        for j in range(-2, 3, 2):
            img.put(int(px + j), int(py - 2), DRESS[0])
    # fartuch z przodu (N): plamy i zacieki mydlin
    ellipse(img, C, by - 9, 12, 8, band_shade(APRON))
    for sx, sy in ((-5, -10), (3, -7), (6, -12)):
        img.put(int(C + sx), int(by + sy), APRON[0])
        img.put(int(C + sx + 1), int(by + sy + 1), APRON[1])
    img.put(int(C - 2), int(by - 13), WATER[2])

    # ręce: lewa (x < C) — wiadro, prawa — mopomiotła
    lh = (C - 24, by - 6 + step)
    rh = (C + 22, by - 10)
    tool_angle, front, splay = 35, 'mop', 0.8
    tool_hand = rh
    bucket_on = True
    bucket_tilt = 0.0
    if spill:
        lh = ((C - 20, by - 18), (C - 14, by - 28), (C - 10, by - 32), (C - 20, by - 14))[k]
        bucket_tilt = (0.2, 0.7, 1.0, 0.1)[k]
        tool_angle = (40, 20, -10, 30)[k]  # mop zgarnia wodę od prawej do lewej
        rh = ((C + 22, by - 12), (C + 18, by - 18), (C + 10, by - 22), (C + 20, by - 12))[k]
    if pull:
        lh = ((C - 28, by + 6), (C - 12, by - 32), (C - 20, by - 12), (C - 24, by - 8))[k]
        bucket_on = k in (0, 3)
    if strike:
        front = 'broom'
        tool_angle = (150, 80, 5, 30)[k]
        rh = ((C + 18, by + 2), (C + 17, by - 10), (C + 6, by - 17), (C + 16, by - 16))[k]
        splay = (0.4, 0.6, 1.6, 0.8)[k]
    if tangle:
        front = 'broom'
        tool_angle = (0, 0, 0, 0)[k]
        rh = ((C + 4, by - 20), (C + 2, by - 18), (C + 2, by - 18), (C + 2, by - 19))[k]
        splay = (0.5, 1.8, 2.4, 2.1)[k]
        lh = (C - 6, by - 20) if k else (C - 22, by - 8)  # chwyta kij oburącz
    if flip:
        tool_angle = (35, 95, 160, 215)[k]
        front = 'mop'
        rh = (C + 20, by - 12)
    if death_pose:
        lh, rh = (C - 22, by - 24), (C + 22, by - 24)
        bucket_on = False
    if tangle and k:
        tool_hand = (C + 1, by - 22)
    # przedramiona (rękawy sukni), dłonie
    for shoulder, hand in (((C - 15, by - 4), lh), ((C + 15, by - 4), rh)):
        stroke(img, [shoulder, (hand[0] + (2 if hand[0] < C else -2), hand[1] + 3)], 6, DRESS[2], edge=DRESS[3])
    # kij: przy fazie 2 i plątaniu miotła z przodu
    if not death_pose:
        flen = 20 if tangle else 19
        if tangle:
            mop_broom(img, tool_hand, tool_angle, front, splay, front_len=flen, back_len=10)
        else:
            mop_broom(img, rh, tool_angle, front, splay)
    for hand in (lh, rh):
        ellipse(img, hand[0], hand[1], 3, 3, lambda nx, ny: SKIN[2] if nx + ny < 0 else SKIN[1])
    if bucket_on and not death_pose:
        bucket(img, lh[0] - 1, lh[1] - 4, bucket_tilt)
    if pull and not bucket_on:  # dłoń ściska sznur — w grze sznur ciągnie się do wiadra
        dx, dy = (0, -1) if k == 1 else (.2, -1)
        for i in range(2, 9):
            img.put(int(lh[0] + dx * i), int(lh[1] + dy * i), TWINE)
    if spill and k >= 2:  # chlust mydlin przed sobą
        n = 5 if k == 2 else 3
        for i in range(n):
            ellipse(img, C - 10 + i * 2.5, by - 38 - i * 3, 2.8 + i * .4, 2.2 + i * .3,
                    lambda nx, ny: WATER[3] if nx + ny < -.3 else WATER[2])
            img.put(int(C - 10 + i * 2.5), int(by - 39 - i * 3), WATER[4])

    # głowa: siwe strąki spod ronda (po bokach i z tyłu), nos wystaje z przodu
    hy = by - 14
    for side in (-1, 1):
        for i in range(4):
            x0 = C + side * (8 + i * 2)
            stroke(img, [(x0, hy + 4), (x0 + side * 2, hy + 14 + i)], 1.4, HAIR[i % 2 + 1])
    # kapelusz: rondo (pofalowane), korona przesunięta do tyłu, szpic wygięty i wystający za rondo (sylwetka)
    tilt = (0, 1, -1, 1)[k] if flip else 0
    R = 12.5
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x + .5 - C - tilt, y + .5 - hy
            a = math.atan2(dy, dx)
            r = R * (1 + .06 * math.sin(5 * a + 1))
            d = math.hypot(dx, dy * 1.06)
            if d <= r:
                if d > r - 1.5:
                    c = HAT[3] if dx + dy < -3 else HAT[1]  # krawędź ronda: jasna od N-W, ciemna od S-E
                else:
                    c = HAT[2] if dx + dy > -4 else HAT[3]
                img.put(x, y, c)
    # korona: stożek widziany z góry — kolejne mniejsze kręgi przesunięte na S, szpic zagina się w bok za rondo
    cone = [(0, 1, 7), (1, 4, 5.6), (2, 7, 4.4), (4, 10, 3.4), (7, 13, 2.6), (10, 15, 2.0), (13, 16, 1.6), (15, 16, 1.2)]
    for i, (ox, oy, rr) in enumerate(cone):
        ellipse(img, C + tilt + ox, hy + oy, rr, rr * .92,
                band_shade(HAT, light=(-.5, -.6)) if i < 4 else (lambda nx, ny: HAT[2] if ny < 0 else HAT[1]))
    # opaska z klamrą u podstawy korony
    for deg in range(0, 360, 6):
        rad = math.radians(deg)
        img.put(int(C + tilt + math.cos(rad) * 7.2), int(hy + 1 + math.sin(rad) * 6.6), BAND[0])
    rect(img, C + tilt - 2, hy - 7, C + tilt + 1, hy - 5, BAND[1])
    img.put(int(C + tilt - 1), int(hy - 6), BAND[0])
    # nos-haczyk wystaje spod ronda (N), po bokach żółte ślepia (akcent)
    stroke(img, [(C, hy - 11), (C + 1, hy - 16), (C + 3, hy - 17)], 2.2, SKIN[1], edge=SKIN[2])
    img.put(int(C + 3), int(hy - 17), SKIN[0])
    img.put(int(C + 1), int(hy - 15), SKIN[0])  # brodawka
    for side in (-1, 1):
        img.put(int(C + side * 4 - (1 if side < 0 else 0)), int(hy - 12), EYE)
        img.put(int(C + side * 4 - (1 if side < 0 else 0)), int(hy - 13), HAT[0])  # krzaczasta brew
    if flip and k in (1, 2):  # rechot: rozdziawione usta pod nosem
        rect(img, C - 2, hy - 13, C + 1, hy - 13, SKIN[0])
    return img


# ---------------- śmierć: topnieje w kałużę (jak wiedźma polana wodą) ----------------
# Klatki: skala ciała, promień kałuży, bąble. 0 krzyk, 1–6 topnieje, 7 sam kapelusz na kałuży.
DEATH_FRAMES = ((1.0, 0, 0), (0.9, 14, 0), (0.78, 20, 1), (0.64, 25, 2), (0.48, 28, 3), (0.32, 31, 3), (0.16, 33, 2), (0.0, 34, 2))
BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))


def slop_pool(img, cx, cy, r):
    """Kałuża brudnej wody: ciemny brzeg, przejście ditheringiem Bayera 4×4, jasny połysk po stronie N-W."""
    for y in range(img.h):
        for x in range(img.w):
            dx, dy = (x + .5 - cx) / r, (y + .5 - cy) / (r * .82)
            a = math.atan2(dy, dx)
            d = math.hypot(dx, dy) / (1 + .1 * math.sin(4 * a + .7) + .06 * math.sin(7 * a + 2))
            if d > 1:
                continue
            if d > .9:
                c = SLOP[0]
            elif d > .6:
                c = SLOP[1] if (d - .6) / .3 * 16 > BAYER[y % 4][x % 4] else SLOP[2]
            else:
                c = SLOP[3] if .35 < d < .5 and -2.6 < a < -1.8 else SLOP[2]
            img.put(x, y, c)


def hat_only(img, cx, cy):
    """Kapelusz pływający na kałuży (bez głowy): to samo rondo i korona co u żywej wiedźmy."""
    ellipse(img, cx, cy, 12.5, 11.8, lambda nx, ny: HAT[1] if nx * nx + ny * ny > .8 else (HAT[2] if nx + ny > -.3 else HAT[3]))
    for ox, oy, rr in ((0, 1, 7), (1, 4, 5.6), (2, 7, 4.4), (4, 10, 3.4), (7, 13, 2.6), (10, 15, 2.0), (13, 16, 1.6)):
        ellipse(img, cx + ox, cy + oy, rr, rr * .92, band_shade(HAT, light=(-.5, -.6)))
    rect(img, cx - 2, cy - 7, cx + 1, cy - 5, BAND[1])


def witch_death_frame(f):
    scale, pool_r, bubbles = DEATH_FRAMES[f]
    base = witch_frame(0, death_pose=True)
    cx, cy = centroid(base)
    img = Img(CELL, CELL)
    if pool_r:
        slop_pool(img, cx, cy + 4, pool_r)
    if f >= 4:  # mopomiotła wypada z rąk i leży obok kałuży
        mop_broom(img, (cx + 26, cy + 6), 160, 'mop', 0.6, front_len=18, back_len=16)
    if scale:
        img.blit(scaled(base, (cx, cy), scale * (1 + (1 - scale) * .4), scale, sink=(1 - scale) * 8), 0, 0)
    if f >= 6:
        hat_only(img, cx - 2, cy - 4 + (f - 6) * 2)
    r = random.Random(9500 + f)
    for _ in range(bubbles):  # bąble na kałuży
        a, d = r.uniform(0, math.tau), r.uniform(.4, .8) * pool_r
        bx, by = int(cx + math.cos(a) * d), int(cy + 4 + math.sin(a) * d * .8)
        for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            img.put(bx + ox, by + oy, SLOP[3])
        img.put(bx, by, SLOP[1])
        img.put(bx - 1, by - 1, SLOP[4])
    return img


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
                band = (x - y + shine) % 23
                if band in (0, 1) and d < .7:  # ukośne pasy połysku
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
        x, y = 16 + math.cos(a) * d, 16 + math.sin(a) * d
        ellipse(img, x, y, size, size, lambda nx, ny: WATER[3] if nx + ny < 0 else WATER[2])
    if k < 2:
        ellipse(img, 16, 16, 5 - k * 2, 5 - k * 2, lambda nx, ny: WATER[3] if nx + ny < -.2 else WATER[1])
    return img


def bucket_frame(k):
    """Wiadro w locie (24x24): obraca się co 90° (pałąk zmienia stronę), chlapie kroplami."""
    img = Img(24, 24)
    rot = Img(24, 24)
    bucket(rot, 12, 11, 0.0, handle_up=True)
    for y in range(24):
        for x in range(24):
            dx, dy = x - 11.5, y - 11.5
            for _ in range(k):
                dx, dy = -dy, dx
            cc = rot.get(round(11.5 + dx), round(11.5 + dy))
            if cc and cc[3]:
                img.put(x, y, cc)
    img.put(3 + k * 2, 3, WATER[3])
    img.put(20, 4 + k * 3, WATER[2])
    return img


def tangle_frame(f):
    """Plątanie (48x48): witki miotły i sznurki mopa wyrastają z posadzki wokół stóp (środek wolny na bohatera)."""
    img = Img(48, 48)
    c = 24
    grow = (.3, .55, .8, 1.0, 1.0, 1.0, .9, .6)[f]
    wiggle = (0, 0, 0, 0, .25, -.25, 0, 0)[f]
    broken = f >= 6
    r = random.Random(9640)
    for i in range(10):
        a = i * math.tau / 10 + r.uniform(-.2, .2)
        base = (c + math.cos(a) * 15, c + math.sin(a) * 15)
        bend = a + 2.2 + wiggle  # zagięte do środka — oplatają nogi
        L = 11 * grow
        mid = (base[0] + math.cos(a + math.pi) * L * .5, base[1] + math.sin(a + math.pi) * L * .5)
        tip = (mid[0] + math.cos(bend) * L * .55, mid[1] + math.sin(bend) * L * .55)
        ramp = STRAW if i % 2 else MOP
        if broken and i % 3 == 0:  # pęknięta witka: tylko kikut
            stroke(img, [base, mid], 1.6, ramp[1])
            img.put(int(mid[0]), int(mid[1]), ramp[3])
            continue
        stroke(img, [base, mid, tip], 1.6, ramp[2], edge=ramp[3])
        img.put(int(base[0]), int(base[1]), ramp[0])
    for i in range(12):  # pęd/okruchy u podstawy
        a = i * math.tau / 12
        img.put(int(c + math.cos(a) * 17), int(c + math.sin(a) * 17), STRAW[0] if i % 2 else MOP[0])
    if broken:
        for _ in range(6):  # sypiące się drzazgi
            a, d = r.uniform(0, math.tau), r.uniform(17, 21)
            img.put(int(c + math.cos(a) * d), int(c + math.sin(a) * d), STRAW[3])
    return img


def build():
    boss, bf = directional_sheet(CELL, witch_frame, 24)
    death, df = directional_sheet(CELL, witch_death_frame, 8)
    puddle, pf = strip_sheet(PUDDLE, puddle_frame, 8)
    splash, sf = strip_sheet(32, splash_frame, 4)
    buck, buf = strip_sheet(24, bucket_frame, 4)
    tangle, tf = strip_sheet(48, tangle_frame, 8)
    return {
        'mop-witch_walk-spill-bucket-broom-tangle-flip.png': (boss, bf, CELL, 8),
        'mop-witch_death.png': (death, df, CELL, 8),
        'soap-puddle.png': (puddle, pf, PUDDLE, 1),
        'water-splash.png': (splash, sf, 32, 1),
        'bucket.png': (buck, buf, 24, 1),
        'broom-tangle.png': (tangle, tf, 48, 1),
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Wiedźmy Mopa i efektów jej ataków')
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

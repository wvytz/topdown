"""
Generator Brudnej Wiedźmy (krok 137, szkic i nazwa właściciela `#brudna-wiedzma`) — bossa Bocianiego Ogrodu — i efektów
jej ataków. Ze szkicu: długie czarne włosy, szeroki zębaty uśmiech i puste oczy, pomarańczowo-czarna suknia z zielonym
obrąbkiem, czerwony kwiat z okiem w dłoni, ptaszek na ramieniu, wokół bociany i żuki.

Użycie (z katalogu głównego repozytorium):
  python tools/witch_sprites.py                       # arkusze do public/assets/sprites/
  python tools/witch_sprites.py --preview tools/out   # dodatkowo podgląd 2x na tonie nocnej trawy

dirty-witch_walk-cast-whirl-fly-laugh.png (2560x1024, komórka 128x128, pivot 64,64, 8 kierunków z obrotu): kolumny 0–3
  chód (suknia kołysze się na boki), 4–7 czar (ręce w przód, kwiat w górze — kwiat-oko, pikowanie, rój), 8–11 wir sukni
  (obrót, suknia się rozkłada), 12–15 lot na bocianach (ręce rozłożone, suknia trzepocze), 16–19 chichot (głowa odchylona).
dirty-witch_death.png (1024x1024, komórka 128): 8 klatek bez pętli — 0 zachwiana, 1 zapada się, 2–7 suknia opada w kupkę,
  ptaki odlatują, zostaje czerwony kwiat.
stork.png (192x48, komórka 48): bocian w locie na wschód, 4 klatki machania (gra obraca go w kierunku lotu).
dive-bird.png (96x24, komórka 24): ptak pikujący w dół ekranu — 0–2 skrzydła złożone, 3 rozłożone przy uderzeniu.
flower-eye.png (384x48, komórka 48): kwiat-oko — 0–5 wyrasta (łodyga, płatki, oko się otwiera), 6–7 oko się rozgląda.
witch-pollen.png (64x16, komórka 16): kula pyłku z kwiatu-oka, pulsuje.
witch-leaf.png (64x16, komórka 16): liść z wiru sukni, obraca się co 90°.
witch-seed.png (64x16, komórka 16): nasiono kwiatu-oka w locie, obraca się.
beetle_walk-prime.png (384x384, komórka 48, 8 kierunków): żuk z roju — 0–3 bieg, 4–7 pokrywy się rozchylają i świecą.
beetle_burst.png (192x48, komórka 48): żuk pęka chmurą pyłku, 4 klatki.
Dominująca cecha: rozłożysta pomarańczowa suknia z zielonym obrąbkiem i czarne włosy na plecach; akcent: czerwony kwiat.
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
S = 1.75  # skala sylwetki (jak brunetka z Lustrzanej komnaty)

DRESS = (ok(.46, .140, 42), ok(.56, .165, 47), ok(.66, .170, 54), ok(.75, .145, 62), ok(.83, .100, 70))
DARK = (ok(.13, .010, 40), ok(.18, .012, 40), ok(.24, .014, 45), ok(.31, .016, 50), ok(.39, .018, 55))
HEM = (ok(.34, .085, 140), ok(.45, .110, 138), ok(.56, .120, 134))
HAIR = (ok(.10, .010, 280), ok(.16, .014, 276), ok(.23, .018, 270), ok(.33, .022, 264))
SKIN = (ok(.60, .030, 95), ok(.70, .032, 98), ok(.79, .028, 100), ok(.86, .022, 102))
TEETH = ok(.93, .018, 95)
MOUTH = ok(.17, .040, 20)
EYE_HOLE = ok(.20, .020, 280)
FLOWER = (ok(.40, .170, 25), ok(.52, .200, 28), ok(.63, .190, 32), ok(.74, .150, 40))
STEM = (ok(.36, .090, 142), ok(.48, .120, 138), ok(.60, .120, 132))
EYE = (ok(.90, .020, 95), ok(.14, .012, 280), ok(.62, .120, 70))
BIRD = (ok(.76, .010, 250), ok(.86, .010, 250), ok(.94, .008, 250))  # biel ptaków bez czystej bieli
WINGTIP = (ok(.16, .010, 280), ok(.24, .012, 280))
BEAK = (ok(.52, .170, 38), ok(.64, .180, 45))
BEETLE = (ok(.24, .060, 160), ok(.33, .085, 152), ok(.44, .110, 146), ok(.58, .120, 138), ok(.72, .100, 125))
GLOW = (ok(.56, .190, 30), ok(.72, .170, 50), ok(.88, .120, 90))
POLLEN = (ok(.70, .140, 80), ok(.82, .150, 92), ok(.92, .100, 100))
SEED = (ok(.32, .050, 60), ok(.44, .065, 62), ok(.56, .070, 66))
NIGHT = ok(.30, .030, 160)  # tło podglądu: nocna trawa Bocianiego Ogrodu


def vec(angle_deg):
    """Kierunek w przestrzeni lokalnej (0° = N, zgodnie z ruchem wskazówek zegara)."""
    a = math.radians(angle_deg)
    return math.sin(a), -math.cos(a)


def flower(img, x, y, s, open_eye=1.0, look=(0, 0)):
    """Czerwony kwiat z okiem pośrodku (z góry): wieniec ostrych płatków, białe oko z czarną źrenicą."""
    petals = 9
    for i in range(petals):
        a = i * math.tau / petals
        tip = (x + math.cos(a) * 4.4 * s, y + math.sin(a) * 4.4 * s)
        stroke(img, [(x + math.cos(a) * 1.4 * s, y + math.sin(a) * 1.4 * s), tip], 1.4 * s, FLOWER[1 + i % 2], edge=FLOWER[3])
    ellipse(img, x, y, 2.0 * s, 2.0 * s * max(.25, open_eye), lambda nx, ny: EYE[0])
    if open_eye > .3:
        img.put(int(x + look[0]), int(y + look[1]), EYE[1])
        img.put(int(x + look[0] + 1), int(y + look[1]), EYE[1])


def shoulder_bird(img, x, y, s):
    """Ptaszek na ramieniu: biały kłębek z pomarańczowym dziobem w przód."""
    ellipse(img, x, y, 2.3 * s, 2.6 * s, lambda nx, ny: BIRD[2] if nx + ny < -.3 else BIRD[1])
    ellipse(img, x, y - 2.0 * s, 1.5 * s, 1.5 * s, lambda nx, ny: BIRD[2])
    img.put(int(x), int(y - 3.6 * s), BEAK[1])
    img.put(int(x), int(y - 4.4 * s), BEAK[0])
    img.put(int(x - 1), int(y - 2.3 * s), EYE[1])


def dress(img, P, s, flare, sway, spin):
    """Suknia z góry: zielony obrąbek, pomarańczowy klosz w czarne smugi (smugi obracają się w wirze)."""
    rx, ry = (11 + flare) * s, (9 + flare * .7) * s
    cx, cy = P(sway, 4)
    ellipse(img, cx, cy, rx + 1.3 * s, ry + 1.3 * s, lambda nx, ny: HEM[2] if nx + ny < -.5 else (HEM[1] if ny < .5 else HEM[0]))
    ellipse(img, cx, cy, rx, ry, band_shade(DRESS, light=(-.4, -.5)))
    for i in range(8):  # czarne, wygięte smugi od talii ku obrąbkowi (jak kreskowanie na szkicu)
        a = i * math.tau / 8 + spin
        w0 = P(math.cos(a) * 3, 2 + math.sin(a) * 2)
        wm = (cx + math.cos(a + .3) * rx * .55, cy + math.sin(a + .3) * ry * .55)
        w1 = (cx + math.cos(a + .45) * rx * .9, cy + math.sin(a + .45) * ry * .9)
        stroke(img, [w0, wm, w1], 1.0, DARK[1 + i % 2])
    for i in range(int(rx * 2)):  # postrzępiony brzeg obrąbka
        a = i * math.tau / int(rx * 2)
        if i % 3 == 0:
            img.put(int(cx + math.cos(a) * (rx + 1.6 * s)), int(cy + math.sin(a) * (ry + 1.6 * s)), HEM[0])


def head(img, P, s, laugh=0, hair_sway=0):
    """Głowa z góry: długie czarne włosy na plecach, twarz z przodu — puste oczy i szeroki zębaty uśmiech."""
    for i in range(9):  # długie, proste pasma spływają na plecy (na S) i lekko się rozchodzą, falują
        t = (i - 4) / 4
        pts = []
        for j in range(6):
            y = 1.5 + j * 2.6
            wave = math.sin(j * 1.1 + i * .9) * .55 + hair_sway * j * .25
            pts.append(P(t * (3.0 + j * .45) + wave, y))
        stroke(img, pts, 1.5 * s if abs(i - 4) < 3 else 1.1 * s, HAIR[(1, 2, 1, 3, 2, 1, 3, 2, 1)[i]])
    hx, hy = P(0, -1 - laugh * .6)
    ellipse(img, hx, hy - 3.0 * s, 3.4 * s, 2.7 * s, lambda nx, ny: SKIN[2] if nx < .3 else SKIN[1])  # twarz z przodu
    ellipse(img, hx, hy + .6 * s, 4.1 * s, 3.7 * s, band_shade(HAIR + (HAIR[3],), light=(-.45, -.35)))  # czubek głowy
    for i in range(-3, 4):  # przedziałek
        img.put(int(hx + i * s * .9), int(hy + (2 if i % 2 else 1) * s), HAIR[0])
    for side in (-1, 1):  # puste, ciemne oczy
        ex, ey = hx + side * 1.4 * s, hy - 3.6 * s
        img.put(int(ex), int(ey), EYE_HOLE)
        img.put(int(ex + side), int(ey), EYE_HOLE)
    my = hy - 4.9 * s - laugh * .4 * s  # wyszczerz: rząd zębów z ciemnymi przerwami
    half = int(2.4 * s + laugh)
    for dx in range(-half, half + 1):
        img.put(int(hx + dx), int(my), TEETH if dx % 2 else MOUTH)
        img.put(int(hx + dx), int(my + 1), MOUTH)
    if laugh:
        for dx in range(-half + 1, half):
            img.put(int(hx + dx), int(my - 1), TEETH)


def figure(img, f, death=None):
    """Wiedźma na N w jednostkach lokalnych × S. death: None | 'stagger'."""
    s, k = S, f % 4
    walk, cast, whirl, fly, laugh = f < 4, 4 <= f < 8, 8 <= f < 12, 12 <= f < 16, f >= 16
    lean = 0
    if cast:
        lean = (0, -1, -2, -1)[k]
    if laugh:
        lean = (0, 1.5, 2.5, 1.5)[k]
    cy = C + 3
    P = lambda x, y: (C + x * s, cy + (y + lean) * s)
    sway = (0, .8, 0, -.8)[k] if walk else 0
    flare = (2.5, 3.5, 4.2, 3.5)[k] if whirl else ((1.2, 1.8, 1.2, .6)[k] if fly else 0)
    spin = k * .45 if whirl else 0
    if death == 'stagger':
        flare = 1
    dress(img, P, s, flare, sway, spin)
    ellipse(img, *P(0, .5), 6.8 * s, 4.4 * s, band_shade(DRESS, light=(-.5, -.7)))  # gorset
    for side in (-1, 1):  # czarne pasy na ramionach
        stroke(img, [P(side * 2.5, -1.5), P(side * 6.4, 0)], 1.4, DARK[2])

    # ręce: prawa — kwiat, lewa — rozczapierzona dłoń
    rh, lh = (8.5, -4 + sway), (-9, -2 - sway)
    flower_at, flower_open = None, 1.0
    if cast:
        rh = ((7, -7), (5, -11), (4, -13), (6, -10))[k]
        lh = ((-7, -6), (-6, -10), (-5, -12), (-7, -9))[k]
    if whirl:
        a = 90 + k * 40
        rh = (math.sin(math.radians(a)) * 13, -math.cos(math.radians(a)) * 9)
        lh = (-rh[0], -rh[1])
    if fly:
        lift = (0, -1.5, -2.5, -1.5)[k]
        rh, lh = (15, -3 + lift), (-15, -3 + lift)
    if laugh:
        rh, lh = (5, -7), (-5, -7)  # dłonie przy twarzy
    if death == 'stagger':
        rh, lh = (10, -11), (-11, -9)
    for shoulder, hand in ((P(-6.4, 0), P(*lh)), (P(6.4, 0), P(*rh))):
        mid = ((shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2 + 1.5)
        stroke(img, [shoulder, mid, hand], 2.0 * s, DARK[2], edge=DARK[4])
        ellipse(img, hand[0], hand[1], 1.6 * s, 1.6 * s, lambda nx, ny: SKIN[2] if nx + ny < -.2 else SKIN[1])
    for i in (-1, 0, 1):  # długie palce lewej dłoni
        x, y = P(*lh)
        stroke(img, [(x, y), (x + i * 1.6 * s, y - 2.6 * s)], 1.0, SKIN[0])
    flower_at = P(rh[0] + .5, rh[1] - 3.2)
    x, y = P(*rh)
    stroke(img, [(x, y + 2 * s), flower_at], 1.2, STEM[1])  # łodyga przez dłoń
    if not fly:
        shoulder_bird(img, *P(6.2, -1.2), s)
    head(img, P, s, laugh=(0, 1, 2, 1)[k] if laugh else 0, hair_sway=(sway * 2 if walk else (k - 1.5) * .6 if whirl else 0))
    flower(img, *flower_at, s * .8, open_eye=flower_open, look=(0, -1))
    if fly:  # dwa bociany trzymają ją pod ręce
        for side in (-1, 1):
            hx, hy = P(side * 15, -4)
            stork_body(img, hx, hy - 3 * s, (0, -1), s * .55, flap=(1, .4, 0, .4)[k])
    return img


def stork_body(img, x, y, d, s, flap=1.0):
    """Bocian z góry, dziobem w kierunku `d`: białe ciało, skrzydła w poprzek z czarnymi lotkami, czerwony dziób i nogi."""
    dx, dy = d
    px, py = -dy, dx
    ellipse(img, x, y, 6.5 * s if dx else 3.4 * s, 3.4 * s if dx else 6.5 * s, lambda nx, ny: BIRD[2] if nx + ny < -.3 else BIRD[1])
    span = (5 + 9 * flap) * s
    for side in (-1, 1):  # skrzydła: biała nasada, czarne końce
        base = (x + px * side * 2 * s, y + py * side * 2 * s)
        tip = (x + px * side * span - dx * 2 * s, y + py * side * span - dy * 2 * s)
        mid = ((base[0] + tip[0]) / 2 + dx * 1.2 * s, (base[1] + tip[1]) / 2 + dy * 1.2 * s)
        stroke(img, [base, mid], 3.4 * s, BIRD[1], edge=BIRD[2])
        stroke(img, [mid, tip], 2.6 * s, WINGTIP[0], edge=WINGTIP[1])
    neck = (x + dx * 9 * s, y + dy * 9 * s)
    stroke(img, [(x + dx * 4 * s, y + dy * 4 * s), neck], 1.6 * s, BIRD[2])
    ellipse(img, neck[0], neck[1], 1.6 * s, 1.6 * s, lambda nx, ny: BIRD[2])
    stroke(img, [neck, (neck[0] + dx * 6 * s, neck[1] + dy * 6 * s)], 1.1 * s, BEAK[1], edge=BEAK[0])
    stroke(img, [(x - dx * 5 * s, y - dy * 5 * s), (x - dx * 11 * s, y - dy * 11 * s)], 1.0 * s, BEAK[0])  # nogi z tyłu


def frame_fn(f):
    return figure(Img(CELL, CELL), f)


# ---------------- śmierć: suknia opada, ptaki odlatują, zostaje kwiat ----------------
def heap(img, s, size, seed):
    """Opadła suknia: nieregularna kupka pomarańczu i czerni z zielonym obrąbkiem, czarne włosy wysypane na S."""
    r = random.Random(seed)
    cx, cy = C, C + 4
    for i in range(6):
        a = i * math.tau / 6 + r.uniform(-.3, .3)
        stroke(img, [(cx, cy + 4 * s), (cx + math.cos(a) * 6 * s * size, cy + 6 * s + abs(math.sin(a)) * 7 * s * size)], 2 * s, HAIR[1 + i % 2])
    ellipse(img, cx, cy, (11 * size + 1.3) * s, (8 * size + 1.3) * s, lambda nx, ny: HEM[1] if ny < .4 else HEM[0])
    ellipse(img, cx, cy, 11 * size * s, 8 * size * s, band_shade(DRESS, light=(-.4, -.5)))
    for i in range(7):
        a = r.uniform(0, math.tau)
        d = r.uniform(.2, .8)
        stroke(img, [(cx, cy), (cx + math.cos(a) * d * 11 * size * s, cy + math.sin(a) * d * 8 * size * s)], 1.4, DARK[1])


def death_frame(f):
    img = Img(CELL, CELL)
    if f == 0:
        return figure(img, 0, death='stagger')
    s = S
    heap(img, s, (1.0, .95, .85, .78, .72, .7, .7, .7)[f], 9137)
    if f == 1:  # zapada się: głowa nad kupką
        head(img, lambda x, y: (C + x * s, C + 3 + y * s), s, laugh=2)
    flower(img, C + 13 * s, C - 2 * s, s * .8, open_eye=(1, 1, .7, .4, .2, 0, 0, 0)[f], look=(0, 0))
    if 2 <= f <= 5:  # ptaki rozlatują się na wszystkie strony
        for i in range(4):
            a = i * math.tau / 4 + .4
            dist = (f - 1) * 9 * s * .45
            bx, by = C + math.cos(a) * (14 + dist), C + math.sin(a) * (12 + dist)
            if 10 < bx < CELL - 10 and 10 < by < CELL - 10:
                ellipse(img, bx, by, 2.2, 2.2, lambda nx, ny: BIRD[2] if nx < 0 else BIRD[1])
                img.put(int(bx + math.cos(a) * 3), int(by + math.sin(a) * 3), BEAK[1])
    return img


# ---------------- efekty ataków ----------------
def stork_frame(k):
    """Bocian w locie (48x48) na wschód; skrzydła machają (gra obraca sprite w kierunku lotu)."""
    img = Img(48, 48)
    stork_body(img, 22, 24, (1, 0), 1.0, flap=(1, .6, .2, .6)[k])
    return img


def dive_frame(k):
    """Pikujący ptak (24x24) głową w dół ekranu: skrzydła złożone wzdłuż ciała, przy uderzeniu rozłożone."""
    img = Img(24, 24)
    folded = k < 3
    ellipse(img, 12, 11, 2.6, 4.2, lambda nx, ny: BIRD[2] if nx < 0 else BIRD[1])
    for side in (-1, 1):
        if folded:
            stroke(img, [(12 + side * 2, 9), (12 + side * (3 + k * .4), 5 - k)], 1.8, BIRD[1], edge=WINGTIP[1])
        else:
            stroke(img, [(12 + side * 2, 10), (12 + side * 9, 7)], 2.2, BIRD[1])
            stroke(img, [(12 + side * 7, 7.5), (12 + side * 10, 6)], 1.8, WINGTIP[0])
    ellipse(img, 12, 16, 1.8, 1.8, lambda nx, ny: BIRD[2])
    img.put(12, 18, BEAK[1])
    img.put(12, 19, BEAK[0])
    return img


def flower_frame(f):
    """Kwiat-oko (48x48): 0–5 łodyga z liśćmi i rosnący wieniec, oko się otwiera; 6–7 źrenica rozgląda się."""
    img = Img(48, 48)
    grow = (.25, .45, .65, .85, 1.0, 1.0, 1.0, 1.0)[f]
    for side in (-1, 1):  # dwa liście u nasady
        stroke(img, [(24, 26), (24 + side * 9 * grow, 30 + 2 * grow)], 2.4 * grow + .6, STEM[1], edge=STEM[2])
    if f >= 1:
        flower(img, 24, 23, 2.3 * grow, open_eye=(0, 0, .2, .5, .8, 1, 1, 1)[f], look=((0, 0), (0, 0), (0, 0), (0, 0), (0, 0), (0, 0), (-2, 0), (2, 0))[f])
    else:
        ellipse(img, 24, 24, 2.5, 2.5, lambda nx, ny: STEM[2])
    return img


def pollen_frame(k):
    """Kula pyłku (16x16): żółta poświata pulsuje."""
    img = Img(16, 16)
    r = (3.2, 3.8, 4.2, 3.8)[k]
    ellipse(img, 8, 8, r + 1, r + 1, lambda nx, ny: POLLEN[0])
    ellipse(img, 8, 8, r, r, lambda nx, ny: POLLEN[2] if nx + ny < -.4 else POLLEN[1])
    for i in range(4):
        a = i * math.tau / 4 + k * .4
        img.put(int(8 + math.cos(a) * (r + 2)), int(8 + math.sin(a) * (r + 2)), POLLEN[1])
    return img


def turned(src, k, size):
    """Kopia obrazka obrócona o k×90°."""
    img = Img(size, size)
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            dx, dy = x - c, y - c
            for _ in range(k):
                dx, dy = -dy, dx
            col = src.get(round(c + dx), round(c + dy))
            if col and col[3]:
                img.put(x, y, col)
    return img


def leaf_frame(k):
    """Liść z wiru sukni (16x16): zielony z jaśniejszym nerwem, obrót co 90°."""
    src = Img(16, 16)
    ellipse(src, 8, 8, 5.5, 2.8, lambda nx, ny: STEM[2] if ny < -.2 else STEM[1])
    for x in range(3, 13):
        src.put(x, 8, STEM[0])
    return turned(src, k, 16)


def seed_frame(k):
    """Nasiono (16x16): brązowe ziarno z czerwonym czubkiem, obrót co 90°."""
    src = Img(16, 16)
    ellipse(src, 8, 8, 4.2, 2.6, lambda nx, ny: SEED[2] if nx + ny < -.3 else SEED[1])
    for dx in (3, 4):
        src.put(8 + dx, 8, FLOWER[1])
    return turned(src, k, 16)


def beetle_body(f, prime=0):
    """Żuk z góry, głową na N: lśniące zielone pokrywy, sześć nóg; przy zapłonie pokrywy rozchylają się i świeci środek."""
    img = Img(48, 48)
    k = f % 4
    for side in (-1, 1):
        for i, y in enumerate((-3, 1, 5)):
            swing = (1.5 if (i + k + (side > 0)) % 2 else -1.5)
            stroke(img, [(24 + side * 3, 24 + y), (24 + side * 8, 24 + y + swing)], 1.2, BEETLE[0])
    if prime:
        ellipse(img, 24, 25, 4.0, 5.5, lambda nx, ny: GLOW[2] if nx * nx + ny * ny < .3 else GLOW[min(1, prime - 1)])
    gap = prime * .9
    for side in (-1, 1):  # pokrywy
        ellipse(img, 24 + side * (2.3 + gap), 25, 3.0, 6.0, band_shade(BEETLE, light=(-.5 * side, -.5)))
    ellipse(img, 24, 17.5, 2.6, 2.2, lambda nx, ny: BEETLE[1])
    for side in (-1, 1):  # czułki
        stroke(img, [(24 + side, 16), (24 + side * 3, 12)], 1.0, BEETLE[0])
    return img


def beetle_frame(col):
    return beetle_body(col) if col < 4 else beetle_body(0, prime=col - 3)


def beetle_burst_frame(k):
    """Żuk pęka (48x48): chmura pyłku i odłamki pokryw."""
    img = Img(48, 48)
    r = (6, 11, 15, 17)[k]
    ellipse(img, 24, 24, r, r, lambda nx, ny: POLLEN[1] if nx * nx + ny * ny > .55 else POLLEN[2] if k < 2 else POLLEN[0])
    if k >= 2:
        ellipse(img, 24, 24, r - 5, r - 5, lambda nx, ny: POLLEN[0])
    for i in range(6):
        a = i * math.tau / 6 + .3
        d = r + 2
        img.put(int(24 + math.cos(a) * d), int(24 + math.sin(a) * d), BEETLE[3])
        img.put(int(25 + math.cos(a) * d), int(24 + math.sin(a) * d), BEETLE[2])
    return img


def build():
    boss, bf = directional_sheet(CELL, frame_fn, 20)
    death, df = directional_sheet(CELL, death_frame, 8)
    beetle, btf = directional_sheet(48, beetle_frame, 8)
    sheets = {
        'dirty-witch_walk-cast-whirl-fly-laugh.png': (boss, bf, CELL, 8),
        'dirty-witch_death.png': (death, df, CELL, 8),
        'beetle_walk-prime.png': (beetle, btf, 48, 2),
    }
    for fname, size, fn, cols in (('stork.png', 48, stork_frame, 4), ('dive-bird.png', 24, dive_frame, 4),
                                  ('flower-eye.png', 48, flower_frame, 8), ('witch-pollen.png', 16, pollen_frame, 4),
                                  ('witch-leaf.png', 16, leaf_frame, 4), ('witch-seed.png', 16, seed_frame, 4),
                                  ('beetle_burst.png', 48, beetle_burst_frame, 4)):
        sheet, frames = strip_sheet(size, fn, cols)
        sheets[fname] = (sheet, frames, size, 1)
    return sheets


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Brudnej Wiedźmy (bossa Bocianiego Ogrodu) i efektów jej ataków')
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
            bg = Image.new('RGBA', im.size, NIGHT)
            bg.alpha_composite(im)
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

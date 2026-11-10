#!/usr/bin/env python3
"""Generator bossa Cmentarzyska „Grzybowy Pożeracz” (krok 39; od kroku 184 kula z ciał) — wygląd z paczki właściciela
(grzybowy-pozeracz.zip, generator fungal_sprites.py), dopasowany do naszego uniwersum:

- palety z Cmentarzyska i Grzybni zamiast własnych: kapelusze z rampy kapelusza siewcy (ten sam grzyb, który
  siewcy wyrósł zamiast głowy), poświata soku w turkusie bioluminescencji Grzybni (świecąca grzybnia zarażonych),
  kość i mrok z palety `cmentarz_trupi`, rdza krat z rampy kałuży Sludge Kinga; krew i gnijące ciało jak w paczce;
- w kokonach śpią zarażeni z kroku 32b (blada, zimna skóra), bo z rozdartego kokonu wychodzi zarażony;
- układ arkuszy pod mechanikę Lorda z kroku 33: zamach obiema łapami zamiast tasaka (cios `Cleave`),
  drżenie i rozdarcie kokonu (zew i trafienie gracza);
- podglądy na podłodze Cmentarzyska.

Zasady jak u Matki Pająków (docs/STYLEGUIDE.md): widok z góry, postać rysowana raz na północ, 8 kierunków z obrotu
co 45°, obrys #1b1a22 po obrocie (4-sąsiedztwo), 6 kl./s, cieniowanie pasmowe ze światłem z lewej-przodu
w przestrzeni lokalnej, bez ditheringu, bez półprzezroczystości.

Użycie (z katalogu głównego repozytorium; Pillow + numpy z tools/requirements.txt):
    python tools/devourer_sprites.py                       # → public/assets/sprites/
    python tools/devourer_sprites.py --preview tools/out   # + podglądy na podłodze Cmentarzyska

Arkusze:
  fungal-devourer.png   96×96 · pivot 48,48, wiersze 8 kierunków N…NW;
                        0–3 szuranie (pętla), 4–7 pożarcie (telegraf, wypad, kłapnięcie, przeżuwanie),
                        8–11 karmienie kokonem (leczenie w kolumnie 11), 12–15 zamach łapami (uderzenie w 15),
                        16–19 wyrzut zarodników (krok 111; strąk w paszczy w 18), 20–23 skok (przysiad, wybicie, lot),
                        24–27 chwyt kończynami (krok 184)
  devourer-cocoon.png   48×48, wiersze = 3 warianty (twarz, dłoń, skulone ciało);
                        0–3 oddech, 4–7 zjedzenie (7 zostaje), 8–9 drżenie (zew), 10–13 rozdarcie (wychodzi zarażony)
  fungal-throne.png     96×96, tron z grzybni, oparcie na północy (dekoracja areny bez kolizji)
  fungal-fx.png         48×48, wiersz 0 krew (trafienie gracza), wiersz 1 sok (leczenie), 4 klatki bez pętli
  throne-decals.png     48×48, 6 naklejek: kałuża krwi, rozbryzg, ślad wleczenia, grzybnia, kałuża soku, krata
  mushroom-trail.png    48×48 (krok 111): płat grzybów ze śladu; 0–5 rozrost (promień 6→18 px = hitbox płatu),
                        6–7 puls soku, 8–9 więdnięcie
  spore-pod.png         24×24 (krok 111): strąk zarodników w locie, 4 klatki pulsu
  devourer-hand.png     24×24 (krok 184): ręka chwytu w locie; 0–1 otwarta, 2–3 zaciśnięta

Krok 184 (`#pozeracz`): Pożeracz to kula zlepiona z ciał zjedzonych (stylizacja geometryczna: blade tułowie,
głowy-kółka, kończyny-kapsuły), spleciona grzybnią, z paszczą z przodu; kolumny 24–27 to chwyt kończynami
(zamach, wyrzut rąk, chwyt, wciągnięcie do paszczy).
"""
import argparse
import math
import os
import random
import sys

import numpy as np
from PIL import Image

import tower_ruins_tiles as trt
from grave_enemies import CAP, SKIN

GRAVE = trt.PALETTES['cmentarz_trupi']
GROVE = trt.PALETTES['grzybnia']


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


OUTLINE = trt.OUT
FLOOR = GRAVE.floor[2]
FLOOR_DARK = GRAVE.floor[1]
VOID = GRAVE.deep[0]
# Ciało: gnijąca skóra (z paczki). Cień chłodny (fiolet-siniak), światło ciepłe (trupi beż).
FLESH = [hx(c) for c in ('#120d16', '#2a1c26', '#47303a', '#6b4c50', '#93766c')]
# Grzyb: kapelusze i oplot kokonów — rampa kapelusza siewcy (krok 32b), najciemniejszy ton na krawędź cienia.
MYC = [hx('#1f1626'), *CAP[:4]]
# Akcent 1: krew.
BLOOD = [hx(c) for c in ('#2e0a12', '#5e0f1a', '#9a1a22', '#cf3a2e')]
# Akcent 2: sok grzybni — bioluminescencja Grzybni (ten sam turkus, którym świeci grzybnia zarażonych).
# Co świeci, to sok: boss się nim leczy.
SAP = list(GROVE.flame)
# Kość z palety Cmentarzyska (jak kości i czaszki na posadzce).
BONE = list(GRAVE.bone)
# Rdza krat (rampa kałuży Sludge Kinga).
RUST = list(trt.DIRT[2:5])
# Zarażeni w kokonach (krok 32b): blada, zimna skóra.
VICTIM = list(SKIN)

PALETTE = {OUTLINE, VOID, *FLESH, *MYC, *BLOOD, *SAP, *BONE, *RUST, *VICTIM}

# Światło z lewej-przodu, z góry (przestrzeń lokalna: przód = -y).
_L = np.array([-0.55, -0.55, 0.63])
LX, LY, LZ = _L / np.linalg.norm(_L)

DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']


# ---------------------------------------------------------------- warstwa

class Layer:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), np.uint8)

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = c

    def solid(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.a[y, x, 3] > 0

    def paste(self, other):
        m = other.a[..., 3] > 0
        self.a[m] = other.a[m]


def band(d, n, r2, rim):
    """Indeks w rampie z jasności d. Najciemniejszy ton tylko na krawędzi od cienia."""
    if n == 5:
        idx = 1 if d < 0.30 else 2 if d < 0.66 else 3 if d < 0.90 else 4
        if rim and r2 > 0.78 and d < 0.25:
            idx = 0
    elif n == 4:
        idx = 0 if d < 0.15 else 1 if d < 0.55 else 2 if d < 0.88 else 3
    else:
        idx = 0 if d < 0.35 else 1 if d < 0.85 else 2
    return idx


def lit(nx, ny):
    r2 = nx * nx + ny * ny
    nz = math.sqrt(max(0.0, 1.0 - r2))
    return LX * nx + LY * ny + LZ * nz, r2


def ellipse(L, cx, cy, rx, ry, ramp, rim=True, clip=None, bias=0.0):
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            nx = (x + 0.5 - cx) / rx
            ny = (y + 0.5 - cy) / ry
            if nx * nx + ny * ny > 1.0:
                continue
            if clip and not clip(x, y):
                continue
            d, r2 = lit(nx, ny)
            L.put(x, y, ramp[band(d + bias, len(ramp), r2, rim)])


def capsule(L, ax, ay, bx, by, r0, r1, ramp, rim=True, tmin=0.0):
    vx, vy = bx - ax, by - ay
    ll = vx * vx + vy * vy or 1e-6
    rmax = max(r0, r1)
    for y in range(int(min(ay, by) - rmax) - 1, int(max(ay, by) + rmax) + 2):
        for x in range(int(min(ax, bx) - rmax) - 1, int(max(ax, bx) + rmax) + 2):
            px, py = x + 0.5, y + 0.5
            t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / ll))
            if t < tmin:
                continue
            r = r0 + (r1 - r0) * t
            nx = (px - (ax + vx * t)) / r
            ny = (py - (ay + vy * t)) / r
            if nx * nx + ny * ny > 1.0:
                continue
            d, r2 = lit(nx, ny)
            L.put(x, y, ramp[band(d, len(ramp), r2, rim)])


def disc(L, cx, cy, r, c):
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                L.put(x, y, c)


def line(L, pts, c, inside=None):
    """Kreska 1 px; z `inside` tylko w środku tej sylwetki (detale 1 px nie na brzegu)."""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            if inside is None or interior(inside, x, y):
                L.put(x, y, c)


def interior(L, x, y):
    return all(L.solid(x + dx, y + dy) for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)))


def blob(L, rng, cx, cy, r, ramp, n=6, spread=0.8):
    """Plama z kół (kałuże, rozbryzgi). Płaska: krawędź = najciemniejszy ton."""
    circles = [(cx, cy, r)]
    for _ in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.3, spread) * r
        circles.append((cx + math.cos(a) * d, cy + math.sin(a) * d, r * rng.uniform(0.35, 0.7)))
    inside = set()
    for (x0, y0, rr) in circles:
        for y in range(int(y0 - rr) - 1, int(y0 + rr) + 2):
            for x in range(int(x0 - rr) - 1, int(x0 + rr) + 2):
                if (x + 0.5 - x0) ** 2 + (y + 0.5 - y0) ** 2 <= rr * rr:
                    inside.add((x, y))
    for (x, y) in inside:
        edge = any((x + dx, y + dy) not in inside for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge:
            c = ramp[0]
        else:
            # Połysk mokrej krwi z lewej-góry, pasmowo.
            dd = ((x - cx) + (y - cy)) / max(r, 1)
            c = ramp[2] if dd < -0.55 else ramp[1]
        L.put(x, y, c)
    return inside


def droplets(L, rng, cx, cy, r0, r1, n, ramp, size=(0.6, 1.4)):
    for _ in range(n):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(r0, r1)
        s = rng.uniform(*size)
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        disc(L, x, y, s, ramp[2] if s > 1.0 else ramp[1])
        if s > 1.1:
            L.put(int(x), int(y), ramp[3])


def outline(L):
    m = L.a[..., 3] > 0
    n = np.zeros_like(m)
    n[1:, :] |= m[:-1, :]
    n[:-1, :] |= m[1:, :]
    n[:, 1:] |= m[:, :-1]
    n[:, :-1] |= m[:, 1:]
    edge = n & ~m
    L.a[edge] = OUTLINE


# ---------------------------------------------------------------- obrót

def rot45(arr, size):
    img = Image.fromarray(arr, 'RGBA')
    c = size / 2
    return np.array(img.rotate(-45, resample=Image.NEAREST, center=(c, c)))


def directions(arr, size):
    """8 kierunków N…NW (wiersz = round(kąt/45) % 8), kąt zgodnie z zegarem."""
    a0, a45 = arr, rot45(arr, size)
    out = []
    for i in range(8):
        base = a0 if i % 2 == 0 else a45
        out.append(np.rot90(base, k=-(i // 2)).copy())
    return out


def finish(body, fx, size):
    """Obrót → obrys → efekty bez obrysu (krew w locie, sok) na wierzch."""
    res = []
    for b, f in zip(directions(body.a, size), directions(fx.a, size)):
        L = Layer(size, size)
        L.a = b
        outline(L)
        F = Layer(size, size)
        F.a = f
        L.paste(F)
        res.append(L.a)
    return res


# ---------------------------------------------------------------- boss

# Krok 184 (`#pozeracz`, prośba właściciela): Pożeracz to kula zlepiona z ciał zjedzonych, spleciona grzybnią.
# Stylizacja geometryczna bez dosłownej makabry: blade tułowie i głowy (kółka, zamknięte oczy-kreski),
# kończyny jako kapsuły z dłońmi, jedna wielka paszcza z zębami-kośćmi z przodu (północ). Grzybnia i kapelusze
# zostają z Cmentarzyska/Grzybni (klimat biomu), sok świeci przy leczeniu.

BALL = (48, 50)      # środek kuli (przestrzeń lokalna, przód = -y)
BALL_R = 19
# Ciała w kuli: (kąt °, odległość od środka 0..1, rozmiar, poza: 0 skulony tułów, 1 głowa, 2 plecy).
BODIES = [
    (200, 0.72, 5.5, 0), (250, 0.70, 5.0, 2), (300, 0.68, 5.5, 0), (150, 0.70, 5.0, 2), (110, 0.66, 5.5, 0),
    (60, 0.70, 5.0, 2), (180, 0.30, 6.0, 2), (240, 0.32, 5.0, 0), (120, 0.34, 5.0, 0), (0, 0.10, 5.5, 2),
    (215, 0.55, 3.2, 1), (275, 0.50, 3.0, 1), (95, 0.52, 3.0, 1), (160, 0.85, 3.0, 1), (330, 0.60, 3.0, 1),
]
# Kończyny wystające z kuli: (kąt °, długość, zgięcie °) — 0° = przód; zgięcia na przemian „w złą stronę”.
LIMBS = [(-38, 15, 40), (38, 15, -40), (-82, 14, -55), (82, 14, 55), (-128, 13, 50), (128, 13, -50),
         (-165, 12, -35), (165, 12, 35)]
# Kapelusze na grzbiecie (klimat biomu): (kąt °, odległość, promień).
BALL_CAPS = [(200, 0.55, 3.5), (140, 0.62, 2.6), (250, 0.40, 2.2), (180, 0.80, 2.0)]
BALL_THREADS = [  # grzybnia wiążąca ciała (kąt startu, kąt końca, odległość)
    (130, 230, 0.58), (200, 300, 0.50), (60, 150, 0.48), (250, 330, 0.75), (20, 100, 0.80),
]


def polar(cx, cy, ang, d):
    a = math.radians(ang)
    return cx + math.sin(a) * d, cy - math.cos(a) * d


def draw_limb(L, cx, cy, r, ang, length, bend, grasp=False, twitch=0.0):
    """Kończyna z kuli: ramię od barku pod powierzchnią, łokieć wygięty o `bend`, przedramię wraca ostrzej
    (nienaturalnie), na końcu dłoń — otwarta (3 palce) albo zaciśnięta."""
    sx, sy = polar(cx, cy, ang, r * 0.8)
    ex, ey = polar(sx, sy, ang + bend + twitch, length * 0.5)
    hx_, hy_ = polar(ex, ey, ang - bend * 1.3 - twitch, length * 0.55)
    capsule(L, sx, sy, ex, ey, 2.7, 2.2, VICTIM)
    capsule(L, ex, ey, hx_, hy_, 2.2, 1.8, VICTIM)
    draw_hand(L, hx_, hy_, math.degrees(math.atan2(hx_ - ex, -(hy_ - ey))), grasp)
    return hx_, hy_


def draw_hand(L, x, y, ang, grasp):
    if grasp:
        ellipse(L, x, y, 2.6, 2.6, VICTIM)
        return
    ellipse(L, x, y, 2.3, 2.3, VICTIM)
    for da in (-40, 0, 40):
        tx, ty = polar(x, y, ang + da, 4.2)
        capsule(L, x, y, tx, ty, 1.0, 0.8, VICTIM, rim=False)


def fang(L, bx, by, tx, ty, base):
    """Kieł: klin z kości od nasady (bx, by) do szpica (tx, ty) — zwężająca się kapsuła, szpic jasny."""
    capsule(L, bx, by, tx, ty, base, 0.45, BONE, rim=False)
    L.put(int(round(tx)), int(round(ty)), BONE[2])


def draw_mouth(L, cx, cy, k, r):
    """Paszcza z przodu kuli; k = 0 zamknięta szczelina … 4 rozwarta. Krok 184a (prośba właściciela: „większe,
    bardziej wampirze zęby, by nadać głębi”): po dwa długie kły z przedniej i tylnej wargi zachodzą na gardziel,
    między nimi krótsze zęby, a w głębi drugi, ciemniejszy pierścień zębów nad czarną gardzielą."""
    mx, my = cx, cy - r * 0.42
    w = 7 + k * 1.4
    h = 1.6 + k * 1.9
    if k == 0:
        line(L, [(mx - w, my), (mx + w, my)], VOID)
        for x in range(int(mx - w) + 1, int(mx + w), 2):
            L.put(x, int(my) - 1, BONE[1])
        # Kły wystają ze zwartej paszczy: przednie w dół, tylne w górę, na krzyż przez szczelinę.
        for sx in (-1, 1):
            fang(L, mx + sx * w * 0.42, my - 1.5, mx + sx * w * 0.36, my + 3.5, 1.3)
            fang(L, mx + sx * w * 0.72, my + 1.5, mx + sx * w * 0.70, my - 2.5, 1.0)
        return
    ellipse(L, mx, my, w + 1.8, h + 1.8, FLESH, rim=False, bias=-0.2)
    ellipse(L, mx, my, w, h, BLOOD[:3], rim=False, bias=-0.6)
    # Głębia: gardziel coraz ciemniejsza do środka.
    ellipse(L, mx, my + h * 0.15, w * 0.72, h * 0.7, [BLOOD[0], BLOOD[0], BLOOD[1]], rim=False, bias=-0.4)
    ellipse(L, mx, my + h * 0.2, w * 0.45, h * 0.42, [VOID, VOID, VOID], rim=False)
    # Drugi pierścień zębów w głębi: krótkie, ciemniejsza kość.
    n = 8 + k * 2
    for i in range(n):
        a = math.tau * (i + 0.5) / n
        bx, by = mx + math.cos(a) * w * 0.7, my + math.sin(a) * h * 0.68
        tx, ty = mx + math.cos(a) * w * 0.5, my + math.sin(a) * h * 0.45
        line(L, [(bx, by), (tx, ty)], BONE[0])
    # Zewnętrzny pierścień: grubsze kliny na brzegu wargi.
    for i in range(n):
        a = math.tau * i / n
        if abs(math.sin(a)) < 0.35:   # kąciki ust bez zębów — tam siedzą kły
            continue
        bx, by = mx + math.cos(a) * w, my + math.sin(a) * h
        tx, ty = mx + math.cos(a) * w * 0.82, my + math.sin(a) * h * 0.72
        capsule(L, bx, by, tx, ty, 0.8, 0.35, BONE[:2] + [BONE[1]], rim=False)
    # Kły: dwa długie z przedniej wargi (−y) i dwa krótsze z tylnej, szpice w głąb gardzieli.
    reach = 0.95 if k >= 3 else 0.75
    for sx in (-1, 1):
        fx_ = mx + sx * w * 0.38
        fang(L, fx_, my - h - 1.0, fx_ + sx * 0.8, my - h + h * 2 * reach * 0.66, 2.1)
        bx_ = mx + sx * w * 0.62
        fang(L, bx_, my + h + 0.5, bx_ - sx * 0.4, my + h - h * 2 * reach * 0.4, 1.3)


# Ciała wystające poza obrys kuli — sylwetka jest nierówna, zlepiona (kąt °, rozmiar).
EDGE_BODIES = [(60, 5.0), (115, 5.5), (165, 5.0), (210, 6.0), (255, 5.0), (300, 5.5), (95, 3.5), (235, 3.5)]


def ball_body(L, cx, cy, rx, ry, roll, glow):
    sx, sy = rx / BALL_R, ry / BALL_R
    for (ang, size) in EDGE_BODIES:
        x, y = polar(cx, cy, ang + roll, BALL_R * 0.92)
        x, y = cx + (x - cx) * sx, cy + (y - cy) * sy
        ax, ay = polar(x, y, ang + roll + 90, size * 0.7)
        bx, by = polar(x, y, ang + roll - 90, size * 0.7)
        capsule(L, ax, ay, bx, by, size * 0.62, size * 0.55, VICTIM)
    ellipse(L, cx, cy, rx * 0.97, ry * 0.97, FLESH)
    sx, sy = rx / BALL_R, ry / BALL_R
    for (ang, d, size, kind) in BODIES:
        x, y = polar(cx, cy, ang + roll, d * BALL_R)
        x, y = cx + (x - cx) * sx, cy + (y - cy) * sy
        tang = ang + roll + 90
        if kind == 1:   # głowa: kółko, zamknięte oczy (kreski), bez rysów twarzy
            ellipse(L, x, y, size, size, VICTIM)
            ex, ey = polar(x, y, tang, 1.4)
            L.put(int(ex), int(ey), VICTIM[0])
            ex, ey = polar(x, y, tang + 180, 1.4)
            L.put(int(ex), int(ey), VICTIM[0])
        elif kind == 0:  # skulony tułów: owal z kręgosłupem
            ax, ay = polar(x, y, tang, size * 0.6)
            bx, by = polar(x, y, tang + 180, size * 0.6)
            capsule(L, ax, ay, bx, by, size * 0.55, size * 0.5, VICTIM)
            line(L, [(ax, ay), (bx, by)], VICTIM[1], inside=L)
        else:            # plecy: większy owal w cieniu (ciało głębiej w kuli)
            ellipse(L, x, y, size, size * 0.75, VICTIM[:4], bias=-0.15)
    # Grzybnia wiąże ciała.
    for (a0, a1, d) in BALL_THREADS:
        pts = [polar(cx, cy, a0 + roll + (a1 - a0) * t / 6, d * BALL_R * (1 + 0.08 * math.sin(t))) for t in range(7)]
        pts = [(cx + (x - cx) * sx, cy + (y - cy) * sy) for x, y in pts]
        line(L, pts, MYC[3], inside=L)
    for (ang, d, r) in BALL_CAPS:
        x, y = polar(cx, cy, ang + roll * 0.5, d * BALL_R)
        ellipse(L, x, y * 1.0, r, r * 0.85, MYC)
        L.put(int(x), int(y), SAP[2] if glow else MYC[4])
    # Krosty soku: puls jasnością (leczenie).
    for (ang, d) in ((230, 0.45), (130, 0.5), (290, 0.62), (70, 0.6)):
        x, y = polar(cx, cy, ang + roll, d * BALL_R)
        c = SAP[1] if glow == 0 else SAP[2] if glow == 1 else SAP[3]
        disc(L, x, y, 1.0 + 0.5 * glow, c)


def boss_frame(p):
    body = Layer(96, 96)
    fx = Layer(96, 96)
    cx, cy = BALL[0], BALL[1] + p.get('dy', 0)
    rx = BALL_R * p.get('sx', 1.0)
    ry = BALL_R * p.get('sy', 1.0)
    roll = p.get('roll', 0)
    limbs = p.get('limbs', LIMBS)
    tw = p.get('twitch', [0] * len(limbs))
    for (ang, length, bend), t in zip(limbs, tw):
        draw_limb(body, cx, cy, min(rx, ry), ang, length, bend, grasp=p.get('grasp', False), twitch=t)
    ball_body(body, cx, cy, rx, ry, roll, p.get('glow', 0))
    draw_mouth(body, cx, cy, p.get('jaw', 0), ry)
    # Ręce chwytu (krok 184): z paszczy wystrzelają dwie długie kończyny.
    for (ang, length, bend, grasp) in p.get('reach', []):
        draw_limb(body, cx, cy - ry * 0.42, 3, ang, length, bend, grasp=grasp)
    if p.get('puff'):
        droplets(fx, random.Random(3), cx, cy, 12, 21, 14, SAP, size=(0.5, 1.2))
    if 'pod' in p:
        spore_pod(fx, cx, cy - ry * 0.42 - 2, 0)
    if p.get('spores'):
        n = 8 if p['spores'] == 1 else 18
        droplets(fx, random.Random(5), cx, cy - ry * 0.42 - 6, 2, 5 + 3 * p['spores'], n, SAP, size=(0.5, 1.1))
    if p.get('drip'):
        my = cy - ry * 0.42
        for dx, dy in ((-3, -4), (2, -5), (0, -6), (4, -3)):
            fx.put(int(cx + dx), int(my + dy), BLOOD[2])
    return finish(body, fx, 96)


HAND = 24


def hand_frame(f):
    """Ręka chwytu w locie (krok 184), 24×24, dłoń na północ (gra obraca ją w kierunku lotu):
    0–1 otwarta (palce drgają), 2–3 zaciśnięta."""
    L = Layer(HAND, HAND)
    capsule(L, 12, 19, 12, 14, 2.4, 2.2, VICTIM)
    if f < 2:
        ellipse(L, 12, 11, 3.2, 3.2, VICTIM)
        for da in (-45, 0, 45):
            tx, ty = polar(12, 11, da + (6 if f else -6), 6.5)
            capsule(L, 12, 11, tx, ty, 1.2, 0.9, VICTIM, rim=False)
    else:
        ellipse(L, 12, 12, 3.6, 3.4 - (f - 2) * 0.4, VICTIM)
        line(L, [(10, 10), (14, 10)], VICTIM[1], inside=L)
    outline(L)
    return L.a


def crawl(i, amp=10):
    """Kończyny przy szuraniu: pary na przemian sięgają i podciągają kulę; drgania na zmianę — nierówny rytm."""
    out = []
    for j, (ang, length, bend) in enumerate(LIMBS):
        ph = (i + (j % 2) * 2) % 4
        reach = [1.0, 1.15, 0.85, 0.7][ph]
        out.append((ang + (amp if ph == 1 else -amp / 2 if ph == 3 else 0) * (1 if ang < 0 else -1), length * reach, bend))
    return out


def walk_pose(i):
    return dict(roll=i * 14, limbs=crawl(i), twitch=[(-12, 8, 15, -6, 4, -14, 10, -4)[(k + i * 3) % 8] for k in range(8)],
                sx=[1.0, 1.05, 0.97, 1.03][i], sy=[1.0, 0.95, 1.04, 0.98][i], dy=[0, -1, 0, 1][i])


def bite_pose(i):
    if i == 0:   # paszcza się rozwiera, kończyny rozkładają się
        return dict(jaw=2, glow=1, limbs=crawl(0, 18), sy=1.04)
    if i == 1:   # wypad
        return dict(jaw=4, dy=-4, sy=1.08, sx=0.95, limbs=crawl(1, 6))
    if i == 2:   # kłapnięcie
        return dict(jaw=0, dy=-5, sy=1.06, limbs=crawl(2, 6), drip=True)
    return dict(jaw=1, dy=-2, limbs=crawl(3), drip=True)   # przeżuwanie


FRONT = [(-60, 15, 30), (60, 15, -30), (-25, 16, 20), (25, 16, -20)]
BACK = [(-128, 13, 50), (128, 13, -50), (-165, 12, -35), (165, 12, 35)]


def feed_pose(i):
    if i == 0:   # kończyny sięgają do kokonu
        return dict(jaw=1, glow=1, limbs=BACK + [(a, l + 4, b) for a, l, b in FRONT])
    if i == 1:   # chwyt: zaciśnięte dłonie, paszcza rozwarta
        return dict(jaw=4, glow=1, grasp=True, limbs=BACK + [(a * 0.7, l, b) for a, l, b in FRONT], dy=-2)
    if i == 2:   # wciąga do paszczy
        return dict(jaw=3, glow=1, grasp=True, limbs=BACK + [(a * 0.5, l * 0.6, b) for a, l, b in FRONT], dy=-3, sy=1.05)
    return dict(jaw=0, glow=2, puff=True, sx=1.06, sy=1.06)   # przełknięcie: leczenie, kula pęcznieje


def smash_pose(i):
    if i == 0:   # kończyny cofnięte, kula się kurczy
        return dict(limbs=[(a * 1.2 if abs(a) < 140 else a, l * 0.8, b) for a, l, b in LIMBS], sx=0.95, sy=0.95, glow=1)
    if i == 1:   # kończyny w górze i szeroko — telegraf
        return dict(limbs=[(a * 1.3 if abs(a) < 120 else a, l * 1.15, -b) for a, l, b in LIMBS], glow=1, jaw=1)
    if i == 2:   # opadają do przodu
        return dict(limbs=BACK + FRONT, jaw=2, dy=-2)
    return dict(limbs=BACK + [(a * 0.6, l, b * 0.5) for a, l, b in FRONT], jaw=2, dy=-4, sy=0.94, sx=1.06, drip=True)


def spit_pose(i):
    if i == 0:
        return dict(sy=0.94, sx=1.04, dy=2, glow=1, limbs=crawl(0, 14))
    if i == 1:
        return dict(sy=1.08, sx=1.08, glow=2, jaw=1, limbs=crawl(1, 14))
    if i == 2:
        return dict(jaw=4, glow=1, pod=True, spores=1, limbs=crawl(2, 6))
    return dict(jaw=3, glow=1, spores=2, limbs=crawl(3, 6))


def leap_pose(i):
    if i == 0:   # przysiad: kula spłaszczona, kończyny podkulone
        return dict(sx=1.1, sy=0.88, glow=1, limbs=[(a, l * 0.7, b * 1.4) for a, l, b in LIMBS])
    if i == 1:
        return dict(sx=1.16, sy=0.84, glow=2, limbs=[(a, l * 0.6, b * 1.6) for a, l, b in LIMBS])
    if i == 2:   # wybicie: kula wydłużona w przód
        return dict(sx=0.9, sy=1.12, dy=-2, jaw=2, limbs=[(a, l * 1.2, b * 0.4) for a, l, b in LIMBS])
    return dict(sx=0.94, sy=1.08, dy=-3, jaw=4, limbs=BACK + [(a, l + 2, b * 0.3) for a, l, b in FRONT])


def grab_pose(i):
    """Chwyt kończynami (krok 184): ręce wystrzelają z paszczy, łapią i wracają do niej z ofiarą."""
    if i == 0:   # zamach: kula cofa się, paszcza rozwiera, dłonie w gardzieli
        return dict(jaw=3, glow=1, dy=3, sy=0.95, limbs=crawl(0, 16), reach=[(-20, 8, 50, False), (20, 8, -50, False)])
    if i == 1:   # wyrzut: dwie długie ręce sięgają do przodu, dłonie otwarte
        return dict(jaw=4, dy=1, limbs=crawl(1, 6), reach=[(-16, 24, 14, False), (16, 24, -14, False)])
    if i == 2:   # chwyt: zaciśnięte dłonie, ręce w pół drogi
        return dict(jaw=4, limbs=crawl(2, 6), reach=[(-16, 16, 25, True), (16, 16, -25, True)])
    return dict(jaw=4, dy=-2, sy=1.05, glow=1, limbs=crawl(3, 10), reach=[(-14, 7, 40, True), (14, 7, -40, True)])


# ---------------------------------------------------------------- kokony

def cocoon(variant, frame):
    """Kokon z zarażonym pokrytym grzybem. Rekwizyt: bez kierunków, wiersz = wariant.
    0–3 oddech, 4–7 zjedzenie (Pożeracz, klatka 7 zostaje na podłodze), 8–9 drżenie (zew),
    10–13 rozdarcie od środka: wychodzi zarażony (klatka 13 to pusty oplot na podłodze)."""
    under = Layer(48, 48)
    body = Layer(48, 48)
    fx = Layer(48, 48)
    rng = random.Random(11 + variant)
    shake = 0
    if frame < 4:
        breathe, glow, consumed, torn = [0, 1, 1, 0][frame], [1, 2, 2, 1][frame], -1, -1
    elif frame < 8:
        breathe, glow, consumed, torn = 0, 0, frame - 4, -1
    elif frame < 10:
        breathe, glow, consumed, torn = 1, 3, -1, -1
        shake = -1 if frame == 8 else 1
    else:
        breathe, glow, consumed, torn = 0, 0, -1, frame - 10
    # Rozdarcie od środka rysujemy jak zjedzenie, ale bez kałuży krwi i z wychodzącym zarażonym.
    opened = consumed if consumed >= 0 else torn
    cx = 24 + shake
    rx, ry = (12, 13) if variant == 2 else (8.5, 15)
    rx += breathe * 0.6

    if consumed >= 1:
        blob(under, rng, 24, 25, 6 + consumed * 1.3, BLOOD if consumed < 3 else BLOOD[:1] + BLOOD[:3], n=7)

    if opened < 1:
        ellipse(body, cx, 24, rx, ry, MYC)
        # Włókna oplotu: krótkie skośne kreski.
        for i in range(-3, 4):
            yy = 24 + i * 4
            line(body, [(cx - rx + 2, yy + 2), (cx + rx - 3, yy - 2)], MYC[2], inside=body)
        # Żyły soku.
        vc = SAP[glow]
        line(body, [(cx - 3, 10), (cx - 5, 20), (cx - 3, 30), (cx - 4, 37)], vc, inside=body)
        line(body, [(cx + 3, 12), (cx + 5, 23), (cx + 3, 34)], vc, inside=body)
        if variant == 0:  # twarz w otworze
            ellipse(body, cx, 13, 4.5, 5, VICTIM, bias=0.35)
            body.put(cx - 2, 12, VICTIM[0]); body.put(cx + 2, 12, VICTIM[0])
            body.put(cx - 1, 16, BLOOD[0]); body.put(cx, 16, BLOOD[0]); body.put(cx, 15, BLOOD[1])
            body.put(cx - 2, 13, BLOOD[2]); body.put(cx - 2, 14, BLOOD[1])  # krwawa łza
            line(body, [(cx + 2, 9), (cx + 1, 11), (cx + 3, 14)], MYC[3], inside=body)
        elif variant == 1:  # dłoń przebija oplot
            capsule(body, cx + 5, 24, cx + 10, 20, 2.6, 2.2, VICTIM)
            ellipse(body, cx + 10, 20, 2.6, 2.6, VICTIM, bias=0.3)
            for (tx, ty) in ((13, 17), (14, 20), (12, 23)):
                capsule(body, cx + 10, 20, cx + tx, ty, 1.0, 0.9, VICTIM)
            ellipse(body, cx + 6, 24, 2.5, 3, BLOOD, rim=False)
            # Zarys twarzy pod oplotem.
            body.put(cx - 1, 12, MYC[1]); body.put(cx + 1, 12, MYC[1]); body.put(cx, 15, MYC[1])
        else:  # skulone ciało (pozycja płodowa)
            ellipse(body, cx - 6, 17, 4.5, 4.5, VICTIM, bias=0.35)
            body.put(cx - 7, 16, VICTIM[0]); body.put(cx - 5, 18, BLOOD[0])
            ellipse(body, cx + 6, 30, 3.5, 3, VICTIM)       # kolano
            ellipse(body, cx + 5, 18, 2.5, 2.5, VICTIM)     # dłoń przy twarzy
            line(body, [(cx - 8, 20), (cx - 7, 23)], BLOOD[2], inside=body)
        if opened == 0:  # rozdarcie: szrama i krew w locie (przy wyjściu zarażonego — strzępki soku)
            ellipse(body, cx, 24, 3, 9, BLOOD, rim=False, bias=-0.2)
            droplets(fx, rng, 24, 22, 5, 13, 16, BLOOD if consumed == 0 else SAP)
    else:
        # Rozdarta łupina: połówki rozchylone, w środku żebra (zjedzony) albo wychodzący zarażony.
        open_ = 4 + min(opened, 2)
        ellipse(body, 24, 24, open_ + 1, ry - 1, BLOOD if consumed >= 0 else MYC[:3], rim=False, bias=-0.3)
        if consumed >= 0:
            for y in range(15, 34, 3):
                line(body, [(24 - open_ + 2, y), (24 + open_ - 2, y)], BONE[1] if consumed < 3 else BONE[0])
            body.put(24, 13, BONE[2]); body.put(23, 13, BONE[1])
        hw = 4.5 - (0.5 if opened == 3 else 0)
        ellipse(body, 24 - open_ - 1, 24, hw, ry - 1, MYC)
        ellipse(body, 24 + open_ + 1, 24, hw, ry - 1, MYC)
        if consumed == 1:
            droplets(fx, rng, 24, 24, 8, 15, 10, BLOOD)
        if torn in (1, 2):  # zarażony wstaje z oplotu: głowa wychodzi do przodu
            hy = 18 - (torn - 1) * 5
            ellipse(body, 24, hy, 4, 4, VICTIM, bias=0.2)
            body.put(22, hy + 2, VICTIM[0]); body.put(24, hy + 3, VICTIM[0]); body.put(26, hy + 2, VICTIM[0])
            body.put(23, hy - 1, MYC[3])
            if torn == 1:
                droplets(fx, rng, 24, 22, 8, 14, 8, SAP, size=(0.5, 1.0))
        if opened >= 2:
            line(body, [(18, 18), (17, 26), (18, 32)], SAP[1] if opened == 2 else MYC[1], inside=body)
    outline(body)
    res = Layer(48, 48)
    res.paste(under)
    res.paste(body)
    res.paste(fx)
    return res.a


# ---------------------------------------------------------------- tron

def throne():
    under = Layer(96, 96)
    body = Layer(96, 96)
    rng = random.Random(5)
    # Krew spływa po stopniu (podłoga, bez obrysu).
    blob(under, rng, 48, 76, 9, BLOOD, n=8, spread=1.0)
    for x in (40, 45, 52, 57):
        line(under, [(x, 70), (x + rng.randint(-1, 1), 84)], BLOOD[1])
    # Masa grzybni.
    ellipse(body, 48, 50, 33, 26, MYC)
    ellipse(body, 48, 30, 32, 15, MYC)
    # Wtopione ciała w oparciu: twarze i ręce.
    for (fx_, fy_) in ((30, 30), (48, 26), (66, 30)):
        ellipse(body, fx_, fy_, 4.5, 5, FLESH)
        body.put(fx_ - 2, fy_ - 1, FLESH[0]); body.put(fx_ + 2, fy_ - 1, FLESH[0])
        body.put(fx_, fy_ + 2, BLOOD[0]); body.put(fx_ - 1, fy_ + 2, BLOOD[1])
    for (ax, ay, bx, by) in ((20, 34, 13, 22), (76, 34, 83, 22), (38, 24, 35, 13), (58, 24, 61, 13)):
        capsule(body, ax, ay, bx, by, 2.6, 2.0, FLESH)
        for ang in (-0.5, 0.5):
            dx, dy = bx - ax, by - ay
            n = math.hypot(dx, dy)
            dx, dy = dx / n, dy / n
            cx = dx * math.cos(ang) - dy * math.sin(ang)
            cy = dx * math.sin(ang) + dy * math.cos(ang)
            capsule(body, bx, by, bx + cx * 3, by + cy * 3, 1.0, 0.9, FLESH)
    # Kapelusze koronują oparcie.
    for (x, y, r) in ((17, 40, 4), (79, 40, 4), (36, 18, 4.5), (60, 18, 4.5), (24, 22, 7), (72, 22, 7), (48, 16, 7.5)):
        ellipse(body, x, y, r, r * 0.92, MYC)
        body.put(int(x), int(y), MYC[1])
    for (x, y) in ((22, 20), (70, 20), (46, 14), (50, 17)):
        body.put(x, y, BONE[1])
    # Siedzisko: wgłębienie pełne krwi.
    ellipse(body, 48, 52, 16, 12, MYC, bias=-0.6)
    seat = Layer(96, 96)
    blob(seat, rng, 48, 54, 9, BLOOD, n=6, spread=0.7)
    m = seat.a[..., 3] > 0
    body.a[m] = seat.a[m]
    # Podłokietniki zakończone czaszkami.
    for sx in (24, 72):
        capsule(body, sx, 40, sx, 64, 6, 5, MYC)
        ellipse(body, sx, 67, 4.5, 4.5, BONE, rim=False)
        body.put(sx - 2, 68, VOID); body.put(sx + 1, 68, VOID); body.put(sx, 70, VOID)
    # Krosty soku.
    for (x, y) in ((31, 46), (65, 47), (40, 38), (57, 37), (20, 52), (76, 53), (48, 38)):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            body.put(x + dx, y + dy, SAP[2])
        body.put(x, y, SAP[3])
    # Grzybnia.
    for t in ([(32, 60), (28, 66)], [(64, 60), (68, 66)], [(40, 40), (36, 46), (34, 52)], [(56, 40), (60, 46), (62, 52)]):
        line(body, t, MYC[3], inside=body)
    outline(body)
    res = Layer(96, 96)
    res.paste(under)
    res.paste(body)
    return res.a


# ---------------------------------------------------------------- efekty

def fx_blood(i):
    L = Layer(48, 48)
    rng = random.Random(21)
    if i == 0:
        ellipse(L, 24, 24, 5, 5, BLOOD, rim=False)
        L.put(23, 23, BLOOD[3]); L.put(22, 22, BLOOD[3])
    elif i == 1:
        ellipse(L, 24, 24, 7, 6.5, BLOOD, rim=False)
        droplets(L, rng, 24, 24, 7, 12, 16, BLOOD)
    elif i == 2:
        ellipse(L, 24, 24, 4, 3.5, BLOOD, rim=False, bias=-0.3)
        droplets(L, rng, 24, 24, 10, 15, 22, BLOOD)
    else:
        for _ in range(9):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(5, 14)
            disc(L, 24 + math.cos(a) * d, 24 + math.sin(a) * d, rng.uniform(0.8, 1.8), BLOOD[1])
        disc(L, 24, 24, 2.5, BLOOD[0])
    return L.a


def fx_spore(i):
    L = Layer(48, 48)
    rng = random.Random(31)
    if i == 0:
        ellipse(L, 24, 24, 4, 4, SAP, rim=False)
    elif i == 1:
        ellipse(L, 24, 24, 3, 3, SAP, rim=False, bias=-0.2)
        droplets(L, rng, 24, 24, 5, 10, 14, SAP, size=(0.5, 1.3))
    elif i == 2:
        droplets(L, rng, 24, 24, 9, 14, 18, SAP, size=(0.5, 1.2))
    else:
        for _ in range(10):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(11, 15)
            L.put(int(24 + math.cos(a) * d), int(24 + math.sin(a) * d), SAP[1])
    return L.a


def spore_pod(L, cx, cy, f):
    """Strąk zarodników (krok 111): kapelusz grzybni zwinięty w kulę, pęknięcia świecą sokiem; `f` = puls 0–3."""
    r = 5.5 + (0.5 if f in (1, 2) else 0)
    ellipse(L, cx, cy, r, r * 0.9, MYC)
    glow = SAP[3] if f == 2 else SAP[2]
    for a in (0.4, 2.3, 4.2):  # pęknięcia od środka, obrót z klatką
        a += f * 0.5
        line(L, [(cx, cy), (cx + math.cos(a) * (r - 1.5), cy + math.sin(a) * (r - 1.5))], SAP[1], inside=L)
        L.put(int(round(cx + math.cos(a) * (r - 2))), int(round(cy + math.sin(a) * (r - 2))), glow)
    L.put(int(cx), int(cy), glow)


def pod_frame(f):
    L = Layer(POD, POD)
    spore_pod(L, POD / 2, POD / 2, f)
    outline(L)
    return L.a


# Promienie klatek rozrostu = webPatchRadius w grze (bossConfig.FUNGAL_DEVOURER.trail.patch: 6 → 18 px).
TRAIL = 48
TRAIL_RADII = (6, 8, 11, 13, 16, 18, 18, 18, 18, 18)
POD = 24


def trail_frame(f):
    """Płat grzybów ze śladu Pożeracza (krok 111): ciemna mata grzybni z kościstymi kapeluszami i kroplami soku.
    0–5 rozrost, 6–7 puls soku, 8–9 więdnięcie. Zasięg maty = promień płatu (hitbox łapie ślad stóp)."""
    L = Layer(TRAIL, TRAIL)
    c = TRAIL / 2
    rad = TRAIL_RADII[f]
    r = random.Random(1110)  # ten sam kształt w każdej klatce — płat rośnie, a nie skacze
    lobes = [r.uniform(.8, 1.0) for _ in range(12)]
    wither = f >= 8
    for y in range(TRAIL):
        for x in range(TRAIL):
            dx, dy = x + .5 - c, y + .5 - c
            d = math.hypot(dx, dy)
            a = (math.atan2(dy, dx) + math.pi) / (2 * math.pi) * 12
            i0 = int(a) % 12
            edge = rad * (lobes[i0] + (lobes[(i0 + 1) % 12] - lobes[i0]) * (a - int(a)))
            if d > edge - .5:
                continue
            t = d / edge
            if d > edge - 1.6 and not wither and f >= 2:
                # Brzeg płatu (= zasięg) świeci sokiem — grzyby widać na ciemnej posadzce Cmentarzyska.
                L.put(x, y, SAP[2] if f in (6, 7) and (x + y) % 3 == 0 else SAP[1])
                continue
            L.put(x, y, MYC[0] if t > .82 or wither else (MYC[1] if t > .4 else MYC[2]))
    for k in range(7):  # strzępki na brzegu
        ang = r.uniform(0, math.tau)
        for j in range(int(rad * .5), int(rad) - 1):
            L.put(int(c + math.cos(ang) * j), int(c + math.sin(ang) * j), FLESH[2] if wither else MYC[3])
    # Kapelusze: więcej i większe, im starszy płat; przy więdnięciu opadają (ciemnieją i maleją).
    caps = [(0, 0, 3.0)] + [(k * math.tau / 6 + r.uniform(-.4, .4), r.uniform(.45, .68), r.uniform(1.8, 2.8)) for k in range(6)]
    shown = min(len(caps), 1 + f) if f < 6 else len(caps) - (3 if f == 9 else 0)
    for k, (ang, dist, size) in enumerate(caps[:shown]):
        x, y = c + math.cos(ang) * dist * rad, c + math.sin(ang) * dist * rad
        sz = size * min(1.0, rad / 14) * (.7 if wither else 1)
        ellipse(L, x, y, sz, sz * .85, FLESH[:4] if wither else BONE)
        if not wither:
            L.put(int(x), int(y), MYC[1])
    pulse = f in (6, 7)
    for k in range(2 + min(f, 4)):  # krople soku
        ang, dist = r.uniform(0, math.tau), r.uniform(.2, .75)
        if wither and k % 2:
            continue
        x, y = int(c + math.cos(ang) * dist * rad), int(c + math.sin(ang) * dist * rad)
        L.put(x, y, SAP[3] if pulse and (k + f) % 2 == 0 else SAP[2])
        if pulse:
            L.put(x + 1, y, SAP[1])
    return L.a


# ---------------------------------------------------------------- naklejki podłogi

def decal(i):
    L = Layer(48, 48)
    rng = random.Random(41 + i)
    if i == 0:    # kałuża krwi
        blob(L, rng, 24, 24, 11, BLOOD, n=8, spread=0.9)
        L.put(19, 19, BLOOD[3]); L.put(20, 19, BLOOD[3])
    elif i == 1:  # rozbryzg
        blob(L, rng, 24, 24, 6, BLOOD, n=5)
        droplets(L, rng, 24, 24, 8, 15, 18, BLOOD)
    elif i == 2:  # ślad wleczenia ciała
        blob(L, rng, 35, 24, 4.5, BLOOD, n=5)
        for k, y in enumerate((20, 22, 23, 25, 26, 28)):
            x = 32
            end = 9 + rng.randint(0, 8)
            while x > end:
                seg = rng.randint(2, 6)
                line(L, [(x, y), (max(end, x - seg), y)], BLOOD[1] if k % 3 else BLOOD[0])
                x -= seg + rng.randint(0, 2)
            if rng.random() < 0.6:
                L.put(x + 1, y, BLOOD[2])
        for (x, y) in ((12, 33), (14, 34), (16, 33), (13, 35), (15, 36)):  # odcisk palców
            L.put(x, y, BLOOD[2])
    elif i == 3:  # placek grzybni
        for _ in range(9):
            a = rng.uniform(0, math.tau)
            d = rng.uniform(6, 15)
            line(L, [(24, 24), (24 + math.cos(a) * d * 0.5 + rng.uniform(-2, 2), 24 + math.sin(a) * d * 0.5),
                     (24 + math.cos(a) * d, 24 + math.sin(a) * d)], MYC[2])
        ellipse(L, 24, 24, 4, 3.5, MYC, rim=False)
        for (x, y, r) in ((16, 18, 2), (31, 29, 2.5), (29, 15, 1.6), (17, 31, 1.6)):
            ellipse(L, x, y, r, r, MYC[1:], rim=False)
        L.put(25, 23, SAP[2])
    elif i == 4:  # kałuża soku
        blob(L, rng, 24, 25, 5.5, SAP, n=5)
        L.put(21, 22, SAP[3])
        droplets(L, rng, 24, 25, 10, 15, 8, SAP, size=(0.5, 1.0))
    else:         # zardzewiała krata, krew sączy się przez szczeliny (Silent Hill)
        for y in range(9, 39):
            for x in range(9, 39):
                if (x - 9) % 5 == 0 or (y - 9) % 5 == 0 or x in (9, 38) or y in (9, 38):
                    c = RUST[2] if ((x + y) % 7 == 0) else RUST[1]
                    if (x - 9) % 5 == 0 and (y - 9) % 5 == 0:
                        c = RUST[0]
                    L.put(x, y, c)
                else:
                    L.put(x, y, VOID)
        for (x, y) in ((16, 17), (17, 17), (21, 22), (22, 22), (21, 23), (27, 28), (31, 32), (26, 22)):
            L.put(x, y, BLOOD[1])
        for y in range(28, 39):
            L.put(31, y, BLOOD[1] if y % 2 else BLOOD[0])
    return L.a


# ---------------------------------------------------------------- arkusze

def sheet(cells, cell):
    rows, cols = len(cells), len(cells[0])
    out = np.zeros((rows * cell, cols * cell, 4), np.uint8)
    for r, row in enumerate(cells):
        for c, a in enumerate(row):
            out[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = a
    return out


def validate(name, arr, cell, margin=8):
    a = arr[..., 3]
    assert set(np.unique(a)) <= {0, 255}, f'{name}: półprzezroczystość'
    cols = {tuple(c) for c in arr[a == 255].reshape(-1, 4)}
    bad = cols - {tuple(c) for c in PALETTE}
    assert not bad, f'{name}: kolory spoza palety {sorted(bad)[:4]}'
    h, w = a.shape
    for y0 in range(0, h, cell):
        for x0 in range(0, w, cell):
            c = a[y0:y0 + cell, x0:x0 + cell]
            if c[:margin].any() or c[-margin:].any() or c[:, :margin].any() or c[:, -margin:].any():
                raise AssertionError(f'{name}: komórka {x0 // cell},{y0 // cell} wchodzi w margines {margin} px')


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def build():
    # Każdą klatkę liczymy raz dla 8 kierunków.
    walk = [boss_frame(walk_pose(i)) for i in range(4)]
    bite = [boss_frame(bite_pose(i)) for i in range(4)]
    feed = [boss_frame(feed_pose(i)) for i in range(4)]
    smash = [boss_frame(smash_pose(i)) for i in range(4)]
    spit = [boss_frame(spit_pose(i)) for i in range(4)]
    leap = [boss_frame(leap_pose(i)) for i in range(4)]
    grab = [boss_frame(grab_pose(i)) for i in range(4)]
    rows = [[anim[i][d] for anim in (walk, bite, feed, smash, spit, leap, grab) for i in range(4)] for d in range(8)]
    sheets = {
        'fungal-devourer.png': (sheet(rows, 96), 96, 8),
        'devourer-cocoon.png': (sheet([[cocoon(v, f) for f in range(14)] for v in range(3)], 48), 48, 6),
        'fungal-throne.png': (throne(), 96, 6),
        'fungal-fx.png': (sheet([[fx_blood(i) for i in range(4)], [fx_spore(i) for i in range(4)]], 48), 48, 2),
        'throne-decals.png': (sheet([[decal(i) for i in range(6)]], 48), 48, 4),
        'mushroom-trail.png': (sheet([[trail_frame(i) for i in range(10)]], TRAIL), TRAIL, 2),
        'spore-pod.png': (sheet([[pod_frame(i) for i in range(4)]], POD), POD, 2),
        'devourer-hand.png': (sheet([[hand_frame(i) for i in range(4)]], HAND), HAND, 1),
    }
    return sheets


def floor_bg(w, h, grid=16):
    bg = np.zeros((h, w, 4), np.uint8)
    bg[:] = FLOOR
    bg[::grid, :] = FLOOR_DARK
    bg[:, ::grid] = FLOOR_DARK
    return bg


def over(bg, fg, x=0, y=0, shadow=None):
    h, w = fg.shape[:2]
    if shadow:
        cx, cy, rx, ry = shadow
        for yy in range(int(cy - ry), int(cy + ry) + 1):
            for xx in range(int(cx - rx), int(cx + rx) + 1):
                if ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1 and 0 <= yy < bg.shape[0] and 0 <= xx < bg.shape[1]:
                    bg[yy, xx, :3] = (bg[yy, xx, :3] * 0.6).astype(np.uint8)  # groundShadow α 0,4
    sx0, sy0 = max(0, -x), max(0, -y)
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(bg.shape[1], x + w), min(bg.shape[0], y + h)
    reg = bg[y0:y1, x0:x1]
    src = fg[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)]
    m = src[..., 3] > 0
    reg[m] = src[m]


def up(arr, k):
    return np.repeat(np.repeat(arr, k, 0), k, 1)


def save(arr, path):
    Image.fromarray(arr, 'RGBA').save(path)


def previews(sheets, out):
    os.makedirs(out, exist_ok=True)
    for name, (arr, cell, _) in sheets.items():
        h, w = arr.shape[:2]
        bg = floor_bg(w, h)
        over(bg, arr)
        k = 2 if w >= 384 and h >= 384 else 4
        save(up(bg, k), os.path.join(out, f'preview_{name[:-4]}_{k}x.png'))
    # Klatki na północ, po 4 w pasku, 3x, z cieniem silnika.
    mb = sheets['fungal-devourer.png'][0]
    for nm, src, c0 in (('walk', mb, 0), ('bite', mb, 4), ('feed', mb, 8), ('smash', mb, 12), ('spit', mb, 16), ('leap', mb, 20), ('grab', mb, 24)):
        bg = floor_bg(384, 96)
        for i in range(4):
            over(bg, src[0:96, (c0 + i) * 96:(c0 + i + 1) * 96], i * 96, 0, shadow=(i * 96 + 48, 50, 21, 17))
        save(up(bg, 3), os.path.join(out, f'preview_north-{nm}_3x.png'))
    save(up(scene(sheets), 4), os.path.join(out, 'preview_throne-room_4x.png'))


def scene(sheets):
    """Sala tronowa w podglądzie na podłodze Cmentarzyska. Mgiełka i winieta tylko w podglądzie (w grze daje je
    mgiełka biomu z kroku 32a)."""
    W, H = 288, 184
    bg = floor_bg(W, H)
    dec = sheets['throne-decals.png'][0]
    coc = sheets['devourer-cocoon.png'][0]
    thr = sheets['fungal-throne.png'][0]
    mb = sheets['fungal-devourer.png'][0]
    d = lambda i: dec[:, i * 48:(i + 1) * 48]
    c = lambda v, f: coc[v * 48:(v + 1) * 48, f * 48:(f + 1) * 48]
    for (i, x, y) in ((5, 120, 128), (0, 104, 92), (2, 150, 120), (3, 40, 14), (3, 200, 120),
                      (1, 70, 130), (4, 190, 30), (0, 214, 82), (2, 56, 70), (5, 10, 136), (1, 230, 140)):
        over(bg, d(i), x, y)
    over(bg, thr, 96, -6)
    for (v, f, x, y) in ((0, 0, 4, 4), (1, 1, 4, 52), (2, 2, 4, 100), (0, 2, 36, 28), (1, 3, 36, 76),
                         (2, 0, 236, 4), (0, 1, 236, 52), (1, 0, 236, 100), (2, 3, 204, 28), (0, 6, 204, 76),
                         (1, 7, 60, 130), (0, 5, 186, 134), (2, 1, 6, 138), (0, 3, 236, 138)):
        over(bg, c(v, f), x, y)
    over(bg, mb[4 * 96:5 * 96, 0:96], 96, 76, shadow=(144, 124, 21, 17))
    out = bg.astype(np.float32)
    rng = np.random.default_rng(9)
    # Mgła: szum niskiej częstotliwości, skwantowany do 4 poziomów (piksel-art).
    small = rng.random((H // 24 + 2, W // 24 + 2))
    fog = np.array(Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)) / 255.0
    yy, xx = np.mgrid[0:H, 0:W]
    vig = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H * 0.55) / (H * 0.6)) ** 2)
    fogq = np.floor(np.clip(fog * 0.9 + 0.1 * (yy / H), 0, 1) * 4) / 4 * 0.32
    darkq = np.floor(np.clip(vig - 0.35, 0, 1) * 4) / 4 * 0.75
    fogc = np.array(GRAVE.deep[1][:3], np.float32)
    out[..., :3] = out[..., :3] * (1 - fogq[..., None]) + fogc * fogq[..., None]
    out[..., :3] *= (1 - darkq[..., None])
    for _ in range(70):  # popiół
        x, y = rng.integers(0, W), rng.integers(0, H)
        out[y, x, :3] = GRAVE.ash[0][:3]
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Grzybowego Pożeracza (Cmentarzysko)')
    ap.add_argument('--out', default=trt.SPRITES_DIR)
    ap.add_argument('--preview')
    a = ap.parse_args()
    sheets = build()
    os.makedirs(a.out, exist_ok=True)
    for name, (arr, cell, margin) in sheets.items():
        validate(name, arr, cell, margin)
        save(arr, os.path.join(a.out, name))
        print(f'{name:34s} {arr.shape[1]}×{arr.shape[0]}  komórka {cell}')
    for nm, c in (('outline', OUTLINE), ('flesh-2', FLESH[2]), ('myc-2', MYC[2]), ('myc-3', MYC[3]), ('blood-2', BLOOD[2])):
        print(f'kontrast {nm:8s} na podłodze Cmentarzyska: {contrast(c, FLOOR):.2f}:1')
    if a.preview:
        previews(sheets, a.preview)


if __name__ == '__main__':
    main()

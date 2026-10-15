#!/usr/bin/env python3
"""Generator bossa Cmentarzyska „Grzybowy Pożeracz” (krok 39) — wygląd z paczki właściciela
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
                        8–11 karmienie kokonem (leczenie w kolumnie 11), 12–15 zamach łapami (uderzenie w 15)
  devourer-cocoon.png   48×48, wiersze = 3 warianty (twarz, dłoń, skulone ciało);
                        0–3 oddech, 4–7 zjedzenie (7 zostaje), 8–9 drżenie (zew), 10–13 rozdarcie (wychodzi zarażony)
  fungal-throne.png     96×96, tron z grzybni, oparcie na północy (dekoracja areny bez kolizji)
  fungal-fx.png         48×48, wiersz 0 krew (trafienie gracza), wiersz 1 sok (leczenie), 4 klatki bez pętli
  throne-decals.png     48×48, 6 naklejek: kałuża krwi, rozbryzg, ślad wleczenia, grzybnia, kałuża soku, krata
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

CAPS = [  # (x, y, r) kapelusze na grzbiecie, od małych do dużych
    (44, 37, 2), (55, 31, 3.5), (41, 65, 4), (54, 66, 4.5), (36, 53, 5), (60, 52, 6), (48, 57, 9),
]
CAP_SPOTS = [(44, 53), (46, 52), (51, 59), (42, 58), (58, 49), (35, 51), (60, 54), (53, 64), (54, 30)]
STALKS = [  # maczużnik: pnie z grzbietu, zgrubiałe czubki
    (37, 62, 32, 69), (60, 63, 64, 70),
]
SHELVES = []
SAP_SPOTS = [(42, 50), (56, 61), (38, 59), (61, 46), (48, 66), (30, 47), (66, 42), (54, 47)]
THREADS = [
    [(40, 50), (33, 46), (28, 41)],
    [(57, 48), (64, 45), (69, 40)],
    [(48, 49), (48, 43), (46, 38)],
    [(37, 60), (31, 57), (28, 52)],
    [(60, 60), (66, 57), (68, 52)],
    [(44, 48), (39, 44), (36, 40)],
]


def walk_pose(i):
    ph = [0, 1, 0, -1][i]
    return dict(
        handL=(29, 21 + 3 * ph), elbowL=(23, 33 + 2 * ph),
        handR=(67, 21 - 3 * ph), elbowR=(73, 33 - 2 * ph),
        footL=(42, 69 - 3 * ph), footR=(54, 69 + 3 * ph),
        head=(48, 32), jaw=0, sway=ph, glow=0,
    )


def bite_pose(i):
    p = walk_pose(0)
    if i == 0:   # telegraf: rozkłada ręce, szczęka pęka, sok jaśnieje
        p.update(handL=(21, 28), elbowL=(18, 40), handR=(75, 28), elbowR=(78, 40),
                 head=(48, 34), jaw=1, glow=1, spread=2)
    elif i == 1:  # wypad: głowa w przód, paszcza rozdarta na dwie połowy
        p.update(handL=(31, 22), elbowL=(22, 32), handR=(65, 22), elbowR=(74, 32),
                 head=(48, 30), jaw=4, glow=1)
    elif i == 2:  # kłapnięcie: trafienie, krew w locie
        p.update(handL=(39, 17), elbowL=(25, 27), handR=(57, 17), elbowR=(71, 27),
                 head=(48, 28), jaw=0, glow=0, spray=(48, 20, 0.9), blood=2)
    else:         # przeżuwanie
        p.update(handL=(33, 21), elbowL=(23, 31), handR=(63, 21), elbowR=(73, 31),
                 head=(48, 30), jaw=2, glow=0, blood=2, drip=True)
    return p


def smash_pose(i):
    """Zamach obiema łapami (cios `Cleave`, zamiast tasaka Lorda): ostatnia klatka w chwili uderzenia."""
    p = walk_pose(0)
    if i == 0:   # zamach: łapy cofnięte za barki, tułów się prostuje
        p.update(handL=(25, 57), elbowL=(18, 45), handR=(71, 57), elbowR=(78, 45), head=(48, 34), glow=1)
    elif i == 1:  # łapy w górze i szeroko — telegraf, sok jaśnieje
        p.update(handL=(24, 26), elbowL=(17, 38), handR=(72, 26), elbowR=(79, 38), head=(48, 33), glow=1, spread=2)
    elif i == 2:  # łapy opadają do środka
        p.update(handL=(37, 15), elbowL=(26, 27), handR=(59, 15), elbowR=(70, 27), head=(48, 31), sway=-1)
    else:         # uderzenie: pięści złączone daleko przed sobą, krew z pazurów
        p.update(handL=(44, 15), elbowL=(32, 27), handR=(52, 15), elbowR=(64, 27), head=(48, 30), blood=2, drip=True)
    return p


def feed_pose(i):
    p = walk_pose(0)
    if i == 0:   # strzępki grzybni wystrzeliwują do kokonu
        p.update(handL=(31, 22), handR=(65, 22), head=(48, 31), glow=1,
                 tendrils=[(40, 46, 40, 13), (56, 46, 56, 13), (48, 44, 48, 12)])
    elif i == 1:  # chwyt i rozdarcie
        p.update(handL=(37, 15), elbowL=(25, 27), handR=(59, 15), elbowR=(71, 27),
                 head=(48, 29), jaw=3, glow=1,
                 tendrils=[(40, 46, 43, 12), (56, 46, 53, 12)])
    elif i == 2:  # głowa w kokonie: dużo krwi
        p.update(handL=(37, 16), elbowL=(25, 28), handR=(59, 16), elbowR=(71, 28),
                 head=(48, 27), jaw=2, glow=1, spray=(48, 20, 1.1), blood=3)
    else:         # przełknięcie: leczenie, sok świeci najjaśniej
        p.update(handL=(33, 23), handR=(63, 23), head=(48, 32), jaw=0, glow=2,
                 blood=3, drip=True, puff=True)
    return p


def draw_head(L, cx, cy, k, blood_lvl):
    if k > 0:
        # Paszcza: czerwone wnętrze między połowami głowy.
        ellipse(L, cx, cy - 1, k + 2, 8.5, BLOOD, rim=False, bias=-0.35)
        for y in range(int(cy - 5), int(cy + 3)):
            L.put(cx - 1, y, BLOOD[2] if y % 3 else BLOOD[3])
        ellipse(L, cx - k, cy, 8, 8.5, FLESH, clip=lambda x, y: x + 0.5 <= cx - k)
        ellipse(L, cx + k, cy, 8, 8.5, FLESH, clip=lambda x, y: x + 0.5 >= cx + k)
        # Zęby na wewnętrznych krawędziach połówek.
        for y in range(int(cy - 6), int(cy + 3), 2):
            L.put(cx - k - 1, y, BONE[1])
            L.put(cx + k, y, BONE[1])
        L.put(cx - k - 1, int(cy - 7), BONE[2])
        L.put(cx + k, int(cy - 7), BONE[2])
        ex = (cx - k - 4, cx + k + 3)
    else:
        ellipse(L, cx, cy, 8, 8.5, FLESH)
        # Pęknięcie czaszki i zaschnięta krew przy pysku.
        line(L, [(cx, cy - 2), (cx - 1, cy + 3), (cx, cy + 6)], FLESH[0], inside=L)
        for x in range(cx - 3, cx + 3):
            L.put(x, int(cy - 7), BLOOD[1] if x % 2 else BLOOD[0])
        L.put(cx - 1, int(cy - 6), BLOOD[2])
        L.put(cx + 1, int(cy - 6), BLOOD[2])
        ex = (cx - 4, cx + 3)
    # Martwe, mleczne oczy w ciemnych oczodołach.
    for x in ex:
        L.put(x, int(cy - 5), BONE[2])
        L.put(x, int(cy - 4), FLESH[0])
    if blood_lvl >= 2:
        for x in range(ex[0], ex[1] + 1):
            if L.solid(x, int(cy - 7)) and x % 2 == 0:
                L.put(x, int(cy - 7), BLOOD[3])


def draw_arm(L, sx, sy, e, h, blood_lvl):
    capsule(L, sx, sy, e[0], e[1], 4.5, 3.6, FLESH)
    capsule(L, e[0], e[1], h[0], h[1], 3.6, 3.0, FLESH)
    # Przedramię i dłoń we krwi: ta sama bryła, rampa krwi.
    capsule(L, e[0], e[1], h[0], h[1], 3.6, 3.0, BLOOD, tmin=0.55 if blood_lvl < 2 else 0.25)
    ellipse(L, h[0], h[1], 3.6, 3.6, BLOOD)
    # Pazury: kapsuły 2 px, czubki we krwi.
    dx, dy = h[0] - e[0], h[1] - e[1]
    n = math.hypot(dx, dy) or 1
    dx, dy = dx / n, dy / n
    for ang in (-0.55, 0, 0.55):
        cx = dx * math.cos(ang) - dy * math.sin(ang)
        cy = dx * math.sin(ang) + dy * math.cos(ang)
        bx, by = h[0] + cx * 3.0, h[1] + cy * 3.0
        tx, ty = h[0] + cx * 5.2, h[1] + cy * 5.2
        capsule(L, bx, by, tx, ty, 1.1, 0.9, BONE, rim=False)
        L.put(int(tx), int(ty), BLOOD[2])


def boss_frame(p):
    body = Layer(96, 96)
    fx = Layer(96, 96)
    rng = random.Random(7)
    blood_lvl = p.get('blood', 1)
    sw = p.get('sway', 0)
    sp = p.get('spread', 0)

    # Stopy pod tułowiem (szuranie).
    for (fx_, fy_) in (p['footL'], p['footR']):
        capsule(body, fx_, 60, fx_, fy_, 3.8, 3.2, FLESH)
    # Ramiona.
    draw_arm(body, 33 - sp + sw, 44, p['elbowL'], p['handL'], blood_lvl)
    draw_arm(body, 63 + sp + sw, 44, p['elbowR'], p['handR'], blood_lvl)
    # Strzępki grzybni (karmienie).
    for (ax, ay, bx, by) in p.get('tendrils', []):
        mx, my = (ax + bx) / 2 + 3, (ay + by) / 2
        capsule(body, ax, ay, mx, my, 1.9, 1.6, MYC)
        capsule(body, mx, my, bx, by, 1.6, 1.3, MYC)
        disc(body, bx, by, 1.5, SAP[2])
    # Tułów (zgarbiony grzbiet).
    ellipse(body, 48 + sw, 52, 19, 15, FLESH)
    # Rozdarty bok: krew i żebra.
    ellipse(body, 63 + sw, 56, 4.5, 3.5, BLOOD, rim=False)
    for y in (55, 57):
        line(body, [(61 + sw, y), (64 + sw, y)], BONE[1])
    # Głowa wciśnięta między barki.
    hx_, hy_ = p['head']
    draw_head(body, hx_ + sw, hy_, p['jaw'], blood_lvl)
    # Barki nachodzą na boki głowy.
    ellipse(body, 32 - sp + sw, 44, 9, 8, FLESH)
    ellipse(body, 64 + sp + sw, 44, 9, 8, FLESH)
    # Krew na barkach (z poprzednich posiłków).
    ellipse(body, 35 - sp + sw, 41, 3, 2, BLOOD, rim=False)
    ellipse(body, 62 + sp + sw, 40, 2.5, 2, BLOOD, rim=False)
    # Kręgosłup przebija skórę.
    for y in (43, 46):
        body.put(48 + sw, y, BONE[0])
        body.put(49 + sw, y, BONE[1])
    # Krwawy płaszcz na karku (spływa spod paszczy).
    ellipse(body, 48 + sw, 41, 7, 3, BLOOD, rim=False)
    # Huby na barkach.
    for (x, y) in SHELVES:
        x += sw + (-sp if x < 48 else sp)
        ellipse(body, x, y, 4, 2.4, MYC, clip=(lambda xx, yy, x=x: xx + 0.5 <= x + 1) if x < 48 else (lambda xx, yy, x=x: xx + 0.5 >= x - 1))
        line(body, [(x - 2, y - 1), (x + 2, y - 1)], MYC[4], inside=body)
    # Pnie maczużnika.
    for (ax, ay, bx, by) in STALKS:
        capsule(body, ax + sw, ay, bx + sw, by, 1.8, 1.3, MYC)
        ellipse(body, bx + sw, by, 2.2, 2.2, MYC)
        body.put(int(bx + sw), int(by), SAP[2] if p.get('glow', 0) else MYC[4])
    # Grzybnia na skórze.
    for t in THREADS:
        line(body, [(x + sw, y) for x, y in t], MYC[3], inside=body)
    # Kapelusze (cecha dominująca).
    for (x, y, r) in CAPS:
        ellipse(body, x + sw, y, r, r * 0.85, MYC)
        if r >= 5:  # wgłębienie i pierścień blaszek przy brzegu
            body.put(int(x + sw), int(y), MYC[1])
            body.put(int(x + sw) + 1, int(y), MYC[1])
            for a in range(0, 360, 30):
                xx = int(round(x + sw + math.cos(math.radians(a)) * (r - 1.6)))
                yy = int(round(y + math.sin(math.radians(a)) * (r - 1.6) * 0.85))
                if a > 20 and a < 160:
                    body.put(xx, yy, MYC[1])
    for (x, y) in CAP_SPOTS:
        body.put(x + sw, y, BONE[1])
    # Krosty soku: puls jasnością.
    g = p.get('glow', 0)
    for (x, y) in SAP_SPOTS:
        x += sw
        if g == 0:
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                body.put(x + dx, y + dy, SAP[1])
            body.put(x, y, SAP[2])
        elif g == 1:
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                body.put(x + dx, y + dy, SAP[2])
            body.put(x, y, SAP[3])
        else:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    body.put(x + dx, y + dy, SAP[2])
            body.put(x, y, SAP[3])
            body.put(x + 1, y, SAP[3])
    if g == 2:  # w chwili leczenia brzegi dużego kapelusza świecą sokiem
        for y in range(46, 68):
            for x in range(36, 60):
                if body.solid(x, y) and tuple(body.a[y, x]) == MYC[0]:
                    body.put(x, y, SAP[1])
    # Krew w locie i ślinienie (bez obrysu, krawędź = blood-0).
    if 'spray' in p:
        sx, sy, s = p['spray']
        ellipse(fx, sx, sy, 5 * s, 3.5 * s, BLOOD, rim=False)
        droplets(fx, rng, sx, sy, 4 * s, 11 * s, int(26 * s), BLOOD)
        for a in (-2.2, -1.57, -0.9):
            line(fx, [(sx + math.cos(a) * 4 * s, sy + math.sin(a) * 3 * s), (sx + math.cos(a) * 10 * s, sy + math.sin(a) * 8 * s)], BLOOD[2])
    if p.get('drip'):
        for x, y in ((hx_ - 3, hy_ - 9), (hx_ + 2, hy_ - 10), (hx_, hy_ - 11), (hx_ - 1, hy_ - 13), (hx_ + 3, hy_ - 12)):
            fx.put(x, y, BLOOD[2])
            fx.put(x, y - 1, BLOOD[1])
        for h in (p['handL'], p['handR']):
            fx.put(h[0], h[1] + 5, BLOOD[2]); fx.put(h[0] + 1, h[1] + 6, BLOOD[1])
    if p.get('puff'):
        droplets(fx, random.Random(3), 48, 56, 12, 20, 14, SAP, size=(0.5, 1.2))
    return finish(body, fx, 96)


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
    rows = [[anim[i][d] for anim in (walk, bite, feed, smash) for i in range(4)] for d in range(8)]
    sheets = {
        'fungal-devourer.png': (sheet(rows, 96), 96, 8),
        'devourer-cocoon.png': (sheet([[cocoon(v, f) for f in range(14)] for v in range(3)], 48), 48, 6),
        'fungal-throne.png': (throne(), 96, 6),
        'fungal-fx.png': (sheet([[fx_blood(i) for i in range(4)], [fx_spore(i) for i in range(4)]], 48), 48, 2),
        'throne-decals.png': (sheet([[decal(i) for i in range(6)]], 48), 48, 4),
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
    for nm, src, c0 in (('walk', mb, 0), ('bite', mb, 4), ('feed', mb, 8), ('smash', mb, 12)):
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

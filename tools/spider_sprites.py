"""
Generator sprite'ów bossa „Matka Pająków” i jego pajączków-kamikaze. Paleta i narzędzia z
tower_ruins_tiles.py / loot_sprites.py (rampy, obrys 1 px #1b1a22, obrót co 45°, walidacja).

Użycie (z katalogu głównego repozytorium):
  python tools/spider_sprites.py                       # arkusze do public/assets/sprites/
  python tools/spider_sprites.py --preview tools/out   # dodatkowo podglądy 4x na podłodze z palety C

Arkusze (STYLEGUIDE §2, §8, §10):
  spider-queen_move-birth.png  96x96, 8 kierunków; kolumny 0–3 chód, 4–7 złożenie pajączka (wylęga się w kolumnie 7)
  spiderling_walk-prime.png    48x48, 8 kierunków; kolumny 0–3 bieg, 4–7 „zapłon” przed wybuchem (bez pętli)
  spiderling_burst.png         48x48, bez kierunków; 4 klatki wybuchu (bez pętli)
  spider-queen_death.png       96x96, 8 kierunków (krok 24); 0 wzdrygnięcie, 1–3 nogi się podkulają, jaja gasną,
                               4 odwłok flaczeje, jaja pękają, 5 posoka, 6–7 ciało rozpada się w posokę
                               (po animacji gra zostawia plamę `splat`)

Postać rysujemy raz, na północ, w przestrzeni lokalnej; kierunki z obrotu (najbliższy sąsiad), obrys po obrocie.
"""
import argparse
import math
import os
import random
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import BONE, DIRT, FLAME, OUT, Img, hx, ok, outline
from loot_sprites import rotate45

PALETTE = trt.PALETTES['piaskowiec']
OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
BOSS = 96
SMALL = 48
MARGIN = 8
SPAWN_BACK = 30  # pajączek wylęga się 30 px ZA pivotem (odwłok), w kolumnie 7

# Chityna: rampa 5 tonów, cień chłodny (fiolet-granat), światło ciepłe (rdzawy brąz) — STYLEGUIDE §4.1.
CHITIN = (ok(.17, .020, 290), ok(.23, .026, 330), ok(.30, .032, 10), ok(.39, .036, 35), ok(.52, .040, 55))
# Akcent 1: oczy — czerwień (jedyne nasycone piksele głowy).
EYE = (ok(.50, .170, 25), ok(.64, .200, 28), ok(.86, .070, 60))
# Akcent 2: jaja i odwłok pajączka — ogień pochodni (FLAME): to, co świeci, wybucha.
EGG = FLAME


# ---------------- narzędzia rysunku ----------------
def ellipse(img, cx, cy, rx, ry, shade):
    """Wypełniona elipsa; shade(nx, ny) dostaje współrzędne znormalizowane (−1..1) i zwraca kolor."""
    for y in range(img.h):
        for x in range(img.w):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny <= 1.0:
                img.put(x, y, shade(nx, ny))


def band_shade(ramp, light=(-.45, -.55)):
    """Cieniowanie pasmowe (cel): światło z lewej-przodu w przestrzeni lokalnej, bez gradientu i ditheringu."""
    D, d, B, L, H = ramp

    def f(nx, ny):
        r = nx * nx + ny * ny
        lx, ly = nx - light[0], ny - light[1]
        lit = lx * lx + ly * ly
        if r > .78 and (nx > .1 or ny > .25):
            return D
        if lit < .06:
            return H
        if lit < .45:
            return L
        if r > .62:
            return d
        return B
    return f


def stroke(img, pts, width, color, edge=None):
    """Gruba łamana (kończyny ≥ 2 px, STYLEGUIDE §7); edge = jaśniejsza linia po stronie światła."""
    r = width / 2
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) * 3))
        for i in range(n + 1):
            t = i / n
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for y in range(int(py - r - 1), int(py + r + 2)):
                for x in range(int(px - r - 1), int(px + r + 2)):
                    if (x + .5 - px) ** 2 + (y + .5 - py) ** 2 <= r * r + .15:
                        img.put(x, y, color)
    if edge:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(2, int(math.hypot(x1 - x0, y1 - y0) * 2))
            for i in range(1, n):
                t = i / n
                img.put(int(x0 + (x1 - x0) * t - .5), int(y0 + (y1 - y0) * t - .5), edge)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def mirror(p, c):
    return (2 * c - p[0], p[1])


# ---------------- Matka Pająków (96x96) ----------------
# Nogi prawej strony w osi N (kolano wypchnięte na zewnątrz, stopa pod ciałem): przyczep, kolano, stopa.
QUEEN_LEGS = [
    ((54, 28), (64, 19), (63, 12)),
    ((58, 32), (73, 25), (84, 34)),
    ((58, 37), (74, 42), (84, 55)),
    ((55, 41), (68, 56), (73, 74)),
]
QUEEN_SKULL = [  # znak na odwłoku (kość) — dominująca cecha obok jaj, 9x9
    '..KKKKK..',
    '.KkkkkkK.',
    'KkjjKjjkK',
    'Kkj.K.jkK',
    'KkkKKKkkK',
    '.KkkjkkK.',
    '..KjKjK..',
    '..K.K.K..',
    '.........',
]
QUEEN_EGGS = [(-12, 10), (-6, 14), (0, 15.5), (6, 14), (12, 10)]  # względem środka odwłoka


def queen_frame(f):
    """f 0–3: chód (dwie grupy nóg naprzemiennie), f 4–7: złożenie pajączka."""
    walk = f < 4
    return queen_pose(
        swell=(0, 0, 0, 0, 1, 2, -1, 0)[f],           # odwłok nabrzmiewa i się kurczy
        glow=(0, 0, 0, 0, 1, 2, 2, 1)[f],             # jaja jaśnieją przed wylęgiem
        splay=(0, 0, 0, 0, 1, 2, 2, 1)[f],            # nogi rozstawione przy wysiłku
        fangs=(0, 0, 0, 0, 0, 1, 1, 1)[f],            # kły rozwarte
        step=(0, -3, 0, 3)[f] if walk else 0,
        spinnerets=f in (6, 7),
        baby=f == 7,
    )


# Śmierć (krok 24): posoka — ciemna, rdzawa czerwień chityny (nie ogień jaj, nie zieleń leża).
ICHOR = (ok(.24, .060, 15), ok(.31, .075, 20), ok(.38, .085, 25))


def curl_leg(pts, t, c):
    """Martwy pająk podkula nogi: kolano wraca ku przyczepowi, stopa zawija się pod ciało."""
    a, k, f = pts
    k2 = lerp(k, lerp(a, k, .55), t)
    tuck = lerp(lerp(a, k2, .5), (c, c + 6), .35)
    return [a, k2, lerp(f, tuck, t)]


def queen_pose(swell=0, glow=0, splay=0, fangs=0, step=0, spinnerets=False, baby=False,
               curl=0.0, eyes=1, eggs='whole', ichor=0):
    """Poza Matki Pająków na N. curl 0–1: podkulenie nóg; eyes 0 = zgasłe; eggs: whole/dim/broken;
    ichor: promień kałuży posoki pod ciałem (0 = brak)."""
    img = Img(BOSS, BOSS)
    c = BOSS / 2

    if ichor:
        ellipse(img, c + 2, 50, ichor, ichor * .8,
                lambda nx, ny: ICHOR[0] if nx * nx + ny * ny > .55 else (ICHOR[2] if nx < -.2 and ny < -.2 else ICHOR[1]))

    ab_cx, ab_cy = c, 58
    rx, ry = 16 + (1 if swell > 1 else 0), 17 + swell

    # Nogi pod ciałem: najpierw lewa i prawa strona, grupy A/B naprzemiennie (chód czworonożny ×2).
    for side in (1, -1):
        for i, (a, k, t) in enumerate(QUEEN_LEGS):
            group = (i + (0 if side > 0 else 1)) % 2
            dy = step if group == 0 else -step
            sx = splay * (1 if i in (1, 2) else 0)
            k2 = (k[0] + sx, k[1] + dy * .5 - (splay if i == 0 else 0))
            t2 = (t[0] + sx, t[1] + dy + (splay if i == 3 else 0) - (splay if i == 0 else 0))
            pts = [a, k2, t2]
            if curl:
                pts = curl_leg(pts, curl, c)
            if side < 0:
                pts = [mirror(p, c) for p in pts]
            claw = lerp(pts[1], pts[2], .78)
            stroke(img, [pts[0], pts[1]], 3.2, CHITIN[2], edge=CHITIN[3])
            stroke(img, [pts[1], claw], 2.4, CHITIN[2])
            stroke(img, [claw, pts[2]], 2.2, BONE[1])
            img.put(int(pts[1][0]), int(pts[1][1]), CHITIN[0])  # staw kolana — najciemniejszy ton materiału

    # Odwłok
    ellipse(img, ab_cx, ab_cy, rx, ry, band_shade(CHITIN))
    # Pręgi włosków: krótkie kreski najciemniejszego tonu wzdłuż boków (faktura, nie dithering)
    for a in range(200, 341, 20):
        for s in (1, -1):
            ang = math.radians(a)
            x = ab_cx + s * (rx - 3) * math.cos(ang)
            y = ab_cy + (ry - 3) * -math.sin(ang)
            img.put(int(x), int(y), CHITIN[1])
            img.put(int(x), int(y) + 1, CHITIN[1])
    # Znak czaszki
    sk = {'K': BONE[1], 'k': BONE[2], 'j': BONE[0]}
    for yy, row in enumerate(QUEEN_SKULL):
        for xx, ch in enumerate(row):
            if ch != '.':
                img.put(int(ab_cx) - 4 + xx, int(ab_cy) - 7 + yy, sk[ch])
    # Jaja (czerwone złoto pochodni) na tylnym brzegu odwłoka
    for i, (ex, ey) in enumerate(QUEEN_EGGS):
        if eggs != 'whole':  # przy śmierci gasną, potem pękają (skorupki z kości)
            ey2 = ey + swell * .8
            ex2, ey2 = int(ab_cx + ex), int(ab_cy + ey2)
            if eggs == 'dim':
                ellipse(img, ex2 + .5, ey2 + .5, 2.4, 2.4, lambda nx, ny: EGG[0])
            else:
                for dx, dy in ((-1, 0), (1, -1), (0, 1)):
                    img.put(ex2 + dx, ey2 + dy, BONE[1])
                img.put(ex2, ey2, ICHOR[1])
            continue
        er = 2.6 + (.4 if glow and i % 2 == 0 else 0)
        base = EGG[1 + min(glow, 1)]
        hi = EGG[3] if glow > 1 else EGG[2]
        ey2 = ey + swell * .8
        ellipse(img, ab_cx + ex, ab_cy + ey2, er, er,
                lambda nx, ny, b=base, h=hi: h if (nx < -.1 and ny < -.1) else (EGG[0] if nx + ny > .9 else b))
    # Kądziołki przędne — przy wylęgu otwarte
    sp_y = int(ab_cy + ry) - 1
    img.put(int(c) - 1, sp_y, CHITIN[0])
    img.put(int(c), sp_y, CHITIN[0])
    if spinnerets:
        img.put(int(c) - 1, sp_y - 1, EGG[2])
        img.put(int(c), sp_y - 1, EGG[2])

    # Głowotułów
    ce_cx, ce_cy = c, 35
    ellipse(img, ce_cx, ce_cy, 11, 10, band_shade(CHITIN, light=(-.4, -.7)))
    for y in range(31, 42):  # bruzda środkowa (fovea) — ton cienia, wewnętrzna linia podziału
        img.put(int(c) - (1 if y % 2 else 0), y, CHITIN[1])
    # Kły (chelicery) i nogogłaszczki
    for s in (1, -1):
        bx = c + s * (2.5 + fangs)
        stroke(img, [(bx, 26), (bx + s * fangs, 21)], 2.4, BONE[1])
        img.put(int(bx + s * fangs - .5), 20, BONE[0])
        stroke(img, [(c + s * 7, 27), (c + s * 9.5, 22)], 2.2, CHITIN[3])
    # Oczy: 2 duże, 2 średnie, 4 małe — wszystkie w środku sylwetki (martwe: ton cienia chityny)
    if not eyes:
        EYE_ = (CHITIN[1], CHITIN[0], CHITIN[1])
    else:
        EYE_ = EYE
    for s in (1, -1):
        for (ex, ey) in ((2, 28), (2, 29)):
            img.put(int(c + (s * ex if s > 0 else s * ex - 1)), ey, EYE_[1])
            img.put(int(c + (s * (ex + 1) if s > 0 else s * (ex + 1) - 1)), ey, EYE_[1] if ey == 29 else EYE_[2])
        img.put(int(c + (5 if s > 0 else -6)), 28, EYE_[1])
        img.put(int(c + (4 if s > 0 else -5)), 31, EYE_[0])
        img.put(int(c + (6 if s > 0 else -7)), 31, EYE_[0])
        img.put(int(c + (6 if s > 0 else -7)), 26, EYE_[0])

    # Kolumna 7: pajączek wyłania się spod odwłoka (punkt spawnu: SPAWN_BACK px za pivotem)
    if baby:
        hatchling = spiderling_body(0, prime=0, scale=.75)
        img.blit(crop_center(hatchling, 24, 24, 13), int(c) - 13, int(c + SPAWN_BACK) - 13)
    return img


def crumble(img, amount, seed):
    """Rozpad ciała: znikają całe bloki 3×3 sylwetki (bez półprzezroczystości), kałuża posoki zostaje."""
    r = random.Random(seed)
    for by in range(0, img.h, 3):
        for bx in range(0, img.w, 3):
            if r.random() >= amount:
                continue
            for y in range(by, min(by + 3, img.h)):
                for x in range(bx, min(bx + 3, img.w)):
                    p = img.get(x, y)
                    if p and p[3] and p not in ICHOR:
                        img.put(x, y, ICHOR[1] if r.random() < .35 else (0, 0, 0, 0))
    return img


def queen_death_frame(f):
    """Śmierć Matki Pająków (8 klatek, bez pętli)."""
    if f == 0:  # wzdrygnięcie: nogi rozrzucone, kły rozwarte
        return queen_pose(splay=3, fangs=1, swell=1, glow=2)
    if f <= 3:  # podkulanie nóg, gasnące oczy i jaja, odwłok wiotczeje
        return queen_pose(curl=(.3, .6, .85)[f - 1], swell=(0, -1, -2)[f - 1], eyes=f < 3, eggs='dim', ichor=(0, 0, 11)[f - 1])
    if f == 4:  # odwłok flaczeje, jaja pękają
        return queen_pose(curl=1, swell=-3, eyes=0, eggs='broken', ichor=15)
    img = queen_pose(curl=1, swell=-3, eyes=0, eggs='broken', ichor=(18, 22, 24)[f - 5])
    return crumble(img, (0, .35, .7)[f - 5], 2400 + f)


def crop_center(img, cx, cy, r):
    out = Img(2 * r, 2 * r)
    for y in range(2 * r):
        for x in range(2 * r):
            p = img.get(cx - r + x, cy - r + y)
            if p and p[3]:
                out.put(x, y, p)
    return out


# ---------------- Pajączek (48x48) ----------------
BABY_LEGS = [
    ((26, 19), (30.5, 15), (30, 12.5)),
    ((27, 21), (33, 18.5), (36.5, 21)),
    ((27, 23), (33, 25.5), (35.5, 29.5)),
    ((26, 25), (30.5, 29.5), (30.5, 34)),
]


def spiderling_body(f, prime=0, scale=1.0):
    """Pajączek-kamikaze na N: czarna chityna i świecący, pręgowany worek na odwłoku (sygnał: wybuchnie)."""
    img = Img(SMALL, SMALL)
    c = SMALL / 2
    step = (0, -1.5, 0, 1.5)[f % 4] if not prime else 0
    tuck = (0, 0, 1, 1, 2)[prime]  # przy zapłonie nogi się podkulają

    def S(p):
        return (c + (p[0] - c) * scale, c + (p[1] - c) * scale)

    for side in (1, -1):
        for i, (a, k, t) in enumerate(BABY_LEGS):
            group = (i + (0 if side > 0 else 1)) % 2
            dy = step if group == 0 else -step
            tx = t[0] - tuck if t[0] > c else t[0] + tuck
            pts = [a, (k[0], k[1] + dy * .5), (tx, t[1] + dy)]
            if side < 0:
                pts = [mirror(p, c) for p in pts]
            pts = [S(p) for p in pts]
            stroke(img, pts, 2.0, CHITIN[2])
    # Worek-bomba: rampa ognia, przy zapłonie jaśnieje i nabrzmiewa (puls jasnością, nie skalą przezroczystości)
    grow = (0, 0, 1, 1, 2)[prime]
    sac = {0: (EGG[0], EGG[0], EGG[1], EGG[2], EGG[3]),
           1: (EGG[0], EGG[1], EGG[1], EGG[2], EGG[3]),
           2: (EGG[0], EGG[1], EGG[2], EGG[3], EGG[3]),
           3: (EGG[1], EGG[1], EGG[2], EGG[3], EGG[3]),
           4: (EGG[1], EGG[2], EGG[3], EGG[3], BONE[2])}[prime]
    ellipse(img, c, c + 3 * scale, (5 + grow * .5) * scale, (5.5 + grow * .5) * scale, band_shade(sac))
    # Klepsydra z chityny na worku (odwrócona „czarna wdowa”) — sylwetka bomby, nie pszczoły
    if scale >= 1:
        mark = CHITIN[1] if prime < 3 else EGG[0]
        for yy, w in ((1, 1), (2, 0), (3, 0), (4, 1)):
            for xx in range(-w - 1, w + 1):
                img.put(int(c) + xx, int(c) + yy, mark)
    # Głowotułów
    ellipse(img, c, c - 4.5 * scale, 4.5 * scale, 4 * scale, band_shade(CHITIN, light=(-.4, -.7)))
    if scale >= 1:
        img.put(int(c) - 2, int(c) - 6, EYE[1])
        img.put(int(c) + 1, int(c) - 6, EYE[1])
        img.put(int(c) - 1, int(c) - 8, BONE[1])  # kły: 2 px kości na przodzie
        img.put(int(c), int(c) - 8, BONE[1])
    return img


def spiderling_frame(col):
    return spiderling_body(col, prime=0) if col < 4 else spiderling_body(0, prime=col - 3)


# ---------------- Wybuch (48x48, bez kierunków) ----------------
def burst_frame(f):
    """Ogień bez obrysu (STYLEGUIDE §6b: krawędź = najciemniejszy ton rampy), odłamki chityny z obrysem."""
    img = Img(SMALL, SMALL)
    c = SMALL / 2
    r = random.Random(4100 + f)
    jag = [r.uniform(-1.6, 1.6) for _ in range(16)]

    def radius_at(x, y, base):
        a = (math.atan2(y, x) + math.pi) / (2 * math.pi) * 16
        i = int(a) % 16
        t = a - int(a)
        return base + jag[i] * (1 - t) + jag[(i + 1) % 16] * t

    if f == 0:  # błysk
        for y in range(SMALL):
            for x in range(SMALL):
                dx, dy = x + .5 - c, y + .5 - c
                d = math.hypot(dx, dy)
                if d <= radius_at(dx, dy, 7):
                    img.put(x, y, BONE[2] if d < 3 else (EGG[3] if d < 5 else EGG[2]))
        for a in range(0, 360, 45):  # promienie błysku
            for k in range(8, 11):
                img.put(int(c + k * math.cos(math.radians(a))), int(c + k * math.sin(math.radians(a))), EGG[2])
    elif f == 1:  # kula ognia
        for y in range(SMALL):
            for x in range(SMALL):
                dx, dy = x + .5 - c, y + .5 - c
                d = math.hypot(dx, dy)
                R = radius_at(dx, dy, 14)
                if d <= R:
                    img.put(x, y, EGG[3] if d < 5 else EGG[2] if d < 9 else EGG[1] if d < R - 1.5 else EGG[0])
    elif f == 2:  # pierścień: wypalony środek, dym
        for y in range(SMALL):
            for x in range(SMALL):
                dx, dy = x + .5 - c, y + .5 - c
                d = math.hypot(dx, dy)
                R = radius_at(dx, dy, 17)
                if R - 5 <= d <= R:
                    img.put(x, y, EGG[0] if d > R - 1.5 or d < R - 4 else EGG[1])
                elif d < 9:  # dym w środku: pasma, światło z lewej-góry (bez ditheringu)
                    img.put(x, y, DIRT[4] if dx + dy < -4 else (DIRT[2] if dx + dy > 5 else DIRT[3]))
    else:  # opadający dym i żar
        for _ in range(7):
            a, d = r.uniform(0, 2 * math.pi), r.uniform(6, 15)
            px, py, pr = c + d * math.cos(a), c + d * math.sin(a), r.uniform(2.2, 3.4)
            ellipse(img, px, py, pr, pr, lambda nx, ny: DIRT[4] if nx + ny < -.4 else (DIRT[2] if nx + ny > .7 else DIRT[3]))
        for _ in range(8):
            a, d = r.uniform(0, 2 * math.pi), r.uniform(10, 17)
            img.put(int(c + d * math.cos(a)), int(c + d * math.sin(a)), EGG[2])

    if f >= 2:  # odłamki: kawałki chityny i nóżek, z obrysem
        debris = Img(SMALL, SMALL)
        for k in range(5):
            a = math.radians(k * 72 + 20 + f * 9)
            d = 11 + f * 2.5
            x, y = c + d * math.cos(a), c + d * math.sin(a)
            if k % 2:
                stroke(debris, [(x, y), (x + 3 * math.cos(a + 1.2), y + 3 * math.sin(a + 1.2))], 2.0, CHITIN[2])
            else:
                debris.put(int(x), int(y), CHITIN[3])
                debris.put(int(x) + 1, int(y), CHITIN[2])
                debris.put(int(x), int(y) + 1, CHITIN[2])
        outline(debris, OUT)
        img.blit(debris, 0, 0)
    return img


# ---------------- arkusze ----------------
def directional_sheet(size, frame_fn, cols=8):
    sheet = Img(size * cols, size * 8)
    frames = []
    for col in range(cols):
        base = frame_fn(col)
        for row in range(8):
            img = rotate45(base, row)
            outline(img, OUT)
            sheet.blit(img, col * size, row * size)
            frames.append((f'r{row}c{col}', img))
    return sheet, frames


def build():
    queen, qf = directional_sheet(BOSS, queen_frame)
    death, df = directional_sheet(BOSS, queen_death_frame)
    baby, bf = directional_sheet(SMALL, spiderling_frame)
    burst = Img(SMALL * 4, SMALL)
    uf = []
    for f in range(4):
        img = burst_frame(f)
        burst.blit(img, f * SMALL, 0)
        uf.append((f'burst{f}', img))
    return {
        'spider-queen_move-birth.png': (queen, qf, BOSS),
        'spider-queen_death.png': (death, df, BOSS),
        'spiderling_walk-prime.png': (baby, bf, SMALL),
        'spiderling_burst.png': (burst, uf, SMALL),
    }


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
            lo, hi = MARGIN - 1, size - MARGIN  # obrys może wejść 1 px w margines
            if 'burst' not in name and any(not (lo <= x < hi + 1 and lo <= y < hi + 1) for x, y, _ in opaque):
                errors.append(f'{fname} {name}: sylwetka wchodzi w margines {MARGIN} px')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description="Generator sprite'ów Matki Pająków")
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

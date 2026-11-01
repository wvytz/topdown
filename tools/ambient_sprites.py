"""
Generator żywego otoczenia biomów 2 i 3 (krok 156, `#zywe-otoczenie`): Grzybnia i Cmentarzysko dostają animowane
rekwizyty, które reagują na bohatera. Poziom detalu jak ogień (krok 144) i szlam (krok 153): pasmowe cieniowanie
ze światłem z lewej-góry, blask pojedynczymi pikselami, świecące elementy bez ciemnego obrysu (STYLEGUIDE §6b).

Lore: świat po apokalipsie, wieża to ostatnie miejsce z resztkami cywilizacji — piętra 2–3 są mniej zrujnowane
niż piętro 1. W Grzybni grzyb porasta stare lampy (ktoś je kiedyś zawiesił), na Cmentarzysku palą się znicze
(ktoś jeszcze pamięta o zmarłych), choć część już się wypaliła.

Użycie (z katalogu głównego repozytorium):
  python tools/ambient_sprites.py                       # arkusze do public/assets/sprites/
  python tools/ambient_sprites.py --preview tools/out   # dodatkowo podgląd 4x na posadzce biomu

grove-glowcap.png (320x96, komórka 32, 3 wiersze = warianty kępy): 0–5 puls — światło wędruje po kapeluszach
  i biegnie żyłkami grzybni od kępy na zewnątrz; 6–7 skulenie (kapelusze zamykają się w pąki i gasną);
  8–9 przygaszone pąki tlą się w pętli.
grove-lamp.png (320x32, komórka 32): stara latarnia z pękniętą szybą, z której wylewa się świecący grzyb; klatki
  jak u kępy (puls, skulenie, przygaszenie), żyłki rozchodzą się po posadzce.
grove-moth.png (32x8, komórka 8): świecąca ćma, 4 klatki machania skrzydłami (bez obrysu — świeci).
grave-candle.png (240x72, komórka 24, 3 wiersze = 1, 2 albo 3 znicze): 0–3 migotanie płomienia za szkłem
  i poświata na posadzce, 4–5 szarpnięcie płomienia (przechodzący bohater), 6 zgaszony / wypalony,
  7–9 smużka dymu po zdmuchnięciu.
grave-wisp.png (72x16, komórka 12×16): błędny ognik — zimny zielony płomyk, język płomienia kołysze się, iskierki
  odrywają się od czubka; 6 klatek w pętli.
grave-raven.png (128x16, komórka 16): kruk z profilu, dziobem w prawo (gra odbija w poziomie): 0–1 spoczynek
  (mrugnięcie, uniesiony ogon), 2–3 dziobanie, 4–7 lot (skrzydła w górze, w poziomie, w dole, w poziomie).
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, hx, outline

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CLR = (0, 0, 0, 0)
OUTLINE = hx('#1b1a22')

# Grzybnia: światło grzybów = rampa „flame” arkusza Grzybni (deep → hl), o ton ciemniej przy przygaszeniu.
GLOW = tuple(hx(h) for h in ('#0b3446', '#126686', '#0099bb', '#44d4e2', '#b6f2f1', '#e4fbf8'))
STEM = tuple(hx(h) for h in ('#2c2840', '#4a4466', '#736c90', '#a49dbd'))
THREAD = tuple(hx(h) for h in ('#3a3556', '#5a547a'))
RUST = tuple(hx(h) for h in ('#231a18', '#45302a', '#6e4a34', '#9a6c46'))
GLASS = tuple(hx(h) for h in ('#25333d', '#3d5560', '#6d8f96'))

# Cmentarzysko: znicze w czerwonym i bursztynowym szkle, mosiężne wieczka; płomień = rampa „flame” Cmentarzyska.
RED_GLASS = tuple(hx(h) for h in ('#2e0b10', '#5e1a1f', '#93302c', '#c4524a', '#eaa08e'))
AMBER_GLASS = tuple(hx(h) for h in ('#2e1c08', '#5e3e12', '#93681e', '#c99a36', '#efd08a'))
BRASS = tuple(hx(h) for h in ('#2e2412', '#5a4622', '#8c6f34', '#c49c4a'))
FLAME = tuple(hx(h) for h in ('#89601f', '#b69439', '#d9c876', '#eeeac4'))
SMOKE = tuple(hx(h) for h in ('#4c4d47', '#6b6c64', '#8c8d82'))
WISP = tuple(hx(h) for h in ('#1f4a2e', '#3f8a52', '#7fd08a', '#d4f5c8'))
FEATHER = tuple(hx(h) for h in ('#141218', '#25222c', '#3a3644', '#5d6488'))
BEAK = tuple(hx(h) for h in ('#2a2622', '#57504a'))
EYE = hx('#c9c2a0')

# Tła podglądu: kolor płyt posadzki z arkuszy kafli biomów.
GROVE_FLOOR = hx('#625c7c')
GRAVE_FLOOR = hx('#58614c')

PULSE = 6  # klatki pulsu


def hash01(*a):
    """Stały „szum” 0..1 z liczb całkowitych — ten sam wynik przy każdym uruchomieniu."""
    h = 2166136261
    for v in a:
        h = ((h ^ (int(v) & 0xffffffff)) * 16777619) & 0xffffffff
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xffffffff
    return ((h ^ (h >> 15)) % 10007) / 10007


def sheet(frames, rows=1):
    """Skleja klatki (lista wierszy list Img) w jeden obraz PIL."""
    grid = frames if rows > 1 else [frames]
    w, h = grid[0][0].w, grid[0][0].h
    out = Image.new('RGBA', (w * len(grid[0]), h * len(grid)), CLR)
    for r, row in enumerate(grid):
        for c, img in enumerate(row):
            out.alpha_composite(img.pil(), (c * w, r * h))
    return out


def outline_except(img, glowing):
    """Obrys 1 px (4-sąsiedztwo) tylko wokół pikseli, które nie świecą (`glowing` — zbiór kolorów bez obrysu)."""
    add = []
    for y in range(img.h):
        for x in range(img.w):
            if img.p[y][x][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c = img.get(x + dx, y + dy)
                if c and c[3] and c not in glowing and c != OUTLINE:
                    add.append((x, y))
                    break
    for x, y in add:
        img.put(x, y, OUTLINE)


# ---------------- Grzybnia: żyłki grzybni ----------------

def thread_paths(seed, cx, cy, count, size, min_len=7):
    """Krzywe żyłki od podstawy kępy ku brzegom komórki (lista list pikseli, od kępy na zewnątrz)."""
    paths = []
    for i in range(count):
        a = (i + hash01(seed, i) * .7) * 2 * math.pi / count
        x, y = float(cx), float(cy)
        bend = (hash01(seed, i, 7) - .5) * .5
        pts = []
        for step in range(40):
            a += bend * .18 + (hash01(seed, i, step) - .5) * .35
            x += math.cos(a) * .9
            y += math.sin(a) * .62
            p = (int(round(x)), int(round(y)))
            if not (1 <= p[0] < size - 1 and 1 <= p[1] < size - 1):
                break
            if not pts or pts[-1] != p:
                pts.append(p)
        if len(pts) >= min_len:
            paths.append(pts)
    return paths


def draw_threads(img, paths, frame, skip_r, cx, cy, pulse=True, level=0):
    """
    Żyłki 1 px w ciemnym fiolecie; w pulsie światło biegnie od kępy na zewnątrz — jasna główka i ślad.
    `level` < 0 przygasza żyłki (bez światła). Piksele pod kępą (`skip_r`) pomijamy.
    """
    for k, pts in enumerate(paths):
        n = len(pts)
        head = (frame / PULSE) * (n + 4) - 2 + (k % 2) * 2
        for i, (x, y) in enumerate(pts):
            if (x - cx) ** 2 + ((y - cy) * 1.4) ** 2 < skip_r ** 2:
                continue
            c = THREAD[1] if i < n * .55 else THREAD[0]
            if pulse and level >= 0:
                d = head - i
                if 0 <= d < 1:
                    c = GLOW[4]
                elif 1 <= d < 2.5:
                    c = GLOW[3]
                elif 2.5 <= d < 4:
                    c = GLOW[2]
            img.put(x, y, c)


# ---------------- Grzybnia: kapelusze ----------------

def cap(img, cx, cy, rx, ry, stem_h, bright, closed=0.0):
    """
    Grzyb: trzon (pasmowo, światło z lewej) i półkolisty kapelusz świecący rampą GLOW przesuniętą o `bright`
    (-2..+1). `closed` 0..1 — kapelusz zamyka się w pąk (węższy, wyższy, ciemniejszy).
    """
    rx = max(1.0, rx * (1 - .45 * closed))
    ry = ry * (1 + .5 * closed)
    top = cy - stem_h
    # Trzon: 2 px szerokości (3 przy dużych), jasny z lewej.
    sw = 2 if rx < 4 else 3
    for y in range(int(top), cy + 1):
        for i in range(sw):
            x = int(cx - sw // 2 + i)
            img.put(x, y, STEM[3] if i == 0 else STEM[2] if i < sw - 1 else STEM[1])
    img.put(int(cx - sw // 2) - 1, cy, STEM[1])
    img.put(int(cx - sw // 2) + sw, cy, STEM[0])
    # Kapelusz: górna połówka elipsy + 1 px blaszek od spodu.
    base = 2 + bright
    for y in range(int(top - ry) - 1, int(top) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            nx = (x + .5 - cx) / rx
            ny = (y + .5 - top) / ry
            if ny > .35 or nx * nx + ny * ny > 1:
                continue
            if ny > 0:  # spód kapelusza — blaszki (ciemniej)
                img.put(x, y, GLOW[max(0, base - 2)])
                continue
            # Pasmowe cieniowanie: światło z lewej-góry.
            lit = -.65 * nx - .75 * ny
            idx = base + (1 if lit > .55 else 0 if lit > .05 else -1)
            img.put(x, y, GLOW[max(0, min(5, idx))])
    # Blask: pojedyncze piksele na lewym-górnym łuku (tylko w świetle).
    if bright >= 0 and closed < .5:
        img.put(int(cx - rx * .45), int(top - ry * .7), GLOW[5])
        if rx >= 4:
            img.put(int(cx - rx * .45) + 1, int(top - ry * .8), GLOW[5])
    # Kropki na kapeluszu (jak u muchomora, ale świecące).
    if rx >= 4 and closed < .5:
        img.put(int(cx + rx * .3), int(top - ry * .45), GLOW[min(5, base + 2)])


# Warianty kęp: (dx, dy, rx, ry, wysokość trzonu) względem środka komórki.
GLOWCAP_VARIANTS = (
    ((-4, 2, 5, 3, 4), (4, 4, 4, 2.6, 3), (0, 7, 3, 2, 2)),
    ((0, 3, 6.5, 4, 5), (-6, 7, 2.5, 1.8, 2), (6, 6, 3, 2, 2)),
    ((-5, 1, 3.5, 2.4, 3), (3, 0, 3, 2, 3), (-2, 6, 3, 2, 2), (6, 6, 3.5, 2.4, 3)),
)


def glowcap_frame(variant, f):
    """Komórka 32×32: żyłki grzybni + kępa kapeluszy; klatki opisane w nagłówku pliku."""
    img = Img(32, 32)
    cx, cy = 16, 20
    caps = GLOWCAP_VARIANTS[variant]
    paths = thread_paths(variant * 31 + 5, cx, cy + 2, 5 + variant % 2, 32)
    if f < PULSE:
        draw_threads(img, paths, f, 6, cx, cy + 2)
    else:
        draw_threads(img, paths, 0, 6, cx, cy + 2, pulse=False, level=-1)
    # Kapelusze od tyłu (wyżej) do przodu, żeby przednie zasłaniały tylne.
    for k, (dx, dy, rx, ry, sh) in sorted(enumerate(caps), key=lambda e: e[1][1]):
        if f < PULSE:
            wave = math.cos((f - k * 1.5) / PULSE * 2 * math.pi)
            bright = 1 if wave > .5 else 0 if wave > -.5 else -1
            closed = 0
        elif f == 6:
            bright, closed = -1, .45
        elif f == 7:
            bright, closed = -2, .85
        else:
            bright, closed = (-2 if (f + k) % 2 == 0 else -1), 1
        cap(img, cx + dx, cy - 6 + dy, rx, ry, sh if f < 6 else max(1, sh - 1), bright, closed)
    outline_except(img, set(GLOW) | set(THREAD))
    return img


# ---------------- Grzybnia: zarośnięta lampa ----------------

def lamp_frame(f):
    """
    Stara latarnia (klosz w żelaznej klatce) stoi przekrzywiona na posadzce; szybka z lewej pęknięta, ze środka
    i przez wieczko wyrasta świecący grzyb. Żyłki rozchodzą się po posadzce.
    """
    img = Img(32, 32)
    cx, base = 15, 27
    paths = thread_paths(77, cx, base, 6, 32, 6)
    if f < PULSE:
        draw_threads(img, paths, f, 5, cx, base)
    else:
        draw_threads(img, paths, 0, 5, cx, base, pulse=False, level=-1)
    if f < PULSE:
        wave = math.cos(f / PULSE * 2 * math.pi)
        bright = 1 if wave > .5 else 0 if wave > -.5 else -1
        closed = 0
    elif f == 6:
        bright, closed = -1, .45
    elif f == 7:
        bright, closed = -2, .85
    else:
        bright, closed = (-2 if f % 2 == 0 else -1), 1
    gl = 2 + bright
    left, right, top = cx - 5, cx + 5, base - 13
    # Podstawa (płyta) i daszek z pierścieniem — rdza, pasmowo.
    for x in range(left - 1, right + 2):
        img.put(x, base, RUST[1])
        img.put(x, base - 1, RUST[2] if x < cx else RUST[1])
    for y in range(4):
        w = 6 - y * 2 + 1
        for x in range(cx - w, cx + w + 1):
            img.put(x, top - y, RUST[3] if x < cx - w // 2 else RUST[2] if x <= cx else RUST[1])
    img.put(cx, top - 5, RUST[2])
    img.put(cx - 1, top - 6, RUST[2])
    img.put(cx + 1, top - 6, RUST[1])
    img.put(cx, top - 7, RUST[0])
    # Szybki: wnętrze świeci grzybem (ciemniej, gdy przygaszony), szkło przyciemnia brzegi.
    for y in range(top + 1, base - 1):
        for x in range(left + 1, right):
            d = abs(x - cx) / 5 + abs(y - (base - 6)) / 7
            idx = gl + (1 if d < .45 else 0 if d < .9 else -1)
            c = GLOW[max(0, min(5, idx))]
            if x in (left + 1, right - 1) or y == top + 1:
                c = GLASS[1] if gl < 2 else GLOW[max(0, gl - 1)]
            img.put(x, y, c)
    # Pęknięta szybka z lewej: brak szkła — grzyb wylewa się na zewnątrz.
    for y in range(base - 8, base - 3):
        img.put(left + 1, y, GLOW[max(0, min(5, gl + 1))] if y % 2 else GLOW[max(0, gl)])
    # Klatka: słupki w narożnikach i środkowy pręt.
    for y in range(top, base):
        img.put(left, y, RUST[2])
        img.put(right, y, RUST[1])
        img.put(cx, y, RUST[1] if y % 3 else RUST[0])
    # Grzyby: jeden wychodzi przez wieczko, dwa przez pękniętą szybkę na posadzkę.
    cap(img, cx + 2, top - 3, 3.5, 2.2, 3, bright, closed)
    cap(img, left - 2, base - 3, 3, 2, 3, bright, closed)
    cap(img, left - 5, base, 2.2, 1.6, 2, bright, closed)
    # Rdzawe zacieki na podstawie.
    img.put(right - 2, base - 1, RUST[0])
    img.put(left + 2, base, RUST[0])
    outline_except(img, set(GLOW) | set(THREAD))
    return img


# ---------------- Grzybnia: ćma ----------------

MOTH = (
    # skrzydła w górze
    ('.a....a.',
     '.ba..ab.',
     '..bccb..',
     '...dd...',
     '...cc...',
     '........'),
    # w połowie
    ('........',
     'aa....aa',
     '.bbccbb.',
     '...dd...',
     '...cc...',
     '........'),
    # w dole
    ('........',
     '........',
     '...cc...',
     '.bbddbb.',
     'ab.cc.ba',
     'a......a'),
    # w połowie
    ('........',
     'aa....aa',
     '.bbccbb.',
     '...dd...',
     '...cc...',
     '........'),
)


def moth_frame(f):
    img = Img(8, 8)
    pal = {'a': GLOW[2], 'b': GLOW[3], 'c': GLOW[4], 'd': GLOW[5]}
    for y, row in enumerate(MOTH[f]):
        for x, ch in enumerate(row):
            if ch in pal:
                img.put(x, y + 1, pal[ch])
    return img


# ---------------- Cmentarzysko: znicze ----------------

def flame_shape(f, lean):
    """Kształt płomienia za szkłem: (wysokość, przesunięcie wierzchołka) dla klatki migotania."""
    heights = (4, 5, 4, 3)
    return heights[f % 4], lean


def znicz(img, x0, bottom, glass, f, lean, lit, tall):
    """
    Znicz: szklany kubek (5 px szerokości, `tall` wysokości), mosiężne wieczko z otworami. Płomień świeci przez
    szkło (szkło jaśnieje wokół płomienia), czubek płomienia wystaje przez otwór wieczka.
    """
    w = 5
    top = bottom - tall
    h, tip = flame_shape(f, lean)
    fx = x0 + 2
    for y in range(top, bottom):
        for x in range(x0, x0 + w):
            edge = x in (x0, x0 + w - 1)
            idx = 1 if edge else 2
            if x == x0 + 1:
                idx += 1  # światło z lewej
            if lit:
                # Szkło jaśnieje wokół płomienia (dolna połowa kubka).
                d = abs(x - fx) + max(0, (bottom - 2) - y) * .6
                if d < 1.6:
                    idx = 4
                elif d < 2.8:
                    idx = max(idx, 3)
            else:
                idx = max(0, idx - 1)
            img.put(x, y, glass[min(4, idx)])
    # Płomień w środku (bez obrysu): rdzeń jasny, brzeg ciemniejszym tonem rampy ognia.
    if lit:
        for i in range(h):
            y = bottom - 2 - i
            sx = fx + round(tip * i / max(1, h - 1))
            img.put(sx, y, FLAME[3] if i < h - 1 else FLAME[2])
            if i < h - 2:
                img.put(sx - 1, y, FLAME[1])
        # Blask szkła — pojedynczy piksel.
        img.put(x0 + 1, top + 1, glass[4])
    else:
        img.put(x0 + 1, top + 1, glass[2])
        # Osad wypalonej świecy na dnie.
        img.put(fx, bottom - 1, SMOKE[0])
    # Wieczko: 1 px szersze z każdej strony, otwory w środku.
    for x in range(x0 - 1, x0 + w + 1):
        img.put(x, top - 1, BRASS[3] if x <= x0 else BRASS[2] if x < x0 + w - 1 else BRASS[1])
    img.put(x0 + 1, top - 2, BRASS[2])
    img.put(x0 + 2, top - 2, BRASS[0] if lit else BRASS[1])
    img.put(x0 + 3, top - 2, BRASS[1])
    img.put(fx, top - 1, BRASS[0])
    if lit and h >= 4:
        img.put(fx + (1 if tip > 0 else -1 if tip < 0 else 0), top - 3, FLAME[2])
    # Dno — ciemny pasek mosiądzu.
    for x in range(x0, x0 + w):
        img.put(x, bottom, BRASS[1] if x > x0 else BRASS[2])


# Układy zniczy w wariantach: (x0, dół, szkło, wysokość).
CANDLE_LAYOUTS = (
    ((9, 21, 0, 7),),
    ((5, 20, 0, 7), (13, 22, 1, 6)),
    ((3, 21, 1, 6), (10, 19, 0, 8), (16, 22, 0, 6)),
)


def candle_frame(variant, f):
    """Komórka 24×24: poświata na posadzce, znicze, dym po zdmuchnięciu."""
    img = Img(24, 24)
    lit = f < 6
    flick = f if f < 4 else (f - 4) * 2 + 1
    lean = 0 if f < 4 else (-1 if f == 4 else 1)
    layout = CANDLE_LAYOUTS[variant]
    for k, (x0, bottom, g, tall) in enumerate(layout):
        glass = RED_GLASS if g == 0 else AMBER_GLASS
        znicz(img, x0, bottom, glass, (flick + k) % 4, lean, lit, tall)
    outline_except(img, set(FLAME))
    # Poświata na posadzce u stóp zniczy (pełne piksele, w kolorze szkła) — pod obrysem nie rysujemy.
    if lit:
        for k, (x0, bottom, g, tall) in enumerate(layout):
            glass = RED_GLASS if g == 0 else AMBER_GLASS
            for dx in range(-2, 7):
                x, y = x0 + dx, bottom + 2
                if img.get(x, y) == CLR and (dx + k + flick) % 3 != 0:
                    img.put(x, y, glass[1])
    # Dym po zdmuchnięciu: smużka z wieczek unosi się i rozwiewa.
    if f >= 7:
        t = f - 7
        for k, (x0, bottom, g, tall) in enumerate(layout):
            top = bottom - tall - 3
            for i in range(3 + t * 2):
                y = top - i
                x = x0 + 2 + round(math.sin(i * .9 + k) * (1 + t * .5))
                if i < t * 2 - 1:
                    continue  # dół smużki już się rozwiał
                if 0 <= y:
                    img.put(x, y, SMOKE[2] if i < 3 else SMOKE[1] if i < 6 else SMOKE[0])
    return img


# ---------------- Cmentarzysko: błędny ognik ----------------

def wisp_frame(f):
    """
    Zimny zielony płomyk 12×16: kulisty rdzeń u dołu, język płomienia ku górze kołysze się i migocze; iskierki
    odrywają się od czubka. Bez obrysu (świeci) — brzeg rysuje najciemniejszy ton rampy.
    """
    img = Img(12, 16)
    t = f / 6 * 2 * math.pi
    cx, cy, r = 6.0, 11.0, 3.4 + .25 * math.sin(t * 2)
    length = 8 + (1 if f % 3 == 0 else 0)
    sway = math.sin(t) * 2.2
    for y in range(16):
        for x in range(12):
            px, py = x + .5, y + .5
            h = (cy - py) / length
            if h <= 0:
                d = math.hypot(px - cx, py - cy) / r
            else:
                if h >= 1:
                    continue
                w = r * (1 - h) ** .75
                if w <= .2:
                    continue
                d = abs(px - (cx + sway * h * h)) / w
            if d < .42:
                img.put(x, y, WISP[3])
            elif d < .72:
                img.put(x, y, WISP[2])
            elif d < 1:
                img.put(x, y, WISP[1])
            elif d < 1.25 and hash01(x, y, f) > .6:
                img.put(x, y, WISP[0])
    # Iskierki nad czubkiem: wznoszą się klatka po klatce.
    for k in range(2):
        sy = int(cy - length - 1 - ((f + k * 3) % 6) * .8)
        sx = int(round(cx + sway + (1 if k else -1) * (1 + (f % 2))))
        if 0 <= sy:
            img.put(sx, sy, WISP[2] if (f + k) % 2 else WISP[3])
    return img


# ---------------- Cmentarzysko: kruk ----------------

RAVEN = (
    # 0 spoczynek
    ('................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '..........kk....',
     '.........kdmk...',
     '........kdmedBB.',
     '........kddmkb..',
     '...kkkkkdddmk...',
     '..kddmmmmmmdk...',
     '.kddmlllmmmdk...',
     'kkdddmmmmmdk....',
     'k...kkdddkk.....',
     '.......f.f......'),
    # 1 mrugnięcie, ogon w górze
    ('................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '..........kk....',
     '.........kdmk...',
     '........kdmddBB.',
     '........kddmkb..',
     'k..kkkkkdddmk...',
     'kkddmmmmmmmdk...',
     '.kddmlllmmmdk...',
     '..kddmmmmmdk....',
     '....kkdddkk.....',
     '.......f.f......'),
    # 2 dziób w dół
    ('................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '...kkkkkkk......',
     '..kddmmmmmdk....',
     '.kddmlllmmmdkk..',
     'kkdddmmmmmddmdk.',
     'k...kkdddkkkedBB',
     '.......f.f..kkb.'),
    # 3 dziób przy ziemi
    ('................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '...kkkkkkk......',
     '..kddmmmmmdk....',
     '.kddmlllmmmdk...',
     'kkdddmmmmmddkk..',
     'k...kkdddkkdmdk.',
     '.......f.f.kedBB'),
    # 4 lot: skrzydła w górze
    ('................',
     '......kk........',
     '.....kddk.......',
     '.....kdmdk......',
     '......kdmdk.....',
     '......kdmmdk....',
     '.......kdmmk.kk.',
     '...kkkkkdmmkkdmk',
     '.kkddmmmlmmmdeBB',
     'kkddmmmmmmmmkb..',
     'k..kkkkkkkkk....',
     '................',
     '................',
     '................',
     '................',
     '................'),
    # 5 lot: skrzydła w poziomie
    ('................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '...kkkkkkk..kk..',
     '.kkdddmmmkkkdmk.',
     'kkddmmlmmmmmdeBB',
     'k.kkddddddddkb..',
     '...kkdmmdk......',
     '................',
     '................',
     '................',
     '................',
     '................'),
    # 6 lot: skrzydła w dole
    ('................',
     '................',
     '................',
     '................',
     '................',
     '............kk..',
     '..kkkkkkkk.kdmk.',
     '.kddmmlmmmmmdeBB',
     'kkddmmmmmmmmkb..',
     'k..kkdmmmmdk....',
     '....kdmmmdk.....',
     '....kdmmdk......',
     '.....kddk.......',
     '.....kdk........',
     '......k.........',
     '................'),
    # 7 lot: skrzydła w poziomie
    ('................',
     '................',
     '................',
     '................',
     '................',
     '................',
     '...kkkkkkk..kk..',
     '.kkdddmmmkkkdmk.',
     'kkddmmlmmmmmdeBB',
     'k.kkddddddddkb..',
     '...kkdmmdk......',
     '................',
     '................',
     '................',
     '................',
     '................'),
)


def raven_frame(f):
    img = Img(16, 16)
    pal = {'k': FEATHER[0], 'd': FEATHER[1], 'm': FEATHER[2], 'l': FEATHER[3], 'b': BEAK[0], 'B': BEAK[1], 'e': EYE, 'f': BEAK[0]}
    for y, row in enumerate(RAVEN[f]):
        for x, ch in enumerate(row):
            if ch in pal:
                img.put(x, y, pal[ch])
    outline(img, OUTLINE)
    return img


# ---------------- zapis i podgląd ----------------

SHEETS = {
    'grove-glowcap.png': lambda: sheet([[glowcap_frame(v, f) for f in range(10)] for v in range(3)], rows=3),
    'grove-lamp.png': lambda: sheet([lamp_frame(f) for f in range(10)]),
    'grove-moth.png': lambda: sheet([moth_frame(f) for f in range(4)]),
    'grave-candle.png': lambda: sheet([[candle_frame(v, f) for f in range(10)] for v in range(3)], rows=3),
    'grave-wisp.png': lambda: sheet([wisp_frame(f) for f in range(6)]),
    'grave-raven.png': lambda: sheet([raven_frame(f) for f in range(8)]),
}


def preview(out_dir, images):
    """Podgląd 4× na posadzce biomu: każdy arkusz w osobnym pasie."""
    os.makedirs(out_dir, exist_ok=True)
    pad = 4
    width = max(im.width for im in images.values()) + pad * 2
    height = sum(im.height + pad * 2 for im in images.values())
    canvas = Image.new('RGBA', (width, height), CLR)
    y = 0
    for name, im in images.items():
        bg = GROVE_FLOOR if name.startswith('grove') else GRAVE_FLOOR
        canvas.paste(Image.new('RGBA', (width, im.height + pad * 2), bg), (0, y))
        canvas.alpha_composite(im, (pad, y + pad))
        y += im.height + pad * 2
    canvas = canvas.resize((width * 4, height * 4), Image.NEAREST)
    path = os.path.join(out_dir, 'ambient-preview.png')
    canvas.save(path)
    print('podgląd:', path)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--preview', metavar='DIR', help='zapisz podgląd 4x w katalogu')
    parser.add_argument('--out', default=OUT_DIR)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    images = {}
    for name, build in SHEETS.items():
        im = build()
        im.save(os.path.join(args.out, name))
        images[name] = im
        print(f'{name}: {im.width}x{im.height}')
    if args.preview:
        preview(args.preview, images)


if __name__ == '__main__':
    sys.exit(main())

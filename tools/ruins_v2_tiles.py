"""Oprawa 2.0 ruin (krok U4a, upgrade Aktu I — pilot kafli).

Moduł pomocniczy generatora `tower_ruins_tiles.py` (biom `tower_ruins`, dodatek `v2`). Zasady: docs/STYLEGUIDE.md §13.8.

- Więcej wariantów tej samej płyty zamiast nowej palety: obtłuczone narożniki, rysa, zapadnięta płyta, łata z bruku,
  wytarcia, popiół w fugach; dwa nowe wzory 2×2.
- Progi (przejście materiałów): kamienny próg na wejściu do pokoju, między brukiem korytarza a płytami pokoju.
- Obwódka areny: wpuszczony w posadzkę pas ciemniejszego kamienia wzdłuż murów areny, z narożnikami.
- Mur: ciosy o nierównej długości (bez powtarzalnego wzoru), masa wieży z dużych bloków zamiast prawie czarnej
  cegły i wyrwy, przez które widać otchłań i nocne niebo za wieżą („wieża za oknem”).

Wszystko z palety biomu (walidator generatora), krycie 0/255, bez kolizji — kolizję buduje gra z danych piętra.
Generator wywołuje `apply(entries, Entry, kit)`; kafle dopisuje na końcu (first-fit), więc kafle sprzed upgradu
zostają na swoich miejscach w arkuszu.
"""
import dataclasses
import math

K = None  # zestaw z generatora: Img, T, FACE, CLR, crack, pebble, floor_slabs, SLAB_LAYOUTS, cobble, wall_tile, ashlar

# Indeksy rampy `Palette.sky`.
VOID, NIGHT, HAZE, CLOUD, STAR = 0, 1, 2, 3, 4

# Nowe układy płyt 64×64 (pokrywają cały kafel 2×2 bez dziur — sprawdza `_check_layout`).
MACRO = {
    # Duża płyta 32×32 w ramie z długich płyt.
    'macro_c': [(0, 0, 48, 16), (48, 0, 16, 32), (0, 16, 16, 48), (16, 16, 32, 32), (48, 32, 16, 32), (16, 48, 32, 16)],
    # Jodełka z płyt 32×16 i 16×32.
    'macro_d': [(0, 0, 32, 16), (32, 0, 16, 32), (48, 0, 16, 16), (48, 16, 16, 16), (0, 16, 16, 32), (16, 16, 16, 16),
                (16, 32, 32, 16), (48, 32, 16, 32), (0, 48, 16, 16), (16, 48, 32, 16)],
}

# Warianty płyt: (nazwa, układ, waga). Stare płyty ważą razem 51 — nowe to ok. 1/4 posadzki.
FLOOR = (('chipped', 'slab16', 4), ('hairline', 'slab32', 3), ('sunken', 'mixed_h', 3), ('patch', 'slab16', 1.5),
         ('scuffed', 'slab16', 3), ('ashjoint', 'mixed_v', 3))

BORDER_SIDES = ('n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se')
BORDER_INSET = 6   # odległość pasa obwódki od muru (px)
BORDER_WIDTH = 7   # szerokość pasa obwódki (px)

# Wyrwy w murze wieży: (nazwa, szerokość, wysokość w kaflach, waga).
BREACHES = (('a', 2, 2, 3), ('b', 2, 2, 3), ('c', 2, 1, 2), ('d', 1, 2, 2), ('e', 1, 1, 2))


def _check_layout(slabs, size):
    cells = set()
    for (sx, sy, sw, sh) in slabs:
        for y in range(sy, sy + sh):
            for x in range(sx, sx + sw):
                assert (x, y) not in cells, f'płyty nachodzą na siebie w ({x}, {y})'
                cells.add((x, y))
    assert len(cells) == size * size, 'płyty nie pokrywają całego wzoru'


# ---------------- posadzka ----------------
def chip(img, p, cx, cy, rad=2.6):
    """Obtłuczony narożnik płyty: ubytek z ziemią, cień pod północną krawędzią, jasna krawędź południowa."""
    F, D = p.floor, p.dirt
    pts = {(x, y) for y in range(int(cy - rad) - 1, int(cy + rad) + 2) for x in range(int(cx - rad) - 1, int(cx + rad) + 2)
           if 0 <= x < img.w and 0 <= y < img.h and math.hypot(x + .5 - cx, y + .5 - cy) <= rad}
    for (x, y) in pts:
        img.put(x, y, D[2])
    for (x, y) in pts:
        if (x, y - 1) not in pts:
            img.put(x, y, F[0])
        if (x, y + 1) not in pts and y + 1 < img.h:
            img.put(x, y + 1, F[4])


def mini_cobble(img, p, r, x0, y0, w, h):
    """Łata z drobnych kamieni w miejscu wyjętej płyty (ta sama rampa co bruk korytarza)."""
    F = p.floor
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            img.put(x, y, F[1])
    for cy in range(y0 + 1, y0 + h - 1, 5):
        for cx in range(x0 + 1, x0 + w - 1, 5):
            base = p.floor_alt if r.random() < .4 else F[2]
            for y in range(4):
                for x in range(4):
                    if x in (0, 3) and y in (0, 3):
                        continue
                    img.put(cx + x, cy + y, F[3] if (y == 0 or x == 0) else base)


def floor_variant(kind, layout):
    def gen(p, r):
        F = p.floor
        img = K.floor_slabs(p, r, K.SLAB_LAYOUTS[layout])
        if kind == 'chipped':
            for (cx, cy) in r.sample([(2, 2), (14, 2), (18, 2), (30, 2), (2, 14), (18, 18), (30, 30), (14, 30)], 2):
                chip(img, p, cx, cy)
        elif kind == 'hairline':
            keep = lambda x, y: 2 <= x < K.T - 2 and 2 <= y < K.T - 2
            K.crack(img, r, r.randint(4, 10), 3, 22, 1, 1, dark=F[0], lit=F[3], keep=keep)
        elif kind == 'sunken':
            # Płyta 16×16 z lewego dołu osiadła: cień spod sąsiadki od północy, oświetlona krawędź od południa.
            sx, sy = (0, 16) if r.random() < .5 else (16, 16)
            for x in range(sx + 1, sx + 16):
                img.put(x, sy + 1, F[0])
                img.put(x, sy + 2, F[1])
            for y in range(sy + 1, sy + 16):
                img.put(sx + 1, y, F[1])
        elif kind == 'patch':
            qx, qy = r.choice([(0, 0), (16, 0), (0, 16), (16, 16)])
            mini_cobble(img, p, r, qx, qy, 16, 16)
        elif kind == 'scuffed':
            for _ in range(r.randint(3, 5)):
                x, y = r.randint(4, 24), r.randint(4, 26)
                for i in range(r.randint(3, 5)):
                    if img.get(x + i, y + (i // 2)) in (F[2], p.floor_alt):
                        img.put(x + i, y + (i // 2), F[3])
        elif kind == 'ashjoint':
            for y in range(img.h):
                for x in range(img.w):
                    if img.get(x, y) == F[1] and r.random() < .35:
                        img.put(x, y, p.ash[0])
        return img
    return gen


def macro(style):
    def gen(p, r):
        return K.floor_slabs(p, r, MACRO[style], 2 * K.T, 2 * K.T)
    return gen


def sill(orient):
    """Próg wejścia do pokoju: dwa kamienne bloki w poprzek przejścia, po bokach bruk korytarza.
    h — przejście północ-południe (próg leży poziomo), v — wschód-zachód (próg pionowo)."""
    def gen(p, r):
        F, T = p.floor, K.T
        img = K.cobble(p, r)
        a, b = 9, 23  # pas progu (wiersze dla h, kolumny dla v)
        for u in range(T):          # wzdłuż progu
            for v in range(a, b):   # w poprzek progu
                lu = u % 16
                if v in (a, b - 1) or lu == 0:
                    c = F[1]
                elif v == a + 1 or lu == 1:
                    c = F[3]
                elif v == (a + b) // 2:
                    c = F[0] if 3 <= lu <= 13 else F[2]  # rowek po kracie / drzwiach
                else:
                    c = p.floor_alt if (u // 16) % 2 else F[2]
                x, y = (u, v) if orient == 'h' else (v, u)
                img.put(x, y, c)
        for _ in range(6):  # wytarcie stopami na środku
            u, v = r.randint(4, 27), r.randint(a + 2, b - 3)
            x, y = (u, v) if orient == 'h' else (v, u)
            if img.get(x, y) in (F[2], p.floor_alt):
                img.put(x, y, F[4])
        return img
    return gen


def border(side):
    """Obwódka areny: pas wpuszczony w posadzkę (rowek, oświetlona krawędź, ciemniejszy kamień, spoiny co 16 px).
    Nakładka podłogi — pod nią widać zwykłe płyty."""
    def gen(p, r):
        F, T = p.floor, K.T
        img = K.Img(T, T)
        lo, hi = BORDER_INSET, BORDER_INSET + BORDER_WIDTH  # od muru

        def band(horizontal, near_start, start, end):
            # near_start: mur po stronie małych współrzędnych (n albo w); start..end — zakres wzdłuż pasa.
            for u in range(start, end):
                for k in range(lo, hi):
                    v = k if near_start else T - 1 - k
                    edge_in = k == hi - 1
                    if k == lo or edge_in:
                        c = F[0]
                    elif (k == lo + 1 and near_start) or (k == hi - 2 and not near_start):
                        c = F[3]
                    elif u % 16 == 8:
                        c = F[0]
                    else:
                        c = F[1]
                    img.put(u, v, c) if horizontal else img.put(v, u, c)

        north, south, west, east = 'n' in side, 's' in side, 'w' in side, 'e' in side
        if len(side) == 1:
            band(north or south, north or west, 0, T)
        else:
            # Narożnik: dwa pasy od muru do brzegu kafla i kamień narożny w miejscu ich spotkania.
            ys = (lo, T) if north else (0, T - lo)
            xs = (lo, T) if west else (0, T - lo)
            band(True, north, *xs)
            band(False, west, *ys)
            c0 = lo - 1 if west else T - hi - 1
            r0 = lo - 1 if north else T - hi - 1
            size = BORDER_WIDTH + 2
            for y in range(r0, r0 + size):
                for x in range(c0, c0 + size):
                    ly, lx = y - r0, x - c0
                    if ly in (0, size - 1) or lx in (0, size - 1):
                        c = F[0]
                    elif ly == 1 or lx == 1:
                        c = F[4]
                    elif abs(lx - size // 2) + abs(ly - size // 2) <= 1:
                        c = F[0]  # wyryty romb
                    else:
                        c = p.floor_alt
                    img.put(x, y, c)
        return img
    return gen


# ---------------- mur wieży i wyrwy ----------------
def tower_masonry(img, p, r, w, h):
    """Masa wieży z dala od pokojów: duże bloki 32×16 z przesunięciem 16 px (okres 32 — łączą się z sąsiadami).
    Jaśniejsza niż stara „głębia”, żeby poza pokojami był widać mur, a nie jednolitą czerń (STYLEGUIDE §13.8)."""
    WF, D = p.wall_fade, p.deep
    # Ciemniejsze bloki tylko w wierszach bez przesunięcia (blok = cały kafel), więc szwy między kaflami się zgadzają.
    dark = {(bx, row) for row in range(0, h // 16, 2) for bx in range(0, w, 32) if r.random() < .3}
    for y in range(h):
        row = y // 16
        off = 16 if row % 2 else 0
        for x in range(w):
            lx, ly = (x + off) % 32, y % 16
            if ly == 0 or lx == 0:
                c = D[1]
            elif ly == 1:
                c = WF[2]
            else:
                c = WF[0] if ((x // 32) * 32, row) in dark and ly > 2 else WF[1]
            img.put(x, y, c)
    for _ in range(sum(r.random() < .3 for _ in range(max(1, w * h // 512)))):  # rzadkie rysy w blokach
        K.crack(img, r, r.randint(3, w - 4), r.randint(3, h - 4), 7, r.choice([-1, 1]), 1, dark=D[1], lit=WF[2],
                keep=lambda x, y: 1 <= x < w - 1 and 1 <= y < h - 1)


def fade(p, r):
    """Pasmo przejściowe (2 kafle od podłogi): ciosy jak przy pokoju, w chłodnych tonach lica — łagodniejszy krok
    jasności między murem przy pokoju a masą wieży niż stare, prawie czarne pasmo."""
    img = K.Img(K.T, K.T)
    WF = p.wall_face
    K.ashlar(img, r, WF[0], WF[1], WF[2], specks=(WF[0],))
    return img


def tower(p, r):
    img = K.Img(K.T, K.T)
    tower_masonry(img, p, r, K.T, K.T)
    return img


def breach(w, h):
    """Wyrwa w murze wieży: przez poszarpany otwór widać otchłań za wieżą i nocne niebo z chmurami popiołu.
    Pod północną krawędzią otworu widać grubość muru (lico szybu), krawędź od północy jest oświetlona."""
    def gen(p, r):
        S, WF, D = p.sky, p.wall_face, p.deep
        T = K.T
        W_, H_ = w * T, h * T
        img = K.Img(W_, H_)
        tower_masonry(img, p, r, W_, H_)
        # Kształt: kilka nachodzących elips (nieregularny wyłom), krawędź schodkowa w komórkach 3×3 jak wyłamane ciosy.
        cx, cy = W_ / 2 + r.uniform(-2, 2), H_ / 2 + r.uniform(-1, 2)
        rx, ry = W_ / 2 - 6, H_ / 2 - 6
        blobs = [(cx, cy, rx * .82, ry * .82)]
        for _ in range(2 + w + h):
            a = r.uniform(0, 2 * math.pi)
            blobs.append((cx + math.cos(a) * rx * .45, cy + math.sin(a) * ry * .45,
                          rx * r.uniform(.35, .55), ry * r.uniform(.35, .55)))
        jitter = {}
        hole = set()
        for y in range(4, H_ - 4):
            for x in range(4, W_ - 4):
                cell = (x // 3, y // 3)
                if cell not in jitter:
                    jitter[cell] = r.uniform(-.35, .25)
                if any(((x + .5 - bx) / bw) ** 2 + ((y + .5 - by) / bh) ** 2 < 1 + jitter[cell] for bx, by, bw, bh in blobs):
                    hole.add((x, y))
        # pojedyncze piksele i przewężenia na krawędzi wygładzamy: zostają tylko piksele z ≥2 sąsiadami w otworze
        hole = {(x, y) for (x, y) in hole if sum((x + dx, y + dy) in hole for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) >= 2}
        ry = max(1, (max(y for _, y in hole) - min(y for _, y in hole)) / 2) if hole else ry
        # niebo: noc, pasma mgły i chmur popiołu, rzadkie gwiazdy
        for (x, y) in hole:
            img.put(x, y, S[NIGHT] if y > cy - ry * .3 else S[VOID])
        for _ in range(w * h * 3):
            bx, by, bw = r.uniform(0, W_), r.uniform(cy - ry * .4, H_), r.uniform(5, 14)
            for (x, y) in hole:
                d = ((x - bx) / bw) ** 2 + ((y - by) / 2.2) ** 2
                if d < 1:
                    img.put(x, y, S[CLOUD] if d < .3 and y < by else S[HAZE])
        stars = [pt for pt in sorted(hole) if img.get(*pt) == S[VOID]]
        for (x, y) in r.sample(stars, min(len(stars), 2 + w * h)):
            img.put(x, y, S[STAR])
        # grubość muru pod północną krawędzią otworu
        depth = 5
        for (x, y) in hole:
            k = next((k for k in range(1, depth + 1) if (x, y - k) not in hole), None)
            if k is not None:
                img.put(x, y, WF[2] if k == 1 else (WF[1] if k <= 3 else WF[0]))
                if k in (2, 4) and (x + 3 * k) % 9 == 0:
                    img.put(x, y, D[0])  # spoina w licu szybu
        # krawędzie: oświetlona od północy, ciemna szczelina od południa, ciemne boki
        for (x, y) in hole:
            for dx, dy, c in ((0, -1, WF[2]), (0, 1, p.outline), (-1, 0, D[0]), (1, 0, D[0])):
                if (x + dx, y + dy) not in hole:
                    img.put(x + dx, y + dy, c)
        # okruchy na krawędzi
        rim = [(x, y - 2) for (x, y) in hole if (x, y - 1) not in hole and (x, y - 2) not in hole]
        for (x, y) in r.sample(rim, min(len(rim), 3 * w)):
            img.put(x, y, WF[1])
        return img
    return gen


def apply(entries, Entry, kit):
    """Dopisuje kafle oprawy 2.0 na końcu (first-fit)."""
    global K
    K = kit
    for slabs in MACRO.values():
        _check_layout(slabs, 2 * K.T)
    out = list(entries)
    for kind, layout, weight in FLOOR:
        out.append(Entry(f'floor_v2_{kind}', floor_variant(kind, layout), 'floorBase', group='floor', weight=weight,
                         flip_x=True))
    for style in MACRO:
        out.append(Entry(f'floor_{style}_2x2', macro(style), 'floorBase', 2, 2, group='floorMacro', weight=1, flip_x=True))
    for orient in ('h', 'v'):
        out.append(Entry(f'floor_sill_{orient}', sill(orient), 'floorBase', group=f'floorSill.{orient}', weight=1))
    for side in BORDER_SIDES:
        out.append(Entry(f'decal_arena_border_{side}', border(side), 'floorDecal', group=f'arenaBorder.{side}', weight=1))
    # Mur: ciosy o nierównej długości na najczęstszych maskach (brzeg pokoju i pełna masa przy podłodze).
    for mask in (7, 11, 13, 14, 15):
        for v in ('a', 'b'):
            out.append(Entry(f'wall_{mask:02d}_v2_{v}', K.wall_tile(mask, irregular=True), 'wall', group=f'wall.{mask}',
                             weight=30))
    for v in ('a', 'b'):
        out.append(Entry(f'wall_fade2_{v}', fade, 'wall', group='wallBand.fade2', weight=1))
    for v in ('a', 'b', 'c'):
        out.append(Entry(f'wall_tower_{v}', tower, 'wall', group='wallBand.tower', weight=1))
    for v, w, h, weight in BREACHES:
        out.append(Entry(f'wall_breach_{v}_{w}x{h}', breach(w, h), 'wall', w, h, group='wallBreach', weight=weight))
    return out

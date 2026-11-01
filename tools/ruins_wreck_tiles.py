"""Ruiny po apokalipsie (krok 155): śmieci i zniszczenie na piętrze 1.

Moduł pomocniczy generatora `tower_ruins_tiles.py` (biom `tower_ruins`, dodatek `wreck`). Wieża to ostatnie
miejsce, gdzie przetrwała cywilizacja (prośba właściciela), więc parter nosi ślady oblężenia i koczowania
uciekinierów: zardzewiałe pręty i blachy, łańcuchy, wypalone plamy i belki, rozbite szkło, łachmany, porzucone
buty, wygasłe ogniska, ulotki, kości poległych; większe: zawalony strop 2×2, zwęglona belka, szczątki
uciekiniera i pęknięta rura. Na licach: odsłonięte zbrojenie, sadza, zabite deskami wyłomy, kreski odliczania
ze strzałką „w górę”, rdzewiejąca rura z zaciekiem.

Zasady (jak w mieszkaniu gracza): rzeczy w przygaszonych barwach, obrys najciemniejszym tonem posadzki zamiast
czarnego obrysu postaci — leżą w tej samej warstwie co podłoga, a postacie dalej się od niej odcinają.
Bez fioletu (szlam bossa, wrogowie) i bez zieleni (magia). Wszystko bez kolizji — to nakładki podłogi i lica.

Generator wywołuje `apply(entries, Entry, kit)`; `kit` podaje płótno i narzędzia arkusza (bez importu
w drugą stronę, bo `tower_ruins_tiles` uruchamia się jako skrypt).
"""
import dataclasses
import math

K = None  # zestaw z generatora: Img, outline, T, FACE, CLR, crack, pebble

# Indeksy rampy `Palette.wreck` (kolejność jak w palecie `piaskowiec`).
RU0, RU1, RU2 = 0, 1, 2   # rdza: cień, rdza, jasna
CH0, CH1, CH2 = 3, 4, 5   # zwęglenie: sadza, węgiel, popiół
WD0, WD1, WD2 = 6, 7, 8   # stare drewno: cień, deska, jasne
CL0, CL1, CL2 = 9, 10, 11  # wyblakła tkanina: cień, płótno, jasne
GL0, GL1 = 12, 13         # szkło: odłamek, błysk
PAPER = 14                # zżółkły papier


# ---------------- prymitywy ----------------
def canvas(w=1, h=1):
    return K.Img(w * K.T, h * K.T)


def put(img, x, y, c):
    img.put(int(round(x)), int(round(y)), c)


def box(img, x0, y0, w, h, c):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            img.put(x, y, c)


def line(img, x0, y0, x1, y1, c, width=1):
    n = max(abs(x1 - x0), abs(y1 - y0), 1) * 2
    for i in range(int(n) + 1):
        t = i / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for k in range(width):
            put(img, x, y + k, c)


def polyline(img, pts, c, width=1):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        line(img, x0, y0, x1, y1, c, width)


def fill_ellipse(img, cx, cy, rx, ry, fn):
    """Wypełniona elipsa; fn(nx, ny) zwraca kolor albo None (nx, ny w −1..1)."""
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny <= 1:
                c = fn(nx, ny)
                if c:
                    img.put(x, y, c)


def fill_poly(img, pts, fn):
    """Wypełniony wielokąt (parzystość przecięć); fn(x, y) zwraca kolor."""
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            px, py, inside = x + .5, y + .5, False
            for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
                if (ay > py) != (by > py) and px < ax + (py - ay) * (bx - ax) / (by - ay):
                    inside = not inside
            if inside:
                img.put(x, y, fn(x, y))


def item(p):
    """Osobne płótno dla jednej rzeczy — dostaje własny obrys, zanim trafi na kafel."""
    return K.Img(p.w, p.h)


def stamp(tile, thing, p, shadow=True):
    """Obrys rzeczy tonem szczeliny posadzki i cień o 1 px na południe (ton fugi), potem na kafel."""
    K.outline(thing, p.floor[0])
    if shadow:
        for y in range(thing.h - 1, -1, -1):
            for x in range(thing.w):
                if thing.p[y][x][3] and tile.get(x, y + 1) is not None and not thing.get(x, y + 1)[3]:
                    if not tile.get(x, y + 1)[3]:
                        tile.put(x, y + 1, p.floor[1])
    tile.blit(thing, 0, 0)


def ramp3(dark, mid, hi):
    """Cieniowanie z lewej-góry dla elips: fn(nx, ny)."""
    return lambda nx, ny: hi if nx + ny < -.55 else (mid if nx + ny < .55 else dark)


# ---------------- rzeczy ----------------
def rebar(tile, p, r, pts):
    """Zardzewiały pręt zbrojeniowy: 2 px, jaśniejszy wierzch i żeberka co kilka pikseli."""
    w = p.wreck
    t = item(tile)
    polyline(t, pts, w[RU1], width=2)
    polyline(t, pts, w[RU2])
    for i, (x, y) in enumerate(pts[1:-1]):
        put(t, x, y + 1, w[RU0])
    stamp(tile, t, p)


def bolt(tile, p, x, y):
    I = p.iron
    t = item(tile)
    box(t, x, y, 2, 2, I[1])
    t.put(x, y, I[2])
    stamp(tile, t, p, shadow=False)


def sheet(tile, p, r, pts, rivets=True):
    """Pogięta blacha: rdza z łatami jaśniejszej i ciemniejszej, nity na rogach."""
    w, I = p.wreck, p.iron
    t = item(tile)
    fill_poly(t, pts, lambda x, y: w[RU1] if r.random() < .78 else (w[RU0] if r.random() < .6 else w[RU2]))
    for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):  # jaśniejsza krawędź od północy
        if bx != ax and abs((by - ay) / (bx - ax)) < 1 and (ay + by) / 2 < sum(q[1] for q in pts) / len(pts):
            line(t, ax, ay + 1, bx, by + 1, w[RU2])
    if rivets:
        cx, cy = sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts)
        for x, y in pts[:4]:
            put(t, x + (cx - x) * .25, y + (cy - y) * .25, I[2])
    stamp(tile, t, p)


def chain(tile, p, r, x0, y0, n, dx=4, wobble=1.2):
    I = p.iron
    t = item(tile)
    for i in range(n):
        x, y = x0 + i * dx, y0 + wobble * math.sin(i * 1.1)
        if i % 2:
            fill_ellipse(t, x, y, 2.4, 1.4, lambda nx, ny: I[1] if nx * nx + ny * ny > .3 else None)
        else:
            fill_ellipse(t, x, y, 1.5, 2.2, lambda nx, ny: I[2] if ny < 0 else I[0])
    stamp(tile, t, p)


def soot(img, p, r, cx, cy, rad, squash=.8):
    """Wypalona plama: płaska, gładka i ciepła (dwa tony + popiół w środku). Bez postrzępionego brzegu
    z drobin — taki wyglądał jak włochaty pająk."""
    w = p.wreck
    for y in range(img.h):
        for x in range(img.w):
            a = math.atan2(y + .5 - cy, x + .5 - cx)
            d = math.hypot(x + .5 - cx, (y + .5 - cy) / squash)
            reach = rad * (1 + .12 * math.sin(a * 3 + cx) + .06 * math.sin(a * 5 - cy))
            if d < reach * .3:
                img.put(x, y, w[CH2] if r.random() < .3 else w[CH0])
            elif d < reach * .65:
                img.put(x, y, w[CH0])
            elif d < reach:
                img.put(x, y, w[CH1])


def plank(tile, p, r, x0, y0, length, thick, vertical=False, charred=0.0, nails=2):
    """Deska z słojami; `charred` — udział zwęglonego końca (od prawej / od dołu)."""
    w, I = p.wreck, p.iron
    t = item(tile)
    for i in range(length):
        burnt = i >= length * (1 - charred)
        for k in range(thick):
            c = w[WD2] if k == 0 else (w[WD0] if k == thick - 1 else w[WD1])
            if burnt:
                c = w[CH2] if k == 0 and r.random() < .3 else (w[CH0] if r.random() < .4 else w[CH1])
            elif k not in (0, thick - 1) and r.random() < .12:
                c = w[WD0]  # słoje
            t.put(x0 + k, y0 + i, c) if vertical else t.put(x0 + i, y0 + k, c)
    for j in range(nails):
        i = int(length * (j + 1) / (nails + 1) * (1 - charred))
        t.put(x0 + 1, y0 + i, I[2]) if vertical else t.put(x0 + i, y0 + 1, I[2])
    end = length - 1  # poszarpany koniec
    for k in range(thick):
        if r.random() < .5:
            t.put(x0 + k, y0 + end, K.CLR) if vertical else t.put(x0 + end, y0 + k, K.CLR)
    stamp(tile, t, p)


def shards(tile, p, r, n, area=(3, 3, 28, 28)):
    w = p.wreck
    t = item(tile)
    for _ in range(n):
        x, y = r.randint(area[0], area[2]), r.randint(area[1], area[3])
        s = r.choice((2, 2, 3, 4))
        for i in range(s):
            for j in range(s - i):
                t.put(x + j, y + i, w[GL0])
        t.put(x, y, w[GL1])
    stamp(tile, t, p, shadow=False)


def rag(tile, p, r, cx, cy, rx, ry):
    """Łachman: płachta z fałdami i postrzępionym brzegiem."""
    w = p.wreck
    t = item(tile)
    phase = r.uniform(0, 6)
    for y in range(int(cy - ry) - 2, int(cy + ry) + 3):
        for x in range(int(cx - rx) - 2, int(cx + rx) + 3):
            a = math.atan2(y + .5 - cy, x + .5 - cx)
            edge = 1 + .22 * math.sin(a * 4 + phase) + (.12 if r.random() < .25 else 0)
            nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny <= edge * edge * .8:
                fold = math.sin((x - y * .6) * .55 + phase)
                t.put(x, y, w[CL2] if fold > .7 else (w[CL0] if fold < -.55 else w[CL1]))
    for _ in range(3):  # strzępy
        x, y = cx + r.uniform(-rx, rx), cy + ry * r.choice((-1, 1)) * .9
        line(t, x, y, x + r.uniform(-2, 2), y + r.choice((-1, 1)) * r.uniform(2, 3), w[CL0])
    stamp(tile, t, p)


def boot(tile, p, r, cx, cy, flip=False):
    """Porzucony but z góry: podeszwa, cholewka, sznurowanie."""
    w = p.wreck
    t = item(tile)
    s = -1 if flip else 1
    fill_ellipse(t, cx + s * 2, cy, 5.5, 2.6, ramp3(w[WD0], w[WD1], w[WD2]))
    fill_ellipse(t, cx - s * 3, cy - .5, 3, 3.2, ramp3(w[CH1], w[WD0], w[WD1]))
    for i in range(3):
        t.put(int(cx - s * 1 + s * i * 2), int(cy - 1), p.bone[0])
    stamp(tile, t, p)


def skull(img, p, cx, cy, rad=3.2):
    B = p.bone
    fill_ellipse(img, cx, cy, rad, rad * 1.1, lambda nx, ny: B[1] if ny < -.3 else B[0])
    ey = int(cy + rad * .2)
    img.put(int(cx - rad * .45), ey, p.floor[0])
    img.put(int(cx + rad * .45), ey, p.floor[0])
    img.put(int(cx), int(cy + rad * .7), p.floor[0])


def long_bone(img, p, x0, y0, x1, y1):
    B = p.bone
    # Przygaszone (cień i środek rampy kości), żeby szczątki nie przypominały łupów ani pocisków.
    line(img, x0, y0, x1, y1, B[0], width=2)
    line(img, x0, y0, x1, y1, B[1])
    for x, y in ((x0, y0), (x1, y1)):  # nasady
        box(img, int(x) - 1, int(y), 3, 2, B[0])
        img.put(int(x) - 1, int(y), B[1])


def ribs(img, p, cx, cy, n=4, span=5, spine=True):
    B = p.bone
    if spine:
        for i in range(n * 2 + 1):
            img.put(int(cx), int(cy - n + i), B[1] if i % 2 else B[0])
    for i in range(n):
        y = cy - n + 1 + i * 2
        for sgn in (-1, 1):
            polyline(img, [(cx + sgn, y), (cx + sgn * span * .7, y - 1), (cx + sgn * span, y + 1)], B[0])


def paper(tile, p, r, cx, cy, angle, w=7, h=9):
    W = p.wreck
    t = item(tile)
    ca, sa = math.cos(angle), math.sin(angle)
    pts = [(cx + ca * dx - sa * dy, cy + sa * dx + ca * dy) for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2),
                                                                           (w / 2, h / 2), (-w / 2, h / 2))]
    fill_poly(t, pts, lambda x, y: W[PAPER])
    for i in range(1, 4):  # wiersze tekstu
        dy = -h / 2 + i * h / 4.5
        line(t, cx + ca * (-w / 2 + 1.5) - sa * dy, cy + sa * (-w / 2 + 1.5) + ca * dy,
             cx + ca * (w / 2 - 2) - sa * dy, cy + sa * (w / 2 - 2) + ca * dy, W[CH2])
    stamp(tile, t, p)


def stones(tile, p, r, pts, size=2):
    for x, y in pts:
        K.pebble(tile, x, y, size, p.wall_top)


# ---------------- nakładki podłogi 1×1 ----------------
def floor_decal(kind):
    def gen(p, r):
        tile = canvas()
        w = p.wreck
        if kind == 'scrap_a':  # pręty zbrojeniowe i śruby
            rebar(tile, p, r, [(4, 9), (12, 8), (17, 11), (26, 9)])
            rebar(tile, p, r, [(7, 24), (13, 19), (15, 13)])
            for x, y in ((20, 21), (24, 25), (9, 15)):
                bolt(tile, p, x, y)
        elif kind == 'scrap_b':  # zardzewiała blacha z nitami
            sheet(tile, p, r, [(8, 10), (19, 8), (22, 17), (15, 22), (9, 19)])
            bolt(tile, p, 25, 26)
            rebar(tile, p, r, [(20, 27), (28, 23)])
        elif kind == 'scrap_c':  # zerwany łańcuch i gwoździe
            chain(tile, p, r, 5, 14, 6)
            for x, y in ((8, 23), (19, 24), (24, 7)):
                t = item(tile)
                line(t, x, y, x + 3, y + 1, p.iron[1])
                t.put(x, y, p.iron[2])
                stamp(tile, t, p, shadow=False)
        elif kind == 'char_a':  # wypalona plama z kawałkiem zwęglonej deski
            soot(tile, p, r, 16, 17, 9.5)
            plank(tile, p, r, 6, 14, 17, 4, charred=.65, nails=1)
        elif kind == 'char_b':  # sadza po pożarze, popiół w środku
            soot(tile, p, r, 15, 15, 11)
        elif kind == 'glass':  # rozbite szkło i szyjka butelki
            shards(tile, p, r, 9)
            t = item(tile)
            line(t, 18, 12, 24, 15, w[GL0], width=2)
            t.put(18, 12, w[GL1])
            stamp(tile, t, p)
        elif kind == 'rags_a':  # łachman
            rag(tile, p, r, 15, 16, 9, 6)
        elif kind == 'rags_b':  # porzucony but i strzęp bandaża
            boot(tile, p, r, 12, 12)
            t = item(tile)
            polyline(t, [(8, 24), (14, 21), (20, 23), (26, 20)], p.bone[0], width=2)
            polyline(t, [(8, 24), (14, 21), (20, 23)], p.bone[1])
            stamp(tile, t, p)
        elif kind == 'camp':  # wygasłe ognisko uciekinierów: krąg kamieni, popiół, zwęglone patyki
            for y in range(6, 27):
                for x in range(6, 27):
                    d = math.hypot(x + .5 - 16, (y + .5 - 16) * 1.15)
                    if d < 7.5:
                        tile.put(x, y, w[CH0] if d < 3.5 else (w[CH2] if r.random() < .35 else w[CH1]))
            t = item(tile)
            line(t, 11, 13, 21, 19, w[CH1], width=2)
            line(t, 12, 20, 20, 12, w[CH1], width=2)
            line(t, 11, 13, 15, 15, w[CH2])
            stamp(tile, t, p)
            ring = [(16 + 9.5 * math.cos(a), 16 + 8.5 * math.sin(a)) for a in (i * math.pi / 4 + .3 for i in range(8))]
            stones(tile, p, r, [(int(x) - 1, int(y) - 1) for x, y in ring])
        elif kind == 'papers':  # ulotki, rozdarte ogłoszenia
            paper(tile, p, r, 10, 11, .4)
            paper(tile, p, r, 21, 19, -.7, 6, 8)
            paper(tile, p, r, 12, 24, 1.2, 5, 6)
        elif kind == 'bones_a':  # czaszka i piszczele poległego
            t = item(tile)
            long_bone(t, p, 5, 22, 17, 26)
            long_bone(t, p, 18, 21, 27, 14)
            skull(t, p, 11, 11)
            stamp(tile, t, p)
        elif kind == 'bones_b':  # żebra i miednica
            t = item(tile)
            ribs(t, p, 13, 14, 4, 6)
            fill_ellipse(t, 22, 23, 4, 2.6, lambda nx, ny: p.bone[0] if nx * nx + ny * ny > .25 else None)
            stamp(tile, t, p)
        elif kind == 'debris':  # okruchy tynku i rdzy (wypełniacz)
            for _ in range(8):
                K.pebble(tile, r.randint(2, 28), r.randint(2, 28), r.choice((1, 1, 2)), p.wall_top)
            for _ in range(6):
                tile.put(r.randint(2, 29), r.randint(2, 29), w[r.choice((RU0, RU1, CH1))])
        else:
            raise ValueError(kind)
        return tile
    return gen


# ---------------- duże nakładki ----------------
def large_decal(kind):
    def gen(p, r):
        w, W = p.wreck, p.wall_top
        if kind == 'collapse':  # zawalony strop 2×2: płaskie płyty w kawałkach, pręty, gruz i pył
            tile = canvas(2, 2)
            for y in range(64):  # pył wokół
                for x in range(64):
                    d = math.hypot(x + .5 - 32, (y + .5 - 33) * 1.1)
                    if 16 < d < 28 and r.random() < .3 * (1 - (d - 16) / 12):
                        tile.put(x, y, p.ash[0] if r.random() < .6 else p.ash[1])
            slabs = [[(14, 18), (31, 13), (35, 28), (19, 33)], [(34, 14), (50, 20), (46, 34), (37, 29)],
                     [(17, 36), (34, 31), (40, 47), (22, 50)], [(41, 37), (51, 36), (53, 48), (43, 50)]]
            for pts in slabs:
                t = item(tile)
                fill_poly(t, pts, lambda x, y: W[2] if r.random() < .82 else (W[1] if r.random() < .5 else W[3]))
                for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
                    if ay + by < 2 * sum(q[1] for q in pts) / len(pts):
                        line(t, ax, ay, bx, by, W[4])
                K.crack(t, r, int(pts[0][0]) + 3, int(pts[0][1]) + 2, 9, 1, 1, W[0], W[4],
                        keep=lambda x, y, t=t: t.get(x, y) is not None and t.get(x, y)[3])
                stamp(tile, t, p)
            rebar(tile, p, r, [(31, 24), (38, 17), (45, 9)])
            rebar(tile, p, r, [(25, 42), (17, 46), (9, 44)])
            plank(tile, p, r, 44, 47, 15, 3, charred=.4, nails=1)
            for _ in range(16):
                K.pebble(tile, r.randint(8, 54), r.randint(10, 54), r.choice((1, 2, 2, 3)), W)
            return tile
        if kind == 'beam':  # zwęglona belka stropowa 2×1 i drzazgi
            tile = canvas(2, 1)
            soot(tile, p, r, 44, 17, 10, .6)
            plank(tile, p, r, 4, 11, 54, 7, charred=.45, nails=3)
            plank(tile, p, r, 12, 22, 18, 3, charred=0, nails=1)
            for _ in range(5):
                tile.put(r.randint(30, 60), r.randint(22, 29), w[CH1])
            return tile
        if kind == 'remains':  # szczątki uciekiniera 2×1: szkielet pod łachmanem, zardzewiały nóż
            tile = canvas(2, 1)
            rag(tile, p, r, 26, 16, 9, 7)
            t = item(tile)
            skull(t, p, 9, 15, 3.4)
            ribs(t, p, 22, 15, 3, 5, spine=True)
            fill_ellipse(t, 32, 16, 3.5, 2.6, lambda nx, ny: p.bone[0] if nx * nx + ny * ny > .3 else None)
            long_bone(t, p, 35, 13, 48, 10)
            long_bone(t, p, 35, 19, 47, 22)
            long_bone(t, p, 48, 10, 57, 12)
            long_bone(t, p, 47, 22, 56, 24)
            long_bone(t, p, 19, 21, 14, 27)
            stamp(tile, t, p)
            n = item(tile)
            line(n, 6, 25, 12, 27, p.iron[2])
            line(n, 6, 26, 12, 28, w[RU1])
            box(n, 12, 26, 3, 2, w[WD0])
            stamp(tile, n, p)
            return tile
        if kind == 'pipe':  # pęknięta rura 2×1 z kałużą rdzawej wody
            tile = canvas(2, 1)
            for y in range(32):
                for x in range(64):
                    d = math.hypot(x + .5 - 50, (y + .5 - 20) * 1.6)
                    if d < 9 + r.uniform(-1.2, 1.2):
                        tile.put(x, y, p.stain[1] if d < 5 else p.stain[0])
            t = item(tile)
            for x in range(6, 46):
                for k in range(5):
                    c = w[RU2] if k == 1 else (w[RU0] if k == 4 else w[RU1])
                    if r.random() < .1:
                        c = w[RU0]
                    t.put(x, 12 + k + (1 if x > 30 else 0), c)
            for fx in (6, 24):  # kołnierze
                box(t, fx, 10, 3, 9, p.iron[1])
                t.put(fx, 10, p.iron[2])
                t.put(fx + 1, 18, p.iron[0])
            for k in range(6):  # rozerwany koniec
                t.put(45 + (k % 2), 11 + k, K.CLR)
                t.put(46, 12 + k, w[RU0])
            stamp(tile, t, p)
            return tile
        raise ValueError(kind)
    return gen


# ---------------- lica murów ----------------
def face(kind):
    """Detale na licu muru (wiersze T−FACE..T−1 kafla z licem od południa), czasem wchodzą na wierzch muru."""
    def gen(p, r):
        T, F = K.T, K.FACE
        img, w, I = canvas(), p.wreck, p.iron
        fy = T - F
        if kind == 'rebar':  # odpadnięty tynk, odsłonięte zbrojenie
            for y in range(fy, T - 1):
                for x in range(9, 23):
                    if abs(x + .5 - 16) < 7 - abs(y - fy - 3) * .6 + r.uniform(-.8, .8):
                        img.put(x, y, p.wall_face[0] if y > fy + 1 else p.outline)
            for x in range(8, 24):
                img.put(x, fy + 3, w[RU1])
            img.put(8, fy + 3, w[RU2])
            for x0 in (12, 19):
                for y in range(fy + 1, T - 2):
                    img.put(x0, y, w[RU0] if y % 2 else w[RU1])
            img.put(23, fy + 2, w[RU2])
        elif kind == 'soot':  # sadza po pożarze: języki w górę lica, aż na wierzch muru
            for x in range(4, 28):
                reach = 6 + 5 * math.sin((x - 4) / 24 * math.pi) + r.uniform(-1.5, 1.5)
                for y in range(T - 1, int(T - 1 - reach - 4), -1):
                    d = T - 1 - y
                    if d < reach * .6:
                        img.put(x, y, w[CH0])
                    elif d < reach and r.random() < .7:
                        img.put(x, y, w[CH1])
                    elif d < reach + 3 and r.random() < .15:
                        img.put(x, y, w[CH2])
        elif kind == 'boards':  # wyłom zabity deskami
            for y in range(fy, T - 1):
                for x in range(8, 24):
                    img.put(x, y, p.outline)
            for x0, x1, y0, y1 in ((6, 25, fy + 1, fy + 2), (7, 26, fy + 4, fy + 5)):
                for x in range(x0, x1):
                    for y in (y0, y1):
                        img.put(x, y, w[WD2] if y == y0 else w[WD0])
                img.put(x0 + 1, y0, I[2])
                img.put(x1 - 2, y0, I[2])
            line(img, 9, fy - 1, 21, T - 2, w[WD1], width=2)
            img.put(9, fy - 1, w[WD2])
        elif kind == 'tally':  # kreski odliczania dni i strzałka w górę — „do wieży”
            chalk = p.bone[0]
            for i, x in enumerate((6, 8, 10, 12)):
                for y in range(fy + 2, T - 2):
                    img.put(x, y, chalk)
            line(img, 5, T - 3, 13, fy + 2, chalk)
            for i, x in enumerate((16, 18)):
                for y in range(fy + 2, T - 2):
                    img.put(x, y, chalk)
            for y in range(fy + 1, T - 1):  # strzałka
                img.put(24, y, chalk)
            for d in range(1, 3):
                img.put(24 - d, fy + 1 + d, chalk)
                img.put(24 + d, fy + 1 + d, chalk)
        elif kind == 'pipe':  # rdzewiejąca rura wzdłuż lica, zaciek rdzy pod pęknięciem
            for x in range(0, T):
                img.put(x, fy + 1, w[RU2])
                img.put(x, fy + 2, w[RU1])
                img.put(x, fy + 3, w[RU0])
            box(img, 10, fy, 2, 5, I[1])
            img.put(10, fy, I[2])
            for y in range(fy + 4, T - 1):
                img.put(21, y, w[RU0])
                if y > fy + 5:
                    img.put(22, y, w[RU0])
            img.put(21, fy + 2, p.outline)
        else:
            raise ValueError(kind)
        return img
    return gen


FLOOR = (('scrap_a', 'decal.scrap'), ('scrap_b', 'decal.scrap'), ('scrap_c', 'decal.scrap'),
         ('char_a', 'decal.char'), ('char_b', 'decal.char'), ('glass', 'decal.glass'),
         ('rags_a', 'decal.rags'), ('rags_b', 'decal.rags'), ('camp', 'decal.camp'), ('papers', 'decal.papers'),
         ('bones_a', 'decal.bones'), ('bones_b', 'decal.bones'), ('debris', 'decal.wreckDebris'))
LARGE = (('collapse', 2, 2, 'decal.collapse'), ('beam', 2, 1, 'decal.beam'), ('remains', 2, 1, 'decal.remains'),
         ('pipe', 2, 1, 'decal.pipe'))
FACES = (('rebar', 3), ('soot', 3), ('boards', 2), ('tally', 1), ('pipe', 2))
# Mury ruin bardziej zniszczone: pęknięte i wyszczerbione warianty losują się tyle razy częściej (Grzybnia 4×).
WALL_DAMAGE = 3


def apply(entries, Entry, kit):
    """Dopisuje kafle zniszczenia na końcu (first-fit) i częściej losuje uszkodzone mury."""
    global K
    K = kit
    out = [dataclasses.replace(e, weight=e.weight * WALL_DAMAGE)
           if e.layer == 'wall' and e.name.endswith(('_crack', '_chunk')) else e for e in entries]
    for kind, group in FLOOR:
        out.append(Entry(f'decal_wreck_{kind}', floor_decal(kind), 'floorDecal', group=group, weight=1, flip_x=True))
    for kind, w, h, group in LARGE:
        out.append(Entry(f'decal_wreck_{kind}_{w}x{h}', large_decal(kind), 'floorDecal', w, h, group=group,
                         weight=1, flip_x=True))
    for kind, weight in FACES:
        out.append(Entry(f'face_wreck_{kind}', face(kind), 'wallDecor', group='wallFace.wreck', weight=weight))
    return out

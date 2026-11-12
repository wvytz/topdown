"""
Kręcona klatka schodowa na wyższe piętro (krok 187; krok 186 — pierwsza wersja z łukiem).

Prośba właściciela (11.11.2026): schody w narożniku areny, model ze złudzeniem 3D, który „faktycznie ukazuje głębię
ciemności i ryzyko, jakie podejmujemy”, z logiką klatki schodowej w jednym pionie. Wieża ma klatkę w jednym pionie,
więc schody to spirala w okrągłym szybie. Kafel 3x3 (96x96 px), widok z góry:

  - wejście od południa: pierwszy stopień na poziomie posadzki, najjaśniejszy;
  - stopnie-kliny wznoszą się zgodnie z ruchem wskazówek zegara (zachód → północ → wschód) i z każdym stopniem
    ciemnieją — u góry spirala znika w czerni (sektor wschodni): idziemy w nieznane;
  - w środku dusza klatki — szyb w głąb: wewnętrzne lico opada w czerń, w dole majaczą coraz mniejsze i ciemniejsze
    zwoje tej samej spirali (piętra, które już przeszliśmy). Poręcz wokół szybu;
  - mur szybu z widocznym licem północnej ściany i przednim licem od południa (złudzenie bryły);
  - zamknięte (przed bossem): krata w wejściu z kłódką.

Gradient zniszczeń (lore: piętro 1 najbardziej zrujnowane, wyżej więcej resztek cywilizacji) — `WEAR` per biom:
3 = ruiny (wyłamana poręcz nad szybem, wyszczerbiony mur, gruz), 0 = złota poręcz. Dodatki biomów: pajęczyna nad
szybem (leże, Grzybnia), żar na dnie szybu (Piekło), chodnik z mosiężnymi prętami (mieszkanie gracza), trawa przy
murze (Bociani Ogród).
"""
import math

S = 96  # bok kafla 3x3

# Biom → poziom zniszczenia (0 zadbane … 3 ruina).
WEAR = {
    'tower_ruins': 3,
    'spider_lair': 2,
    'fungal_grove': 2,
    'graveyard': 2,
    'infernal': 1,
    'smoke_den': 1,
    'mirror_hall': 0,
    'stork_garden': 0,
}

# Indeksy rampy `Palette.junk` (jak w tools/gamer_den_tiles.py): dywan bordo cień, bordo, beż.
RUG0, RUG1, RUGB = 33, 34, 35

CX, CY = 48, 47           # środek szybu
R_WALL_OUT = 46.5         # mur szybu: zewnętrzny promień
R_WALL_IN = 41.5          # mur szybu: wewnętrzny promień (wierzch muru między nimi)
R_FACE = 37.5             # lico muru widoczne od północy (między R_FACE a R_WALL_IN)
R_RAIL = 15.5             # poręcz wokół szybu (R_WELL..R_RAIL)
R_WELL = 13.5             # krawędź szybu
STEP_DEG = 20             # kąt jednego stopnia
ENTRY = (160, 200)        # wejście od południa (kąty: 0 = północ, zgodnie z zegarem)
STEPS = 14                # widoczne stopnie: od wejścia przez zachód i północ do 80° (ostatnie toną w mroku)


def polar(x, y):
    dx, dy = x + .5 - CX, y + .5 - CY
    return math.hypot(dx, dy), math.degrees(math.atan2(dx, -dy)) % 360


def draw(p, r, open_, biome, Img, outline):
    W, WF, D, G, I, O, A = p.wall_top, p.wall_face, p.deep, p.accent, p.iron, p.outline, p.ash
    wear = WEAR.get(biome, 2)
    img = Img(S, S)
    put = img.put
    rug = biome == 'smoke_den' and len(p.junk) > RUGB

    # Stopień k zajmuje kąty [160 + 20k, 180 + 20k) (mod 360); k rośnie w górę spirali.
    def step_of(a):
        k = int(((a - ENTRY[0]) % 360) // STEP_DEG)
        return k if k < STEPS else None

    # Barwy stopni: im wyżej, tym ciemniej (ostatnie toną w mroku).
    tread = (W[4], W[4], W[3], W[3], W[3], W[2], W[2], W[2], W[1], W[1], W[0], D[1], D[0], D[0])
    nose = (W[5], W[5], W[4], W[4], W[4], W[3], W[3], W[3], W[2], W[2], W[1], W[0], D[1], D[1])
    shade = (W[3], W[3], W[2], W[2], W[2], W[1], W[1], W[1], W[0], W[0], D[1], D[0], O, O)
    riser = (W[1], W[1], W[0], W[0], W[0], W[0], O, O, O, O, O, O, O, O)

    for y in range(S):
        for x in range(S):
            d, a = polar(x, y)
            north = a >= 270 or a <= 90
            if d > R_WALL_OUT:
                continue
            if d > R_WALL_IN:  # wierzch muru szybu (przerwa na wejście)
                if ENTRY[0] <= a < ENTRY[1]:
                    continue
                c = W[3]
                if d > R_WALL_OUT - 1:
                    c = W[4] if north else W[2]
                elif d < R_WALL_IN + 1:
                    c = W[2] if north else W[4]
                if int(a) % 30 == 0:  # spoiny bloków muru
                    c = W[1]
                put(x, y, c)
                continue
            if north and d > R_FACE and not (ENTRY[0] <= a < ENTRY[1]):  # lico północnej ściany szybu
                t = (d - R_FACE) / (R_WALL_IN - R_FACE)
                c = WF[1] if t > .66 else (WF[0] if t > .33 else D[1])
                if a > 20 and a < 90:
                    c = D[0] if t > .5 else O
                put(x, y, c)
                continue
            if d > R_RAIL:  # stopnie
                k = step_of(a)
                if k is None:  # czerń: tu spirala biegnie dalej w górę, w nieznane
                    put(x, y, O)
                    continue
                pos = ((a - ENTRY[0]) % 360) - k * STEP_DEG  # 0..20 w obrębie stopnia
                c = tread[k]
                if pos < 1.2:
                    c = O  # szczelina między stopniami
                elif pos < 3.4:
                    c = riser[k]  # lico stopnia: wyższy stopień wznosi się nad niższym
                elif pos < 4.6:
                    c = nose[k]
                elif pos > STEP_DEG - 3.5 or d < R_RAIL + 3:
                    c = shade[k]  # cień pod nawisem wyższego stopnia i przy poręczy
                elif d > R_WALL_IN - 4 and (x + y) % 2 and k < 10:
                    c = nose[k]  # zewnętrzny, wydeptany brzeg — jaśniejszy
                if rug and 22 < d < 32 and pos >= 3.4:
                    J = p.junk
                    c = J[RUGB] if (d < 23 or d > 31) else (G[2] if pos < 4.6 else J[RUG1])
                put(x, y, c)
                continue
            if d > R_WELL:  # poręcz wokół szybu
                rail = (G[2] if north else G[1]) if wear == 0 else (W[4] if north else W[3])
                put(x, y, rail)
                continue
            # Szyb: wewnętrzne lico opada w czerń, w dole mniejsze zwoje spirali.
            c = O
            if not north or d > 12:
                c = WF[0] if d > 11.5 and (a >= 300 or a <= 60) else O
            if 11.5 < d <= 13.5 and (a >= 280 or a <= 80):
                c = WF[1] if d > 12.5 else WF[0]
            for ring, col in ((9.0, D[1]), (5.5, D[0])):
                if abs(d - ring) < .55 and not (100 <= a <= 160):
                    c = col
            if 6.5 < d < 8.6 and int(a) % 40 < 4:  # krawędzie niższych stopni
                c = D[0]
            put(x, y, c)

    # Przednie lico muru od południa (złudzenie bryły): 3 px pod dolną krawędzią muru.
    for x in range(S):
        bottom = None
        for y in range(S - 1, CY, -1):
            if img.get(x, y)[3]:
                bottom = y
                break
        if bottom is None:
            continue
        d, a = polar(x, bottom)
        if ENTRY[0] - 4 <= a < ENTRY[1] + 4:
            continue
        for k in range(1, 4):
            put(x, bottom + k, WF[2] if k == 1 else WF[1])
    # Próg wejścia: pierwszy stopień wychodzi na posadzkę.
    for y in range(S):
        for x in range(S):
            d, a = polar(x, y)
            if ENTRY[0] + 1 <= a < ENTRY[1] - 1 and R_WALL_IN <= d < R_WALL_OUT + 1:
                put(x, y, W[4] if d < R_WALL_IN + 2 else WF[1])

    # ---------- zamknięte: krata w wejściu z kłódką ----------
    if not open_:
        ys = [y for y in range(S) for x in range(S) if ENTRY[0] <= polar(x, y)[1] < ENTRY[1] and R_RAIL < polar(x, y)[0] <= R_WALL_OUT]
        y0, y1 = min(ys), max(ys)
        gx0, gx1 = CX - 8, CX + 8
        gy = y1 - 7
        for bx in range(gx0, gx1 + 1, 4):
            for y in range(gy, y1 + 2):
                put(bx, y, I[1]); put(bx + 1, y, I[0])
        for by in (gy, gy + 5):
            for x in range(gx0 - 1, gx1 + 3):
                put(x, by, I[2]); put(x, by + 1, O)
        px, py = CX - 2, gy + 1
        for yy in range(py, py + 6):
            for x in range(px, px + 5):
                edge = yy in (py, py + 5) or x in (px, px + 4)
                put(x, yy, O if edge else (G[2] if yy < py + 3 else G[1]))
        put(px + 2, py + 3, O)

    # ---------- zniszczenia (gradient lore) ----------
    def on_step(x, y, low=0, high=STEPS):
        d, a = polar(x, y)
        k = step_of(a)
        return k is not None and low <= k < high and R_RAIL + 2 < d < R_WALL_IN - 1

    def pebbles(count):
        for _ in range(count * 20):
            if count <= 0:
                break
            x, y = r.randint(8, S - 10), r.randint(8, S - 10)
            if on_step(x, y, 0, 8) and on_step(x + 1, y + 1, 0, 8):
                put(x, y, W[4]); put(x + 1, y, W[2]); put(x, y + 1, W[1])
                count -= 1

    def crack(length):
        for _ in range(40):
            x, y = r.randint(10, S - 10), r.randint(10, S - 10)
            if on_step(x, y, 1, 8):
                break
        for _ in range(length):
            if not on_step(x, y):
                break
            put(x, y, W[0])
            x += r.choice((-1, 0, 1, 1))
            y += r.choice((0, 1, 1, -1))

    if wear >= 1:
        for _ in range(wear + 1):
            crack(r.randint(5, 9))
    if wear >= 2:
        pebbles(2 * wear)
    if wear >= 3:
        # Wyłamana poręcz nad szybem (zachód): przerwa, przez którą widać czerń, i wyszczerbiony mur na północy.
        for y in range(S):
            for x in range(S):
                d, a = polar(x, y)
                if R_WELL < d <= R_RAIL + .6 and 248 <= a <= 282:
                    put(x, y, O)
                if d > R_WALL_OUT - 2.2 and 330 <= a <= 352:
                    put(x, y, (0, 0, 0, 0))
        for (x, y) in ((24, 30), (21, 34), (27, 27)):
            put(x, y, W[4]); put(x + 1, y, W[2]); put(x, y + 1, W[1]); put(x + 1, y + 1, W[0])

    # ---------- dodatki biomów ----------
    if biome in ('spider_lair', 'fungal_grove'):  # pajęczyna w poprzek szybu
        for k in range(-10, 11):  # dwie nici w poprzek i jedna od krawędzi
            put(CX + k, CY - 4 + k // 4, A[0])
        for k in range(0, 10):
            put(CX - 9 + k, CY + 3 + k // 3, A[0])
    if biome == 'infernal' and p.ember:  # żar na dnie szybu
        E = p.ember
        for (dx, dy, c) in ((0, 0, E[2]), (-1, 0, E[1]), (1, 1, E[1]), (-2, 2, E[0]), (2, -1, E[0]), (0, 2, E[0])):
            put(CX + dx, CY + dy, c)
    if biome == 'stork_garden' and p.grass:
        Gr = p.grass
        for a in (215, 250, 290, 320, 145, 125):
            x = int(CX + (R_WALL_OUT + .5) * math.sin(math.radians(a)))
            y = int(CY - (R_WALL_OUT + .5) * math.cos(math.radians(a)))
            put(x, y, Gr[1]); put(x, y - 1, Gr[2]); put(x + 1, y, Gr[0])

    outline(img, O)
    return img

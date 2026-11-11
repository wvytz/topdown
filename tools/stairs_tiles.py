"""
Schody na wyższe piętro (krok 186, prośba właściciela: „idziemy w górę — schody mają to jednoznacznie komunikować”).

Kafel 2x2 (64x64 px) rysowany jako wolnostojąca budowla na przezroczystym tle — pod spodem widać prawdziwą
podłogę biomu (wykładzina mieszkania, trawa ogrodu). Czytelność „w górę” budują naraz:
  - bieg stopni zwęża się i skraca ku północy (perspektywa), stopnie jaśnieją ku górze;
  - balustrady z klinem lica — rosną ku północy, niski słupek na dole;
  - u szczytu łuk z nadprożem: bieg znika pod nim i ciągnie się dalej w świetle z wyższego piętra;
  - podwójna strzałka (szewron) na nadprożu, świecąca po otwarciu;
  - zamknięte: krata w łuku, łańcuch z kłódką w poprzek biegu, przygaszone szewrony.

Gradient zniszczeń (lore: piętro 1 najbardziej zrujnowane, wyżej więcej resztek cywilizacji) — `WEAR` per biom:
3 = ruiny (wyłamana balustrada, zapadnięty stopień, odłupane nadproże, gruz), 0 = złote okucia i zadbany kamień.
Dodatki biomów: pajęczyna w łuku (leże, Grzybnia), żar w szczelinach (Piekło), chodnik z mosiężnymi prętami
(mieszkanie gracza), trawa przy balustradach (Bociani Ogród).
"""

S = 64  # bok kafla 2x2

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

# Układ (piksele kafla).
ARCH_TOP, LINTEL_FACE, OPEN_Y0, OPEN_Y1 = 0, 4, 12, 18  # wierzch nadproża 0..3, lico 4..11, prześwit 12..17
PILLAR_W = 7
ARCH_X0 = 10  # lewa krawędź łuku (prawa symetrycznie)
FLIGHT_TOP, FLIGHT_BOTTOM = 18, 59  # bieg stopni (bez przedniego lica dolnego stopnia)
STEP_HEIGHTS = (4, 5, 5, 6, 6, 7, 8)  # od góry: wyższe stopnie krótsze (perspektywa)
RAIL_W = 5
TAPER = 5  # o ile bieg zwęża się z każdej strony u szczytu


def draw(p, r, open_, biome, Img, outline):
    W, WF, G, I, O, F = p.wall_top, p.wall_face, p.accent, p.iron, p.outline, p.floor
    wear = WEAR.get(biome, 2)
    img = Img(S, S)
    put = img.put

    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                put(x, y, c)

    # Szerokość biegu w danym wierszu: u dołu 14..50, u góry 19..45 (zwężenie ku północy).
    def flight_x(y):
        t = (y - FLIGHT_TOP) / (FLIGHT_BOTTOM - FLIGHT_TOP)
        inset = round(TAPER * (1 - t))
        return 14 + inset, 50 - inset

    # ---------- stopnie ----------
    steps, y = [], FLIGHT_TOP
    for h in STEP_HEIGHTS:
        steps.append((y, h))
        y += h
    n = len(steps)
    tread_open = (W[5], W[5], W[4], W[4], W[3], W[3], W[3])
    riser_open = (W[2], W[1], W[1], W[1], W[0], W[0], W[0])
    tread = tread_open if open_ else (W[4], W[4], W[3], W[3], W[3], W[2], W[2])
    riser = riser_open if open_ else (W[1], W[1], W[0], W[0], W[0], W[0], W[0])
    for i, (yt, h) in enumerate(steps):
        rise = 2 if h < 6 else 3
        for yy in range(yt, yt + h):
            x0, x1 = flight_x(yy)
            ly = yy - yt
            for x in range(x0, x1):
                if ly >= h - rise:
                    c = riser[i] if ly > h - rise else O  # krawędź stopnia: linia cienia pod nosem
                    if ly == h - 1 and i == n - 1:
                        c = riser[i]
                else:
                    c = tread[i]
                    if ly == 0:  # nos stopnia — jaśniejsza krawędź
                        c = W[5] if i < 3 else W[4]
                    elif x == x0:  # cień lewej balustrady
                        c = W[1]
                put(x, yy, c)
            # Lico stopnia: cień od lewej, światło od prawej.
            if ly >= h - rise + 1:
                put(x0, yy, W[0])
        # Wytarty środek stopnia (tam się chodzi).
        cx0, cx1 = flight_x(yt)
        for _ in range(2 + i):
            x = r.randint(cx0 + 6, cx1 - 7)
            yy = yt + r.randint(1, max(1, h - 4))
            if img.get(x, yy) == tread[i]:
                put(x, yy, W[min(5, W.index(tread[i]) + 1)] if tread[i] != W[5] else W[4])

    # Dolny stopień wychodzi na posadzkę: przednie lico na całą szerokość + stopka.
    rect(12, FLIGHT_BOTTOM, 52, FLIGHT_BOTTOM + 3, WF[1])
    rect(12, FLIGHT_BOTTOM, 52, FLIGHT_BOTTOM + 1, W[3] if open_ else W[2])
    rect(12, FLIGHT_BOTTOM + 3, 52, FLIGHT_BOTTOM + 4, WF[0])

    # Światło z wyższego piętra pada na górne stopnie: zwężający się pas jaśniejszych stopni i złote nosy.
    # Właściwy blask (światło w mroku, pyłki unoszące się w górę) dokłada gra — effects/StairsGlow.ts.
    if open_:
        for i, (yt, h) in enumerate(steps[:4]):
            half = 11 - 2 * i
            rise = 2 if h < 6 else 3
            for yy in range(yt, yt + h - rise):
                for x in range(32 - half, 32 + half):
                    put(x, yy, (G[3] if i < 2 else G[2]) if yy == yt else W[5])

    # ---------- chodnik (mieszkanie gracza) ----------
    if biome == 'smoke_den' and len(p.junk) > RUGB:
        J = p.junk
        for i, (yt, h) in enumerate(steps):
            rise = 2 if h < 6 else 3
            for yy in range(yt, yt + h):
                ly = yy - yt
                riser_row = ly >= h - rise
                for x in range(23, 41):
                    edge = x in (23, 40)
                    c = J[RUGB] if edge else (J[RUG0] if riser_row else J[RUG1])
                    if riser_row and ly == h - rise:
                        c = G[2] if not edge else G[1]  # mosiężny pręt docisku
                    put(x, yy, c)

    # ---------- balustrady ----------
    def rail(side):
        top = FLIGHT_TOP - 1
        bottom = FLIGHT_BOTTOM - 1
        for yy in range(top, bottom):
            x0, x1 = flight_x(yy)
            t = (bottom - yy) / (bottom - top)  # 1 u góry, 0 u dołu
            face = 1 + round(4 * t)  # klin lica: balustrada rośnie ku północy
            if side < 0:
                cap0, cap1 = x0 - RAIL_W, x0
                face0, face1 = cap0 - face, cap0
            else:
                cap0, cap1 = x1, x1 + RAIL_W
                face0, face1 = cap1, cap1 + face
            for x in range(cap0, cap1):
                c = W[3]
                if x == cap0:
                    c = W[4] if side < 0 else W[3]
                if x == cap1 - 1:
                    c = W[2] if side < 0 else W[2]
                if (yy - top) % 9 == 8:  # spoina bloków
                    c = W[1]
                put(x, yy, c)
            for x in range(face0, face1):
                put(x, yy, WF[2] if side < 0 and x == face0 else (WF[0] if side > 0 and x == face1 - 1 else WF[1]))
        # Słupek na dole: kwadratowy kapitel i lico.
        px0 = (flight_x(bottom)[0] - RAIL_W - 1) if side < 0 else (flight_x(bottom)[1] - 1)
        rect(px0, bottom - 4, px0 + RAIL_W + 2, bottom + 1, W[3])
        rect(px0, bottom - 4, px0 + RAIL_W + 2, bottom - 3, W[4])
        rect(px0 + RAIL_W + 1, bottom - 3, px0 + RAIL_W + 2, bottom + 1, W[2])
        rect(px0, bottom + 1, px0 + RAIL_W + 2, bottom + 5, WF[1])
        rect(px0, bottom + 1, px0 + 1, bottom + 5, WF[2])
        if wear == 0:  # złota kula na słupku
            cx = px0 + (RAIL_W + 2) // 2
            put(cx, bottom - 3, G[3]); put(cx - 1, bottom - 2, G[2]); put(cx, bottom - 2, G[2]); put(cx + 1, bottom - 2, G[1])
            put(cx, bottom - 1, G[1])
        return px0

    rail(-1)
    rail(1)

    # ---------- łuk u szczytu: filary, nadproże, prześwit ----------
    for x0 in (ARCH_X0, S - ARCH_X0 - PILLAR_W):
        rect(x0, ARCH_TOP, x0 + PILLAR_W, OPEN_Y1 + 1, WF[1])
        rect(x0, ARCH_TOP, x0 + 1, OPEN_Y1 + 1, WF[2])
        rect(x0 + PILLAR_W - 1, ARCH_TOP, x0 + PILLAR_W, OPEN_Y1 + 1, WF[0])
        for yy in range(LINTEL_FACE + 3, OPEN_Y1 + 1, 4):  # spoiny filara
            rect(x0 + 1, yy, x0 + PILLAR_W - 1, yy + 1, WF[0])
    rect(ARCH_X0, ARCH_TOP, S - ARCH_X0, LINTEL_FACE, W[3])  # wierzch nadproża
    rect(ARCH_X0, ARCH_TOP, S - ARCH_X0, ARCH_TOP + 1, W[4])
    rect(ARCH_X0 + 1, ARCH_TOP + 1, S - ARCH_X0 - 1, ARCH_TOP + 2, W[5] if open_ else W[4])
    rect(ARCH_X0, LINTEL_FACE - 1, S - ARCH_X0, LINTEL_FACE, W[1])
    rect(ARCH_X0, LINTEL_FACE, S - ARCH_X0, OPEN_Y0, WF[1])  # lico nadproża
    rect(ARCH_X0, OPEN_Y0 - 1, S - ARCH_X0, OPEN_Y0, WF[0])
    for xx in (ARCH_X0 + PILLAR_W, 25, 38, S - ARCH_X0 - PILLAR_W - 1):  # spoiny nadproża
        rect(xx, LINTEL_FACE, xx + 1, OPEN_Y0 - 1, WF[0])
    if wear == 0:  # złota listwa pod nadprożem
        rect(ARCH_X0 + PILLAR_W, OPEN_Y0 - 1, S - ARCH_X0 - PILLAR_W, OPEN_Y0, G[1])

    # Prześwit: bieg ciągnie się dalej w górę — w świetle (otwarte) albo w czerni za kratą.
    ox0, ox1 = ARCH_X0 + PILLAR_W, S - ARCH_X0 - PILLAR_W
    if open_:
        rows = (W[5], W[5], G[3], G[3], G[3], G[2])
        for k, yy in enumerate(range(OPEN_Y0, OPEN_Y1)):
            rect(ox0, yy, ox1, yy + 1, rows[k])
        for yy, c in ((OPEN_Y0 + 2, G[2]), (OPEN_Y0 + 4, G[1])):  # dalsze stopnie, prawie rozpuszczone w świetle
            rect(ox0 + 3, yy, ox1 - 3, yy + 1, c)
    else:
        rect(ox0, OPEN_Y0, ox1, OPEN_Y1, O)
        for yy, c in ((OPEN_Y0 + 2, W[0]), (OPEN_Y0 + 4, W[0])):
            rect(ox0 + 3, yy, ox1 - 3, yy + 1, c)
        for bx in range(ox0 + 2, ox1 - 1, 5):  # krata
            rect(bx, OPEN_Y0, bx + 1, OPEN_Y1, I[1])
            rect(bx + 1, OPEN_Y0, bx + 2, OPEN_Y1, I[0])
        rect(ox0, OPEN_Y0 + 3, ox1, OPEN_Y0 + 4, I[2])
        rect(ox0, OPEN_Y0 + 4, ox1, OPEN_Y0 + 5, I[0])

    # Podwójny szewron „w górę” na licu nadproża.
    lit, mid = (G[3], G[2]) if open_ else (G[1], G[0])
    for top in (LINTEL_FACE + 1, LINTEL_FACE + 4):
        for k in range(4):
            c = lit if k < 2 else mid
            put(31 - k, top + k, c); put(32 + k, top + k, c)
        if open_:
            put(31, top, W[5]); put(32, top, W[5])

    # ---------- zamknięte: łańcuch z kłódką w poprzek biegu ----------
    if not open_:
        lx0, lx1 = flight_x(36)
        for x in range(lx0 - 2, lx1 + 2):
            sag = round(3 * (1 - ((x - 32) / ((lx1 - lx0) / 2 + 2)) ** 2))
            yy = 34 + sag
            link = (x // 2) % 2
            put(x, yy, I[2] if link else I[1])
            put(x, yy + 1, O if link else I[0])
        cx, cy = 32, 38
        for yy in range(cy, cy + 7):
            for x in range(cx - 3, cx + 3):
                edge = yy == cy or x in (cx - 3, cx + 2) or yy == cy + 6
                put(x, yy, O if edge else (G[2] if yy < cy + 3 else G[1]))
        put(cx - 1, cy - 1, I[1]); put(cx, cy - 1, I[1]); put(cx - 2, cy, I[1]); put(cx + 1, cy, I[1])
        put(cx - 1, cy + 3, O); put(cx - 1, cy + 4, O)

    # ---------- zniszczenia (gradient lore) ----------
    def chip_nosings(chance):
        for i, (yt, h) in enumerate(steps):
            x0, x1 = flight_x(yt)
            x = x0 + 1
            while x < x1 - 1:
                if r.random() < chance:
                    run = r.randint(1, 3)
                    for k in range(run):
                        if x + k < x1:
                            put(x + k, yt, tread[i])
                            if r.random() < .5:
                                put(x + k, yt + 1, W[1])
                    x += run + 2
                else:
                    x += 1

    def tread_crack(length, dark, glow=None):
        i = r.randrange(1, n)
        yt, h = steps[i]
        x0, x1 = flight_x(yt)
        x, yy = r.randint(x0 + 3, x1 - 4), yt + 1
        for _ in range(length):
            if yy >= yt + h - 2:
                break
            put(x, yy, dark if not glow or r.random() < .6 else glow)
            x += r.choice((-1, 0, 1, 1))
            if r.random() < .45:
                yy += 1
            if x < x0 + 1 or x >= x1 - 1:
                break

    def pebbles(count):
        for _ in range(count):
            i = r.randrange(n)
            yt, h = steps[i]
            x0, x1 = flight_x(yt)
            x, yy = r.randint(x0 + 1, x1 - 3), yt + r.randint(0, max(0, h - 4))
            put(x, yy, W[4]); put(x + 1, yy, W[2]); put(x, yy + 1, W[1])

    glow = p.ember[1] if biome == 'infernal' and p.ember else None
    if wear >= 1:
        chip_nosings(.03 * wear)
        for _ in range(wear):
            tread_crack(r.randint(5, 9), W[0], glow)
    if wear >= 2:
        pebbles(3 * wear)
        # Odłupany narożnik nadproża.
        for yy in range(0, 3):
            for x in range(S - ARCH_X0 - (3 - yy), S - ARCH_X0):
                put(x, yy, (0, 0, 0, 0))
    if wear >= 3:
        # Wyłamany fragment lewej balustrady: dziura w kapitelu i licu, gruz u podnóża.
        gy0, gy1 = 31, 40
        for yy in range(gy0, gy1):
            x0, _ = flight_x(yy)
            depth = 2 + (1 if (yy - gy0) in (2, 3, 4, 5) else 0) + (1 if (yy - gy0) in (3, 4) else 0)
            for x in range(x0 - RAIL_W - 4, x0 - RAIL_W + depth):
                put(x, yy, (0, 0, 0, 0))
        for (x, yy) in ((7, 41), (9, 43), (6, 44)):
            put(x, yy, W[4]); put(x + 1, yy, W[2]); put(x, yy + 1, W[1]); put(x + 1, yy + 1, W[0])
        # Zapadnięty kawałek trzeciego stopnia od dołu: wyrwa z ciemnym wnętrzem.
        yt, h = steps[n - 3]
        _, fx1 = flight_x(yt)
        for yy in range(yt, yt + h):
            for x in range(fx1 - 11, fx1 - 1):
                d = abs(x - (fx1 - 6)) + abs(yy - (yt + h // 2)) * 1.4
                if d < 5.5:
                    put(x, yy, O if yy == yt or d > 4.5 else F[0])
        put(fx1 - 7, yt + h // 2, W[2]); put(fx1 - 4, yt + h // 2 + 1, W[1])
        # Pęknięcie przez nadproże.
        x, yy = 46, ARCH_TOP + 1
        while yy < OPEN_Y0 - 1:
            put(x, yy, W[0] if yy < LINTEL_FACE else WF[0])
            x += r.choice((0, 1, -1))
            yy += 1

    # ---------- dodatki biomów ----------
    if 'spider' in biome or biome == 'fungal_grove':
        A = p.ash
        for k in range(1, 6):  # pajęczyna w lewym górnym rogu prześwitu: nić po skosie i łuk
            put(ox0 + k, OPEN_Y0 + k - 1, A[0])
        for (x, yy) in ((ox0 + 3, OPEN_Y0), (ox0 + 3, OPEN_Y0 + 1), (ox0 + 2, OPEN_Y0 + 3), (ox0, OPEN_Y0 + 3)):
            put(x, yy, A[0])
    if biome == 'stork_garden' and p.grass:
        Gr = p.grass
        for (x, yy) in ((10, 54), (11, 47), (53, 50), (54, 56), (15, 58), (48, 58), (9, 15), (54, 12)):
            put(x, yy, Gr[1]); put(x, yy - 1, Gr[2]); put(x + 1, yy, Gr[0])

    outline(img, O)
    return img

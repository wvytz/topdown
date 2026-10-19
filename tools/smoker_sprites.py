"""
Generator bossa piętra 7 „Baron Dymu” (krok 83) i jego psa: gruby ziomek z wysokim czołem i wielkim brzuchem,
puszką napoju energetycznego w lewej ręce, fajką w prawej i drugą fajką w ustach; przy twarzy cały czas unosi się dym.
Do tego czarny dog (osobny sprite, osobny boss-pomocnik), puszka rzucana w walce i obłok dymu smugi.

Użycie (z katalogu głównego repozytorium):
  python tools/smoker_sprites.py                       # arkusze do public/assets/sprites/
  python tools/smoker_sprites.py --preview tools/out   # dodatkowo podgląd 2x na podłodze palety C

smoke-baron_walk-puff-slam-throw-drink.png (2560x1024, komórka 128x128, pivot 48,48, 8 kierunków z obrotu, obrys po obrocie):
  kolumny 0–3 chód (kołysanie brzucha), 4–7 smuga dymu (wdech, uniesienie fajki, wydmuch, trzymanie),
  8–11 uderzenie brzuchem (odchylenie, pchnięcie, uderzenie, powrót), 12–15 rzut puszką lewą ręką,
  16–19 łyk z puszki (ryk wściekłości).
Dominująca cecha: ogromny brzuch w brudnym podkoszulku + wysokie, łyse czoło (jasna kopuła) + dym przy twarzy.
Akcenty: neonowa zieleń puszki (jedyny jaskrawy kolor) i żar fajek.

black-dog_run-lunge.png (640x640, komórka 80x80, pivot 40,40): kolumny 0–3 bieg, 4–7 skok z kłapnięciem
  (przysiad, wybicie, kłapnięcie z odsłoniętymi kłami, lądowanie).
smoke-puff.png (128x32): obłok dymu smugi, 4 klatki rosnącego kłębu (gra skaluje i przezroczystość ustawia sama).
energy-can.png (64x16): puszka w locie, 4 klatki obrotu co 45°.
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok
from spider_sprites import band_shade, ellipse, stroke
from lair_enemies import directional_sheet, strip_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 128
DOG = 80
C = CELL / 2
FLOOR = trt.PALETTES['piaskowiec'].floor[2]

# Skóra: ciepły róż (łysa kopuła musi być jasna — „wysokie czoło” czytelne w sylwetce).
SKIN = (ok(.46, .060, 40), ok(.58, .070, 42), ok(.69, .075, 45), ok(.78, .070, 50), ok(.88, .050, 60))
# T-shirt: ciemnoszary (biały nadruk i paski muszą się odcinać), spodnie: niebieski jeans.
SHIRT = (ok(.17, .008, 260), ok(.22, .008, 260), ok(.28, .008, 260), ok(.36, .008, 260), ok(.45, .008, 260))
PANTS = (ok(.34, .080, 255), ok(.42, .090, 255), ok(.50, .100, 255), ok(.58, .100, 252), ok(.66, .090, 250))
PRINT = ok(.96, .004, 90)  # biały nadruk i paski (nie czysta biel)
WOOD = (ok(.28, .050, 55), ok(.36, .065, 55), ok(.45, .075, 55), ok(.54, .075, 58))
# Dym: ciepła, jasna szarość (jaśniejsza od podłogi, ciemniejsza od kości).
SMOKE = (ok(.62, .008, 90), ok(.72, .008, 90), ok(.81, .008, 90), ok(.89, .008, 90))
EMBER = trt.PALETTES['pieklo_bazalt'].ember
HAIR = (ok(.22, .020, 60), ok(.30, .025, 60))
# Puszka: neonowa zieleń napoju energetycznego (akcent 1) i srebrna pokrywa.
CAN = (ok(.52, .190, 140), ok(.72, .230, 140), ok(.86, .210, 135))
LID = (ok(.60, .008, 250), ok(.80, .008, 250))
# Pies: czarna sierść z chłodnym odblaskiem; ciało ciemniejsze od podłogi (kontrast ≥ 1,5), odblaski odcinają sylwetkę od obrysu.
FUR = (ok(.19, .010, 265), ok(.23, .012, 265), ok(.28, .014, 265), ok(.37, .016, 262), ok(.52, .020, 258))
LEATHER = (ok(.30, .080, 30), ok(.40, .100, 32))
STUD = ok(.80, .010, 250)
FANG = ok(.90, .020, 95)
TONGUE = (ok(.50, .130, 15), ok(.60, .140, 15))


def rect(img, x0, y0, x1, y1, color):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            img.put(x, y, color)


def puff(img, cx, cy, r, ramp=SMOKE):
    """Kłąb dymu: dysk z jasnym brzegiem po stronie światła (pasma, bez gradientu)."""
    ellipse(img, cx, cy, r, r, lambda nx, ny: ramp[3] if nx + ny < -.9 else (ramp[2] if nx + ny < -.2 else (ramp[1] if nx + ny < .5 else ramp[0])))


def can_sprite(img, x, y, tilt=0):
    """Puszka z góry: zielony walec ze srebrną pokrywą, jaśniejszy pasek światła."""
    rect(img, x - 2, y - 4, x + 2, y + 4, CAN[0])
    rect(img, x - 2, y - 4, x - 1, y + 4, CAN[1])
    img.put(int(x - 2), int(y - 2 + tilt), CAN[2])
    rect(img, x - 2, y - 5, x + 2, y - 4, LID[1])
    img.put(int(x), int(y), CAN[2])  # błyskawica z logo


GLYPHS = {
    'G': ('.##', '#..', '#.#', '#.#', '.##'),
    '2': ('##.', '..#', '.#.', '#..', '###'),
    'B': ('##.', '#.#', '##.', '#.#', '##.'),
    'A': ('.#.', '#.#', '###', '#.#', '#.#'),
    'X': ('#.#', '#.#', '.#.', '#.#', '#.#'),
    '4': ('#.#', '#.#', '###', '..#', '..#'),
}


def print_text(img, text, cx, top):
    """Nadruk na koszulce: czcionka 3x5, litery co 4 px, wyśrodkowane na cx; tylko na istniejących pikselach."""
    x0 = int(cx - (len(text) * 4 - 1) / 2)
    for i, ch in enumerate(text):
        for dy, row in enumerate(GLYPHS[ch]):
            for dx, v in enumerate(row):
                if v == '#' and img.get(x0 + i * 4 + dx, top + dy) and img.get(x0 + i * 4 + dx, top + dy)[3]:
                    img.put(x0 + i * 4 + dx, top + dy, PRINT)


def baron_frame(f):
    """Baron na N. f 0–3 chód; 4–7 smuga dymu; 8–11 uderzenie brzuchem; 12–15 rzut puszką; 16–19 łyk."""
    img = Img(CELL, CELL)
    walk = f < 4
    puff_atk = 4 <= f < 8
    slam = 8 <= f < 12
    throw = 12 <= f < 16
    drink = f >= 16
    step = (0, 2, 0, -2)[f] if walk else 0
    cy = C + 6
    lunge = (3, -2, -8, 0)[f - 8] if slam else 0  # brzuch w przód
    belly_r = (0, 0, 2, 0)[f - 8] if slam else 0

    # stopy (wielkie buty pod brzuchem), naprzemiennie
    for side, dy in ((-1, step), (1, -step)):
        ellipse(img, C + side * 11, cy + 22 + dy, 7, 6.5, band_shade(PANTS))
        img.put(int(C + side * 11), int(cy + 27 + dy), PANTS[0])
    # tułów: szerokie barki i plecy w koszulce
    ellipse(img, C, cy, 26, 21, band_shade(SHIRT))
    # BRZUCH: ogromny, wypychany do przodu (N); pod koszulką pasy napięcia, na dole kawałek skóry
    bx, by = C, cy - 8 + lunge
    ellipse(img, bx, by, 21 + belly_r, 17 + belly_r, band_shade(SHIRT, light=(-.5, -.65)))
    for i, dx in enumerate((-10, -4, 3, 9)):  # zagniecenia koszulki na brzuchu (najciemniejszy ton)
        for dy in range(-2, 3):
            img.put(int(bx + dx + (1 if dy > 0 else 0)), int(by + 4 + dy + abs(i - 1)), SHIRT[0])
    ellipse(img, bx, by - 13 - belly_r, 7, 3.2, lambda nx, ny: SKIN[2] if ny < .2 else SKIN[1])  # odsłonięty pępek
    img.put(int(bx), int(by - 13 - belly_r), SKIN[0])
    # paski na ramionach (białe, po dwa) i nadruk: „G2” na brzuchu, na plecach „BAX” nad numerem „4”
    for side in (-1, 1):
        for off in (21, 24):
            for dy in range(-9, 4):
                px = int(C + side * off - (1 if side < 0 else 0))
                if img.get(px, int(cy + dy)) and img.get(px, int(cy + dy))[3]:
                    img.put(px, int(cy + dy), PRINT)
    print_text(img, 'G2', bx, int(by - 4))
    print_text(img, 'BAX', C, int(cy + 10 + max(0, belly_r)))
    print_text(img, '4', C, int(cy + 16 + max(0, belly_r)))
    # lewe ramię (obraz: lewa strona) z puszką; prawe z fajką
    lhand = (C - 25, cy - 20)
    rhand = (C + 25, cy - 20)
    if puff_atk:  # prawa ręka unosi fajkę przed twarz, potem opuszcza po wydmuchu
        rhand = ((C + 24, cy - 22), (C + 14, cy - 34), (C + 8, cy - 38), (C + 10, cy - 36))[f - 4]
    if throw:  # zamach puszki za siebie (w tył), wyrzut przed siebie
        lhand = ((C - 32, cy - 6), (C - 34, cy + 4), (C - 22, cy - 34), (C - 24, cy - 26))[f - 12]
    if drink:  # puszka pod usta
        lhand = ((C - 14, cy - 28), (C - 8, cy - 40), (C - 6, cy - 44), (C - 12, cy - 38))[f - 16]
    if slam:
        lhand, rhand = (C - 28 + lunge // 2, cy - 12 + lunge), (C + 28 - lunge // 2, cy - 12 + lunge)
    stroke(img, [(C - 21, cy - 6), (lhand[0] + 2, lhand[1] + 5)], 7, SKIN[1], edge=SKIN[2])
    stroke(img, [(C + 21, cy - 6), (rhand[0] - 2, rhand[1] + 5)], 7, SKIN[1], edge=SKIN[2])
    # głowa: duża kopuła, pod nią kark; im bliżej N, tym twarz
    hy = cy - 27 + lunge // 2
    if drink:
        hy -= 2
    ellipse(img, C, hy + 2, 12, 9, band_shade(SKIN))  # kark/policzki
    ellipse(img, C, hy, 10, 10.5, band_shade(SKIN, light=(-.35, -.75)))  # wysokie czoło: jasna łysa kopuła
    for dx in range(-5, 3):  # połysk na czole (najjaśniejszy ton)
        img.put(int(C + dx), int(hy + 4), SKIN[4])
    for dx in range(-3, 2):
        img.put(int(C + dx), int(hy + 3), SKIN[4])
    # włosy tylko po bokach i z tyłu (czoło wolne)
    for side in (-1, 1):
        for dy in range(3, 8):
            img.put(int(C + side * 9), int(hy + dy), HAIR[0])
            img.put(int(C + side * 8), int(hy + dy + 1), HAIR[1])
    for dx in range(-6, 7):
        img.put(int(C + dx), int(hy + 9), HAIR[0])
    # uszy
    for side in (-1, 1):
        ellipse(img, C + side * 11, hy + 3, 2.2, 3, lambda nx, ny: SKIN[1])
    # twarz u przedniej krawędzi: brwi, oczy, nos
    for side in (-1, 1):
        rect(img, C + side * 4 - (1 if side < 0 else 0), hy - 3, C + side * 4 + (1 if side > 0 else 0), hy - 3, HAIR[0])
        img.put(int(C + side * 4), int(hy - 1), SKIN[0])  # oko
    img.put(int(C), int(hy - 1), SKIN[1])
    # FAJKA W USTACH: krótki cybuch z żarem
    mouth_y = hy - 7
    img.put(int(C - 1), int(mouth_y), SKIN[0])
    img.put(int(C), int(mouth_y), SKIN[0])
    img.put(int(C + 1), int(mouth_y), SKIN[0])
    stroke(img, [(C + 2, mouth_y), (C + 7, mouth_y - 3)], 2.2, WOOD[1], edge=WOOD[3])
    ellipse(img, C + 8, mouth_y - 4, 3.2, 3, lambda nx, ny: WOOD[0] if nx + ny > .2 else WOOD[2])
    img.put(int(C + 8), int(mouth_y - 5), EMBER[2] if f % 2 else EMBER[1])
    # puszka w lewej ręce (akcent: neon)
    can_sprite(img, lhand[0], lhand[1], tilt=1 if throw else 0)
    if throw and f >= 14:  # puszka właśnie wyleciała: ręka pusta
        rect(img, lhand[0] - 3, lhand[1] - 6, lhand[0] + 3, lhand[1] + 5, trt.CLR)
        ellipse(img, lhand[0], lhand[1], 3.2, 3.2, lambda nx, ny: SKIN[2])
    # fajka w prawej ręce: długi cybuch z kopciem
    pipe_dir = (-0.5, -1) if puff_atk else (0.25, -1)
    pend = (rhand[0] + pipe_dir[0] * 9, rhand[1] + pipe_dir[1] * 9)
    stroke(img, [(rhand[0], rhand[1]), pend], 2.4, WOOD[1], edge=WOOD[3])
    ellipse(img, pend[0], pend[1] - 1, 3.4, 3.4, lambda nx, ny: WOOD[0] if nx + ny > .1 else WOOD[2])
    img.put(int(pend[0]), int(pend[1] - 1), EMBER[2] if f % 2 == 0 else EMBER[1])
    ellipse(img, rhand[0], rhand[1], 3.8, 3.8, lambda nx, ny: SKIN[2])  # dłoń
    ellipse(img, lhand[0], lhand[1] + 5, 3.8, 3.2, lambda nx, ny: SKIN[2])
    # DYM przy twarzy — cały czas, dryfuje do góry (klatki przesuwają kłęby)
    k = f % 4
    for side, base in ((-1, 0), (1, 2)):
        for i in range(3):
            t = (k + base + i * 1.3) % 4
            px = C + side * (13 + 3 * math.sin(t * 1.6 + i)) + (6 if side > 0 else -2)
            py = hy - 10 - t * 3.2
            puff(img, px, py, 2.2 + 0.6 * i + t * 0.25, SMOKE)
    if puff_atk and f >= 6:  # wydmuch: gęsty słup dymu przed twarzą (N)
        spread = (0, 0, 3, 5)[f - 4]
        for i in range(5):
            puff(img, C + 6 + (i - 2) * (2 + spread / 2), hy - 13 - i * 3, 2.6 + i * 0.6 + spread * 0.15, SMOKE)
    if slam and f == 10:  # uderzenie: iskry kurzu po bokach
        for dx in (-30, -22, 22, 30):
            img.put(int(C + dx), int(cy - 4), SMOKE[3])
            img.put(int(C + dx), int(cy - 5), SMOKE[2])
    return img


def dog_frame(f):
    """Dog na N (cel 64x64): f 0–3 bieg, 4–7 skok z kłapnięciem (4 przysiad, 5 wybicie, 6 kłapnięcie, 7 lądowanie)."""
    img = Img(DOG, DOG)
    c = DOG / 2
    run = f < 4
    step = (0, 2, 0, -2)[f] if run else 0
    stretch = 0 if run else (-3, 3, 4, 0)[f - 4]
    body_ry = 13 + stretch
    cy = c + 4
    # łapy: długie, 4 pary naprzemiennie (w skoku wyciągnięte)
    if run:
        legs = [((-5, -7), (-10, -11 + step)), ((5, -7), (10, -11 - step)), ((-5, 6), (-10, 11 - step)), ((5, 6), (10, 11 + step))]
    else:
        legs = {
            4: [((-5, -6), (-9, -8)), ((5, -6), (9, -8)), ((-5, 6), (-9, 10)), ((5, 6), (9, 10))],
            5: [((-4, -8), (-5, -17)), ((4, -8), (5, -17)), ((-4, 7), (-5, 16)), ((4, 7), (5, 16))],
            6: [((-4, -8), (-6, -16)), ((4, -8), (6, -16)), ((-4, 7), (-4, 16)), ((4, 7), (4, 16))],
            7: [((-5, -7), (-7, -11)), ((5, -7), (7, -11)), ((-5, 6), (-6, 11)), ((5, 6), (6, 11))],
        }[f]
    for (ax, ay), (fx, fy) in legs:
        stroke(img, [(c + ax, cy + ay), (c + fx, cy + fy)], 3.4, FUR[2], edge=FUR[4])
        img.put(int(c + fx), int(cy + fy), FUR[0])
    # ogon: gruby, opada
    tail = (c + (step * .8 if run else 0), cy + body_ry + 5)
    stroke(img, [(c, cy + body_ry - 2), tail], 2.6, FUR[1], edge=FUR[3])
    # tułów: wąska talia, szeroka pierś (dog)
    ellipse(img, c, cy + 2, 6.0, body_ry, band_shade(FUR))
    ellipse(img, c, cy - body_ry + 5, 7.6, 7, band_shade(FUR))  # pierś
    for dy in (-5, 0, 5):  # żebra
        img.put(int(c - 4), int(cy + dy), FUR[0])
        img.put(int(c + 4), int(cy + dy), FUR[0])
    # obroża z ćwiekami (czerwono-brązowa — akcent)
    ny = cy - body_ry - 1
    for dx in range(-5, 6):
        img.put(int(c + dx), int(ny), LEATHER[0] if dx % 3 else STUD)
        img.put(int(c + dx), int(ny + 1), LEATHER[1])
    # głowa: czaszka, długi pysk, obwisłe uszy
    hy = ny - 6
    ellipse(img, c, hy, 6.2, 5.6, band_shade(FUR, light=(-.4, -.6)))
    open_jaw = (not run) and f == 6
    ellipse(img, c, hy - 5.5, 3.6, 4.6, lambda nx, ny_: FUR[2] if ny_ < 0 else FUR[1])  # pysk
    img.put(int(c - 1), int(hy - 10), FUR[0])
    img.put(int(c), int(hy - 10), FUR[0])  # nos
    for s in (-1, 1):  # uszy
        ellipse(img, c + s * 6.5, hy + 1.5, 2.6, 4.2, lambda nx, ny_: FUR[0] if ny_ > 0 else FUR[1])
    # oczy: bursztyn (jedyny jasny punkt w głowie)
    for s in (-1, 1):
        img.put(int(c + s * 2.4 - (1 if s < 0 else 0)), int(hy - 2), ok(.75, .14, 75))
    if open_jaw:  # kłapnięcie: dolna szczęka w dół, kły, język
        rect(img, c - 3, hy - 9, c + 2, hy - 7, TONGUE[0])
        rect(img, c - 2, hy - 8, c + 1, hy - 7, TONGUE[1])
        for dx in (-3, 2):
            img.put(int(c + dx), int(hy - 10), FANG)
            img.put(int(c + dx), int(hy - 9), FANG)
        img.put(int(c - 3), int(hy - 7), FANG)
        img.put(int(c + 2), int(hy - 7), FANG)
    return img


def smoke_frame(k):
    """Obłok smugi: 4 klatki rosnącego kłębu (k = 0 mały i gęsty … 3 duży i rozwiany)."""
    img = Img(32, 32)
    r = (5, 8, 11, 13)[k]
    puffs = [(16, 16, r), (16 - r * .55, 16 + r * .2, r * .62), (16 + r * .5, 16 - r * .25, r * .66), (16 - r * .1, 16 - r * .55, r * .55)]
    for x, y, rr in puffs:
        puff(img, x, y, max(2.0, rr))
    return img


def can_frame(k):
    """Puszka w locie: obraca się co 45°."""
    img = Img(16, 16)
    a = math.radians(45 * k)
    dx, dy = math.cos(a), math.sin(a)
    stroke(img, [(8 - dx * 3.5, 8 - dy * 3.5), (8 + dx * 3.5, 8 + dy * 3.5)], 5.0, CAN[0])
    stroke(img, [(8 - dx * 3.5 - dy * 1.6, 8 - dy * 3.5 + dx * 1.6), (8 + dx * 3.5 - dy * 1.6, 8 + dy * 3.5 + dx * 1.6)], 1.4, CAN[1])
    img.put(int(8 + dx * 4.5), int(8 + dy * 4.5), LID[1])
    img.put(int(8 - dx * 4.5), int(8 - dy * 4.5), LID[0])
    img.put(8, 8, CAN[2])
    return img


def build():
    boss, bf = directional_sheet(CELL, baron_frame, 20)
    dog, df = directional_sheet(DOG, dog_frame, 8)
    smoke, sf = strip_sheet(32, smoke_frame, 4)
    can, cf = strip_sheet(16, can_frame, 4)
    return {
        'smoke-baron_walk-puff-slam-throw-drink.png': (boss, bf, CELL, 8),
        'black-dog_run-lunge.png': (dog, df, DOG, 4),
        'smoke-puff.png': (smoke, sf, 32, 1),
        'energy-can.png': (can, cf, 16, 1),
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Barona Dymu i jego psa')
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

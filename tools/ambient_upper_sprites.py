"""
Generator żywego otoczenia Piekła (piętro 4) i mieszkania gracza (piętro 5) — krok 157, `#zywe-otoczenie`.
Ten sam poziom detalu i te same zasady co `tools/ambient_sprites.py` (krok 156): pasmowe cieniowanie ze światłem
z lewej-góry, świecące elementy bez ciemnego obrysu (STYLEGUIDE §6b), barwy z palet arkuszy kafli biomów.

Lore (decyzja właściciela): po apokalipsie wieża jest ostatnim miejscem z resztkami cywilizacji — im wyżej, tym ich
więcej. W Piekle żyje tylko żar: szczeliny z lawą oddychają, gdy ktoś przechodzi, a po posadzce biegają żużlowe
chrząszcze. W mieszkaniu gracza (piętro 5) jest jeszcze prąd: stare telewizory, monitory i laptopy migoczą — leci na
nich gra albo komunikat ratunkowy z wieżą i strzałką w górę (ten sam znak „do wieży”, co kreski na murach parteru,
krok 155). Karaluchy pierzchają spod nóg, puszki turlają się po kopnięciu.

Użycie (z katalogu głównego repozytorium):
  python tools/ambient_upper_sprites.py                       # arkusze do public/assets/sprites/
  python tools/ambient_upper_sprites.py --preview tools/out   # dodatkowo podgląd 4x na posadzce biomu

hell-vent.png (320x96, komórka 32, 3 wiersze = kształty szczeliny): 0–5 puls — żar wędruje wzdłuż szczeliny;
  6–7 wydech (szczelina się rozwiera, tryskają iskry); 8–9 przygaszona skorupa tli się w pętli.
hell-beetle.png (72x12, komórka 12): żużlowy chrząszcz z góry, głową w prawo (gra obraca): 0–1 spoczynek (żar na
  pancerzu pulsuje), 2–5 bieg (nóżki).
den-screen.png (320x96, komórka 32, 3 wiersze = telewizor CRT, monitor z klawiaturą, laptop): 0–2 gra na ekranie,
  3–5 komunikat ratunkowy (wieża i mrugająca strzałka w górę); 6–7 zakłócenia (śnieg); 8–9 czuwanie (ciemny ekran,
  mrugająca dioda).
den-roach.png (32x8, komórka 8): karaluch z góry, głową w prawo: 0–1 czułki, 2–3 bieg.
den-can.png (32x8, komórka 8): puszka na boku, 4 klatki toczenia (etykieta obiega puszkę).
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, hx, outline
from ambient_sprites import CLR, OUTLINE, hash01, outline_except, sheet

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')

# Piekło: paleta „krwawy bazalt” (pieklo_bazalt) — skorupa w tonach muru, żar = rampa `ember` + jasny rdzeń `flame`.
CRUST = tuple(hx(h) for h in ('#0e0505', '#211111', '#3d2727', '#4f3635'))
LAVA = tuple(hx(h) for h in ('#6a1210', '#9e231e', '#d95f19', '#f5ae4b', '#f7dba1'))
SHELL = tuple(hx(h) for h in ('#130505', '#2a1414', '#46282a', '#644b49'))

# Mieszkanie gracza: plastik i drewno z palety `mieszkanie_gracza` (junk), ekran w zimnym błękicie (jedyne zimne
# światło na ciepłym, nikotynowym piętrze — od razu widać, że to prąd, a nie ogień).
BEIGE = tuple(hx(h) for h in ('#4f4a40', '#726e65', '#8d897f', '#aaa596'))
BLACK = tuple(hx(h) for h in ('#101115', '#222429', '#404249', '#5d6068'))
SCREEN = tuple(hx(h) for h in ('#0f1a22', '#1b3a4a', '#2f6f8a', '#5fb4cf', '#b4ecf6', '#eafcff'))
GAME = tuple(hx(h) for h in ('#4f9a52', '#a8e07a', '#e8c25a', '#d9533e'))
LED = (hx('#5e1a1f'), hx('#e0483a'))
ROACH = tuple(hx(h) for h in ('#1e120b', '#3b2214', '#5e381f', '#8a5630', '#b07a46'))
CAN = tuple(hx(h) for h in ('#4f5257', '#7c8086', '#aaaeb3', '#d8dbde'))
LABEL = tuple(hx(h) for h in ('#5e1a1f', '#93302c', '#c4524a'))

HELL_FLOOR = hx('#634e4c')
DEN_FLOOR = hx('#5a4f41')

PULSE = 6


# ---------------- Piekło: szczelina z żarem ----------------

def crack_paths(seed):
    """Szczelina: główna krzywa przez komórkę i 1–2 odnogi (listy pikseli z szerokością 0/1)."""
    rnd = lambda *a: hash01(seed, *a)
    paths = []
    a = rnd(1) * math.pi
    x, y = 16 - math.cos(a) * 11, 16 - math.sin(a) * 7
    pts = []
    for step in range(60):
        a += (rnd(2, step) - .5) * .55
        x += math.cos(a) * .8
        y += math.sin(a) * .55
        p = (int(round(x)), int(round(y)))
        if not (3 <= p[0] < 29 and 4 <= p[1] < 29):
            break
        if not pts or pts[-1] != p:
            pts.append(p)
    paths.append(pts)
    for b in range(1 + int(rnd(9) * 2)):
        if len(pts) < 8:
            break
        start = pts[int(len(pts) * (.3 + .4 * rnd(3, b)))]
        a2 = a + (1.4 if b % 2 else -1.4) + (rnd(4, b) - .5)
        bx, by = float(start[0]), float(start[1])
        branch = []
        for step in range(10):
            a2 += (rnd(5, b, step) - .5) * .7
            bx += math.cos(a2) * .8
            by += math.sin(a2) * .55
            p = (int(round(bx)), int(round(by)))
            if not (2 <= p[0] < 30 and 3 <= p[1] < 30):
                break
            if not branch or branch[-1] != p:
                branch.append(p)
        paths.append(branch)
    return paths


VENT_SEEDS = (11, 23, 37)


def vent_frame(variant, f):
    """
    Komórka 32×32: szczelina w bazalcie. Rdzeń szczeliny niesie żar, brzegi to ciemna skorupa (bez obrysu postaci —
    to część posadzki). Puls: jasna fala biegnie wzdłuż szczeliny. Wydech: szczelina szersza, białożółty rdzeń
    i iskry nad nią. Przygaszenie: skorupa się zamyka, tli się tylko ciemna czerwień.
    """
    img = Img(32, 32)
    paths = crack_paths(VENT_SEEDS[variant])
    belch = f in (6, 7)
    dim = f >= 8
    heat = {}
    for k, pts in enumerate(paths):
        n = max(1, len(pts))
        main = k == 0
        for i, (x, y) in enumerate(pts):
            along = i / n
            # Szczelina najszersza w środku głównej krzywej, odnogi cienkie.
            wide = main and .18 < along < .82 and (belch or hash01(variant, i) > .2)
            if f < PULSE:
                # Fala żaru biegnie od środka szczeliny ku końcom (jak oddech).
                wave = math.cos((abs(along - .5) * 2.4 - f / PULSE) * 2 * math.pi)
                h = .38 + .48 * wave + (.12 if main else -.12)
            elif belch:
                h = 1.05 - abs(along - .5) * .6 + (.1 if f == 7 else 0)
            else:
                h = .12 + (.12 if (i + f) % 5 == 0 else 0) - (0 if main else .1)
            cells = [(x, y)] + ([(x, y + 1)] if wide else []) + ([(x + 1, y)] if main and .3 < along < .7 else [])
            for c in cells:
                heat[c] = max(heat.get(c, -1), h)
    # Jeziorko żaru w najszerszym miejscu szczeliny: owal 5×3, gorętszy w środku (oddycha razem z falą).
    if paths[0]:
        px, py = paths[0][len(paths[0]) // 2]
        core = .9 if f < PULSE and f in (2, 3, 4) else 1.1 if belch else .55 if f < PULSE else .2
        for dy in (-1, 0, 1):
            for dx in range(-2, 3):
                if abs(dx) == 2 and dy != 0:
                    continue
                c = (px + dx, py + dy)
                heat[c] = max(heat.get(c, -1), core - .25 * abs(dx) - .2 * abs(dy))
    # Osmalona posadzka: rzadkie ciemne plamy sadzy w pasie 2–3 px od szczeliny.
    for (x, y) in list(heat):
        for dx in range(-3, 4):
            for dy in range(-2, 3):
                c = (x + dx, y + dy)
                if c in heat or img.get(*c) is None or img.get(*c) != CLR:
                    continue
                if hash01(c[0], c[1], variant) > .9:
                    img.put(c[0], c[1], CRUST[2])
    # Skorupa: ciemne brzegi wokół szczeliny (8-sąsiedztwo), z jaśniejszym, odłupanym kamieniem od góry-lewej.
    for (x, y) in list(heat):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                c = (x + dx, y + dy)
                if c in heat or img.get(*c) is None:
                    continue
                img.put(c[0], c[1], CRUST[3] if (dy < 0 and dx <= 0 and hash01(*c) > .55) else CRUST[1])
    for (x, y), h in heat.items():
        if dim:
            c = LAVA[1] if h > .2 else LAVA[0] if h > .05 else CRUST[0]
        elif h > .95:
            c = LAVA[4]
        elif h > .72:
            c = LAVA[3]
        elif h > .45:
            c = LAVA[2]
        elif h > .2:
            c = LAVA[1]
        else:
            c = LAVA[0]
        img.put(x, y, c)
    # Odprysk żaru na posadzce przy szczelinie (pojedyncze piksele w ciepłym tonie) — tylko gdy szczelina żyje.
    if not dim:
        for (x, y), h in heat.items():
            if h > .6 and hash01(x, y, 3) > .82:
                img.put(x + (1 if hash01(x, y) > .5 else -1), y - 2, CRUST[3])
    # Iskry wydechu: tryskają z gorącego środka i lecą w górę, gasnąc.
    if belch:
        hot = sorted(heat.items(), key=lambda kv: -kv[1])[:6]
        t = f - 6
        for k, ((x, y), _) in enumerate(hot):
            for s in range(2):
                sy = y - 3 - t * 4 - s * 3 - int(hash01(k, s) * 3)
                sx = x + int((hash01(k, s, 1) - .5) * (4 + t * 4))
                if 0 <= sy:
                    img.put(sx, sy, LAVA[4] if s == 0 and t == 0 else LAVA[3] if s == 0 else LAVA[2])
    return img


# ---------------- Piekło: żużlowy chrząszcz ----------------

def beetle_frame(f):
    """12×12, głową w prawo: owalny pancerz z bazaltu, przez pęknięcia świeci żar; 6 nóżek."""
    img = Img(12, 12)
    cx, cy = 5.5, 5.5
    glow = LAVA[3] if f in (1,) else LAVA[2]
    # Nóżki: 3 pary, w biegu na przemian wysunięte.
    run = f >= 2
    phase = (f - 2) % 2 if run else 0
    for i, lx in enumerate((3, 5, 7)):
        off = (1 if (i + phase) % 2 else -1) if run else 0
        img.put(lx + off, 2, SHELL[0])
        img.put(lx - off, 9, SHELL[0])
    for y in range(12):
        for x in range(12):
            nx, ny = (x + .5 - cx) / 4.2, (y + .5 - cy) / 3.0
            d = nx * nx + ny * ny
            if d > 1:
                continue
            shade = 3 if (nx < -.1 and ny < -.2) else 2 if ny < .3 else 1
            img.put(x, y, SHELL[shade])
    # Głowa i czułki.
    img.put(10, 5, SHELL[1])
    img.put(10, 6, SHELL[1])
    img.put(11, 4 if f % 2 else 3, SHELL[0])
    img.put(11, 7 if f % 2 else 8, SHELL[0])
    # Szew pancerza i pęknięcia z żarem.
    for x in range(2, 9):
        img.put(x, 5 if x % 3 else 6, glow if x in (3, 4, 6, 7) else SHELL[0])
    img.put(4, 3, glow)
    img.put(6, 8, glow)
    img.put(3, 4, LAVA[1])
    outline_except(img, set(LAVA))
    return img


# ---------------- mieszkanie: ekrany ----------------

def screen_content(img, x0, y0, w, h, f, variant):
    """Zawartość ekranu: gra (0–2), komunikat z wieżą (3–5), śnieg (6–7), czuwanie (8–9). Linie skanowania."""
    for y in range(h):
        for x in range(w):
            scan = y % 2 == 1
            if f < 3:  # gra: ciemna plansza z kropkami bohatera, wroga i monety
                c = SCREEN[1] if scan else SCREEN[2]
            elif f < 6:  # komunikat: jasny błękit, wieża na środku
                c = SCREEN[3] if not scan else SCREEN[2]
            elif f < 8:  # śnieg
                v = hash01(x, y, f, variant)
                c = SCREEN[5] if v > .7 else SCREEN[3] if v > .45 else SCREEN[1] if v > .2 else SCREEN[0]
            else:
                c = SCREEN[0]
            img.put(x0 + x, y0 + y, c)
    cx = x0 + w // 2
    if f < 3:
        # Mała gra z góry: zielony bohater goni złotą monetę, czerwony wróg za nim (krok po kroku).
        hx_, hy = x0 + 2 + f, y0 + h // 2
        img.put(hx_, hy, GAME[1])
        img.put(hx_, hy - 1, GAME[0])
        img.put(x0 + w - 3, y0 + 2 + (f % 2), GAME[2])
        img.put(x0 + 1 + (f + 2) % 3, y0 + h - 2, GAME[3])
    elif f < 6:
        # Wieża (sylwetka) i strzałka w górę obok — mruga w rytmie komunikatu.
        top = y0 + 1
        for y in range(top + 1, y0 + h - 1):
            img.put(cx, y, SCREEN[0])
            if y > top + 2:
                img.put(cx - 1, y, SCREEN[0])
        img.put(cx, top, SCREEN[1])
        if f != 4:
            # Strzałka w górę: grot (szpic, trzy piksele, dwa skrzydła) i trzon.
            ax = cx + 4
            img.put(ax, top, SCREEN[5])
            for dx in (-1, 0, 1):
                img.put(ax + dx, top + 1, SCREEN[5])
            img.put(ax - 2, top + 2, SCREEN[5])
            img.put(ax + 2, top + 2, SCREEN[5])
            for y in range(top + 2, y0 + h - 1):
                img.put(ax, y, SCREEN[5])
    elif f >= 8:
        # Czuwanie: na ciemnym szkle tylko odblask w rogu.
        img.put(x0 + 1, y0 + 1, SCREEN[1])
        img.put(x0 + 2, y0 + 1, SCREEN[1])


def floor_glow(img, x0, x1, y, f, strength):
    """Poświata ekranu na wykładzinie (pełne piksele w zimnym tonie, rzadziej przy śniegu)."""
    if f >= 8:
        return
    for row in range(strength):
        for x in range(x0 - row, x1 + row):
            if img.get(x, y + row) == CLR and hash01(x, y + row, f // 3) > .25 + row * .25:
                img.put(x, y + row, SCREEN[1] if row else SCREEN[2])


def screen_frame(variant, f):
    img = Img(32, 32)
    if variant == 0:  # telewizor CRT: gruba, beżowa skrzynia, wypukły ekran
        for y in range(9, 26):
            for x in range(6, 26):
                c = BEIGE[1]
                if y < 11 or x < 8:
                    c = BEIGE[3] if y < 11 else BEIGE[2]
                if y >= 23 or x >= 24:
                    c = BEIGE[0]
                img.put(x, y, c)
        screen_content(img, 8, 11, 13, 10, f, variant)
        # Pokrętła i dioda.
        img.put(22, 13, BLACK[1])
        img.put(22, 16, BLACK[1])
        img.put(22, 20, LED[1] if f >= 8 and f == 8 else LED[0])
        # Antena „królicze uszy”.
        for i in range(5):
            img.put(13 - i, 8 - i, BLACK[2])
            img.put(18 + i, 8 - i, BLACK[2])
        outline_except(img, set(SCREEN))
        floor_glow(img, 9, 21, 27, f, 2)
    elif variant == 1:  # monitor na podstawce i klawiatura
        for y in range(6, 20):
            for x in range(7, 25):
                img.put(x, y, BLACK[2] if y == 6 or x == 7 else BLACK[1])
        screen_content(img, 9, 8, 14, 10, f, variant)
        img.put(23, 18, LED[1] if f == 8 else LED[0] if f >= 8 else hx('#4f9a52'))
        for y in range(20, 23):
            img.put(15, y, BLACK[1])
            img.put(16, y, BLACK[2])
        for x in range(12, 20):
            img.put(x, 23, BLACK[1])
        # Klawiatura z kilkoma brakującymi klawiszami.
        for y in range(25, 29):
            for x in range(6, 26):
                key = (x + y) % 2 == 0 and y in (26, 27) and 7 < x < 25 and hash01(x, y) > .12
                img.put(x, y, BLACK[3] if key else BLACK[1])
        outline_except(img, set(SCREEN) | {hx('#4f9a52')})
        floor_glow(img, 10, 22, 30, f, 1)
    else:  # laptop: uchylona klapa, ekran pod kątem, pod spodem kabel
        for y in range(8, 18):
            for x in range(8, 24):
                img.put(x, y, BLACK[2] if y == 8 else BLACK[1])
        screen_content(img, 9, 9, 14, 8, f, variant)
        for y in range(18, 25):
            inset = (y - 18) // 3
            for x in range(7 - inset, 25 + inset):
                img.put(x, y, BLACK[2] if y == 18 else BLACK[3] if (x + y) % 3 == 0 and 19 < y < 23 else BLACK[1])
        img.put(23, 23, LED[1] if f == 8 else LED[0])
        # Kabel zasilacza wije się po wykładzinie.
        for i in range(10):
            x, y = 25 + i // 2, 22 + round(math.sin(i * .8) * 1.5) + i // 3
            img.put(x, y, BLACK[0])
        outline_except(img, set(SCREEN))
        floor_glow(img, 9, 23, 26, f, 1)
    return img


# ---------------- mieszkanie: karaluch, puszka ----------------

def roach_frame(f):
    """8×8, głową w prawo: lśniący, brązowy odwłok, czułki; w biegu nóżki na przemian."""
    img = Img(8, 8)
    run = f >= 2
    phase = f % 2
    for i, lx in enumerate((2, 4, 5)):
        off = (1 if (i + phase) % 2 else 0) if run else 0
        img.put(lx - off, 1, ROACH[0])
        img.put(lx + off - 1, 6, ROACH[0])
    for y in range(2, 6):
        for x in range(1, 7):
            if (x, y) in ((1, 2), (1, 5), (6, 2), (6, 5)):
                continue
            img.put(x, y, ROACH[3] if y == 2 else ROACH[2] if y < 5 else ROACH[1])
    img.put(2, 3, ROACH[4])
    img.put(6, 3, ROACH[0])
    img.put(6, 4, ROACH[0])
    img.put(7, 2 if phase else 1, ROACH[1])
    img.put(7, 5 if phase else 6, ROACH[1])
    return img


def can_frame(f):
    """8×8: puszka na boku (oś pozioma), etykieta przesuwa się z każdą klatką — puszka się toczy."""
    img = Img(8, 8)
    for y in range(2, 6):
        for x in range(1, 7):
            band = (x + f) % 4
            c = LABEL[2] if band == 0 else LABEL[1] if band in (1, 3) else CAN[2]
            if y == 2:
                c = CAN[3] if band == 2 else LABEL[2]
            if y == 5:
                c = CAN[0] if band == 2 else LABEL[0]
            img.put(x, y, c)
    for y in range(2, 6):  # denka
        img.put(0, y, CAN[1])
        img.put(7, y, CAN[2] if y < 4 else CAN[1])
    outline(img, OUTLINE)
    return img


# ---------------- zapis i podgląd ----------------

SHEETS = {
    'hell-vent.png': lambda: sheet([[vent_frame(v, f) for f in range(10)] for v in range(3)], rows=3),
    'hell-beetle.png': lambda: sheet([beetle_frame(f) for f in range(6)]),
    'den-screen.png': lambda: sheet([[screen_frame(v, f) for f in range(10)] for v in range(3)], rows=3),
    'den-roach.png': lambda: sheet([roach_frame(f) for f in range(4)]),
    'den-can.png': lambda: sheet([can_frame(f) for f in range(4)]),
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
        bg = HELL_FLOOR if name.startswith('hell') else DEN_FLOOR
        canvas.paste(Image.new('RGBA', (width, im.height + pad * 2), bg), (0, y))
        canvas.alpha_composite(im, (pad, y + pad))
        y += im.height + pad * 2
    canvas = canvas.resize((width * 4, height * 4), Image.NEAREST)
    path = os.path.join(out_dir, 'ambient-upper-preview.png')
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

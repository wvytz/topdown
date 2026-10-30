"""
Generator ikonki gry TOP DOWN (krok 135): wariant „Góra i dół” (C2) wybrany przez właściciela.

Wieża z ekranu startowego przed czarnym słońcem, pod spękaną ziemią jej czerwone odbicie w zaświatach
z czerwonym słońcem — wspinaczka w górę, potem zejście w dół. Granicą światów jest ciemny pas gruzu
z żarzącymi się pęknięciami (bez jasnej linii, decyzja właściciela). Paleta z `SPLASH_PALETTE`.

Rysunek to siatka 32x32; PNG powiększamy całkowitą wielokrotnością (najbliższy sąsiad), żeby piksele
zostały ostre. Rozmiar 180 nie jest wielokrotnością 32, więc margines powtarza skrajne piksele rysunku.

Użycie (z katalogu głównego repozytorium):
  python tools/game_icon.py            # public/icons/: favicon.svg, favicon-32.png, apple-touch-icon.png,
                                       # icon-192.png, icon-512.png
"""
import math
import os

from PIL import Image

OUT_DIR = os.path.join('public', 'icons')
N = 32

P = dict(
    void='#07060b', outline='#1b1a22', c0='#0f0e18', c1='#241823', c2='#3c272a', c3='#573e38',
    e0='#a03317', e1='#d36c00', e2='#e7b140', e3='#f1e2a9', y0='#b02a2d', y1='#ed4b40', y2='#f4c7a3',
)
# Zaświaty: pasy coraz czerwieńsze ku dołowi (wiersz startowy, kolor).
UNDERWORLD_BANDS = [(16, '#1a0b10'), (19, '#240c0e'), (22, '#2f0e0d'), (25, '#3a100d'), (28, '#46120e')]
# Kolumny wyszczerbionej wieży: x, wierzch, szerokość (do linii ziemi w wierszu 16).
TOWER_COLUMNS = [(11, 11, 2), (13, 9, 2), (15, 10, 2), (17, 7, 2), (19, 12, 2)]
GROUND = 16


def grid(bg):
    return [[bg for _ in range(N)] for _ in range(N)]


def rect(g, x, y, w, h, c):
    for j in range(max(0, y), min(N, y + h)):
        for i in range(max(0, x), min(N, x + w)):
            g[j][i] = c


def ring(g, cx, cy, r0, r1, c):
    """Pierścień r0 <= odległość środka piksela < r1."""
    for j in range(N):
        for i in range(N):
            if r0 <= math.hypot(i + 0.5 - cx, j + 0.5 - cy) < r1:
                g[j][i] = c


def eclipse(g, cx, cy, r, corona):
    for k, c in enumerate(corona):
        ring(g, cx, cy, r + k, r + k + 1, c)
    ring(g, cx, cy, 0, r, P['void'])


def draw_tower(g):
    """Wieża nad ziemią: jasna lewa połowa, cień po prawej, żar korony na wierzchołkach kolumn."""
    pts = {(i, j) for x, top, w in TOWER_COLUMNS for j in range(top, GROUND) for i in range(x, x + w)}
    mid = (min(i for i, _ in pts) + max(i for i, _ in pts)) / 2
    for i, j in pts:
        if (i, j - 1) not in pts:
            g[j][i] = P['e1']
        elif (i - 1, j) not in pts:
            g[j][i] = P['c3']
        else:
            g[j][i] = P['c2'] if i < mid else P['c1']


def draw_reflection(g):
    """Odbicie w zaświatach: odwrócona wieża w czerwieni, z ubytkami."""
    pts = {(i, j) for x, top, w in TOWER_COLUMNS for j in range(GROUND + 1, 33 - top) for i in range(x, x + w)}
    for i, j in pts:
        if (i, j + 1) not in pts:
            g[j][i] = P['y1']
        else:
            g[j][i] = P['y0'] if i < 16 else '#7a1d1a'
    for x, y in [(13, 23), (18, 21), (14, 20)]:
        g[y][x] = '#2a0d0c'


def draw_ground(g):
    """Granica światów: nierówny pas gruzu z żarzącymi się pęknięciami."""
    rect(g, 0, GROUND, N, 1, P['outline'])
    for x in [0, 1, 5, 6, 7, 23, 24, 28, 29, 30, 31]:
        g[GROUND - 1][x] = P['outline']
    for x in [2, 3, 8, 22, 25, 26]:
        g[GROUND + 1][x] = P['outline']
    for x, y in [(4, 16), (9, 16), (10, 17), (21, 16), (26, 16), (27, 17)]:
        g[y][x] = P['e0']


def build():
    g = grid(P['c0'])
    for y, c in UNDERWORLD_BANDS:
        rect(g, 0, y, N, N - y, c)
    ring(g, 16, 5, 0, 7, '#160f16')  # poświata nieba wokół zaćmienia
    eclipse(g, 16, 5, 3, [P['e3'], P['e2'], P['e1']])
    eclipse(g, 16, 27, 3, [P['y1'], P['y0'], '#5a1410'])
    draw_tower(g)
    draw_reflection(g)
    rect(g, 15, 12, 2, 2, P['e2'])  # ostatnie okno ze światłem
    rect(g, 15, 19, 2, 2, P['y2'])  # i jego odbicie
    draw_ground(g)
    return g


def to_svg(g):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" shape-rendering="crispEdges">',
           '<title>TOP DOWN</title>']
    for j, row in enumerate(g):
        i = 0
        while i < N:
            k = i
            while k < N and row[k] == row[i]:
                k += 1
            out.append(f'<rect x="{i}" y="{j}" width="{k - i}" height="1" fill="{row[i]}"/>')
            i = k
    out.append('</svg>')
    return '\n'.join(out) + '\n'


def hex_rgb(c):
    return tuple(int(c[k:k + 2], 16) for k in (1, 3, 5))


def to_png(g, size):
    """Powiększenie całkowite i wyśrodkowanie; margines powtarza skrajne piksele rysunku (niebo, ziemia, zaświaty)."""
    scale = max(1, size // N)
    off = (size - N * scale) // 2
    cell = lambda v: min(N - 1, max(0, (v - off) // scale))
    rgb = [[hex_rgb(c) for c in row] for row in g]
    img = Image.new('RGB', (size, size))
    img.putdata([rgb[cell(y)][cell(x)] for y in range(size) for x in range(size)])
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    g = build()
    with open(os.path.join(OUT_DIR, 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(to_svg(g))
    for name, size in [('favicon-32.png', 32), ('apple-touch-icon.png', 180),
                       ('icon-192.png', 192), ('icon-512.png', 512)]:
        to_png(g, size).save(os.path.join(OUT_DIR, name), optimize=True)
    print(f'zapisano ikony w {OUT_DIR}')


if __name__ == '__main__':
    main()

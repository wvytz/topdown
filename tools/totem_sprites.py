"""
Totem łucznika (ultimate pod R, krok 98; sprite od kroku U5c zamiast figur z Graphics).

Użycie (z katalogu głównego repozytorium, wymaga Pillow — tools/requirements.txt):
  python tools/totem_sprites.py                       # arkusz do public/assets/sprites/
  python tools/totem_sprites.py --preview tools/out   # dodatkowo podgląd 4x na podłodze palety C

Rzeźbiony słup łowcy widziany jak rekwizyty (z góry-przodu): głowa jastrzębia z jarzącymi się oczami
na szczycie, rozłożone skrzydła z desek, owijki ze skóry, zielona wstęga w barwie łucznika (HERO_HUES 158°)
i wbite strzały z czerwonymi lotkami. Paleta z `archer_sprites.py` + złoto blasku wabika (ULTIMATE_VISUAL).

totem.png (140x36, komórka 20x36, pivot u podstawy: 10,33 — origin 0.5, 33/36):
  klatki 0–2 wyrastanie z ziemi, 3–6 pętla (oczy pulsują, wstęga faluje).
"""
import argparse
import os
import sys

from PIL import Image

import archer_sprites as ar
from tower_ruins_tiles import OUT, Img, hexes, outline

W, H = 20, 36
BASE_Y = 33  # wiersz podstawy (pivot)
EYE_Y = 8  # wiersz oczu — stąd lecą strzały (ULTIMATE_VISUAL.totem.height = BASE_Y - EYE_Y)
GLOW = hexes('#a8701c', '#e0a53a', '#ffe08a', '#fff4cc')  # D, baza, L, H
PALETTE_COLORS = {OUT, *ar.WOOD, *ar.LEATHER, *ar.CLOAK, *ar.FLETCH, *ar.METAL, *GLOW}
OUT_NAME = 'totem.png'


def rect(img, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            img.put(x, y, c)


def pole(img):
    """Słup 8 px: lewa krawędź w świetle, prawa w cieniu, słoje; owijki ze skóry; korzenie u podstawy."""
    for y in range(12, BASE_Y + 1):
        for x in range(6, 14):
            c = ar.WOOD[2] if x == 6 else ar.WOOD[0] if x >= 12 else ar.WOOD[1]
            if x == 9 and y % 5 == 2:
                c = ar.WOOD[0]  # słój
            img.put(x, y, c)
    for band in (19, 26):
        rect(img, 5, band, 14, band + 1, ar.LEATHER[1])
        img.put(5, band, ar.LEATHER[2])
        rect(img, 13, band, 14, band + 1, ar.LEATHER[0])
    # korzenie i kamienie u podstawy
    for x, y, c in ((4, 33, ar.WOOD[1]), (5, 32, ar.WOOD[1]), (15, 33, ar.WOOD[0]), (14, 32, ar.WOOD[0]),
                    (3, 33, ar.WOOD[0]), (16, 33, ar.WOOD[0])):
        img.put(x, y, c)


def wings(img):
    """Skrzydła z desek po bokach, pióra wycięte zębami."""
    for side in (-1, 1):
        for i in range(5):
            x = 10 + side * (4 + i) - (1 if side > 0 else 0)
            top = 13 + (i // 2)
            for y in range(top, 17):
                img.put(x, y, ar.WOOD[2] if side < 0 else ar.WOOD[1])
            if i % 2 == 0:
                img.put(x, 17, ar.WOOD[0])
        img.put(10 + side * 8 - (1 if side > 0 else 0), 17, ar.WOOD[0])


def head(img, glow):
    """Głowa jastrzębia: kopuła, dziób w dół, dwoje oczu w złocie wabika (`glow` 0..3)."""
    for y in range(3, 13):
        for x in range(5, 15):
            dx, dy = (x + .5 - 10) / 5, (y + .5 - 8) / 5
            if dx * dx + dy * dy <= 1:
                img.put(x, y, ar.WOOD[2] if dx < -.3 else ar.WOOD[0] if dx > .45 else ar.WOOD[1])
    for x, y in ((9, 10), (10, 10), (9, 11), (10, 11), (10, 12)):
        img.put(x, y, ar.METAL[0] if y < 12 else ar.WOOD[0])  # dziób okuty
    eye = GLOW[min(3, 1 + glow)]
    ring = GLOW[glow]
    for ex in (7, 12):
        img.put(ex, EYE_Y, eye)
        img.put(ex + (1 if ex < 10 else -1), EYE_Y, ring)
    # pióropusz: dwie wbite strzały z czerwonymi lotkami
    for x0, lean in ((8, -1), (12, 1)):
        for k in range(3):
            img.put(x0 + (lean if k > 1 else 0), 3 - k, ar.WOOD[2])
        img.put(x0 + lean, 1, ar.FLETCH[1])
        img.put(x0 + lean + lean, 1, ar.FLETCH[0])


def ribbon(img, phase):
    """Zielona wstęga z owijki — barwa łucznika; koniec faluje (phase 0..3)."""
    sway = (0, 1, 2, 1)[phase]
    pts = [(14, 20), (15, 21), (16, 22 + (sway > 0)), (16 + (sway > 1), 23 + sway), (17, 24 + sway)]
    for i, (x, y) in enumerate(pts):
        img.put(x, y, ar.CLOAK[3] if i < 2 else ar.CLOAK[2])
        img.put(x, y + 1, ar.CLOAK[1])


def frame(glow, phase):
    img = Img(W, H)
    pole(img)
    wings(img)
    head(img, glow)
    ribbon(img, phase)
    return img


def risen(img, frac):
    """Wyrastanie: widać tylko górne `frac` sylwetki, wsunięte w ziemię u podstawy."""
    out = Img(W, H)
    visible = max(1, int(round((BASE_Y + 1) * frac)))
    shift = BASE_Y + 1 - visible
    for y in range(BASE_Y + 1 - shift):
        for x in range(W):
            c = img.p[y][x]
            if c[3]:
                out.put(x, y + shift, c)
    # grudki ziemi wyrzucone przy wyrastaniu
    for x in (3, 16):
        out.put(x, BASE_Y, ar.LEATHER[0])
    return out


def build():
    loop = [frame(g, p) for g, p in ((0, 0), (1, 1), (2, 2), (1, 3))]
    frames = [risen(loop[0], f) for f in (.3, .6, .85)] + loop
    sheet = Img(W * len(frames), H)
    out = []
    for i, f in enumerate(frames):
        outline(f, OUT)
        sheet.blit(f, i * W, 0)
        out.append((f'f{i}', f))
    return sheet, out


def validate(frames):
    errors = []
    for name, img in frames:
        opaque = [c for row in img.p for c in row if c[3]]
        if not opaque:
            errors.append(f'{name}: pusta klatka')
        if any(c[3] != 255 for c in opaque):
            errors.append(f'{name}: półprzezroczyste piksele')
        extra = {c for c in opaque if c not in PALETTE_COLORS}
        if extra:
            errors.append(f'{name}: kolory spoza palety {sorted(extra)[:3]}')
        if any(img.p[y][x][3] for y in range(H) for x in (0, W - 1)) or any(img.p[0][x][3] and img.p[0][x] != OUT for x in range(W)):
            errors.append(f'{name}: sprite dotyka bocznej krawędzi komórki')
    return errors


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator totemu łucznika (krok U5c)')
    ap.add_argument('--out', default=ar.SPRITES)
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    sheet, frames = build()
    errors = validate(frames)
    if errors:
        for e in errors[:20]:
            print('BŁĄD:', e)
        return 1
    os.makedirs(a.out, exist_ok=True)
    sheet.pil().save(os.path.join(a.out, OUT_NAME))
    print(f'zapisano {OUT_NAME} {sheet.w}x{sheet.h}')
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        im = sheet.pil()
        bg = Image.new('RGBA', im.size, ar.PALETTE.floor[2])
        bg.alpha_composite(im)
        bg.resize((im.width * 8, im.height * 8), Image.NEAREST).save(os.path.join(a.preview, 'totem_preview.png'))
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""
Generator wrogów Lustrzanej komnaty i Bocianiego Ogrodu (krok U8g): własne warianty Rushera i Kitera dla pięter 6–7
(wcześniej z ruin) oraz ich pociski. Narzędzia z tower_ruins_tiles.py / spider_sprites.py / lair_enemies.py.

Użycie (z katalogu głównego repozytorium):
  python tools/upper_enemies.py                       # arkusze do public/assets/sprites/
  python tools/upper_enemies.py --preview tools/out   # dodatkowo podglądy 4x na posadzce biomu

Arkusze (STYLEGUIDE §2, §8, §10; wiersze = 8 kierunków N..NW z obrotu, obrys po obrocie), komórka 48x48:
  polisher_run-skid.png     Lustrzana komnata, Rusher — żywa polerka do posadzki: kolumny 0–3 jazda (szczotki się
                            kręcą), 4 przysiad (ślepia rozbłyskują — telegraf ślizgu), 5–6 ślizg (piana na boki), 7 hamowanie
  sprayer_walk-spray.png    Lustrzana komnata, Kiter — butla ze środkiem do mycia na nóżkach: 0–3 chód, 4–7 psiknięcie
                            (spust ściśnięty w 5–6, mgiełka w 6–7)
  scarecrow_walk-swing.png  Bociani Ogród, Rusher — strach na wróble z sierpem: 0–3 chód (podskoki na kiju),
                            4–7 zamach sierpem od prawej do lewej (uderzenie w 6)
  owl_fly-throw.png         Bociani Ogród, Kiter — sowa: 0–3 lot (skrzydła w górę i w dół), 4–7 rzut piórami
                            (skrzydła w przód w 6)
  chlorine-drop.png         16x16, 4 klatki, bez obrotu: kropla środka do mycia (chlor), mieni się
  owl-feather.png           16x16, 4 klatki x 8 kierunków: pióro w locie (stosina do tyłu)

Czytelność: posadzka Lustrzanej komnaty jest bardzo jasna (L ok. 0,78), więc ciała jej wrogów są ciemniejsze
(stal, plastik), a jasne zostają tylko akcenty (piana, płyn). Ogród jest ciemny i mglisty, więc jego wrogowie mają
jasne, ciepłe akcenty (słomiany kapelusz, żółte ślepia sowy). Bez krwi (STYLEGUIDE §13).
"""
import argparse
import math
import os
import sys

import tower_ruins_tiles as trt
from tower_ruins_tiles import OUT, Img, ok, outline
from spider_sprites import band_shade, ellipse, mirror, stroke
from lair_enemies import directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8
C = CELL / 2

MIRROR = trt.PALETTES['lustro_opal']
GARDEN = trt.PALETTES['bociani_noc']
OPAL = MIRROR.opal  # róż, błękit, liliowy, blada żółć


def ramp(L0, c, h, step=.1):
    """Pięć tonów jednej barwy co `step` jasności (cień → blask)."""
    return tuple(ok(L0 + i * step, c * (1 - abs(i - 2) * .12), h) for i in range(5))


def shade2(dark, light):
    return lambda nx, ny: light if nx + ny < 0 else dark


def poly(img, pts, color):
    """Wypełniony wielokąt (reguła parzystości), kolor stały lub funkcja (x, y)."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    for y in range(int(min(ys)) - 1, int(max(ys)) + 2):
        for x in range(int(min(xs)) - 1, int(max(xs)) + 2):
            px, py = x + .5, y + .5
            inside = False
            j = len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]
                xj, yj = pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
            if inside:
                img.put(x, y, color(x, y) if callable(color) else color)


# ---------------- Lustrzana komnata: polerka (Rusher) ----------------
STEEL = ramp(.36, .030, 255, .1)     # obudowa: chłodna stal, ciemniejsza od posadzki
PAD = ramp(.18, .020, 270, .06)      # tarcza szczotki (najciemniejsza)
BRISTLE = ok(.62, .090, 300)         # włosie szczotki: liliowy opalu
FOAM = (ok(.80, .020, 240), ok(.88, .015, 235), ok(.94, .010, 230))
GRIP = ramp(.32, .060, 20, .08)      # gumowy uchwyt (przygaszona czerwień)
EYE_PINK = ok(.70, .170, 0)


def polisher_frame(f):
    """Polerka z góry (przód = N): okrągła tarcza ze szczotkami, kopułka silnika, drążek z uchwytem do tyłu.
    f 0–3 jazda; 4 przysiad (kopułka niżej, ślepia jasne); 5–6 ślizg (piana z boków); 7 hamowanie."""
    img = Img(CELL, CELL)
    run = f < 4
    cy = C + 1
    lean = 0 if run else (1, -1, -1.5, .5)[f - 4]
    # drążek z uchwytem za maszyną (T)
    stroke(img, [(C, cy + 6), (C, cy + 11)], 2.0, STEEL[1], edge=STEEL[3])
    stroke(img, [(C - 4, cy + 12), (C + 4, cy + 12)], 2.2, GRIP[1], edge=GRIP[3])
    # piana przy ślizgu: kłębki po bokach i z tyłu
    if f in (5, 6, 7):
        spread = (0, 0, 0, 0, 0, 1, 2, 0)[f]
        for sx, sy, r in ((-10 - spread, 1, 2.0), (10 + spread, 1, 2.0), (-7 - spread, 7, 1.6), (7 + spread, 7, 1.6)):
            ellipse(img, C + sx, cy + sy, r, r, shade2(FOAM[0], FOAM[2]))
    # tarcza ze szczotką
    ellipse(img, C, cy + lean, 10, 10, band_shade(PAD))
    # włosie na obwodzie: krótkie kreski, kręcą się w jeździe (obrót o 1/8 kroku na klatkę)
    rot = (f % 4) * math.pi / 16 if run else (f * math.pi / 5)
    for k in range(10):
        a = rot + k * math.tau / 10
        x0, y0 = C + math.cos(a) * 7, cy + lean + math.sin(a) * 7
        x1, y1 = C + math.cos(a) * 9.4, cy + lean + math.sin(a) * 9.4
        stroke(img, [(x0, y0), (x1, y1)], 1.0, BRISTLE if k % 2 else PAD[3])
    # kopułka silnika (przy przysiadzie przyciśnięta do tarczy)
    dome_r = 5.5 if f != 4 else 4.8
    ellipse(img, C, cy - 1 + lean, dome_r, dome_r * .9, band_shade(STEEL))
    # kratka wentylacji
    for dx in (-2, 0, 2):
        img.put(int(C + dx), int(cy + 2 + lean), STEEL[0])
    # ślepia z przodu kopułki (akcent): w przysiadzie i ślizgu jaśniejsze
    eye = OPAL[0] if f in (4, 5, 6) else EYE_PINK
    ey = int(cy - 4 + lean)
    img.put(int(C - 2), ey, eye)
    img.put(int(C + 1), ey, eye)
    return img


# ---------------- Lustrzana komnata: spryskiwacz (Kiter) ----------------
LIQUID = ramp(.48, .110, 170, .09)   # środek do mycia (turkus chloru) — akcent 1
CAP = ramp(.30, .030, 300, .085)     # plastikowa głowica (ciemny fiolet)
LEG = ramp(.28, .015, 250, .08)


def sprayer_frame(f):
    """Butla z góry (przód = N): owalny zbiornik z płynem, głowica ze spustem i dyszą do przodu, dwie nóżki.
    f 0–3 chód (kołysanie); 4–7 psiknięcie: 4 wstrzymanie, 5–6 spust ściśnięty, 6–7 mgiełka przed dyszą."""
    img = Img(CELL, CELL)
    walk = f < 4
    sway = (0, 1, 0, -1)[f] if walk else 0
    step = (0, 2, 0, -2)[f] if walk else 0
    cy = C + 3
    # nóżki (kreski z małymi stopami)
    for side in (-1, 1):
        dy = step if side > 0 else -step
        foot = (C + side * 5, cy + 9 + dy * .5)
        stroke(img, [(C + side * 3, cy + 5), foot], 1.8, LEG[1], edge=LEG[3])
    # zbiornik z płynem (poziom płynu: jaśniejszy pas)
    ellipse(img, C + sway * .5, cy + 1, 6.5, 8, band_shade(LIQUID))
    for x in range(int(C - 4), int(C + 5)):
        img.put(int(x + sway * .5), int(cy - 3), LIQUID[3])
    # etykieta (ciemny prostokąt)
    for y in range(int(cy + 1), int(cy + 5)):
        for x in range(int(C - 3), int(C + 3)):
            img.put(int(x + sway * .5), y, CAP[1])
    # głowica i spust
    squeeze = 0 if walk else (0, 1.5, 1.5, .5)[f - 4]
    hy = cy - 8
    ellipse(img, C, hy, 3.6, 3, band_shade(CAP, light=(-.4, -.7)))
    stroke(img, [(C + 3, hy + 1), (C + 4 - squeeze, hy + 4)], 1.6, CAP[3])  # spust
    stroke(img, [(C, hy - 2), (C, hy - 5)], 1.6, CAP[2])                    # dysza
    # ślepia na głowicy (akcent 2: róż opalu)
    img.put(int(C - 2), int(hy), OPAL[0])
    img.put(int(C + 1), int(hy), OPAL[0])
    # mgiełka
    if f in (6, 7):
        r = 2.2 if f == 6 else 3.0
        ellipse(img, C, hy - 8, r, r * .8, shade2(LIQUID[3], LIQUID[4]))
        for dx in (-3, 3):
            img.put(int(C + dx), int(hy - 7), LIQUID[4])
    return img


def drop_frame(k):
    """Kropla chloru (pocisk, bez obrotu): kulka płynu z odblaskiem; odblask krąży, by kropla „mieniła się”."""
    img = Img(16, 16)
    wob = (0, .3, 0, -.3)[k]
    ellipse(img, 8, 8.5, 4.2 + wob, 4.2 - wob, band_shade(LIQUID))
    outline(img, OUT)
    spots = ((6, 6), (7, 6), (6, 7), (7, 7))
    x, y = spots[k]
    img.put(x, y, LIQUID[4])
    img.put(10, 10, OPAL[1])
    return img


# ---------------- Bociani Ogród: strach na wróble (Rusher) ----------------
STRAW = ramp(.48, .085, 85, .095)    # słoma kapelusza i wiechci — jasny akcent w mroku ogrodu
SACK = ramp(.28, .030, 60, .08)      # parciany wór
POLE = ramp(.30, .050, 55, .09)      # kij poprzeczny
BLADE = GARDEN.bone                  # sierp: zimna stal
EMBER_EYE = ok(.72, .170, 55)


def scarecrow_frame(f):
    """Strach z góry (przód = N): szeroki słomiany kapelusz, pod nim wór, kij poprzeczny z wiechciami w dłoniach,
    w prawej sierp. f 0–3 chód (podskok na kiju, ramiona się kołyszą); f 4–7 zamach sierpem z prawej na lewo."""
    img = Img(CELL, CELL)
    walk = f < 4
    bob = (0, -1, 0, 1)[f] if walk else 0
    sway = (0, 1.5, 0, -1.5)[f] if walk else 0
    cy = C + 1 + bob * .5
    # kij poprzeczny (ramiona) — przy zamachu prawa strona idzie łukiem
    left = (C - 10, cy - 1 + sway)
    right = (C + 9, cy - 2 - sway) if walk else ((C + 9, cy + 2), (C + 7, cy - 6), (C - 3, cy - 8), (C - 1, cy - 7))[f - 4]
    stroke(img, [left, (C, cy)], 2.0, POLE[1], edge=POLE[3])
    stroke(img, [(C, cy), right], 2.0, POLE[1], edge=POLE[3])
    # wiechcie słomy na końcach rąk
    for hx, hy in (left,):
        for dx, dy in ((-2, -1), (-2, 1), (-1, 2)):
            stroke(img, [(hx, hy), (hx + dx, hy + dy)], 1.0, STRAW[3])
    # sierp w prawej: trzonek i półksiężyc ostrza wysunięty w przód
    hx, hy = right
    dx, dy = hx - C, hy - cy
    n = max(1e-6, math.hypot(dx, dy))
    ux, uy = dx / n, dy / n
    tip_base = (hx + ux * 2, hy + uy * 2)
    stroke(img, [(hx, hy), tip_base], 1.6, POLE[2])
    # ostrze: łuk zakrzywiony do przodu (N w lokalnym układzie dłoni)
    px, py = -uy, ux  # prostopadła
    arc = [(tip_base[0] + ux * math.sin(t) * 3.2 - px * (1 - math.cos(t)) * 3.2,
            tip_base[1] + uy * math.sin(t) * 3.2 - py * (1 - math.cos(t)) * 3.2) for t in (0, .6, 1.2, 1.8, 2.4)]
    if not walk and f in (5, 6):
        arc = [(x, y - 1) for x, y in arc]
    stroke(img, arc, 1.4, BLADE[1], edge=BLADE[2])
    # smuga zamachu w klatce uderzenia (biel-stal, nie krew)
    if f == 6:
        for x, y in ((C + 7, C - 11), (C + 3, C - 13), (C - 2, C - 13), (C - 6, C - 11)):
            img.put(int(x), int(y), BLADE[2])
    # wór pod kapeluszem (wystaje z tyłu) i kapelusz
    ellipse(img, C, cy + 5, 5, 4.5, band_shade(SACK))
    ellipse(img, C, cy, 8.5, 8, band_shade(STRAW))
    ellipse(img, C, cy, 4.2, 4, band_shade(STRAW, light=(-.6, -.7)))   # główka kapelusza
    # wstążka kapelusza i łata
    for a in range(16):
        t = a * math.tau / 16
        img.put(int(C + math.cos(t) * 4.6), int(cy + math.sin(t) * 4.4), SACK[1])
    for x in range(int(C + 3), int(C + 6)):
        img.put(x, int(cy + 4), SACK[2])
    # żarzące się ślepia spod ronda (akcent 2)
    img.put(int(C - 2), int(cy - 7), EMBER_EYE)
    img.put(int(C + 1), int(cy - 7), EMBER_EYE)
    return img


# ---------------- Bociani Ogród: sowa (Kiter) ----------------
PLUME = ramp(.34, .030, 60, .09)     # upierzenie: szarobrązowe
FACE = ramp(.58, .025, 75, .08)      # jasna tarcza twarzy
OWL_EYE = ok(.86, .160, 95)          # żółte ślepia — akcent
BEAK = ok(.62, .060, 70)


def owl_wing(img, side, lift, sweep):
    """Skrzydło sowy: szeroki trójkąt lotek; lift unosi koniec, sweep wysuwa je do przodu (rzut)."""
    sh = (C + side * 4, C)
    tip = (C + side * (14.5 - abs(sweep) * .4), C - 3 - lift * .8 - sweep)
    back = (C + side * 12, C + 6 - lift * .3 - sweep * .5)
    poly(img, [sh, tip, back, (C + side * 4, C + 5)], lambda x, y: PLUME[2] if (y < C + 1) else PLUME[1])
    # lotki: ciemne kreski od barku do krawędzi
    for t in (.35, .6, .85):
        ex = tip[0] + (back[0] - tip[0]) * t
        ey = tip[1] + (back[1] - tip[1]) * t
        stroke(img, [(sh[0] + side, sh[1] + 1), (ex, ey)], 1.0, PLUME[0])
    stroke(img, [sh, tip], 1.4, PLUME[3])


def owl_frame(f):
    """Sowa z góry (przód = N): okrągłe ciało, płaska jasna twarz z wielkimi żółtymi ślepiami, szerokie skrzydła.
    f 0–3 lot; f 4–7 rzut: 4 skrzydła w górę, 5 zamach, 6 skrzydła w przód (pióra lecą), 7 powrót."""
    img = Img(CELL, CELL)
    fly = f < 4
    lift = (0, 3, 5, 3)[f] if fly else (5, 3, -2, 1)[f - 4]
    sweep = 0 if fly else (0, 2, 5, 1)[f - 4]
    for side in (-1, 1):
        owl_wing(img, side, lift, sweep)
    # ogon (krótki wachlarz)
    poly(img, [(C - 3, C + 6), (C + 3, C + 6), (C + 2, C + 11), (C - 2, C + 11)], PLUME[1])
    ellipse(img, C, C + 2, 5.5, 6.5, band_shade(PLUME))
    # głowa z tarczą twarzy (przód) i „uszami” z piór
    hy = C - 4
    ellipse(img, C, hy, 4.6, 4.2, band_shade(PLUME, light=(-.4, -.7)))
    ellipse(img, C, hy - 1.2, 3.6, 2.6, band_shade(FACE))
    for s in (-1, 1):
        stroke(img, [(C + s * 3, hy - 3), (C + s * 4.5, hy - 6)], 1.4, PLUME[3])
    for s in (-2, 1):
        img.put(int(C + s), int(hy - 2), OWL_EYE)
        img.put(int(C + s + (1 if s > 0 else 0) * 0), int(hy - 1), OWL_EYE)
    img.put(int(C), int(hy), BEAK)
    if f == 6:  # pióra wylatują
        for dx in (-5, 0, 5):
            stroke(img, [(C + dx, hy - 7), (C + dx, hy - 10)], 1.0, GARDEN.bone[2])
    return img


def feather_frame(k):
    """Pióro w locie (przód = N): stosina wzdłuż lotu, chorągiewka jasna, koniec ciemniejszy; lekko faluje."""
    img = Img(16, 16)
    flutter = (0, .5, 0, -.5)[k]
    bone = GARDEN.bone
    poly(img, [(8, 2.5), (10.5 + flutter, 7), (9.5 + flutter, 12), (8, 13), (6.5 - flutter, 12), (5.5 - flutter, 7)],
         lambda x, y: bone[1] if x < 8 else bone[0])
    stroke(img, [(8, 3), (8, 14)], 1.0, PLUME[1])
    for y in (10, 11, 12):
        img.put(7, y, PLUME[2])
        img.put(9, y, PLUME[2])
    return img


def build():
    polisher, pf = directional_sheet(CELL, polisher_frame, 8)
    sprayer, sf = directional_sheet(CELL, sprayer_frame, 8)
    scarecrow, cf = directional_sheet(CELL, scarecrow_frame, 8)
    owl, of = directional_sheet(CELL, owl_frame, 8)
    feather, ff = directional_sheet(16, feather_frame, 4)
    drop = Img(64, 16)
    drops = []
    for k in range(4):
        d = drop_frame(k)
        drop.blit(d, k * 16, 0)
        drops.append((f'c{k}', d))
    return {
        'polisher_run-skid.png': (polisher, pf, CELL, MARGIN),
        'sprayer_walk-spray.png': (sprayer, sf, CELL, MARGIN),
        'scarecrow_walk-swing.png': (scarecrow, cf, CELL, MARGIN),
        'owl_fly-throw.png': (owl, of, CELL, MARGIN),
        'chlorine-drop.png': (drop, drops, 16, 1),
        'owl-feather.png': (feather, ff, 16, 1),
    }


PREVIEW_FLOOR = {
    'polisher_run-skid.png': MIRROR.floor[2],
    'sprayer_walk-spray.png': MIRROR.floor[2],
    'chlorine-drop.png': MIRROR.floor[2],
}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator wrogów Lustrzanej komnaty i Bocianiego Ogrodu')
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
    for fname, (sheet, frames, _, _) in sheets.items():
        sheet.pil().save(os.path.join(a.out, fname))
        print(f'zapisano {fname} {sheet.w}x{sheet.h}: {len(frames)} klatek')
    if a.preview:
        from PIL import Image
        os.makedirs(a.preview, exist_ok=True)
        for fname, (sheet, _, _, _) in sheets.items():
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, PREVIEW_FLOOR.get(fname, GARDEN.floor[2]))
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(
                os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

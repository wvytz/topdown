"""
Generator Gniazdownika i czerwia (krok 122): trzeci archetyp wroga — przywoływacz. Widok z góry, przód = N.

Gniazdownik: pękaty mięsisty worek na krótkich nóżkach, na grzbiecie trzy jaja z żółtozielonym blaskiem
(akcent — „to coś się wykluje”), z przodu mały pysk z żuwaczkami. Czerw: blady, różowawy, segmentowany
pędrak z ciemną główką.

Użycie (z katalogu głównego repozytorium):
  python tools/brood_sprites.py                       # arkusze do public/assets/sprites/
  python tools/brood_sprites.py --preview tools/out   # dodatkowo podglądy 2x na posadzce ruin

brood-sac_crawl-birth.png (384x384, komórka 48x48, 8 kierunków z obrotu, obrys po obrocie):
  kolumny 0–3 pełzanie (nóżki na zmianę, worek lekko pulsuje), 4–7 wylęg: worek pęcznieje, jaja jaśnieją,
  pysk się rozwiera (kolumna 7 — wyplucie).
grub_crawl-bite.png (384x384, komórka 48x48, 8 kierunków): 0–3 pełzanie (segmenty falują), 4–7 ugryzienie.

Krok 122a — wersje biomów (te same kolumny: gniazdo 0–3 ruch, 4–7 wylęg; stworek 0–3 ruch, 4–7 atak):
  silk-mother / hatchling          Pajęcze leże: pajęczyca z wielkim jedwabnym kokonem jaj, pajęczak
  puffcap / sporeling              Grzybnia: omszała purchawa na korzeniach grzybni, grzybek-zarodnik na nóżkach
  necromancer / crawling-hand      Cmentarzysko: nekromanta w rdzawych łachmanach z kosturem, pełzająca dłoń
  imp-mother / imp                 Piekło: rozdęta czarcica z żarem w brzuchu, chochlik
  hookah / smoke-wisp              Zadymiona palarnia: żywa fajka wodna na mosiężnych nóżkach, dymek z żarem oczu
"""
import argparse
import math
import os
import sys

from PIL import Image

import tower_ruins_tiles as trt
from tower_ruins_tiles import Img, ok
from spider_sprites import CHITIN, band_shade, ellipse, mirror, stroke
from lair_enemies import SPIDER_LEGS, directional_sheet, validate

OUT_DIR = os.path.join(trt.ROOT, 'public', 'assets', 'sprites')
CELL = 48
MARGIN = 8
C = CELL / 2
# Mięso worka: przybrudzony róż-brąz (ciepły, ale ciemniejszy od piaskowca posadzki).
FLESH = (ok(.34, .050, 30), ok(.45, .065, 32), ok(.56, .075, 35), ok(.67, .065, 40), ok(.78, .045, 50))
# Jaja: żółtozielona żółć — jedyny nasycony akcent (to, co się wykluje).
EGG = (ok(.50, .090, 115), ok(.62, .120, 112), ok(.74, .130, 108), ok(.86, .100, 105), ok(.94, .050, 100))
MAW = ok(.22, .040, 20)
FANG = ok(.86, .030, 80)
# Czerw: blady, różowawy pędrak (jak mięso worka, ale jaśniejszy) z brązową główką — odcina się od piaskowca.
GRUB = (ok(.48, .060, 15), ok(.58, .070, 15), ok(.68, .070, 18), ok(.78, .055, 22), ok(.87, .035, 30))
HEAD = (ok(.30, .040, 45), ok(.40, .050, 48), ok(.50, .055, 50), ok(.60, .050, 55), ok(.70, .040, 60))

SAC_LEGS = [((19, 21), (15.5, 18)), ((18, 25), (13.5, 26)), ((19, 29), (15.5, 32))]


def ramp_shift(ramp, k):
    """Rampa przesunięta o k tonów w stronę światła (jaśnienie jaj przy wylęgu)."""
    return tuple(ramp[min(len(ramp) - 1, i + k)] for i in range(len(ramp)))


def sac_frame(f):
    img = Img(CELL, CELL)
    crawling = f < 4
    step = (0, -1.5, 0, 1.5)[f % 4] if crawling else 0
    swell = (0, .3, 0, -.3)[f] if crawling else (.6, 1.3, 2.0, .4)[f - 4]
    glow = 0 if crawling else (1, 2, 2, 1)[f - 4]
    # nóżki: trzy pary krótkich, grubych kikutów, na zmianę w przód i w tył
    for side in (1, -1):
        for i, (a, t) in enumerate(SAC_LEGS):
            dy = step if (i + (side > 0)) % 2 == 0 else -step
            pts = [a, (t[0], t[1] + dy)]
            if side < 0:
                pts = [mirror(p, C) for p in pts]
            stroke(img, pts, 2.6, FLESH[1], edge=FLESH[2])
    # worek: pękaty owal, przy wylęgu pęcznieje
    ellipse(img, C, C + 2, 9 + swell, 10 + swell, band_shade(FLESH))
    # fałdy między jajami — najciemniejszy ton mięsa
    for x0, y0, x1, y1 in ((C - 5, C + 1, C - 2, C + 7), (C + 5, C + 1, C + 2, C + 7)):
        stroke(img, [(x0, y0), (x1, y1)], 1.0, FLESH[0])
    # trzy jaja na grzbiecie (trójkąt, czubkiem do tyłu)
    eggs = ramp_shift(EGG, glow)
    for ex, ey, r in ((C - 4, C + 5, 3.0), (C + 4, C + 5, 3.0), (C, C + 10, 2.8)):
        ellipse(img, ex, ey, r + swell * .25, r + swell * .25, band_shade(eggs, light=(-.4, -.5)))
    # przód: pysk z żuwaczkami, przy wylęgu rozwarty
    open_ = 0 if crawling else (1, 2, 3, 1)[f - 4]
    hy = C - 8 - swell * .5
    ellipse(img, C, hy, 4.5, 3.5, band_shade(FLESH, light=(-.4, -.7)))
    for x in range(int(C - 1 - open_ * .5), int(C + 1 + open_ * .5)):
        for y in range(int(hy - 2), int(hy + 1)):
            img.put(x, y, MAW)
    for side in (-1, 1):
        tip = (C + side * (2.5 + open_ * .8), hy - 4.5)
        stroke(img, [(C + side * 2.5, hy - 1.5), tip], 1.4, FANG)
    if f == 7:
        # wyplucie: kropla żółci przed pyskiem
        ellipse(img, C, hy - 5.5, 1.5, 1.5, band_shade(EGG))
    return img


def grub_frame(f):
    img = Img(CELL, CELL)
    crawling = f < 4
    wave = (0, 1, 0, -1)[f % 4] if crawling else 0
    lunge = 0 if crawling else (-1, 2, 3, 1)[f - 4]
    # trzy segmenty ciała od tyłu (krótkie przesunięcia na boki — pełzanie falą)
    for i, (dy, r) in enumerate(((8, 3.2), (4.5, 3.8), (1, 4.0))):
        dx = wave * (1 if i % 2 == 0 else -1) * .8
        ellipse(img, C + dx, C + dy - lunge * .5, r, r * .9, band_shade(GRUB))
    # pierścienie między segmentami — najciemniejszy ton
    for dy in (6.5, 2.8):
        for x in range(int(C - 2), int(C + 3)):
            img.put(x, int(C + dy - lunge * .5), GRUB[0])
    # główka z żuwaczkami
    hy = C - 3 - lunge
    ellipse(img, C, hy, 3.2, 2.8, band_shade(HEAD, light=(-.4, -.7)))
    jaw = 1 if not crawling and f in (5, 6) else 0
    for side in (-1, 1):
        stroke(img, [(C + side * 1.5, hy - 2), (C + side * (1.5 + jaw), hy - 4)], 1.2, FANG)
    return img


# ---------------- wspólne: fazy animacji ----------------
def phase(f):
    """(w ruchu?, krok nóg, pęcznienie przy wylęgu, blask 0–2) dla kolumny gniazda."""
    moving = f < 4
    step = (0, -1.5, 0, 1.5)[f % 4] if moving else 0
    swell = (0, .3, 0, -.3)[f] if moving else (.6, 1.3, 2.0, .4)[f - 4]
    glow = 0 if moving else (1, 2, 2, 1)[f - 4]
    return moving, step, swell, glow


def lunge_of(f):
    """Wypad stworka przy ataku (kolumny 4–7)."""
    return 0 if f < 4 else (-1, 2, 3, 1)[f - 4]


def shade2(dark, light):
    """Dwutonowe cieniowanie małych elementów: jasna lewa-przednia połowa."""
    return lambda nx, ny: light if nx + ny < 0 else dark


# ---------------- Pajęcze leże: pajęczyca z kokonem i pajęczak ----------------
LAIR = trt.PALETTES['pajeczy']
LAIR_GREEN = LAIR.flame
# Jedwab kokonu: chłodna biel z fioletem leża (jaśniejsza od posadzki).
SILK = (ok(.60, .030, 305), ok(.70, .028, 305), ok(.79, .024, 300), ok(.87, .018, 300), ok(.93, .010, 295))


def silk_mother_frame(f):
    img = Img(CELL, CELL)
    moving, step, swell, glow = phase(f)
    scale = .72
    for side in (1, -1):
        for i, (a, k, t) in enumerate(SPIDER_LEGS):
            dy = step if (i + (side > 0)) % 2 == 0 else -step
            pts = [a, (k[0], k[1] + dy * .5), (t[0], t[1] + dy)]
            pts = [(C + (x - C) * scale, C - 2 + (y - C) * scale) for x, y in pts]
            if side < 0:
                pts = [mirror(p, C) for p in pts]
            stroke(img, pts[:2], 2.2, CHITIN[2], edge=CHITIN[3])
            stroke(img, pts[1:], 1.9, CHITIN[2])
    # głowotułów z przodu
    ellipse(img, C, C - 7, 4.2, 4, band_shade(CHITIN, light=(-.4, -.7)))
    for ex in (-2, 1):
        img.put(int(C + ex), int(C - 9), LAIR_GREEN[2])
    # kokon jaj zamiast odwłoka: jedwab z nićmi, przez który prześwitują zielone jaja
    ellipse(img, C, C + 4, 8 + swell, 9 + swell, band_shade(SILK))
    for k in (-1, 1):
        stroke(img, [(C - 7, C + 4 + k * 4), (C + 7, C + 4 - k * 3)], 1.0, SILK[1])
    eggs = ramp_shift(LAIR_GREEN + (LAIR_GREEN[-1],), glow)
    for ex, ey in ((C - 3, C + 2), (C + 3, C + 5), (C - 1, C + 8)):
        img.put(int(ex), int(ey), eggs[1])
        img.put(int(ex) + 1, int(ey), eggs[2])
    if f == 7:
        img.put(int(C), int(C - 12), SILK[3])
        img.put(int(C), int(C - 13), SILK[3])
    return img


def hatchling_frame(f):
    img = Img(CELL, CELL)
    moving = f < 4
    step = (0, -1, 0, 1)[f % 4] if moving else 0
    lunge = lunge_of(f)
    for side in (1, -1):
        for i, (ay, ty) in enumerate(((-2, -5), (0, -1), (1, 3), (2, 6))):
            dy = step if (i + (side > 0)) % 2 == 0 else -step
            pts = [(C + 2, C + ay - lunge * .5), (C + 6, C + ty + dy - lunge * .5)]
            if side < 0:
                pts = [mirror(p, C) for p in pts]
            stroke(img, pts, 1.4, CHITIN[2])
    ellipse(img, C, C + 3 - lunge * .5, 3.4, 3.8, band_shade(CHITIN))
    ellipse(img, C, C - 2 - lunge, 2.6, 2.4, band_shade(CHITIN, light=(-.4, -.7)))
    img.put(int(C - 1), int(C - 3 - lunge), LAIR_GREEN[2])
    img.put(int(C), int(C - 3 - lunge), LAIR_GREEN[2])
    if not moving and f in (5, 6):
        for side in (-1, 1):
            img.put(int(C + side), int(C - 5 - lunge), SILK[3])
    return img


# ---------------- Grzybnia: purchawa i grzybek-zarodnik ----------------
GROVE = trt.PALETTES['grzybnia']
GROVE_GLOW = GROVE.flame
# Purchawa: omszała, zgniła zieleń (z dala od fioletu posadzki i od beżowych purchaw-pułapek Grzybni).
PUFF = (ok(.32, .050, 160), ok(.41, .060, 158), ok(.50, .068, 155), ok(.60, .068, 150), ok(.71, .055, 145))
ROOT = (ok(.40, .030, 300), ok(.55, .030, 305))
SHROOM_CAP = (ok(.30, .080, 35), ok(.39, .100, 40), ok(.48, .115, 45), ok(.58, .115, 55), ok(.70, .090, 70))


def puffcap_frame(f):
    img = Img(CELL, CELL)
    moving, step, swell, glow = phase(f)
    # korzenie grzybni zamiast nóg: sześć falujących pasm
    for i in range(6):
        ang = math.radians(30 + i * 60)
        wob = step * (1 if i % 2 else -1)
        pts = [(C + math.cos(ang) * 6, C + 1 + math.sin(ang) * 6),
               (C + math.cos(ang) * 12 + wob * .6, C + 1 + math.sin(ang) * 12 + wob * .4)]
        stroke(img, pts, 2.0, ROOT[0], edge=ROOT[1])
    ellipse(img, C, C + 1, 9.5 + swell, 9.5 + swell, band_shade(PUFF))
    # pory: cyjanowy blask (jaśnieje przy wylęgu)
    pores = ramp_shift(GROVE_GLOW + (GROVE_GLOW[-1],), glow)
    for px, py in ((C - 4, C - 2), (C + 3, C - 3), (C - 1, C + 3), (C + 4, C + 4), (C - 5, C + 5)):
        img.put(int(px), int(py), pores[1])
        img.put(int(px) + 1, int(py), pores[0])
    if f == 7:
        ellipse(img, C, C - 11.5, 2.2, 1.8, shade2(GROVE.ash[1], GROVE.ash[0]))
    return img


def sporeling_frame(f):
    img = Img(CELL, CELL)
    moving = f < 4
    step = (0, -1, 0, 1)[f % 4] if moving else 0
    lunge = lunge_of(f)
    for side in (1, -1):
        for i, (ay, ty) in enumerate(((-1, -3), (2, 5))):
            dy = step if (i + (side > 0)) % 2 == 0 else -step
            pts = [(C + 2, C + ay - lunge * .5), (C + 5, C + ty + dy - lunge * .5)]
            if side < 0:
                pts = [mirror(p, C) for p in pts]
            stroke(img, pts, 1.5, ROOT[1])
    ellipse(img, C, C - lunge * .7, 4.6, 4.3, band_shade(SHROOM_CAP))
    img.put(int(C - 1), int(C - 1 - lunge * .7), GROVE_GLOW[2])
    img.put(int(C + 1), int(C + 1 - lunge * .7), GROVE_GLOW[1])
    if not moving and f in (5, 6):
        ellipse(img, C, C - 6 - lunge, 1.6, 1.4, shade2(GROVE.ash[1], GROVE.ash[0]))
    return img


# ---------------- Cmentarzysko: nekromanta i pełzająca dłoń ----------------
GRAVE = trt.PALETTES['cmentarz_trupi']
MYCEL = GRAVE.mycel
RAGS = (ok(.26, .050, 28), ok(.32, .062, 30), ok(.38, .072, 32), ok(.45, .074, 36), ok(.53, .070, 40))
HOOD_IN = (ok(.14, .012, 30), ok(.20, .014, 30))
DEAD_SKIN = (ok(.50, .018, 235), ok(.60, .020, 230), ok(.70, .022, 225), ok(.79, .020, 220), ok(.87, .016, 215))
STAFF = (ok(.30, .030, 60), ok(.42, .035, 65))


def necromancer_frame(f):
    img = Img(CELL, CELL)
    moving, step, swell, glow = phase(f)
    raise_ = 0 if moving else (2, 4, 5, 2)[f - 4]
    # poły łachmanów za plecami (falują w marszu)
    for dx in (-5, 0, 5):
        stroke(img, [(C + dx * .7, C + 4), (C + dx + step * .6, C + 10)], 3.0, RAGS[1], edge=RAGS[2])
    ellipse(img, C, C + 1, 9, 6.5, band_shade(RAGS))
    # ręce: przy wylęgu wyciągnięte do przodu nad grób
    for side in (-1, 1):
        hand = (C + side * (8 - raise_ * .6), C - 3 - raise_)
        stroke(img, [(C + side * 7, C), hand], 2.4, RAGS[2], edge=RAGS[3])
        img.put(int(hand[0]), int(hand[1]), DEAD_SKIN[2])
    # kostur w prawej ręce z kulą grzybni
    stroke(img, [(C + 9, C + 5), (C + 9, C - 9)], 1.6, STAFF[0], edge=STAFF[1])
    orb = MYCEL[1] if glow else MYCEL[0]
    ellipse(img, C + 9, C - 10, 2 + glow * .4, 2 + glow * .4, shade2(MYCEL[0], orb))
    # kaptur z ciemnym wnętrzem
    ellipse(img, C, C - 3, 4.8, 4.4, band_shade(RAGS, light=(-.4, -.7)))
    ellipse(img, C, C - 4.5, 2.4, 2, shade2(HOOD_IN[0], HOOD_IN[1]))
    img.put(int(C - 1), int(C - 5), MYCEL[1])
    img.put(int(C + 1), int(C - 5), MYCEL[1])
    return img


def crawling_hand_frame(f):
    img = Img(CELL, CELL)
    moving = f < 4
    step = (0, -1, 0, 1)[f % 4] if moving else 0
    lunge = lunge_of(f)
    spread = 0 if moving else (1, 2, 0, 0)[f - 4]
    # mankiet z łachmana i dłoń
    ellipse(img, C, C + 6 - lunge * .5, 3, 2.2, shade2(RAGS[1], RAGS[3]))
    ellipse(img, C, C + 1 - lunge * .5, 4, 4.4, band_shade(DEAD_SKIN))
    for i, dx in enumerate((-3, -1, 1, 3)):
        dy = step if i % 2 == 0 else -step
        tip = (C + dx * (1.3 + spread * .25), C - 6 - lunge + dy * .5 + (abs(dx) == 3) * 1.5)
        stroke(img, [(C + dx, C - 2 - lunge * .5), tip], 1.6, DEAD_SKIN[2], edge=DEAD_SKIN[3])
    # kciuk z boku
    stroke(img, [(C - 3.5, C + 2), (C - 6.5, C - 1 + step * .5)], 1.6, DEAD_SKIN[1])
    img.put(int(C + 1), int(C + 2 - lunge * .5), MYCEL[0])
    return img


# ---------------- Piekło: czarcica i chochlik ----------------
HELL = trt.PALETTES['pieklo_bazalt']
EMBER = HELL.ember
DEMON = (ok(.28, .080, 22), ok(.36, .100, 24), ok(.45, .115, 26), ok(.54, .115, 30), ok(.64, .100, 36))
HORN = (ok(.62, .020, 70), ok(.80, .018, 80))
WING = (ok(.20, .030, 20), ok(.27, .040, 22))


def horns(img, cx, cy, size):
    for side in (-1, 1):
        stroke(img, [(cx + side * size * .6, cy), (cx + side * size, cy - size * .9)], 1.4, HORN[0], edge=HORN[1])


def imp_mother_frame(f):
    img = Img(CELL, CELL)
    moving, step, swell, glow = phase(f)
    for side in (1, -1):
        for i, (a, t) in enumerate(SAC_LEGS):
            dy = step if (i + (side > 0)) % 2 == 0 else -step
            pts = [a, (t[0], t[1] + dy)] if i != 1 else [a, (t[0] + 1, t[1] + dy)]
            if side < 0:
                pts = [mirror(p, C) for p in pts]
            stroke(img, pts, 2.6, DEMON[1], edge=DEMON[2])
    ellipse(img, C, C + 2, 9 + swell, 10 + swell, band_shade(DEMON))
    # pęknięcia z żarem na brzuchu (jaśnieją przy wylęgu)
    hot = ramp_shift(EMBER + (EMBER[-1],), glow)
    for pts in (((C - 5, C + 1), (C - 2, C + 4), (C - 3, C + 8)), ((C + 4, C), (C + 2, C + 5), (C + 5, C + 9))):
        stroke(img, list(pts), 1.0, hot[0])
    ellipse(img, C, C + 4, 2 + glow * .5, 2 + glow * .5, shade2(hot[1], hot[2]))
    # głowa z rogami
    hy = C - 8 - swell * .5
    ellipse(img, C, hy, 4, 3.6, band_shade(DEMON, light=(-.4, -.7)))
    horns(img, C, hy - 1, 4)
    img.put(int(C - 2), int(hy), EMBER[2])
    img.put(int(C + 1), int(hy), EMBER[2])
    if f == 7:
        ellipse(img, C, hy - 4.5, 1.4, 1.4, shade2(EMBER[1], EMBER[2]))
    return img


def imp_frame(f):
    img = Img(CELL, CELL)
    moving = f < 4
    flap = (0, 1, 0, -1)[f % 4] if moving else 1
    lunge = lunge_of(f)
    # ogon i skrzydełka
    stroke(img, [(C, C + 4), (C + 2, C + 8), (C + 1, C + 10)], 1.2, DEMON[1])
    for side in (-1, 1):
        stroke(img, [(C + side * 2, C + 1 - lunge * .5), (C + side * (6 + flap), C - 1 + flap - lunge * .5),
                     (C + side * 4, C + 4 - lunge * .5)], 1.8, WING[0], edge=WING[1])
    ellipse(img, C, C + 2 - lunge * .5, 3, 3.4, band_shade(DEMON))
    hy = C - 2.5 - lunge
    ellipse(img, C, hy, 2.8, 2.6, band_shade(DEMON, light=(-.4, -.7)))
    horns(img, C, hy - .5, 2.6)
    img.put(int(C - 1), int(hy), EMBER[2])
    img.put(int(C + 1), int(hy), EMBER[2])
    if not moving and f in (5, 6):
        for side in (-1, 1):
            img.put(int(C + side * 2), int(hy - 3), HORN[1])
    return img


# ---------------- Zadymiona palarnia: fajka wodna i dymek ----------------
BRASS = (ok(.38, .060, 75), ok(.48, .080, 80), ok(.58, .095, 85), ok(.69, .095, 90), ok(.80, .070, 95))
GLASS = (ok(.30, .060, 200), ok(.38, .075, 200), ok(.46, .085, 195), ok(.56, .085, 190), ok(.68, .070, 185))
SMOKE = (ok(.62, .008, 90), ok(.72, .008, 90), ok(.81, .008, 90), ok(.89, .008, 90))
HOSE = (ok(.26, .040, 300), ok(.36, .050, 300))


def hookah_frame(f):
    img = Img(CELL, CELL)
    moving, step, swell, glow = phase(f)
    # cztery mosiężne nóżki
    for side in (1, -1):
        for fy, ty in ((-3, -8), (4, 9)):
            dy = step if (fy > 0) == (side > 0) else -step
            pts = [(C + 5, C + 1 + fy), (C + 10, C + 1 + ty + dy)]
            if side < 0:
                pts = [mirror(p, C) for p in pts]
            stroke(img, pts, 2.0, BRASS[1], edge=BRASS[2])
    # szklana baza (woda), mosiężny talerz i główka z żarem
    ellipse(img, C, C + 1, 8.5 + swell * .5, 8.5 + swell * .5, band_shade(GLASS))
    ellipse(img, C, C + 1, 4.5, 4.5, band_shade(BRASS))
    hot = ramp_shift(EMBER + (EMBER[-1],), glow)
    ellipse(img, C, C + 1, 2, 2, shade2(hot[0], hot[1]))
    if glow:
        img.put(int(C), int(C + 1), hot[2])
    # wąż zwinięty z boku
    stroke(img, [(C - 6, C + 5), (C - 10, C + 8), (C - 11, C + 3), (C - 8, C - 1)], 1.6, HOSE[0], edge=HOSE[1])
    # kłąb dymu nad główką przy wylęgu
    if not moving:
        r = (1.5, 2.5, 3.5, 2)[f - 4]
        ellipse(img, C, C - 8 - r * .5, r, r * .9, shade2(SMOKE[1], SMOKE[3]))
    return img


def smoke_wisp_frame(f):
    img = Img(CELL, CELL)
    moving = f < 4
    drift = (0, 1, 0, -1)[f % 4] if moving else 0
    lunge = lunge_of(f)
    puff = (SMOKE[0], SMOKE[0], SMOKE[1], SMOKE[2], SMOKE[3])
    # coraz mniejsze kłębki za plecami (smuga) i trzy kłęby ciała
    for dy, r, sway in ((9.5, 1.6, -1), (7, 2.2, 1)):
        ellipse(img, C + drift * sway, C + dy, r, r, band_shade(puff))
    for dx, dy, r in ((-3, 2, 3.2), (3, 2.5, 3.2), (0, -1.5 - lunge * .5, 3.8)):
        ellipse(img, C + dx + drift * .3, C + dy - lunge * .5, r, r * .9, band_shade(puff))
    ey = int(C - 2 - lunge)
    img.put(int(C - 2), ey, EMBER[1])
    img.put(int(C + 1), ey, EMBER[1])
    if not moving and f in (5, 6):
        img.put(int(C - 1), ey + 2, EMBER[0])
        img.put(int(C), ey + 2, EMBER[0])
    return img


SHEETS = {
    'brood-sac_crawl-birth.png': sac_frame,
    'grub_crawl-bite.png': grub_frame,
    'silk-mother_crawl-birth.png': silk_mother_frame,
    'hatchling_crawl-bite.png': hatchling_frame,
    'puffcap_crawl-birth.png': puffcap_frame,
    'sporeling_crawl-bite.png': sporeling_frame,
    'necromancer_crawl-birth.png': necromancer_frame,
    'crawling-hand_crawl-bite.png': crawling_hand_frame,
    'imp-mother_crawl-birth.png': imp_mother_frame,
    'imp_crawl-bite.png': imp_frame,
    'hookah_crawl-birth.png': hookah_frame,
    'smoke-wisp_crawl-bite.png': smoke_wisp_frame,
}


def build():
    out = {}
    for fname, frame in SHEETS.items():
        sheet, frames = directional_sheet(CELL, frame, 8)
        out[fname] = (sheet, frames, CELL, MARGIN)
    return out


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Generator Gniazdownika i czerwia')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--preview', default=None, help='katalog na podglądy 2x')
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
            os.makedirs(a.preview, exist_ok=True)
            im = sheet.pil()
            bg = Image.new('RGBA', im.size, trt.PALETTES['piaskowiec'].floor[2])
            bg.alpha_composite(im)
            bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(os.path.join(a.preview, fname.replace('.png', '_preview.png')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

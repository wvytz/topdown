import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH, GUARANTEED_VIEW_HALF, TILE_SIZE } from '@/config/gameConfig';
import { ambientDarkness } from '@/systems/lighting';
import { TILESET_ASSET } from '@/config/tilesetConfig';
import { LIGHTING } from '@/config/lightingConfig';
import type { Rgba, RgbaImage } from '../helpers/png';
import { contrastRatio, hueSaturation, luminance, pixel, readPng } from '../helpers/png';
import { TILESETS_DIR, loadTileset } from '../helpers/tileset';

/**
 * Arkusz kafli z generatora (tools/tower_ruins_tiles.py): zgodność JSON z PNG
 * oraz progi czytelności postaci na podłodze (STYLEGUIDE §6a).
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const meta = loadTileset();
const sheet = readPng(TILESETS_DIR + meta.image);
const S = meta.tileSize;
const tiles = Object.entries(meta.tiles);

/** Piksele prostokąta kafla (w kaflach) w arkuszu. */
function tilePixels(img: RgbaImage, col: number, row: number, w = 1, h = 1, size = S): Rgba[] {
  const out: Rgba[] = [];
  for (let y = row * size; y < (row + h) * size; y++) {
    for (let x = col * size; x < (col + w) * size; x++) out.push(pixel(img, x, y));
  }
  return out;
}

const hex = ([r, g, b]: Rgba) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function mostCommon(pixels: readonly Rgba[]): Rgba {
  const counts = new Map<string, { color: Rgba; n: number }>();
  for (const p of pixels) {
    const entry = counts.get(hex(p)) ?? { color: p, n: 0 };
    entry.n++;
    counts.set(hex(p), entry);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) throw new Error('mostCommon: brak pikseli');
  return best.color;
}

describe('arkusz kafli: JSON zgodny z PNG', () => {
  it('gra ładuje ten arkusz: ścieżki z konfiguracji, wersja formatu i rozmiar kafla gry', () => {
    expect(TILESET_ASSET.imageUrl).toBe(`assets/tilesets/${meta.image}`);
    expect(readPng(`${ROOT}public/${TILESET_ASSET.imageUrl}`).width).toBe(sheet.width);
    expect(TILESET_ASSET.jsonUrl.endsWith('tower_ruins_tileset.json')).toBe(true);
    expect(meta.version).toBe(TILESET_ASSET.version);
    expect(meta.tileSize).toBe(TILE_SIZE);
  });

  it('wymiary PNG = kolumny × wiersze × rozmiar kafla', () => {
    expect(meta.version).toBe(2);
    expect({ width: sheet.width, height: sheet.height }).toEqual({ width: meta.columns * S, height: meta.rows * S });
  });

  it.each(tiles)('%s: indeks klatki i części zgadzają się z pozycją w siatce', (_name, t) => {
    expect(t.frame).toBe(t.row * meta.columns + t.col);
    expect(t.col + t.w).toBeLessThanOrEqual(meta.columns);
    expect(t.row + t.h).toBeLessThanOrEqual(meta.rows);
    if (t.w > 1 || t.h > 1) {
      const expected = Array.from({ length: t.h }, (_, dy) =>
        Array.from({ length: t.w }, (_, dx) => (t.row + dy) * meta.columns + t.col + dx),
      );
      expect(t.frames).toEqual(expected);
    } else {
      expect(t.frames).toBeUndefined();
    }
  });

  it('kafle nie nachodzą na siebie', () => {
    const used = new Map<number, string>();
    for (const [name, t] of tiles) {
      for (let dy = 0; dy < t.h; dy++) {
        for (let dx = 0; dx < t.w; dx++) {
          const cell = (t.row + dy) * meta.columns + t.col + dx;
          expect(used.get(cell), `${name} nachodzi na ${used.get(cell)}`).toBeUndefined();
          used.set(cell, name);
        }
      }
    }
  });

  it.each(tiles)('%s: zawartość pikseli pasuje do warstwy', (_name, t) => {
    const pixels = tilePixels(sheet, t.col, t.row, t.w, t.h);
    const alphas = new Set(pixels.map((p) => p[3]));
    expect(pixels.some((p) => p[3] > 0), 'kafel jest pusty').toBe(true);
    if (t.layer === 'floorBase') {
      expect([...alphas]).toEqual([255]); // baza podłogi jest w pełni kryjąca
    } else if (t.layer === 'envShadow') {
      expect([...alphas].sort((a, b) => a - b)).toEqual([0, Math.round(meta.envShadowAlpha * 255)]);
    } else {
      for (const a of alphas) expect([0, 255]).toContain(a); // bez półprzezroczystości (STYLEGUIDE §2)
    }
  });

  it('grupy i autotile wskazują istniejące kafle', () => {
    for (const [group, names] of Object.entries(meta.groups)) {
      expect(names.length, group).toBeGreaterThan(0);
      for (const name of names) expect(meta.tiles, `${group} → ${name}`).toHaveProperty(name);
    }
    const { wall, envShadow } = meta.autotile;
    for (let mask = 0; mask < 16; mask++) {
      expect(meta.groups, `maska ${mask}`).toHaveProperty(wall.variants[String(mask)] ?? `brak maski ${mask}`);
    }
    for (const name of [...Object.values(wall.diagonal.tiles), ...Object.values(envShadow.tiles)]) {
      expect(meta.tiles).toHaveProperty(name);
    }
    for (const group of Object.values(wall.bands.groups)) expect(meta.groups).toHaveProperty(group);
  });

  it('pochodnia: uchwyt na licu muru, 4 klatki płomienia, kolory palety dla światła i pyłków', () => {
    expect(meta.tiles.torch_sconce?.layer).toBe('wallDecor');
    expect(meta.groups.torchFlame).toHaveLength(4);
    for (const hexValue of [meta.colors.ambient, meta.colors.outline, ...meta.colors.ash, ...meta.colors.flame]) {
      expect(hexValue).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(meta.colors.flame.length).toBeGreaterThanOrEqual(2);
    expect(meta.torch.flameBaseY).toBeGreaterThan(0);
    expect(meta.torch.flameBaseY).toBeLessThan(S);
  });

  it('odbijane mogą być tylko kafle płaskie na podłodze (bazy, nakładki, ślady walki)', () => {
    for (const [name, t] of tiles) {
      if (t.flipX) expect(['floorBase', 'floorDecal', 'combatDecal'], name).toContain(t.layer);
    }
  });
});

// ---------------- czytelność postaci ----------------

/** Progi ze STYLEGUIDE §6a (kontrast WCAG względem średniej jasności podłogi). */
const READABILITY = { outlineMin: 2.0, bodyMin: 1.5, hueDeltaMin: 60, bodySaturationMin: 0.25 };

interface FloorReference {
  luminance: number;
  hue: number;
}

function floorReference(pixels: readonly Rgba[]): FloorReference {
  const mean = pixels.reduce((sum, p) => sum + luminance(p), 0) / pixels.length;
  return { luminance: mean, hue: hueSaturation(mostCommon(pixels)).hue };
}

interface Readability {
  outline: number;
  body: number;
  hueDelta: number;
  bodySaturation: number;
  passes: boolean;
}

/**
 * Obrys = najczęstszy kolor na krawędzi sylwetki (piksel kryjący z przezroczystym sąsiadem),
 * ciało = najczęstszy pozostały kolor kryjący (bez prawie czarnych akcentów).
 * Klatka 0 wiersza S — postać zwrócona do kamery.
 */
/** Obrys i dominujący ton ciała postaci (klatka 0 wiersza S — postać zwrócona do kamery). */
function characterColors(sprite: RgbaImage, frameSize: number): { outline: Rgba; body: Rgba } {
  const row = 4;
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < frameSize && y < frameSize && pixel(sprite, x, row * frameSize + y)[3] === 255;
  const edge: Rgba[] = [];
  const inner: Rgba[] = [];
  for (let y = 0; y < frameSize; y++) {
    for (let x = 0; x < frameSize; x++) {
      if (!opaque(x, y)) continue;
      const p = pixel(sprite, x, row * frameSize + y);
      const onEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx!;
        const ny = y + dy!;
        return nx < 0 || ny < 0 || nx >= frameSize || ny >= frameSize || pixel(sprite, nx, row * frameSize + ny)[3] === 0;
      });
      (onEdge ? edge : inner).push(p);
    }
  }
  const outline = mostCommon(edge);
  return { outline, body: mostCommon(inner.filter((p) => hex(p) !== hex(outline) && luminance(p) > 0.006)) };
}

function readability(sprite: RgbaImage, frameSize: number, floor: FloorReference): Readability {
  const { outline: outlineColor, body } = characterColors(sprite, frameSize);
  const { hue, saturation } = hueSaturation(body);
  const rawDelta = Math.abs(hue - floor.hue);
  const result = {
    outline: contrastRatio(luminance(outlineColor), floor.luminance),
    body: contrastRatio(luminance(body), floor.luminance),
    hueDelta: Math.min(rawDelta, 360 - rawDelta),
    bodySaturation: saturation,
  };
  const bodyReadable =
    result.body >= READABILITY.bodyMin ||
    (result.hueDelta >= READABILITY.hueDeltaMin && result.bodySaturation >= READABILITY.bodySaturationMin);
  return { ...result, passes: result.outline >= READABILITY.outlineMin && bodyReadable };
}

const CHARACTERS = [
  ['Barbarzyńca', SPRITE_SHEETS.barbarian],
  ['Trashcan Man (Rusher)', SPRITE_SHEETS.trashcanMan],
  ['Demon Mage (Kiter)', SPRITE_SHEETS.demonMage],
  ['Sludge King (boss)', SPRITE_SHEETS.sludgeKing],
] as const;

const floorPixels = (meta.groups.floor ?? []).flatMap((name) => {
  const t = meta.tiles[name]!;
  return tilePixels(sheet, t.col, t.row);
});
const floor = floorReference(floorPixels);

describe('czytelność postaci na podłodze (STYLEGUIDE §6a)', () => {
  it('podłoga ma bazy do porównania', () => {
    expect(floorPixels.length).toBeGreaterThan(0);
  });

  it.each(CHARACTERS)('%s: obrys ≥ 2:1, ciało ≥ 1,5:1 albo wyraźnie inna barwa', (_name, def) => {
    const r = readability(readPng(`${ROOT}public/${def.url}`), def.frameWidth, floor);
    expect(r.outline).toBeGreaterThanOrEqual(READABILITY.outlineMin);
    expect(r.passes, JSON.stringify(r)).toBe(true);
  });

  it.each(CHARACTERS)('%s: na bruku korytarza te same progi (krok 19b)', (_name, def) => {
    const cobblePixels = (meta.groups.floorCobble ?? []).flatMap((name) => {
      const t = meta.tiles[name]!;
      return tilePixels(sheet, t.col, t.row);
    });
    expect(cobblePixels.length).toBeGreaterThan(0);
    const r = readability(readPng(`${ROOT}public/${def.url}`), def.frameWidth, floorReference(cobblePixels));
    expect(r.outline).toBeGreaterThanOrEqual(READABILITY.outlineMin);
    expect(r.passes, JSON.stringify(r)).toBe(true);
  });

  it('progi rozróżniają: arkusz v1 (tools/reference) ich nie spełnia', () => {
    // v1 nie ma grup w JSON-ie; czyste bazy podłogi to kolumny 0–2 wiersza 0.
    const v1 = readPng(`${ROOT}tools/reference/tower-ruins_tileset_v1.png`);
    const v1Floor = floorReference([0, 1, 2].flatMap((col) => tilePixels(v1, col, 0)));
    const failing = CHARACTERS.filter(([, def]) => !readability(readPng(`${ROOT}public/${def.url}`), def.frameWidth, v1Floor).passes);
    expect(failing.length).toBe(CHARACTERS.length);
  });
});

// ---------------- czytelność w mroku (krok 19a) ----------------

/** Nałożenie warstwy mroku o alfie `a` w kolorze `ambient` (mieszanie jak na GPU, w sRGB). */
function darken(c: Rgba, ambient: Rgba, a: number): Rgba {
  const mix = (i: 0 | 1 | 2) => Math.round(c[i] * (1 - a) + ambient[i] * a);
  return [mix(0), mix(1), mix(2), c[3]];
}

function hexToRgba(value: string): Rgba {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255];
}

describe('czytelność w mroku: limit przyciemnienia kadru (krok 19a)', () => {
  const ambient = hexToRgba(meta.colors.ambient);
  const outlineRatioAt = (a: number, def: (typeof CHARACTERS)[number][1]) => {
    const floorY = floorPixels.reduce((sum, p) => sum + luminance(darken(p, ambient, a)), 0) / floorPixels.length;
    const { outline } = characterColors(readPng(`${ROOT}public/${def.url}`), def.frameWidth);
    return contrastRatio(luminance(darken(outline, ambient, a)), floorY);
  };

  it('kolor mroku pochodzi z palety i jest ciemny (nie czysta czerń)', () => {
    expect(meta.colors.ambient).toMatch(/^#[0-9a-f]{6}$/);
    expect(meta.colors.ambient).not.toBe('#000000');
    expect(luminance(ambient)).toBeLessThan(0.01);
  });

  // Strefa walki: prostokąt, z którego wróg może atakować (reguła widoku, krok 18). Mrok jest
  // promienisty i rośnie z odległością, więc najmocniejszy jest w narożniku tego prostokąta.
  const combatZoneDarkness = ambientDarkness(Math.hypot(GUARANTEED_VIEW_HALF.x, GUARANTEED_VIEW_HALF.y), LIGHTING.ambient);

  it.each(CHARACTERS)('%s: w całej strefie walki obrys nadal ≥ 2:1', (_name, def) => {
    expect(combatZoneDarkness).toBeLessThan(LIGHTING.ambient.maxDarkness);
    expect(outlineRatioAt(combatZoneDarkness, def)).toBeGreaterThanOrEqual(READABILITY.outlineMin);
  });

  it('pełne 30% mroku tylko przy krawędziach kadru (winieta), nigdy więcej', () => {
    const frameCorner = Math.hypot(GAME_WIDTH / (2 * CAMERA_CONFIG.zoom) + CAMERA_CONFIG.deadzoneWidth / 2, GAME_HEIGHT / (2 * CAMERA_CONFIG.zoom) + CAMERA_CONFIG.deadzoneHeight / 2);
    expect(ambientDarkness(frameCorner, LIGHTING.ambient)).toBe(LIGHTING.ambient.maxDarkness);
    expect(ambientDarkness(10_000, LIGHTING.ambient)).toBe(0.3);
  });

  it('próg rozróżnia: przy limicie 30% w strefie walki obrys spadłby poniżej 2:1', () => {
    const failing = CHARACTERS.filter(([, def]) => outlineRatioAt(LIGHTING.ambient.maxDarkness, def) < READABILITY.outlineMin);
    expect(failing.length).toBeGreaterThan(0);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ItemKind } from '@/core/lootTypes';
import { ITEM_DEFINITIONS, ITEM_POOL } from '@/config/lootConfig';
import { LOOT_ANIMATIONS, LOOT_ATLAS, LOOT_FRAMES, itemFrames } from '@/config/spriteConfig';
import type { Rgba } from '../helpers/png';
import { pixel, readPng } from '../helpers/png';
import { evaluateReadability, floorReference, hex, spriteColors } from '../helpers/readability';
import { TILESETS_DIR, loadTileset } from '../helpers/tileset';

/** Atlas łupów z generatora (tools/loot_sprites.py, krok 20): zgodność z PNG, kompletność, czytelność. */
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
}
interface Atlas {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number }; items: Record<string, string> };
}

const atlas = JSON.parse(readFileSync(PUBLIC + LOOT_ATLAS.atlasUrl, 'utf8')) as Atlas;
const image = readPng(PUBLIC + LOOT_ATLAS.textureUrl);
const rectOf = (name: string) => {
  const f = atlas.frames[name];
  if (!f) throw new Error(`brak klatki ${name}`);
  return { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h };
};
const framePixels = (name: string): Rgba[] => {
  const r = rectOf(name);
  const out: Rgba[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(pixel(image, x, y));
  return out;
};

/** Wszystkie klatki, których używa gra. */
const USED_FRAMES = [
  ...Object.values(LOOT_FRAMES).flat(),
  ...ITEM_POOL.flatMap((item) => itemFrames(item.id, item.kind)),
];

describe('atlas łupów: zgodność z PNG', () => {
  it('rozmiar z meta = wymiary PNG, ścieżka obrazu z konfiguracji', () => {
    expect({ w: image.width, h: image.height }).toEqual(atlas.meta.size);
    expect(LOOT_ATLAS.textureUrl.endsWith(atlas.meta.image)).toBe(true);
  });

  it('każda klatka mieści się w obrazie i nie jest pusta; tylko piksele pełne (alfa 0/255)', () => {
    for (const name of Object.keys(atlas.frames)) {
      const r = rectOf(name);
      expect(r.x + r.w, name).toBeLessThanOrEqual(image.width);
      expect(r.y + r.h, name).toBeLessThanOrEqual(image.height);
      const px = framePixels(name);
      expect(px.some((p) => p[3] > 0), `${name}: pusta`).toBe(true);
      for (const p of px) expect([0, 255], name).toContain(p[3]);
    }
  });

  it('gra używa tylko istniejących klatek (łupy, pociski, znacznik, kapliczka, ikony przedmiotów)', () => {
    for (const name of USED_FRAMES) expect(atlas.frames, name).toHaveProperty(name);
  });

  it('animacje mają 4 klatki (6 kl./s), znacznik celowania 8 kierunków', () => {
    for (const frames of Object.values(LOOT_ANIMATIONS)) expect(frames).toHaveLength(4);
    expect(LOOT_FRAMES.aim).toHaveLength(8);
    expect(LOOT_ATLAS.fps).toBe(6);
  });
});

describe('ikony przedmiotów', () => {
  it('każdy z 12 przedmiotów ma ikonę; bazowe statyczne, z efektem 4 klatki iskry', () => {
    expect(ITEM_POOL).toHaveLength(12);
    for (const item of ITEM_POOL) {
      expect(itemFrames(item.id, item.kind)).toHaveLength(item.kind === ItemKind.Effect ? 4 : 1);
    }
  });

  it('ikony są różne (żadne dwa przedmioty nie wyglądają tak samo)', () => {
    const signatures = ITEM_POOL.map((item) => framePixels(itemFrames(item.id, item.kind)[0]!).map(hex).join(''));
    expect(new Set(signatures).size).toBe(ITEM_POOL.length);
  });

  it('kolory przedmiotów w generatorze = kolory z lootConfig (HUD i ikona mówią tym samym kolorem)', () => {
    for (const item of ITEM_POOL) {
      const expected = `#${ITEM_DEFINITIONS[item.id].color.toString(16).padStart(6, '0')}`;
      expect(atlas.meta.items[item.id], item.id).toBe(expected);
    }
  });

  it('przedmioty z efektem mają złotą obwódkę, bazowe ciemny obrys', () => {
    for (const item of ITEM_POOL) {
      const { outline } = spriteColors(image, rectOf(itemFrames(item.id, item.kind)[0]!));
      if (item.kind === ItemKind.Effect) expect(hex(outline), item.id).toBe('#d4a83a');
      else expect(hex(outline), item.id).toBe('#1b1a22');
    }
  });
});

describe('czytelność łupów na podłodze (progi STYLEGUIDE §6a)', () => {
  const tileset = loadTileset();
  const sheet = readPng(TILESETS_DIR + tileset.image);
  const groundPixels = (group: string) =>
    (tileset.groups[group] ?? []).flatMap((name) => {
      const t = tileset.tiles[name]!;
      const out: Rgba[] = [];
      for (let y = t.row * 32; y < t.row * 32 + 32; y++) for (let x = t.col * 32; x < t.col * 32 + 32; x++) out.push(pixel(sheet, x, y));
      return out;
    });
  const grounds = [
    ['płyty', floorReference(groundPixels('floor'))],
    ['bruk', floorReference(groundPixels('floorCobble'))],
  ] as const;
  const LOOT = [
    LOOT_FRAMES.coin[0]!,
    LOOT_FRAMES.potion[0]!,
    LOOT_FRAMES.shot[0]!,
    LOOT_FRAMES.shrineActive[0]!,
    ...ITEM_POOL.map((item) => itemFrames(item.id, item.kind)[0]!),
  ];

  it.each(LOOT)('%s: obrys ≥ 2:1 i czytelne ciało na płytach i na bruku', (name) => {
    const colors = spriteColors(image, rectOf(name));
    for (const [ground, floor] of grounds) {
      const r = evaluateReadability(colors, floor);
      expect(r.passes, `${ground}: ${JSON.stringify(r)}`).toBe(true);
    }
  });
});

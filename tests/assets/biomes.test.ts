import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId, biomeForFloor } from '@/config/biomeConfig';
import { FLOOR_DRESSING } from '@/config/dressingConfig';
import { LIGHTING } from '@/config/lightingConfig';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import type { FloorDressingConfig } from '@/config/dressingConfig';
import type { TilesetMeta } from '@/core/tilesetTypes';
import type { Rgba, RgbaImage } from '../helpers/png';
import { pixel, readPng } from '../helpers/png';
import { loadTileset } from '../helpers/tileset';
import { evaluateReadability, floorReference, spriteColors } from '../helpers/readability';

/** Biomy (krok 23a): wybór per piętro, kompletność arkuszy i czytelność postaci biomu na jego podłodze. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const fileOf = (url: string) => url.split('/').at(-1)!;

const biomes = Object.values(BIOMES).map((biome) => [biome.name, biome] as const);

/** Wszystkie grupy kafli, których używa konfiguracja dekorowania. */
function dressingGroups(d: FloorDressingConfig): string[] {
  return [
    d.floorGroup,
    d.floorMacroGroup,
    d.corridorGroup,
    d.longCrackGroup,
    d.archGroup,
    d.wallFace.group,
    d.cobweb.nwGroup,
    d.cobweb.neGroup,
    ...Object.keys(d.decalGroupWeights),
    ...Object.values(d.dust).map((side) => side.group),
    ...Object.values(d.combatDecals.groups),
  ];
}

function groupPixels(meta: TilesetMeta, sheet: RgbaImage, group: string): Rgba[] {
  return (meta.groups[group] ?? []).flatMap((name) => {
    const t = meta.tiles[name]!;
    const out: Rgba[] = [];
    for (let y = t.row * TILE_SIZE; y < (t.row + 1) * TILE_SIZE; y++) {
      for (let x = t.col * TILE_SIZE; x < (t.col + 1) * TILE_SIZE; x++) out.push(pixel(sheet, x, y));
    }
    return out;
  });
}

describe('biomy: wybór piętra', () => {
  it('biom = jedno piętro: 2 leże, 3 Grzybnia, reszta to ruiny', () => {
    expect(biomeForFloor(2).id).toBe(BiomeId.SpiderLair);
    expect(biomeForFloor(3).id).toBe(BiomeId.FungalGrove);
    for (const floor of [1, 4, 9]) expect(biomeForFloor(floor).id).toBe(BiomeId.TowerRuins);
  });

  it('każdy biom ma własne klucze tekstur i animacji pochodni', () => {
    const keys = Object.values(BIOMES).flatMap(({ tileset }) => [tileset.imageKey, tileset.jsonKey, tileset.sheetKey, tileset.torchAnimation]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe.each(biomes)('arkusz biomu: %s', (_name, biome) => {
  const meta = loadTileset(fileOf(biome.tileset.jsonUrl));
  const sheet = readPng(`${ROOT}public/${biome.tileset.imageUrl}`);

  it('JSON i PNG pasują do siebie i do formatu gry', () => {
    expect(fileOf(biome.tileset.imageUrl)).toBe(meta.image);
    expect(meta.version).toBe(biome.tileset.version);
    expect(meta.tileSize).toBe(TILE_SIZE);
    expect({ width: sheet.width, height: sheet.height }).toEqual({ width: meta.columns * TILE_SIZE, height: meta.rows * TILE_SIZE });
  });

  it('ma wszystkie grupy i kafle, których używa dekorowanie biomu', () => {
    for (const group of dressingGroups(biome.dressing)) {
      expect(meta.groups[group]?.length ?? 0, group).toBeGreaterThan(0);
    }
    for (const name of [...Object.values(biome.dressing.stairsTiles), ...Object.values(biome.dressing.gateTiles).flatMap(Object.values)]) {
      expect(meta.tiles[name], name).toBeDefined();
    }
    expect(meta.tiles.torch_sconce).toBeDefined();
    expect(meta.groups.torchFlame?.length).toBe(4);
  });
});

describe('pajęcze leże', () => {
  const lair = BIOMES[BiomeId.SpiderLair];
  const meta = loadTileset(fileOf(lair.tileset.jsonUrl));
  const sheet = readPng(`${ROOT}public/${lair.tileset.imageUrl}`);

  it('ma własne dekoracje: jaja i nici na licu, pancerzyki; gęstsze pajęczyny niż ruiny', () => {
    expect(meta.groups['wallFace.lair']).toEqual(expect.arrayContaining(['face_eggs', 'face_webdrape']));
    expect(meta.groups['decal.husk']?.length).toBeGreaterThan(0);
    expect(lair.dressing.cobweb.chance).toBeGreaterThan(FLOOR_DRESSING.cobweb.chance);
  });

  it('bez dekoracji, które udają elementy rozgrywki (pajęczyna lub kokon na podłodze)', () => {
    const floorDecor = Object.keys(meta.groups).filter((group) => group.startsWith('decal.'));
    expect(floorDecor.some((group) => /web|cocoon|kokon/i.test(group))).toBe(false);
  });

  // Postacie piętra 2: bohater, pająk (Rusher), nietoperz (Kiter), Matka Pająków i pajączek.
  const CHARACTERS = [
    ['Barbarzyńca', SPRITE_SHEETS.barbarian],
    ['Pająk jaskiniowy', SPRITE_SHEETS.caveSpider],
    ['Nietoperz', SPRITE_SHEETS.bat],
    ['Matka Pająków', SPRITE_SHEETS.spiderQueen],
    ['Pajączek', SPRITE_SHEETS.spiderling],
  ] as const;

  it.each(CHARACTERS)('%s: czytelny na podłodze i bruku leża (STYLEGUIDE §6a)', (_name, def) => {
    const img = readPng(`${ROOT}public/${def.url}`);
    const colors = spriteColors(img, { x: 0, y: 4 * def.frameHeight, w: def.frameWidth, h: def.frameHeight });
    for (const group of [lair.dressing.floorGroup, lair.dressing.corridorGroup]) {
      const r = evaluateReadability(colors, floorReference(groupPixels(meta, sheet, group)));
      expect(r.passes, `${group}: ${JSON.stringify(r)}`).toBe(true);
    }
  });
});

describe('Grzybnia (krok 28a)', () => {
  const grove = BIOMES[BiomeId.FungalGrove];
  const meta = loadTileset(fileOf(grove.tileset.jsonUrl));
  const sheet = readPng(`${ROOT}public/${grove.tileset.imageUrl}`);

  it('ma własne dekoracje: grzyby półkowe i strzępki na licu, kępki grzybów i grzybnię; pancerzyki z leża', () => {
    expect(meta.groups['wallFace.fungus']).toEqual(expect.arrayContaining(['face_shelf', 'face_hyphae']));
    for (const group of ['decal.mushrooms', 'decal.mycel', 'decal.husk']) expect(meta.groups[group]?.length, group).toBeGreaterThan(0);
    expect(grove.dressing.wallFace.group).toBe('wallFace.fungus');
  });

  it('mgła: jasny ton (nie czerń jak w „Mroku”), wyraźny widok przy bohaterze, gęstsza niż zwykły mrok', () => {
    const fog = grove.fog!;
    const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
    expect(lum(fog.color)).toBeGreaterThan(lum(parseInt(meta.colors.ambient.slice(1), 16)) * 2);
    expect(fog.profile.fullLightRadius).toBeGreaterThanOrEqual(TILE_SIZE * 2);
    expect(fog.profile.maxDarkness).toBeGreaterThan(LIGHTING.ambient.maxDarkness);
    expect(fog.profile.maxDarkness).toBeLessThan(LIGHTING.darknessModifier.maxDarkness);
    expect(fog.wisps.alpha).toBeLessThan(0.25);
  });

  it('pozostałe biomy bez mgły', () => {
    for (const biome of Object.values(BIOMES)) if (biome.id !== BiomeId.FungalGrove) expect(biome.fog).toBeNull();
  });

  // Postacie piętra 3: bohater, zarażony pająk (Rusher), grzybiec (Kiter, krok 28b), Król Pająków (krok 29).
  const CHARACTERS = [
    ['Barbarzyńca', SPRITE_SHEETS.barbarian],
    ['Zarażony pająk', SPRITE_SHEETS.infectedSpider],
    ['Grzybiec', SPRITE_SHEETS.fungoid],
    ['Król Pająków', SPRITE_SHEETS.spiderKing],
  ] as const;

  it.each(CHARACTERS)('%s: czytelny na podłodze i bruku Grzybni (STYLEGUIDE §6a)', (_name, def) => {
    const img = readPng(`${ROOT}public/${def.url}`);
    const colors = spriteColors(img, { x: 0, y: 4 * def.frameHeight, w: def.frameWidth, h: def.frameHeight });
    for (const group of [grove.dressing.floorGroup, grove.dressing.corridorGroup]) {
      const r = evaluateReadability(colors, floorReference(groupPixels(meta, sheet, group)));
      expect(r.passes, `${group}: ${JSON.stringify(r)}`).toBe(true);
    }
  });
});

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
    ...(d.largeDecals ?? []).map((large) => large.group),
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
  it('biomy: 2 Grzybnia (pajęczy duet), 3 Cmentarzysko, 4 Piekło, 5 palarnia, 6 Lustrzana komnata, 7 Bociani Ogród, 1 ruiny; potem kolejny krąg (kroki 43, 83, 124, 127, 134, 137, 154)', () => {
    expect(biomeForFloor(2).id).toBe(BiomeId.FungalGrove);
    expect(biomeForFloor(3).id).toBe(BiomeId.Graveyard);
    expect(biomeForFloor(4).id).toBe(BiomeId.Infernal);
    expect(biomeForFloor(5).id).toBe(BiomeId.SmokeDen);
    expect(biomeForFloor(6).id).toBe(BiomeId.MirrorHall);
    expect(biomeForFloor(7).id).toBe(BiomeId.StorkGarden);
    for (const floor of [1, 8, 15]) expect(biomeForFloor(floor).id).toBe(BiomeId.TowerRuins);
    expect(biomeForFloor(9).id).toBe(BiomeId.FungalGrove);
    expect(biomeForFloor(13).id).toBe(BiomeId.MirrorHall);
    expect(biomeForFloor(14).id).toBe(BiomeId.StorkGarden);
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

describe('Lustrzana komnata (krok 124)', () => {
  const hall = BIOMES[BiomeId.MirrorHall];
  const meta = loadTileset(fileOf(hall.tileset.jsonUrl));

  it('ma lustrzaną posadzkę, własne lica i nakładki; bez mgły (posadzka świeci)', () => {
    expect(hall.mirrorFloor).toBeTruthy();
    expect(hall.fog).toBeNull();
    expect(hall.dressing.wallFace.group).toBe('wallFace.mirror');
    for (const group of ['decal.shards', 'decal.slop', 'decal.suds']) expect(meta.groups[group]?.length, group).toBeGreaterThan(0);
    expect(hall.dressing.nest?.decals?.group).toBe('decal.suds');
  });

  it('odbicie gaśnie ku dołowi, a inne biomy go nie mają', () => {
    const r = hall.mirrorFloor!.reflection;
    expect(r.alphaNear).toBeGreaterThan(r.alphaFar);
    expect(r.alphaNear).toBeLessThanOrEqual(0.5);
    expect(Object.values(BIOMES).filter((b) => b.mirrorFloor).map((b) => b.id)).toEqual([BiomeId.MirrorHall]);
  });
});

describe('Bociani Ogród (krok 137)', () => {
  const garden = BIOMES[BiomeId.StorkGarden];
  const meta = loadTileset(fileOf(garden.tileset.jsonUrl));

  it('noc: najgęstszy mrok kręgu, własne lica i nakładki; ku arenie pióra', () => {
    const others = Object.values(BIOMES).filter((b) => b.fog && b.id !== BiomeId.StorkGarden);
    for (const other of others) expect(garden.fog!.profile.maxDarkness).toBeGreaterThanOrEqual(other.fog!.profile.maxDarkness);
    expect(garden.dressing.wallFace.group).toBe('wallFace.garden');
    for (const group of ['decal.grass', 'decal.mud', 'decal.flowers', 'decal.feathers', 'wallFace.garden']) {
      expect(meta.groups[group]?.length, group).toBeGreaterThan(0);
    }
    expect(garden.dressing.nest?.decals?.group).toBe('decal.feathers');
  });

  it('zapowiedź piętro niżej: pióra na posadzce Lustrzanej komnaty', () => {
    const hall = BIOMES[BiomeId.MirrorHall];
    expect(hall.dressing.decalGroupWeights['decal.feathers']).toBeGreaterThan(0);
    expect(loadTileset(fileOf(hall.tileset.jsonUrl)).groups['decal.feathers']?.length).toBeGreaterThan(0);
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

  it('ruiny i leże bez mgły', () => {
    expect(BIOMES[BiomeId.TowerRuins].fog).toBeNull();
    expect(BIOMES[BiomeId.SpiderLair].fog).toBeNull();
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

describe('Cmentarzysko (krok 32a)', () => {
  const grave = BIOMES[BiomeId.Graveyard];
  const grove = BIOMES[BiomeId.FungalGrove];
  const meta = loadTileset(fileOf(grave.tileset.jsonUrl));
  const sheet = readPng(`${ROOT}public/${grave.tileset.imageUrl}`);

  it('ma własne dekoracje: nisze, kostnicę i epitafia na licu; kości, świeczki, płyty nagrobne i zwłoki', () => {
    expect(meta.groups['wallFace.grave']).toEqual(expect.arrayContaining(['face_niche', 'face_skulls', 'face_epitaph']));
    for (const group of ['decal.bones', 'decal.candles', 'decal.mycelFaint', 'decal.graveSlab', 'decal.corpse']) {
      expect(meta.groups[group]?.length, group).toBeGreaterThan(0);
    }
    expect(meta.tiles.decal_grave_slab_1x2).toMatchObject({ w: 1, h: 2 });
    expect(meta.tiles.decal_corpse_2x1).toMatchObject({ w: 2, h: 1 });
  });

  it('zwłoki zawsze leżą w poprzek (2×1) — pionowe z góry wyglądałyby jak stojąca postać', () => {
    for (const name of meta.groups['decal.corpse'] ?? []) expect(meta.tiles[name]).toMatchObject({ w: 2, h: 1 });
  });

  it('grzyb ledwo dociera: bez pleśni i kępek grzybów Grzybni, grzybnia rzadka', () => {
    const weights = grave.dressing.decalGroupWeights;
    expect(weights['decal.mold']).toBeUndefined();
    expect(weights['decal.mushrooms']).toBeUndefined();
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect((weights['decal.mycelFaint'] ?? 0) / total).toBeLessThan(0.15);
  });

  it('mgiełka: mroczniejsza niż Grzybnia, ale z szerszym widokiem przy bohaterze; słabsza niż „Mrok”', () => {
    const mist = grave.fog!;
    const fog = grove.fog!;
    const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
    expect(lum(mist.color)).toBeLessThan(lum(fog.color));
    expect(mist.profile.maxDarkness).toBeGreaterThan(fog.profile.maxDarkness);
    expect(mist.profile.maxDarkness).toBeLessThan(LIGHTING.darknessModifier.maxDarkness);
    expect(mist.profile.fullLightRadius).toBeGreaterThan(fog.profile.fullLightRadius);
    expect(mist.wisps.alpha).toBeLessThan(fog.wisps.alpha);
  });

  // Postacie piętra 4: bohater, zarażony (Rusher) i siewca (Kiter) z kroku 32b.
  const CHARACTERS = [
    ['Barbarzyńca', SPRITE_SHEETS.barbarian],
    ['Zarażony', SPRITE_SHEETS.zombie],
    ['Siewca', SPRITE_SHEETS.sower],
  ] as const;

  it.each(CHARACTERS)('%s: czytelny na podłodze i bruku Cmentarzyska (STYLEGUIDE §6a)', (_name, def) => {
    const img = readPng(`${ROOT}public/${def.url}`);
    const colors = spriteColors(img, { x: 0, y: 4 * def.frameHeight, w: def.frameWidth, h: def.frameHeight });
    for (const group of [grave.dressing.floorGroup, grave.dressing.corridorGroup]) {
      const r = evaluateReadability(colors, floorReference(groupPixels(meta, sheet, group)));
      expect(r.passes, `${group}: ${JSON.stringify(r)}`).toBe(true);
    }
  });
});

describe('Piekło (krok 41a)', () => {
  const hell = BIOMES[BiomeId.Infernal];
  const grave = BIOMES[BiomeId.Graveyard];
  const meta = loadTileset(fileOf(hell.tileset.jsonUrl));
  const sheet = readPng(`${ROOT}public/${hell.tileset.imageUrl}`);

  it('ma własne dekoracje: okowy, czaszki na kolcach i żar na licu; szczeliny z żarem, krew, kości i pieczęć 2×2', () => {
    expect(meta.groups['wallFace.infernal']).toEqual(expect.arrayContaining(['face_chains', 'face_skull_spike', 'face_lava_seep']));
    for (const group of ['decal.ember', 'decal.blood', 'decal.bones', 'decal.sigil']) {
      expect(meta.groups[group]?.length, group).toBeGreaterThan(0);
    }
    expect(meta.tiles.decal_sigil_2x2).toMatchObject({ w: 2, h: 2 });
  });

  it('bez pajęczyn — za gorąco', () => {
    expect(hell.dressing.cobweb.chance).toBe(0);
  });

  it('mrok żaru: ciemniejszy niż mgiełka Cmentarzyska (każdy biom mroczniejszy), słabszy niż „Mrok”; iskry lecą w górę', () => {
    const haze = hell.fog!;
    const mist = grave.fog!;
    expect(haze.profile.maxDarkness).toBeGreaterThan(mist.profile.maxDarkness);
    expect(haze.profile.maxDarkness).toBeLessThan(LIGHTING.darknessModifier.maxDarkness);
    expect(haze.profile.fullLightRadius).toBeGreaterThanOrEqual(mist.profile.fullLightRadius);
    expect(haze.motes.gravityY).toBeLessThan(0);
  });

  // Postacie pięter 5–6: obaj bohaterowie i wrogowie Piekła (krok 41d).
  const CHARACTERS = [
    ['Barbarzyńca', SPRITE_SHEETS.barbarian],
    ['Czarodziejka', SPRITE_SHEETS.sorceress],
    ['Piekielny ogar', SPRITE_SHEETS.hellhound],
    ['Kultysta popiołu', SPRITE_SHEETS.cultist],
  ] as const;

  it.each(CHARACTERS)('%s: czytelny na podłodze i bruku piekła (STYLEGUIDE §6a)', (_name, def) => {
    const img = readPng(`${ROOT}public/${def.url}`);
    const colors = spriteColors(img, { x: 0, y: 4 * def.frameHeight, w: def.frameWidth, h: def.frameHeight });
    for (const group of [hell.dressing.floorGroup, hell.dressing.corridorGroup]) {
      const r = evaluateReadability(colors, floorReference(groupPixels(meta, sheet, group)));
      expect(r.passes, `${group}: ${JSON.stringify(r)}`).toBe(true);
    }
  });
});

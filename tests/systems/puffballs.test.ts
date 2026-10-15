import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EnemyVariant } from '@/core/combatTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { ENEMY_VARIANTS, PLAYER_COMBAT, PLAYER_STATUS_RESISTANCE } from '@/config/combatConfig';
import { PLAYER_BASE_STATS, PLAYER_SIZE } from '@/config/gameConfig';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { planCocoons } from '@/dungeon/CocoonPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { CocoonPhase, CocoonState } from '@/systems/Cocoons';
import { isInPoisonCloud, poisonCloudRadius } from '@/systems/Puffballs';
import { StatusEffects } from '@/systems/StatusEffects';
import { sampleFloors } from '../helpers/floors';
import { pixel, readPng } from '../helpers/png';

const CONFIG = BIOMES[BiomeId.FungalGrove].puffballs!;
const CLOUD = CONFIG.cloud;
const SELF = { x: 100, y: 100 };
const FRAME = 16;

describe('Purchawki — tylko w Grzybni (krok 28c)', () => {
  it('Grzybnia ma purchawki, ruiny i leże nie', () => {
    expect(CONFIG).not.toBeNull();
    expect(BIOMES[BiomeId.TowerRuins].puffballs).toBeNull();
    expect(BIOMES[BiomeId.SpiderLair].puffballs).toBeNull();
  });

  it('rozmieszczenie: podłoga zwykłych pokojów, odstępy, limit na pokój, każdy pokój coś ma', () => {
    const floors = sampleFloors([3], 40);
    let rooms = 0;
    let withPuffballs = 0;
    floors.forEach((floor, i) => {
      const tiles = planCocoons(floor, CONFIG, createRng(i));
      for (const tile of tiles) {
        expect(floor.tiles[tile.y * floor.width + tile.x]).toBe(TileType.Floor);
        expect(floor.rooms.find((r) => roomContainsTile(r, tile))!.kind).toBe(RoomKind.Normal);
      }
      for (const room of floor.rooms.filter((r) => r.kind === RoomKind.Normal)) {
        const inRoom = tiles.filter((t) => roomContainsTile(room, t)).length;
        expect(inRoom).toBeLessThanOrEqual(CONFIG.perRoom.max);
        rooms++;
        if (inRoom > 0) withPuffballs++;
      }
    });
    // perRoom.min = 1: prawie każdy pokój ma purchawkę (poza bardzo małymi, gdzie nie ma miejsca).
    expect(withPuffballs / rooms).toBeGreaterThan(0.9);
  });
});

describe('Zapalnik purchawki (wspólny z kokonem)', () => {
  it('podejście budzi, pęknięcie raz po fuseMs; trafienie rozrywa od razu', () => {
    const near = new CocoonState(CONFIG);
    expect(near.update(SELF, { x: SELF.x + CONFIG.triggerRadius, y: SELF.y }, 1000)).toBe(false);
    expect(near.burstAt).toBe(1000 + CONFIG.fuseMs);
    let bursts = 0;
    for (let now = 1000; now < 4000; now += FRAME) if (near.update(SELF, null, now)) bursts++;
    expect(bursts).toBe(1);

    const far = new CocoonState(CONFIG);
    expect(far.update(SELF, { x: SELF.x + CONFIG.triggerRadius + 1, y: SELF.y }, 0)).toBe(false);
    expect(far.currentPhase).toBe(CocoonPhase.Dormant);
    expect(far.hit(10)).toBe(true);
    expect(far.currentPhase).toBe(CocoonPhase.Burst);
  });
});

describe('Trująca chmura', () => {
  it('rośnie od startRadius do maxRadius przez spreadMs, wisi durationMs i znika', () => {
    expect(poisonCloudRadius(CLOUD, 1000, 999)).toBe(0);
    expect(poisonCloudRadius(CLOUD, 1000, 1000)).toBe(CLOUD.startRadius);
    expect(poisonCloudRadius(CLOUD, 1000, 1000 + CLOUD.spreadMs / 2)).toBeCloseTo((CLOUD.startRadius + CLOUD.maxRadius) / 2);
    expect(poisonCloudRadius(CLOUD, 1000, 1000 + CLOUD.spreadMs)).toBe(CLOUD.maxRadius);
    expect(poisonCloudRadius(CLOUD, 1000, 1000 + CLOUD.durationMs - 1)).toBe(CLOUD.maxRadius);
    expect(poisonCloudRadius(CLOUD, 1000, 1000 + CLOUD.durationMs)).toBe(0);
  });

  it('liczy się środek gracza w chmurze', () => {
    const now = CLOUD.spreadMs;
    expect(isInPoisonCloud(CLOUD, SELF, 0, { x: SELF.x + CLOUD.maxRadius, y: SELF.y }, now)).toBe(true);
    expect(isInPoisonCloud(CLOUD, SELF, 0, { x: SELF.x + CLOUD.maxRadius + 1, y: SELF.y }, now)).toBe(false);
    expect(isInPoisonCloud(CLOUD, SELF, 0, SELF, CLOUD.durationMs)).toBe(false);
  });

  it('trucizna odnawiana co klatkę tyka równo i truje jeszcze po wyjściu', () => {
    const status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
    const { tickDamage, tickMs, durationMs } = CLOUD.poison;
    let damage = 0;
    // 2 s w chmurze, potem wyjście.
    for (let now = 0; now <= 2000; now += FRAME) {
      status.apply({ poison: CLOUD.poison }, now);
      damage += status.takePoisonDamage(now);
    }
    expect(damage).toBe(tickDamage * Math.floor(2000 / tickMs));
    let after = 0;
    for (let now = 2000 + FRAME; now <= 2000 + durationMs + 500; now += FRAME) after += status.takePoisonDamage(now);
    expect(after).toBeGreaterThan(0);
    expect(status.isPoisoned(2000 + durationMs + 1)).toBe(false);
  });
});

describe('Purchawka — balans', () => {
  it('uważny gracz (reakcja ~200 ms) wyjdzie chodem poza chmurę, zanim urośnie', () => {
    const REACTION_MS = 200;
    // Gracz stoi na granicy budzenia; po pęknięciu chmura rośnie jeszcze przez spreadMs.
    const walked = (PLAYER_BASE_STATS.moveSpeed * (CONFIG.fuseMs - REACTION_MS + CLOUD.spreadMs)) / 1000;
    expect(CONFIG.triggerRadius + walked).toBeGreaterThan(CLOUD.maxRadius);
  });

  it('dash przelatuje przez całą chmurę', () => {
    const { speed, durationMs } = PLAYER_COMBAT.dash;
    expect((speed * durationMs) / 1000).toBeGreaterThan(CLOUD.maxRadius);
  });

  it('strzał rozbraja purchawkę spoza pełnej chmury', () => {
    const { projectileSpeed, projectileLifetimeMs } = PLAYER_COMBAT.ranged;
    expect((projectileSpeed * projectileLifetimeMs) / 1000).toBeGreaterThan(CLOUD.maxRadius + PLAYER_SIZE);
  });

  it('trucizna chmury nie mocniejsza niż trucizna zarażonego pająka (pułapka, nie boss)', () => {
    const spiderPoison = ENEMY_VARIANTS[EnemyVariant.InfectedSpider].attack?.status?.poison;
    expect(spiderPoison).toBeDefined();
    expect(CLOUD.poison.tickDamage / CLOUD.poison.tickMs).toBeLessThanOrEqual(spiderPoison!.tickDamage / spiderPoison!.tickMs);
  });
});

describe('Sprite chmury zgodny z hitboxem', () => {
  it('promień rysunku w klatkach rozrostu = startRadius … maxRadius (±3 px)', () => {
    const sheet = SPRITE_SHEETS.poisonCloud;
    const png = readPng(fileURLToPath(new URL(`../../public/${sheet.url}`, import.meta.url)));
    const frames = sheet.animations.grow.frames;
    frames.forEach((column, i) => {
      const expected = CLOUD.startRadius + ((CLOUD.maxRadius - CLOUD.startRadius) * i) / (frames.length - 1);
      const c = sheet.frameWidth / 2;
      let maxDist = 0;
      for (let y = 0; y < sheet.frameHeight; y++) {
        for (let x = 0; x < sheet.frameWidth; x++) {
          if (pixel(png, column * sheet.frameWidth + x, y)[3] === 0) continue;
          maxDist = Math.max(maxDist, Math.hypot(x + 0.5 - c, y + 0.5 - c));
        }
      }
      expect(Math.abs(maxDist - expected)).toBeLessThanOrEqual(3);
    });
  });
});

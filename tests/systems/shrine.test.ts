import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { ITEM_POOL, SHRINE_CONFIG } from '@/config/lootConfig';
import { planShrineLocation } from '@/dungeon/ShrinePlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { scaleForFloor } from '@/systems/CombatMath';
import { NEW_RUN, RunState } from '@/systems/RunState';
import type { OfferingInput } from '@/systems/Shrine';
import { ShrineRefusal, makeOffering, shrineCost } from '@/systems/Shrine';
import { floorFromAscii, room, sampleFloors } from '../helpers/floors';

const offering = (overrides: Partial<OfferingInput> = {}): OfferingInput => ({
  gold: 100,
  floor: 1,
  alreadyUsed: false,
  config: SHRINE_CONFIG,
  pool: ITEM_POOL,
  rng: createRng(1),
  ...overrides,
});

describe('shrineCost', () => {
  it('rośnie z piętrem', () => {
    expect(shrineCost(1, SHRINE_CONFIG)).toBe(SHRINE_CONFIG.baseCost);
    expect(shrineCost(4, SHRINE_CONFIG)).toBe(scaleForFloor(SHRINE_CONFIG.baseCost, 4, SHRINE_CONFIG.costPerFloor));
    expect(shrineCost(4, SHRINE_CONFIG)).toBeGreaterThan(shrineCost(1, SHRINE_CONFIG));
  });
});

describe('makeOffering', () => {
  it('przy wystarczającym złocie daje przedmiot z puli i podaje koszt', () => {
    const outcome = makeOffering(offering());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(ITEM_POOL.map((i) => i.id)).toContain(outcome.itemId);
      expect(outcome.cost).toBe(shrineCost(1, SHRINE_CONFIG));
    }
  });

  it('odmawia, gdy brakuje złota — dokładnie na granicy kosztu już wystarcza', () => {
    const cost = shrineCost(2, SHRINE_CONFIG);
    expect(makeOffering(offering({ floor: 2, gold: cost - 1 }))).toMatchObject({ ok: false, reason: ShrineRefusal.NotEnoughGold, cost });
    expect(makeOffering(offering({ floor: 2, gold: cost })).ok).toBe(true);
  });

  it('odmawia po użyciu (jedna ofiara na piętro)', () => {
    expect(makeOffering(offering({ alreadyUsed: true }))).toMatchObject({ ok: false, reason: ShrineRefusal.AlreadyUsed });
  });

  it('pusta pula → odmowa zamiast wyjątku', () => {
    expect(makeOffering(offering({ pool: [] }))).toMatchObject({ ok: false, reason: ShrineRefusal.EmptyPool });
  });

  it('z czasem daje każdy z bazowych przedmiotów', () => {
    const rng = createRng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const outcome = makeOffering(offering({ rng }));
      if (outcome.ok) seen.add(outcome.itemId);
    }
    expect(seen.size).toBe(ITEM_POOL.length);
  });
});

describe('RunState.spendGold', () => {
  it('odejmuje tylko, gdy wystarcza', () => {
    const run = new RunState({ ...NEW_RUN, gold: 20 });
    expect(run.spendGold(25)).toBe(false);
    expect(run.gold).toBe(20);
    expect(run.spendGold(15)).toBe(true);
    expect(run.gold).toBe(5);
  });
});

describe('planShrineLocation', () => {
  it('stoi na podłodze zwykłego pokoju (nie startowego i nie areny)', () => {
    sampleFloors([1, 4, 8], 30).forEach((floor, i) => {
      const tile = planShrineLocation(floor, createRng(i));
      expect(tile).not.toBeNull();
      const host = floor.rooms.find((r) => roomContainsTile(r, tile!));
      expect(host?.kind).toBe(RoomKind.Normal);
      expect(floor.tiles[tile!.y * floor.width + tile!.x]).toBe(TileType.Floor);
    });
  });

  it('brak zwykłych pokojów → brak kapliczki', () => {
    const floor = floorFromAscii(['#####', '#...#', '#####'], [room(0, 1, 1, 3, 1, RoomKind.Start)]);
    expect(planShrineLocation(floor, createRng(1))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { EnemyType } from '@/core/combatTypes';
import type { ItemDefinition, LootTable } from '@/core/lootTypes';
import { ItemId, PickupKind } from '@/core/lootTypes';
import { createRng } from '@/core/random';
import { BOSS_LOOT, ENEMY_LOOT, ITEM_DEFINITIONS, ITEM_EFFECTS, ITEM_POOL, LOOT_SCALING } from '@/config/lootConfig';
import { NO_WEAPON_EFFECTS, computeWeaponEffects } from '@/systems/WeaponEffects';
import { scaleForFloor } from '@/systems/CombatMath';
import { pickWeightedItem, rollLoot, splitGold } from '@/systems/Loot';

const NOTHING: LootTable = { gold: { min: 1, max: 1 }, goldChance: 0, healthChance: 0, healthAmount: 10, itemChance: 0 };
const EVERYTHING: LootTable = { ...NOTHING, gold: { min: 2, max: 4 }, goldChance: 1, healthChance: 1, itemChance: 1 };

describe('rollLoot', () => {
  it('szanse 0 nie dają niczego, szanse 1 dają wszystkie rodzaje', () => {
    const rng = createRng(1);
    expect(rollLoot(NOTHING, 1, LOOT_SCALING, ITEM_POOL, rng)).toEqual([]);
    const kinds = rollLoot(EVERYTHING, 1, LOOT_SCALING, ITEM_POOL, rng).map((d) => d.kind);
    expect(kinds).toEqual([PickupKind.Gold, PickupKind.Health, PickupKind.Item]);
  });

  it('złoto mieści się w zakresie tabeli i rośnie z piętrem', () => {
    const rng = createRng(2);
    for (let i = 0; i < 200; i++) {
      for (const drop of rollLoot(EVERYTHING, 1, LOOT_SCALING, ITEM_POOL, rng)) {
        if (drop.kind === PickupKind.Gold) {
          expect(drop.amount).toBeGreaterThanOrEqual(2);
          expect(drop.amount).toBeLessThanOrEqual(4);
        }
      }
    }
    const goldOnFloor = (floor: number): number => {
      const drop = rollLoot({ ...EVERYTHING, gold: { min: 10, max: 10 } }, floor, LOOT_SCALING, ITEM_POOL, createRng(3))[0];
      return drop?.kind === PickupKind.Gold ? drop.amount : 0;
    };
    expect(goldOnFloor(1)).toBe(10);
    expect(goldOnFloor(4)).toBe(scaleForFloor(10, 4, LOOT_SCALING.goldPerFloor));
  });

  it('częstość zrzutów zgadza się z szansami tabeli (statystycznie)', () => {
    const rng = createRng(4);
    const table = ENEMY_LOOT[EnemyType.Rusher];
    const n = 5000;
    const counts = { gold: 0, health: 0, item: 0 };
    for (let i = 0; i < n; i++) {
      for (const drop of rollLoot(table, 1, LOOT_SCALING, ITEM_POOL, rng)) counts[drop.kind]++;
    }
    expect(counts.gold / n).toBeCloseTo(table.goldChance, 1);
    expect(counts.health / n).toBeCloseTo(table.healthChance, 1);
    expect(counts.item / n).toBeCloseTo(table.itemChance, 1);
  });

  it('boss zawsze zostawia złoto, miksturę i przedmiot', () => {
    for (let seed = 0; seed < 50; seed++) {
      const kinds = rollLoot(BOSS_LOOT, 1, LOOT_SCALING, ITEM_POOL, createRng(seed)).map((d) => d.kind);
      expect(kinds).toEqual([PickupKind.Gold, PickupKind.Health, PickupKind.Item]);
    }
  });
});

describe('pickWeightedItem', () => {
  it('pusta pula lub zerowe wagi → null', () => {
    expect(pickWeightedItem([], createRng(1))).toBeNull();
    const zero: ItemDefinition = { ...ITEM_DEFINITIONS[ItemId.Blade], weight: 0 };
    expect(pickWeightedItem([zero], createRng(1))).toBeNull();
  });

  it('przedmiot o wadze 0 nigdy nie wypada', () => {
    const pool = [ITEM_DEFINITIONS[ItemId.Blade], { ...ITEM_DEFINITIONS[ItemId.Heart], weight: 0 }];
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) expect(pickWeightedItem(pool, rng)).toBe(ItemId.Blade);
  });

  it('proporcje losowań odpowiadają wagom', () => {
    const rng = createRng(6);
    const total = ITEM_POOL.reduce((s, i) => s + i.weight, 0);
    const n = 10_000;
    const counts = new Map<ItemId, number>();
    for (let i = 0; i < n; i++) {
      const id = pickWeightedItem(ITEM_POOL, rng)!;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const item of ITEM_POOL) expect((counts.get(item.id) ?? 0) / n).toBeCloseTo(item.weight / total, 1);
  });
});

describe('splitGold', () => {
  it.each([
    [1, 5],
    [3, 5],
    [7, 5],
    [23, 5],
    [100, 3],
  ])('%i złota na maks. %i monet: suma się zgadza, żadna moneta nie jest pusta', (amount, maxCoins) => {
    const coins = splitGold(amount, maxCoins);
    expect(coins.reduce((a, b) => a + b, 0)).toBe(amount);
    expect(coins.length).toBeLessThanOrEqual(maxCoins);
    expect(coins.every((c) => c > 0)).toBe(true);
  });

  it('zero złota → brak monet', () => {
    expect(splitGold(0, 5)).toEqual([]);
  });
});

describe('konfiguracja łupów', () => {
it('każdy przedmiot ma dodatnią wagę, nazwę i realne działanie (modyfikator lub efekt broni)', () => {    for (const item of ITEM_POOL) {      expect(item.weight).toBeGreaterThan(0);      expect(item.name.length).toBeGreaterThan(0);      const hasModifier = Object.keys(item.modifiers).length > 0;      const hasEffect = JSON.stringify(computeWeaponEffects([item.id], ITEM_EFFECTS)) !== JSON.stringify(NO_WEAPON_EFFECTS);      expect(hasModifier || hasEffect, item.name).toBe(true);    }
  });

  it('każdy typ przeciwnika ma tabelę łupów z poprawnymi szansami', () => {
    for (const type of Object.values(EnemyType)) {
      const table = ENEMY_LOOT[type];
      for (const chance of [table.goldChance, table.healthChance, table.itemChance]) {
        expect(chance).toBeGreaterThanOrEqual(0);
        expect(chance).toBeLessThanOrEqual(1);
      }
      expect(table.gold.min).toBeLessThanOrEqual(table.gold.max);
    }
  });
});

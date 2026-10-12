import { describe, expect, it } from 'vitest';
import { EnemyType } from '@/core/combatTypes';
import { FloorModifierId } from '@/core/floorModifierTypes';
import { ENEMY_DEFINITIONS, PLAYER_COMBAT } from '@/config/combatConfig';
import { FLOOR_MODIFIER_CONFIG, FLOOR_MODIFIER_POOL, FLOOR_MODIFIERS } from '@/config/floorModifierConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { ENEMY_LOOT, ITEM_DEFINITIONS, ITEM_EFFECTS, SHRINE_CONFIG, STAT_LIMITS } from '@/config/lootConfig';
import {
  NO_FLOOR_EFFECTS,
  applyFloorToEnemy,
  applyFloorToEnemyLoot,
  applyFloorToLoadout,
  applyFloorToShrine,
  floorEffectsOf,
  floorModifierFor,
} from '@/systems/FloorModifiers';
import { computeLoadout } from '@/systems/PlayerLoadout';
import { shrineCost } from '@/systems/Shrine';

const effectsOf = (id: FloorModifierId) => floorEffectsOf(FLOOR_MODIFIERS[id]);

describe('floorModifierFor', () => {
  it('piętra przed pierwszym z modyfikatorem są czyste', () => {
    for (let seed = 1; seed < 50; seed++) {
      expect(floorModifierFor(seed, 1, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG)).toBeNull();
    }
  });

  it('od piętra 2 każde piętro ma modyfikator z puli', () => {
    for (let seed = 1; seed < 50; seed++) {
      for (let floor = 2; floor <= 8; floor++) {
        expect(FLOOR_MODIFIER_POOL).toContain(floorModifierFor(seed, floor, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG));
      }
    }
  });

  it('jest deterministyczny dla tego samego runu i piętra', () => {
    const a = floorModifierFor(1234, 5, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG);
    const b = floorModifierFor(1234, 5, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG);
    expect(a).toBe(b);
  });

  it('nigdy nie powtarza modyfikatora dwa piętra z rzędu', () => {
    for (let seed = 1; seed < 200; seed++) {
      for (let floor = 3; floor <= 10; floor++) {
        const previous = floorModifierFor(seed, floor - 1, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG);
        const current = floorModifierFor(seed, floor, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG);
        expect(current).not.toBe(previous);
      }
    }
  });

  it('z czasem wypada każdy modyfikator', () => {
    const seen = new Set<FloorModifierId>();
    for (let seed = 1; seed < 300; seed++) {
      const modifier = floorModifierFor(seed, 2, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG);
      if (modifier) seen.add(modifier.id);
    }
    expect(seen.size).toBe(FLOOR_MODIFIER_POOL.length);
  });

  it('pusta pula = brak modyfikatora', () => {
    expect(floorModifierFor(1, 3, [], FLOOR_MODIFIER_CONFIG)).toBeNull();
  });
});

describe('efekty modyfikatorów', () => {
  const rusher = ENEMY_DEFINITIONS[EnemyType.Rusher];

  it('brak modyfikatora nic nie zmienia', () => {
    expect(floorEffectsOf(null)).toEqual(NO_FLOOR_EFFECTS);
    expect(applyFloorToEnemy(rusher, NO_FLOOR_EFFECTS)).toEqual(rusher);
  });

  it('Gorączka przyspiesza wrogów', () => {
    expect(applyFloorToEnemy(rusher, effectsOf(FloorModifierId.Fever)).moveSpeed).toBe(Math.round(rusher.moveSpeed * 1.2));
  });

  it('Twarda skóra dodaje HP', () => {
    expect(applyFloorToEnemy(rusher, effectsOf(FloorModifierId.ToughSkin)).maxHp).toBe(Math.round(rusher.maxHp * 1.3));
  });

  it('Złota żyła: więcej złota i mocniejsze ciosy wrogów', () => {
    const effects = effectsOf(FloorModifierId.GoldVein);
    const loot = applyFloorToEnemyLoot(ENEMY_LOOT[EnemyType.Kiter], effects);
    expect(loot.gold.max).toBe(Math.round(ENEMY_LOOT[EnemyType.Kiter].gold.max * 1.5));
    expect(applyFloorToEnemy(rusher, effects).attack.damage).toBe(Math.round(rusher.attack.damage * 1.15));
  });

  it('Mrok ogranicza widoczność, pozostałe nie', () => {
    expect(effectsOf(FloorModifierId.Darkness).visionRadius).toBeGreaterThan(0);
    expect(effectsOf(FloorModifierId.Fever).visionRadius).toBeNull();
  });

  it('Wyczerpanie wydłuża odnowienie dasha i ładunków', () => {
    const base = computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, [], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);
    const tired = applyFloorToLoadout(base, effectsOf(FloorModifierId.Exhaustion));
    expect(tired.combat.dash.cooldownMs).toBe(Math.round(PLAYER_COMBAT.dash.cooldownMs * 1.3));
    expect(tired.combat.ranged.rechargeMs).toBe(Math.round(PLAYER_COMBAT.ranged.rechargeMs * 1.3));
    expect(applyFloorToLoadout(base, NO_FLOOR_EFFECTS)).toBe(base);
  });

  it('Kapliczka łaski obniża koszt ofiary o połowę', () => {
    const grace = applyFloorToShrine(SHRINE_CONFIG, effectsOf(FloorModifierId.ShrineGrace));
    for (const floor of [2, 3, 6]) {
      expect(shrineCost(floor, grace)).toBe(Math.round(shrineCost(floor, SHRINE_CONFIG) / 2));
    }
  });
});

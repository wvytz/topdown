import { describe, expect, it } from 'vitest';
import type { Hit, StatusResistance } from '@/core/combatTypes';
import { ItemId, ItemKind } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';
import { BOSS_STATUS_RESISTANCE } from '@/config/bossConfig';
import { ENEMY_STATUS_RESISTANCE, PLAYER_COMBAT, PLAYER_STATUS_RESISTANCE } from '@/config/combatConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, ITEM_POOL, STAT_LIMITS } from '@/config/lootConfig';
import { AttackCycle } from '@/systems/AttackCycle';
import { ChargePool } from '@/systems/ChargePool';
import { resolveDashSweep } from '@/systems/DashStrike';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import { computeLoadout } from '@/systems/PlayerLoadout';
import { resolvePlayerShot } from '@/systems/ShotResolver';
import { StatusEffects } from '@/systems/StatusEffects';
import { NO_WEAPON_EFFECTS, computeWeaponEffects } from '@/systems/WeaponEffects';

const many = (id: ItemId, n: number): ItemId[] => Array.from({ length: n }, () => id);

const makeTarget = (x: number, y: number, hp = 100, radius = 10) => {
  const health = new Health(hp);
  const hits: Hit[] = [];
  const target: MeleeTarget & { hits: Hit[] } = {
    x,
    y,
    radius,
    hits,
    takeHit: (hit: Hit, _now: number, _source: Vector2) => {
      hits.push(hit);
      return health.takeDamage(hit.damage);
    },
  };
  return target;
};

describe('pula przedmiotów', () => {
  it('5 bazowych + 7 z efektem, każdy z unikalnym id', () => {
    expect(ITEM_POOL.filter((i) => i.kind === ItemKind.Stat)).toHaveLength(5);
    expect(ITEM_POOL.filter((i) => i.kind === ItemKind.Effect)).toHaveLength(7);
    expect(new Set(ITEM_POOL.map((i) => i.id)).size).toBe(ITEM_POOL.length);
  });

  it('przedmioty z efektem są rzadsze od każdego bazowego', () => {
    const minStat = Math.min(...ITEM_POOL.filter((i) => i.kind === ItemKind.Stat).map((i) => i.weight));
    for (const item of ITEM_POOL.filter((i) => i.kind === ItemKind.Effect)) expect(item.weight).toBeLessThan(minStat);
  });
});

describe('computeWeaponEffects', () => {
  it('bez przedmiotów z efektem — brak efektów', () => {
    expect(computeWeaponEffects([ItemId.Blade, ItemId.Heart], ITEM_EFFECTS)).toEqual(NO_WEAPON_EFFECTS);
    // Krok 150: dwie kopie Ostrza to jeszcze nie przemiana.
    expect(computeWeaponEffects([ItemId.Blade, ItemId.Blade], ITEM_EFFECTS)).toEqual(NO_WEAPON_EFFECTS);
  });

  it('każdy przedmiot daje swój efekt', () => {
    const fx = (id: ItemId) => computeWeaponEffects([id], ITEM_EFFECTS);
    expect(fx(ItemId.Shuriken).shotPierce).toBe(ITEM_EFFECTS.shuriken.pierce);
    expect(fx(ItemId.ElectricArrow).shotStatus.stun?.durationMs).toBe(ITEM_EFFECTS.electricArrow.stunMs);
    expect(fx(ItemId.FireFist).meleeStatus.burn?.tickDamage).toBe(ITEM_EFFECTS.fireFist.tickDamage);
    expect(fx(ItemId.VampireFang).meleeHeal).toBe(ITEM_EFFECTS.vampireFang.heal);
    expect(fx(ItemId.StormDash).dashDamage).toBe(ITEM_EFFECTS.stormDash.damage);
    expect(fx(ItemId.FrostShard).shotStatus.slow?.pct).toBe(ITEM_EFFECTS.frostShard.slowPct);
  });

  it('kolejne kopie wzmacniają efekt', () => {
    const fx = computeWeaponEffects(
      [...many(ItemId.Shuriken, 3), ...many(ItemId.FireFist, 2), ...many(ItemId.ElectricArrow, 2)],
      ITEM_EFFECTS,
    );
    expect(fx.shotPierce).toBe(ITEM_EFFECTS.shuriken.pierce + 2 * ITEM_EFFECTS.shuriken.piercePerStack);
    expect(fx.meleeStatus.burn?.tickDamage).toBe(ITEM_EFFECTS.fireFist.tickDamage + ITEM_EFFECTS.fireFist.tickDamagePerStack);
    expect(fx.shotStatus.stun?.durationMs).toBe(ITEM_EFFECTS.electricArrow.stunMs + ITEM_EFFECTS.electricArrow.stunMsPerStack);
  });

  it('kroki 93 i 117: kolejne kopie kła i pięści dają coraz mniej', () => {
    const heal = (n: number) => computeWeaponEffects(many(ItemId.VampireFang, n), ITEM_EFFECTS).meleeHeal;
    const tick = (n: number) => computeWeaponEffects(many(ItemId.FireFist, n), ITEM_EFFECTS).meleeStatus.burn?.tickDamage;
    expect([1, 2, 3, 4, 5].map(heal)).toEqual([2, 3, 4, 4, 4]);
    expect([1, 2, 3, 4, 5].map(tick)).toEqual([3, 5, 6, 7, 7]);
    // Nawet dużo kopii nie przekroczy sumy szeregu geometrycznego (base + 2 × perStack).
    expect(heal(30)).toBeLessThanOrEqual(ITEM_EFFECTS.vampireFang.heal + 2 * ITEM_EFFECTS.vampireFang.healPerStack);
  });

  it('spowolnienie ma górny limit', () => {
    expect(computeWeaponEffects(many(ItemId.FrostShard, 20), ITEM_EFFECTS).shotStatus.slow?.pct).toBe(
      ITEM_EFFECTS.frostShard.maxSlowPct,
    );
  });

  it('strzał może mieć jednocześnie ogłuszenie i spowolnienie', () => {
    const fx = computeWeaponEffects([ItemId.ElectricArrow, ItemId.FrostShard], ITEM_EFFECTS);
    expect(fx.shotStatus.stun).toBeDefined();
    expect(fx.shotStatus.slow).toBeDefined();
  });
});

describe('Kołczan w computeLoadout', () => {
  const loadout = (items: ItemId[]) =>
    computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);

  it('+1 ładunek za kopię, z limitem', () => {
    expect(loadout([ItemId.Quiver]).combat.ranged.maxCharges).toBe(PLAYER_COMBAT.ranged.maxCharges + 1);
    expect(loadout(many(ItemId.Quiver, 20)).combat.ranged.maxCharges).toBe(STAT_LIMITS.maxRangedCharges);
  });

  it('loadout niesie efekty broni', () => {
    expect(loadout([ItemId.StormDash]).effects.dashDamage).toBe(ITEM_EFFECTS.stormDash.damage);
  });
});

describe('ChargePool.resize', () => {
  it('nowe miejsce przychodzi naładowane, ładowanie pozostałych trwa dalej', () => {
    const pool = new ChargePool(3, 1000);
    pool.tryConsume(0);
    pool.tryConsume(0);
    pool.resize(4, 500);
    expect(pool.maxCharges).toBe(4);
    expect(pool.available(500)).toBe(2);
    expect(pool.available(1000)).toBe(3);
  });

  it('pełna pula po powiększeniu dalej jest pełna', () => {
    const pool = new ChargePool(3, 1000);
    pool.resize(4, 0);
    expect(pool.available(0)).toBe(4);
    expect(pool.rechargeProgress(0)).toBe(1);
  });
});

describe('AttackCycle.interrupt', () => {
  it('przerwany zamach nie kończy się uderzeniem, odnowienie biegnie dalej', () => {
    const cycle = new AttackCycle(300, 1000);
    cycle.tryStart(0);
    cycle.interrupt();
    expect(cycle.consumeRelease(400)).toBe(false);
    expect(cycle.tryStart(500)).toBe(false);
    expect(cycle.tryStart(1000)).toBe(true);
  });
});

describe('StatusEffects', () => {
  const NO_RESIST: StatusResistance = { stunMultiplier: 1, stunImmunityMs: 0, slowMultiplier: 1 };
  const burn = { tickDamage: 3, tickMs: 500, durationMs: 2000 };

  it('podpalenie tyka co tickMs przez cały czas trwania', () => {
    const status = new StatusEffects(NO_RESIST);
    status.apply({ burn }, 0);
    expect(status.takeBurnDamage(499)).toBe(0);
    expect(status.takeBurnDamage(500)).toBe(3);
    expect(status.takeBurnDamage(2000)).toBe(9); // tyknięcia 1000, 1500, 2000
    expect(status.takeBurnDamage(5000)).toBe(0);
    expect(status.isBurning(2000)).toBe(false);
  });

  it('trucizna (krok 27): tyka jak podpalenie, niezależnie od niego', () => {
    const status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
    status.apply({ poison: { tickDamage: 3, tickMs: 500, durationMs: 2000 }, burn: { tickDamage: 5, tickMs: 500, durationMs: 1000 } }, 0);
    expect(status.isPoisoned(0)).toBe(true);
    expect(status.takePoisonDamage(2000)).toBe(12);
    expect(status.takeBurnDamage(2000)).toBe(10);
    expect(status.isPoisoned(2000)).toBe(false);
    expect(status.takePoisonDamage(5000)).toBe(0);
  });

  it('ponowne podpalenie odświeża czas, ale nie przyspiesza tykania', () => {
    const status = new StatusEffects(NO_RESIST);
    status.apply({ burn }, 0);
    status.apply({ burn }, 400);
    expect(status.takeBurnDamage(500)).toBe(3);
    // Czas przedłużony do 2400: tyknięcia 1000, 1500, 2000 (bez dodatkowych).
    expect(status.isBurning(2399)).toBe(true);
    expect(status.takeBurnDamage(2400)).toBe(9);
  });

  it('silniejsze podpalenie zastępuje słabsze, słabsze nie osłabia silniejszego', () => {
    const status = new StatusEffects(NO_RESIST);
    status.apply({ burn: { ...burn, tickDamage: 7 } }, 0);
    status.apply({ burn }, 100);
    expect(status.takeBurnDamage(500)).toBe(7);
  });

  it('spowolnienie zmniejsza prędkość i wygasa', () => {
    const status = new StatusEffects(NO_RESIST);
    status.apply({ slow: { pct: 0.4, durationMs: 1500 } }, 0);
    expect(status.speedMultiplier(100)).toBeCloseTo(0.6);
    expect(status.speedMultiplier(1500)).toBe(1);
  });

  it('boss: krótsze ogłuszenie, słabsze spowolnienie i odporność po ogłuszeniu', () => {
    const status = new StatusEffects(BOSS_STATUS_RESISTANCE);
    const first = status.apply({ stun: { durationMs: 1000 }, slow: { pct: 0.4, durationMs: 1500 } }, 0);
    expect(first.stunnedMs).toBe(Math.round(1000 * BOSS_STATUS_RESISTANCE.stunMultiplier));
    expect(status.speedMultiplier(10)).toBeCloseTo(1 - 0.4 * BOSS_STATUS_RESISTANCE.slowMultiplier);

    const immuneAt = first.stunnedMs + BOSS_STATUS_RESISTANCE.stunImmunityMs;
    expect(status.apply({ stun: { durationMs: 1000 } }, immuneAt - 1).stunnedMs).toBe(0);
    expect(status.apply({ stun: { durationMs: 1000 } }, immuneAt).stunnedMs).toBeGreaterThan(0);
  });

  it('krok 93: boss dostaje połowę obrażeń podpalenia, zwykły wróg pełne', () => {
    const burn = { tickDamage: 7, tickMs: 500, durationMs: 2000 };
    const boss = new StatusEffects(BOSS_STATUS_RESISTANCE);
    const enemy = new StatusEffects(ENEMY_STATUS_RESISTANCE);
    boss.apply({ burn }, 0);
    enemy.apply({ burn }, 0);
    expect(enemy.takeBurnDamage(2000)).toBe(4 * 7);
    expect(boss.takeBurnDamage(2000)).toBe(4 * Math.round(7 * BOSS_STATUS_RESISTANCE.burnMultiplier!));
  });

  it('krok 93: odporność na ogień zostawia co najmniej 1 HP na tyknięcie', () => {
    const status = new StatusEffects({ ...BOSS_STATUS_RESISTANCE, burnMultiplier: 0.1 });
    status.apply({ burn: { tickDamage: 3, tickMs: 500, durationMs: 500 } }, 0);
    expect(status.takeBurnDamage(500)).toBe(1);
  });

  it('zwykły wróg stoi przez pełny czas ogłuszenia', () => {
    const status = new StatusEffects(ENEMY_STATUS_RESISTANCE);
    status.apply({ stun: { durationMs: 900 } }, 0);
    expect(status.isStunned(899)).toBe(true);
    expect(status.isStunned(900)).toBe(false);
  });
});

describe('trafienia niosą statusy', () => {
  it('cios wręcz przekazuje podpalenie', () => {
    const target = makeTarget(30, 0);
    const burn = { tickDamage: 3, tickMs: 500, durationMs: 2000 };
    resolveMeleeSwing({ origin: { x: 0, y: 0 }, angle: 0, combat: PLAYER_COMBAT, now: 0, status: { burn } }, [target]);
    expect(target.hits[0]?.status?.burn).toEqual(burn);
  });

  it('przebijający strzał pomija już trafione cele', () => {
    const first = makeTarget(0, 0);
    const second = makeTarget(10, 0);
    const shot = {
      position: { x: 0, y: 0 },
      velocity: { x: 400, y: 0 },
      radius: 4,
      origin: { x: -100, y: 0 },
      damage: 7,
      knockback: 90,
      now: 0,
      status: { stun: { durationMs: 900 } },
      ignore: new Set<object>([first]),
    };
    const result = resolvePlayerShot(shot, [first, second]);
    expect(result?.target).toBe(second);
    expect(first.hits).toHaveLength(0);
    expect(second.hits[0]?.status?.stun?.durationMs).toBe(900);
  });
});

describe('resolveDashSweep', () => {
  it('rani dotknięte cele raz na dash, bez odrzutu', () => {
    const near = makeTarget(15, 0, 100);
    const far = makeTarget(100, 0, 100);
    const alreadyHit = new Set<object>();
    const sweep = { center: { x: 0, y: 0 }, radius: 12, damage: 10, now: 0 };

    expect(resolveDashSweep(sweep, [near, far], alreadyHit).hit).toEqual([near]);
    expect(resolveDashSweep(sweep, [near, far], alreadyHit).hit).toEqual([]);
    expect(near.hits).toHaveLength(1);
    expect(near.hits[0]?.knockback).toEqual({ x: 0, y: 0 });
    expect(far.hits).toHaveLength(0);
  });

  it('zwraca zabite i nic nie robi bez obrażeń', () => {
    const weak = makeTarget(0, 0, 5);
    expect(resolveDashSweep({ center: { x: 0, y: 0 }, radius: 12, damage: 0, now: 0 }, [weak], new Set()).hit).toEqual([]);
    expect(resolveDashSweep({ center: { x: 0, y: 0 }, radius: 12, damage: 10, now: 0 }, [weak], new Set()).killed).toEqual([weak]);
  });
});

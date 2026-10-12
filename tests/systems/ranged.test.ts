import { describe, expect, it } from 'vitest';
import type { Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import { ChargePool } from '@/systems/ChargePool';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

describe('ChargePool', () => {
  it('startuje pełna i pozwala wystrzelić serię aż do opróżnienia', () => {
    const pool = new ChargePool(3, 1000);
    expect(pool.available(0)).toBe(3);
    expect(pool.tryConsume(0)).toBe(true);
    expect(pool.tryConsume(10)).toBe(true);
    expect(pool.tryConsume(20)).toBe(true);
    expect(pool.tryConsume(30)).toBe(false);
    expect(pool.available(30)).toBe(0);
  });

  it('odnawia ładunki po jednym, licząc od pierwszego zużycia', () => {
    const pool = new ChargePool(3, 1000);
    pool.tryConsume(0);
    pool.tryConsume(500);
    expect(pool.available(999)).toBe(1);
    expect(pool.available(1000)).toBe(2);
    expect(pool.rechargeProgress(1500)).toBeCloseTo(0.5);
    expect(pool.available(2000)).toBe(3);
    expect(pool.rechargeProgress(2000)).toBe(1);
  });

  it('nie przekracza maksimum przy długiej przerwie', () => {
    const pool = new ChargePool(3, 1000);
    pool.tryConsume(0);
    expect(pool.available(60_000)).toBe(3);
  });

  it('zużycie w trakcie ładowania nie zeruje postępu kolejnego ładunku', () => {
    const pool = new ChargePool(3, 1000);
    pool.tryConsume(0); // 2 ładunki, ładowanie od 0
    pool.tryConsume(600); // 1 ładunek, ładowanie nadal od 0
    expect(pool.rechargeProgress(600)).toBeCloseTo(0.6);
    expect(pool.available(1000)).toBe(2);
  });

  it('po napełnieniu odliczanie startuje od nowego strzału, nie od starego znacznika', () => {
    const pool = new ChargePool(2, 1000);
    pool.tryConsume(0);
    expect(pool.available(5000)).toBe(2);
    pool.tryConsume(5000);
    expect(pool.available(5999)).toBe(1);
    expect(pool.available(6000)).toBe(2);
  });

  it('pełna pula raportuje gotowość 1', () => {
    expect(new ChargePool(3, 1000).rechargeProgress(0)).toBe(1);
  });
});

describe('resolvePlayerShot', () => {
  const makeTarget = (x: number, y: number, hp: number, radius = 10) => {
    const health = new Health(hp);
    const hits: Array<{ hit: Hit; source: Vector2 }> = [];
    const target: MeleeTarget & { hits: typeof hits } = {
      x,
      y,
      radius,
      hits,
      takeHit: (hit, _now, source) => {
        hits.push({ hit, source });
        return health.takeDamage(hit.damage);
      },
    };
    return target;
  };

  const shotAt = (position: Vector2, damage = 7): PlayerShot => ({
    position,
    velocity: { x: 400, y: 0 },
    radius: 4,
    origin: { x: -100, y: 0 },
    damage,
    knockback: 90,
    now: 0,
  });

  it('pudłuje, gdy pocisk nie styka się z celem', () => {
    const target = makeTarget(30, 0, 20);
    expect(resolvePlayerShot(shotAt({ x: 15, y: 0 }), [target])).toBeNull();
    expect(target.hits).toHaveLength(0);
  });

  it('trafia na styku promieni', () => {
    const target = makeTarget(30, 0, 20);
    expect(resolvePlayerShot(shotAt({ x: 16, y: 0 }), [target])?.target).toBe(target);
  });

  it('trafia tylko jeden — najbliższy — cel', () => {
    const near = makeTarget(5, 0, 20);
    const far = makeTarget(12, 0, 20);
    const result = resolvePlayerShot(shotAt({ x: 0, y: 0 }), [far, near]);
    expect(result?.target).toBe(near);
    expect(far.hits).toHaveLength(0);
  });

  it('odrzuca w kierunku lotu, a źródłem alarmu jest miejsce wystrzału', () => {
    const target = makeTarget(0, 5, 20);
    resolvePlayerShot(shotAt({ x: 0, y: 0 }), [target]);
    const { hit, source } = target.hits[0]!;
    expect(hit.knockback.x).toBeGreaterThan(0);
    expect(hit.damage).toBe(7);
    expect(source).toEqual({ x: -100, y: 0 });
  });

  it('zgłasza zabicie celu', () => {
    const target = makeTarget(0, 0, 7);
    expect(resolvePlayerShot(shotAt({ x: 0, y: 0 }), [target])?.died).toBe(true);
  });

  it('strzał jest słabszy od ciosu wręcz (uzupełnienie, nie zamiennik)', () => {
    expect(PLAYER_COMBAT.ranged.damage).toBeLessThan(PLAYER_COMBAT.meleeDamage);
  });
});

import { describe, expect, it } from 'vitest';
import type { Hit } from '@/core/combatTypes';
import { EnemyType } from '@/core/combatTypes';
import { ENEMY_DEFINITIONS, ENEMY_SCALING, PLAYER_COMBAT } from '@/config/combatConfig';
import {
  directionTo,
  isInMeleeArc,
  knockbackFrom,
  normalize,
  scaleForFloor,
  wrapAngle,
} from '@/systems/CombatMath';
import { scaleEnemyForFloor } from '@/systems/EnemyScaling';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';

const ORIGIN = { x: 0, y: 0 };
const ARC_110 = (110 * Math.PI) / 180;

describe('Health', () => {
  it('odejmuje obrażenia i zgłasza śmierć dokładnie raz', () => {
    const hp = new Health(30);
    expect(hp.takeDamage(12)).toEqual({ dealt: 12, died: false });
    expect(hp.takeDamage(25)).toEqual({ dealt: 18, died: true });
    expect(hp.value).toBe(0);
    expect(hp.takeDamage(5)).toEqual({ dealt: 0, died: false });
  });

  it('leczy do maksimum, ale nie wskrzesza', () => {
    const hp = new Health(50);
    hp.takeDamage(20);
    hp.heal(100);
    expect(hp.value).toBe(50);
    hp.takeDamage(50);
    hp.heal(10);
    expect(hp.isDead).toBe(true);
  });

  it('ignoruje ujemne obrażenia', () => {
    const hp = new Health(10);
    hp.takeDamage(-5);
    expect(hp.value).toBe(10);
  });
});

describe('CombatMath', () => {
  it('normalize i directionTo dają wektory jednostkowe (lub zerowy)', () => {
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(directionTo(ORIGIN, { x: 0, y: -5 })).toEqual({ x: 0, y: -1 });
  });

  it('wrapAngle sprowadza kąt do (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it('isInMeleeArc: przód tak, tył i zbyt daleko nie', () => {
    expect(isInMeleeArc(ORIGIN, 0, ARC_110, 52, { x: 40, y: 0 }, 10)).toBe(true);
    expect(isInMeleeArc(ORIGIN, 0, ARC_110, 52, { x: -40, y: 0 }, 10)).toBe(false);
    expect(isInMeleeArc(ORIGIN, 0, ARC_110, 52, { x: 70, y: 0 }, 10)).toBe(false);
  });

  it('isInMeleeArc: działa przy przejściu przez ±π i uwzględnia promień celu', () => {
    expect(isInMeleeArc(ORIGIN, Math.PI, ARC_110, 52, { x: -40, y: 5 }, 10)).toBe(true);
    // Środek celu tuż za krawędzią łuku, ale jego obrys wchodzi w łuk.
    const edge = 55 * (Math.PI / 180) + 0.15;
    const target = { x: Math.cos(edge) * 40, y: Math.sin(edge) * 40 };
    expect(isInMeleeArc(ORIGIN, 0, ARC_110, 52, target, 1)).toBe(false);
    expect(isInMeleeArc(ORIGIN, 0, ARC_110, 52, target, 10)).toBe(true);
  });

  it('cel nachodzący na atakującego jest zawsze trafiony', () => {
    expect(isInMeleeArc(ORIGIN, 0, ARC_110, 52, { x: -3, y: 0 }, 10)).toBe(true);
  });

  it('knockbackFrom wypycha od źródła z zadaną siłą', () => {
    const kb = knockbackFrom(ORIGIN, { x: 10, y: 0 }, 200);
    expect(kb).toEqual({ x: 200, y: 0 });
  });

  it('scaleForFloor: piętro 1 bez zmian, potem liniowo', () => {
    expect(scaleForFloor(100, 1, 0.15)).toBe(100);
    expect(scaleForFloor(100, 3, 0.15)).toBe(130);
  });
});

describe('scaleEnemyForFloor', () => {
  it('skaluje HP i obrażenia, nie rusza reszty', () => {
    const base = ENEMY_DEFINITIONS[EnemyType.Rusher];
    const scaled = scaleEnemyForFloor(base, 3, ENEMY_SCALING);
    expect(scaled.maxHp).toBe(scaleForFloor(base.maxHp, 3, ENEMY_SCALING.hpPerFloor));
    expect(scaled.attack.damage).toBe(scaleForFloor(base.attack.damage, 3, ENEMY_SCALING.damagePerFloor));
    expect(scaled.moveSpeed).toBe(base.moveSpeed);
    expect(scaled.attack.windupMs).toBe(base.attack.windupMs);
  });
});

describe('resolveMeleeSwing', () => {
  const makeTarget = (x: number, hp: number, radius = 10): MeleeTarget & { hits: Hit[] } => {
    const health = new Health(hp);
    const hits: Hit[] = [];
    return {
      x,
      y: 0,
      radius,
      hits,
      takeHit: (hit) => {
        hits.push(hit);
        return health.takeDamage(hit.damage);
      },
    };
  };
  const swing = { origin: ORIGIN, angle: 0, combat: PLAYER_COMBAT, now: 0 };

  it('trafia tylko cele w łuku i zwraca zabite', () => {
    const weak = makeTarget(40, PLAYER_COMBAT.meleeDamage);
    const strong = makeTarget(30, 100);
    const behind = makeTarget(-40, 1);
    const far = makeTarget(200, 1);

    const killed = resolveMeleeSwing(swing, [weak, strong, behind, far]);

    expect(killed).toEqual([weak]);
    expect(strong.hits).toHaveLength(1);
    expect(behind.hits).toHaveLength(0);
    expect(far.hits).toHaveLength(0);
  });

  it('nadaje odrzut od gracza z siłą z konfiguracji', () => {
    const target = makeTarget(40, 100);
    resolveMeleeSwing(swing, [target]);
    expect(target.hits[0]?.knockback).toEqual({ x: PLAYER_COMBAT.knockback, y: 0 });
  });

  it('duży cel (boss) jest trafiany dalej niż mały', () => {
    const small = makeTarget(70, 100, 10);
    const big = makeTarget(70, 100, 26);
    resolveMeleeSwing(swing, [small, big]);
    expect(small.hits).toHaveLength(0);
    expect(big.hits).toHaveLength(1);
  });
});

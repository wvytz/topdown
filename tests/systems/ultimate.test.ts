import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import type { UltimateConfig } from '@/core/heroTypes';
import { HERO_DEFINITIONS, HERO_ORDER } from '@/config/heroConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { ULTIMATE_GAUGE } from '@/config/ultimateConfig';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';
import { ItemId } from '@/core/lootTypes';
import { UltimateGauge, applyRage, gaugeConfigFor, nearestInRange, ultimateActiveMs, ultimateGuardMs } from '@/systems/Ultimate';

const gauge = (startCharge = 0) => new UltimateGauge({ passivePerSec: 0.1, perKill: 0.25, startCharge });
type Rage = Extract<UltimateConfig, { kind: 'rage' }>;

describe('pasek mocy ultimate (krok 98)', () => {
  it('rośnie z czasem od pierwszego odczytu', () => {
    const g = gauge();
    expect(g.value(1000)).toBe(0);
    expect(g.value(6000)).toBeCloseTo(0.5);
    expect(g.isReady(10_999)).toBe(false);
    expect(g.isReady(11_000)).toBe(true);
    expect(g.value(50_000)).toBe(1);
  });

  it('zabicia przyspieszają ładowanie', () => {
    const g = gauge();
    g.value(0);
    g.addKill(0);
    g.addKill(0);
    expect(g.value(0)).toBeCloseTo(0.5);
  });

  it('użycie wymaga pełnego paska, zeruje go i zatrzymuje na czas działania', () => {
    const g = gauge(1);
    expect(g.tryUse(0, 3000)).toBe(true);
    expect(g.isActive(2999)).toBe(true);
    expect(g.value(3000)).toBe(0);
    g.addKill(1000);
    expect(g.value(3000)).toBe(0);
    expect(g.value(8000)).toBeCloseTo(0.5);
    expect(g.tryUse(8000, 0)).toBe(false);
  });

  it('domyślnie pełny na starcie piętra', () => {
    expect(new UltimateGauge(ULTIMATE_GAUGE).isReady(0)).toBe(true);
  });
});

describe('ultimate bohaterów', () => {
  it('każdy bohater ma inny rodzaj i opis R na ekranie wyboru', () => {
    const kinds = HERO_ORDER.map((id) => HERO_DEFINITIONS[id].ultimate.kind);
    expect(new Set(kinds).size).toBe(HERO_ORDER.length);
    for (const id of HERO_ORDER) expect(HERO_DEFINITIONS[id].attacks.some((a) => a.input === 'R')).toBe(true);
  });

  it('szał i tarcza dają nietykalność, totem nie; pasek stoi przez czas działania', () => {
    const rage = HERO_DEFINITIONS[HeroId.Barbarian].ultimate as Rage;
    expect(ultimateGuardMs(rage)).toBe(rage.durationMs);
    expect(ultimateGuardMs({ ...rage, invulnerable: false })).toBe(0);
    const nova = HERO_DEFINITIONS[HeroId.Sorceress].ultimate;
    expect(ultimateGuardMs(nova)).toBeGreaterThan(0);
    const totem = HERO_DEFINITIONS[HeroId.Archer].ultimate;
    expect(ultimateGuardMs(totem)).toBe(0);
    expect(ultimateActiveMs(totem)).toBeGreaterThan(0);
  });

  it('szał: mocniejsze i szybsze ciosy oraz strzały, szybszy chód', () => {
    const barbarian = HERO_DEFINITIONS[HeroId.Barbarian];
    const rage = barbarian.ultimate as Rage;
    const base = computeHeroLoadout(barbarian, [], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);
    const raged = applyRage(base, rage);
    expect(raged.combat.meleeDamage).toBe(Math.round(base.combat.meleeDamage * rage.damageMultiplier));
    expect(raged.combat.attackCooldownMs).toBeLessThan(base.combat.attackCooldownMs);
    expect(raged.combat.ranged.damage).toBeGreaterThanOrEqual(base.combat.ranged.damage);
    expect(raged.stats.moveSpeed).toBeGreaterThan(base.stats.moveSpeed);
    expect(raged.stats.maxHp).toBe(base.stats.maxHp);
  });
});

describe('krok 117: szał z przedmiotami', () => {
  const barbarian = HERO_DEFINITIONS[HeroId.Barbarian];
  const rage = barbarian.ultimate as Rage;

  it('szał z pełnymi Rękawicami nie skraca ciosu poniżej limitu odnowień', () => {
    const gloves = Array.from({ length: 20 }, () => ItemId.Gloves);
    const raged = applyRage(computeHeroLoadout(barbarian, gloves, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS), rage);
    const floor = Math.round(barbarian.combat.attackCooldownMs * STAT_LIMITS.minCooldownMultiplier);
    expect(raged.combat.attackCooldownMs).toBeGreaterThanOrEqual(floor);
  });

  it('barbarzyńca ładuje pasek wolniej za zabicia, reszta bohaterów jak dotąd', () => {
    expect(gaugeConfigFor(barbarian, ULTIMATE_GAUGE).perKill).toBeLessThan(ULTIMATE_GAUGE.perKill);
    expect(gaugeConfigFor(barbarian, ULTIMATE_GAUGE).passivePerSec).toBe(ULTIMATE_GAUGE.passivePerSec);
    expect(gaugeConfigFor(HERO_DEFINITIONS[HeroId.Sorceress], ULTIMATE_GAUGE)).toEqual(ULTIMATE_GAUGE);
    expect(gaugeConfigFor(HERO_DEFINITIONS[HeroId.Archer], ULTIMATE_GAUGE)).toEqual(ULTIMATE_GAUGE);
  });
});

describe('totem: wybór celu', () => {
  it('najbliższy w zasięgu; poza zasięgiem nikt', () => {
    const near = { x: 50, y: 0 };
    const nearer = { x: 0, y: 30 };
    const far = { x: 500, y: 0 };
    expect(nearestInRange({ x: 0, y: 0 }, [near, far, nearer], 100)).toBe(nearer);
    expect(nearestInRange({ x: 0, y: 0 }, [far], 100)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { FIRE_FX } from '@/config/fireConfig';
import {
  FireBudget,
  RateGate,
  burstSpriteFor,
  closingRingRadius,
  fireLightPeak,
  fireLightRadius,
  flameCount,
  flameSpots,
  particleCount,
  shakeIntensity,
} from '@/systems/FireBurst';

/** Ogień walki (krok 144): czysta część efektów ognia. */
describe('FireBurst', () => {
  it('arkusz kuli: najmniejszy, który pokrywa strefę, większe strefy — całkowita skala', () => {
    expect(burstSpriteFor(14, [32, 64], 1.1)).toEqual({ size: 32, scale: 1 }); // pas bocianów
    expect(burstSpriteFor(30, [32, 64], 1.1)).toEqual({ size: 64, scale: 1 }); // pikowanie
    expect(burstSpriteFor(60, [64, 32], 1.1)).toEqual({ size: 64, scale: 2 });
    expect(burstSpriteFor(0, [32, 64], 1.1)).toEqual({ size: 32, scale: 1 });
  });

  it('płomienie: liczba rośnie z polem strefy, w granicach configu', () => {
    const cfg = FIRE_FX.flames;
    expect(flameCount(1, cfg)).toBe(cfg.min);
    expect(flameCount(14, cfg)).toBe(2);
    expect(flameCount(200, cfg)).toBe(cfg.max);
  });

  it('miejsca płomieni leżą w kole o promieniu r × spread', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots = flameSpots({ x: 100, y: 50 }, 20, 40, 0.8, random);
    expect(spots).toHaveLength(40);
    for (const s of spots) expect(Math.hypot(s.x - 100, s.y - 50)).toBeLessThanOrEqual(16 + 1e-9);
  });

  it('iskry i dym: skalowane jakością, co najmniej 1, najwyżej max', () => {
    expect(particleCount(14, 0.5, 18, 1)).toBe(7);
    expect(particleCount(14, 0.5, 18, 0.5)).toBe(4);
    expect(particleCount(1, 0.1, 18, 0.5)).toBe(1);
    expect(particleCount(400, 0.5, 18, 1)).toBe(18);
  });

  it('wstrząs rośnie z promieniem między min a max', () => {
    const cfg = FIRE_FX.shake;
    expect(shakeIntensity(1, cfg)).toBe(cfg.min);
    expect(shakeIntensity(30, cfg)).toBeCloseTo(30 * cfg.perRadius);
    expect(shakeIntensity(1000, cfg)).toBe(cfg.max);
  });

  it('światło: szczyt w krokach `step`, gaśnie do zera w czasie', () => {
    const cfg = FIRE_FX.light;
    const peak = fireLightPeak(14, cfg);
    expect(peak % cfg.step).toBe(0);
    expect(peak).toBeGreaterThanOrEqual(cfg.minRadius);
    expect(fireLightPeak(500, cfg)).toBe(cfg.maxRadius);
    expect(fireLightRadius(peak, 0, 600, cfg.step)).toBe(peak);
    expect(fireLightRadius(peak, 300, 600, cfg.step)).toBeLessThan(peak);
    expect(fireLightRadius(peak, 600, 600, cfg.step)).toBe(0);
    expect(fireLightRadius(peak, -1, 600, cfg.step)).toBe(0);
  });

  it('telegraf: pierścień zaciska się z startScale × r do r dokładnie w chwili uderzenia', () => {
    expect(closingRingRadius(20, 0.05, 1.6, 0.1)).toBeNull();
    expect(closingRingRadius(20, 0.1, 1.6, 0.1)).toBeCloseTo(32);
    expect(closingRingRadius(20, 1, 1.6, 0.1)).toBeCloseTo(20);
    const mid = closingRingRadius(20, 0.55, 1.6, 0.1)!;
    expect(mid).toBeLessThan(32);
    expect(mid).toBeGreaterThan(20);
  });

  it('budżet puli nie pozwala przekroczyć limitu, zwolnione miejsca wracają', () => {
    const budget = new FireBudget(5);
    expect(budget.take(3)).toBe(3);
    expect(budget.take(3)).toBe(2);
    expect(budget.take(1)).toBe(0);
    budget.release(2);
    expect(budget.active).toBe(3);
    expect(budget.take(4)).toBe(2);
    budget.release(99);
    expect(budget.active).toBe(0);
  });

  it('bramka huku przepuszcza najwyżej raz na gapMs', () => {
    const gate = new RateGate(110);
    expect(gate.pass(0)).toBe(true);
    expect(gate.pass(50)).toBe(false);
    expect(gate.pass(110)).toBe(true);
  });

  it('telefon ma niższe limity niż PC', () => {
    const { pc, mobile } = FIRE_FX.quality;
    expect(mobile.maxFlames).toBeLessThan(pc.maxFlames);
    expect(mobile.maxParticles).toBeLessThan(pc.maxParticles);
    expect(mobile.maxBursts).toBeLessThan(pc.maxBursts);
  });
});

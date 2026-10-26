import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/random';
import { angleDelta, isGuardLowered, isShielded, reflectDirection, turnToward } from '@/systems/Shield';

const C = { x: 0, y: 0 };
const NORTH = -Math.PI / 2;

describe('tarcza bossa (krok 41e)', () => {
  it('chroni stożek przed sobą, boki poza stożkiem i tył są odsłonięte', () => {
    expect(isShielded(C, NORTH, 120, { x: 0, y: -50 })).toBe(true);
    expect(isShielded(C, NORTH, 120, { x: 40, y: -40 })).toBe(true); // 45° od osi
    expect(isShielded(C, NORTH, 120, { x: 50, y: -10 })).toBe(false); // ok. 79° od osi
    expect(isShielded(C, NORTH, 120, { x: 0, y: 50 })).toBe(false);
  });

  it('różnica kątów zawsze w (−π, π]', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDelta(0, Math.PI)).toBeCloseTo(Math.PI);
  });

  it('obraca się do celu najwyżej o krok, krótszą drogą', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0, -1, 0.25)).toBeCloseTo(-0.25);
    expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // przez π, nie przez 0
  });

  it('odbity pocisk leci z powrotem', () => {
    expect(reflectDirection({ x: 3, y: -4 })).toEqual({ x: -3, y: 4 });
  });

  it('z rozrzutem odbity pocisk nie leci prosto w strzelca (krok 111)', () => {
    const spread = { minDeg: 30, maxDeg: 80 };
    const rng = createRng(7);
    const sides = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const v = { x: 0, y: -100 }; // leci na północ, strzelec jest na południu
      const out = reflectDirection(v, spread, rng.next);
      expect(Math.hypot(out.x, out.y)).toBeCloseTo(100, 6);
      const off = Math.abs(angleDelta(Math.PI / 2, Math.atan2(out.y, out.x))) * (180 / Math.PI);
      expect(off).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(off).toBeLessThanOrEqual(80 + 1e-6);
      sides.add(Math.sign(out.x));
    }
    expect(sides).toEqual(new Set([-1, 1]));
  });

  it('po ataku boss opuszcza tarczę na chwilę (krok 111)', () => {
    expect(isGuardLowered(1000, 1200, 999)).toBe(false);
    expect(isGuardLowered(1000, 1200, 1000)).toBe(true);
    expect(isGuardLowered(1000, 1200, 2199)).toBe(true);
    expect(isGuardLowered(1000, 1200, 2200)).toBe(false);
    expect(isGuardLowered(-Infinity, 1200, 0)).toBe(false);
  });
});

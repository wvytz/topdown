import { describe, expect, it } from 'vitest';
import { angleDelta, isShielded, reflectDirection, turnToward } from '@/systems/Shield';

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
});

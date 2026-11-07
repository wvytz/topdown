import { describe, expect, it } from 'vitest';
import { RimPixelKind, bayerThreshold, rimPixels } from '@/systems/FirePatchRim';

const shape = { crust: 1, ember: 2, glow: 3 };
const circle = (x: number, y: number, radius: number) => ({ center: { x, y }, radius });
const dist = (p: { x: number; y: number }, c: { center: { x: number; y: number } }) => Math.hypot(p.x + 0.5 - c.center.x, p.y + 0.5 - c.center.y);

describe('obrys płonącej plamy z pikseli (krok 176)', () => {
  it('żar leży w zasięgu parzenia (w kole), skorupa tuż za brzegiem', () => {
    const c = circle(0, 0, 9);
    const pixels = rimPixels([c], 0, shape);
    const ember = pixels.filter((p) => p.kind === RimPixelKind.EmberOuter || p.kind === RimPixelKind.EmberInner);
    const crust = pixels.filter((p) => p.kind === RimPixelKind.Crust);
    expect(ember.length).toBeGreaterThan(40);
    for (const p of ember) expect(dist(p, c)).toBeLessThan(9);
    for (const p of ember) expect(dist(p, c)).toBeGreaterThanOrEqual(7);
    for (const p of crust) expect(dist(p, c)).toBeGreaterThanOrEqual(9);
    for (const p of crust) expect(dist(p, c)).toBeLessThan(10);
  });

  it('brzeg jest ciągły: każdy kierunek ma piksel zewnętrznego żaru', () => {
    const c = circle(0, 0, 22);
    const outer = rimPixels([c], 0, shape).filter((p) => p.kind === RimPixelKind.EmberOuter);
    for (let a = 0; a < 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      const hit = outer.some((p) => Math.abs(Math.atan2(p.y + 0.5, p.x + 0.5) - Math.atan2(Math.sin(rad), Math.cos(rad))) < 0.08);
      expect(hit).toBe(true);
    }
  });

  it('smuga ma jeden obrys: na styku dwóch plam nie ma brzegu, a piksel należy do jednej plamy', () => {
    const circles = [circle(0, 0, 9), circle(12, 0, 9)];
    const a = rimPixels(circles, 0, shape);
    const b = rimPixels(circles, 1, shape);
    const keys = [...a, ...b].map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Środek styku (x = 6) leży głęboko w sumie kół — bez skorupy i żaru.
    const seam = [...a, ...b].filter((p) => p.x === 6 && Math.abs(p.y) <= 1);
    expect(seam.every((p) => p.kind === RimPixelKind.Glow)).toBe(true);
    // Żaden piksel brzegu nie leży głębiej niż pas żaru i poświaty w drugiej plamie.
    for (const p of b.filter((q) => q.kind !== RimPixelKind.Glow)) expect(dist(p, circles[0]!)).toBeGreaterThan(9 - 2 - 0.01);
  });

  it('poświata rzednie w głąb plamy', () => {
    const c = circle(0, 0, 30);
    const glow = rimPixels([c], 0, shape).filter((p) => p.kind === RimPixelKind.Glow);
    const near = glow.filter((p) => dist(p, c) >= 27).length;
    const far = glow.filter((p) => dist(p, c) < 26).length;
    expect(near).toBeGreaterThan(far);
  });

  it('próg Bayera w (0, 1) także dla ujemnych współrzędnych', () => {
    for (const [x, y] of [[0, 0], [-1, -3], [5, 7]] as const) {
      expect(bayerThreshold(x, y)).toBeGreaterThan(0);
      expect(bayerThreshold(x, y)).toBeLessThan(1);
    }
  });
});

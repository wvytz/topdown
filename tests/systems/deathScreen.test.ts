import { describe, expect, it } from 'vitest';
import { DEATH_DRIPS as D, DEATH_SPLAT as S, DEATH_TIMING as T } from '@/config/deathScreenConfig';
import { pixelText } from '@/core/pixelArt';
import { createRng } from '@/core/random';
import {
  deathFrame,
  deathImpactAt,
  dripLength,
  dropsReleased,
  planDrips,
  planSplat,
  stepParticle,
} from '@/systems/deathScreen';

const title = pixelText('POLEGŁEŚ', 1);
const impact = deathImpactAt();

describe('POLEGŁEŚ w foncie pikselowym', () => {
  it('ma polskie litery, a akcent Ś wystaje nad linię liter', () => {
    expect(title.top).toBeLessThan(0);
    expect(title.cells.filter((c) => c.y < 0)).toHaveLength(2);
    expect(title.width).toBe(8 * 5 + 7);
  });
});

describe('deathFrame — sekwencja ekranu śmierci', () => {
  it('gra pod spodem mocno przyciemniona, ale nie zasłonięta całkiem', () => {
    expect(deathFrame(0).dimAlpha).toBe(0);
    expect(deathFrame(T.dimDuration).dimAlpha).toBeCloseTo(T.dimAlpha);
    expect(deathFrame(60_000).dimAlpha).toBeGreaterThanOrEqual(0.75);
    expect(deathFrame(60_000).dimAlpha).toBeLessThan(0.9);
  });

  it('napis uderza i staje w skali 1, błysk tylko po uderzeniu', () => {
    expect(deathFrame(T.slamAt - 1).titleVisible).toBe(false);
    expect(deathFrame(T.slamAt).titleScale).toBeCloseTo(T.slamFromScale);
    expect(deathFrame(impact - 1).flashAlpha).toBe(0);
    expect(deathFrame(impact).flashAlpha).toBeCloseTo(T.flashAlpha);
    expect(deathFrame(impact + T.settleDuration).titleScale).toBe(1);
    expect(deathFrame(impact + T.flashDuration).flashAlpha).toBe(0);
  });

  it('plama rozpryskuje się w chwili uderzenia, przestrzela i staje', () => {
    expect(deathFrame(impact - 1).splatScale).toBe(0);
    expect(deathFrame(impact).splatScale).toBeGreaterThan(0);
    expect(deathFrame(impact + T.splatGrowMs).splatScale).toBeCloseTo(T.splatOvershoot);
    expect(deathFrame(impact + T.splatGrowMs + T.splatSettleMs).splatScale).toBe(1);
    expect(deathFrame(10_000).splatScale).toBe(1);
  });

  it('wynik, potem wiersze tablicy po kolei, potem migający komunikat', () => {
    expect(deathFrame(T.scoreAt).scoreAlpha).toBe(0);
    expect(deathFrame(T.scoreAt + T.scoreFadeDuration).scoreAlpha).toBe(1);
    expect(deathFrame(T.rowsAt - 1).rowsVisible).toBe(0);
    expect(deathFrame(T.rowsAt).rowsVisible).toBe(1);
    expect(deathFrame(T.rowsAt + 2 * T.rowInterval).rowsVisible).toBe(3);
    expect(deathFrame(T.promptAt - 1).promptVisible).toBe(false);
    expect(deathFrame(T.promptAt).promptVisible).toBe(true);
    expect(deathFrame(T.promptAt + T.promptBlinkPeriod * 0.9).promptVisible).toBe(false);
  });
});

describe('planDrips — krew spływająca z liter', () => {
  const drips = planDrips(title.cells, createRng(D.salt));

  it('jest deterministyczny', () => {
    expect(planDrips(title.cells, createRng(D.salt))).toEqual(drips);
  });

  it('strugi ciekną z dolnych krawędzi liter, nie z akcentu, każda z innego miejsca', () => {
    const occupied = new Set(title.cells.map((c) => `${c.x},${c.y}`));
    expect(drips).toHaveLength(D.count);
    for (const { cell } of drips) {
      expect(occupied.has(`${cell.x},${cell.y + 1}`)).toBe(false);
      expect(cell.y).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(drips.map((d) => `${d.cell.x},${d.cell.y}`)).size).toBe(drips.length);
  });

  it('parametry w granicach konfiguracji', () => {
    for (const d of drips) {
      expect(d.startAt).toBeGreaterThanOrEqual(D.startAt);
      expect(d.startAt).toBeLessThanOrEqual(D.startAt + D.startSpread);
      expect(d.maxLength).toBeGreaterThanOrEqual(D.minLength);
      expect(d.maxLength).toBeLessThanOrEqual(D.maxLength);
      expect(d.growMs).toBeGreaterThanOrEqual(D.minGrowMs);
    }
  });

  it('struga rośnie od zera, nie maleje i staje na pełnej długości', () => {
    const d = drips[0]!;
    expect(dripLength(d, d.startAt - 1)).toBe(0);
    let prev = 0;
    for (let t = d.startAt; t <= d.startAt + d.growMs + 500; t += 37) {
      const len = dripLength(d, t);
      expect(len).toBeGreaterThanOrEqual(prev);
      prev = len;
    }
    expect(dripLength(d, d.startAt + d.growMs)).toBe(d.maxLength);
  });

  it('krople odrywają się dopiero od pełnej strugi, co okres', () => {
    const d = { cell: { x: 0, y: 0 }, startAt: 1000, growMs: 2000, maxLength: 40, dropPeriodMs: 1000 };
    expect(dropsReleased(d, 2999)).toBe(0);
    expect(dropsReleased(d, 3999)).toBe(0);
    expect(dropsReleased(d, 4000)).toBe(1);
    expect(dropsReleased(d, 6500)).toBe(3);
  });
});

describe('planSplat — plama krwi za napisem', () => {
  const splat = planSplat(createRng(S.salt));
  const set = new Set(splat.map((c) => `${c.x},${c.y}`));

  it('jest deterministyczna i ma środek pod napisem', () => {
    expect(planSplat(createRng(S.salt))).toEqual(splat);
    expect(set.has('0,0')).toBe(true);
  });

  it('jest szersza niż napis i nie sięga poza ekran', () => {
    const xs = splat.map((c) => c.x * S.cell);
    const ys = splat.map((c) => c.y * S.cell);
    const titleHalf = (title.width * 10) / 2;
    expect(Math.max(...xs)).toBeGreaterThan(titleHalf);
    expect(Math.min(...xs)).toBeLessThan(-titleHalf);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(480);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(200);
  });

  it('brzeg ciemniejszy: każda komórka brzegowa ma pustego sąsiada, wnętrze nie', () => {
    for (const { x, y, tone } of splat) {
      const hasGap = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !set.has(`${x + dx!},${y + dy!}`));
      expect(tone === 'edge').toBe(hasGap);
    }
  });

  it('wokół plamy leżą oderwane krople (rozbryzg), nie tylko jedna bryła', () => {
    const far = splat.filter(({ x, y }) => (x / S.rx) ** 2 + (y / S.ry) ** 2 > 1.2);
    expect(far.length).toBeGreaterThan(20);
  });
});

describe('stepParticle', () => {
  it('grawitacja przyspiesza spadanie', () => {
    let p = { x: 0, y: 0, vx: 0.1, vy: 0 };
    p = stepParticle(p, 100, 0.001);
    expect(p.vy).toBeCloseTo(0.1);
    expect(p.x).toBeCloseTo(10);
    const next = stepParticle(p, 100, 0.001);
    expect(next.y - p.y).toBeGreaterThan(p.y);
  });
});

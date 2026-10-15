import { describe, expect, it } from 'vitest';
import { DEATH_CRUMBLE as C, DEATH_TIMING as T } from '@/config/deathScreenConfig';
import { pixelText } from '@/core/pixelArt';
import { createRng } from '@/core/random';
import {
  deathFrame,
  deathImpactAt,
  dripsReleased,
  planCrumble,
  planDrips,
  splitIntoBlocks,
  stepParticle,
} from '@/systems/deathScreen';

const title = pixelText('POLEGŁEŚ', 1);
const blocks = splitIntoBlocks(title.cells, C.blocksPerPixel);
const impact = deathImpactAt();

describe('POLEGŁEŚ w foncie pikselowym', () => {
  it('ma polskie litery, a akcent Ś wystaje nad linię liter', () => {
    expect(title.top).toBeLessThan(0);
    expect(title.cells.filter((c) => c.y < 0)).toHaveLength(2);
    expect(title.width).toBe(8 * 5 + 7);
  });
});

describe('deathFrame — sekwencja ekranu śmierci', () => {
  it('gra pod spodem tylko przyciemniona, nigdy zasłonięta', () => {
    expect(deathFrame(0).dimAlpha).toBe(0);
    expect(deathFrame(T.dimDuration).dimAlpha).toBeCloseTo(T.dimAlpha);
    expect(deathFrame(60_000).dimAlpha).toBeLessThan(0.8);
  });

  it('napis uderza i staje w skali 1, błysk tylko po uderzeniu', () => {
    expect(deathFrame(T.slamAt - 1).titleVisible).toBe(false);
    expect(deathFrame(T.slamAt).titleScale).toBeCloseTo(T.slamFromScale);
    expect(deathFrame(impact - 1).flashAlpha).toBe(0);
    expect(deathFrame(impact).flashAlpha).toBeCloseTo(T.flashAlpha);
    expect(deathFrame(impact + T.settleDuration).titleScale).toBe(1);
    expect(deathFrame(impact + T.flashDuration).flashAlpha).toBe(0);
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

describe('planCrumble — rozkład napisu', () => {
  const plan = planCrumble(blocks, createRng(C.salt));

  it('jest deterministyczny', () => {
    expect(planCrumble(blocks, createRng(C.salt))).toEqual(plan);
  });

  it('odpada najwyżej maxFraction bloków — napis zostaje czytelny', () => {
    const fallen = plan.filter((at) => at !== null).length;
    expect(fallen).toBeGreaterThan(0);
    expect(fallen).toBeLessThanOrEqual(Math.floor(blocks.length * C.maxFraction));
  });

  it('nic nie odpada przed startem rozkładu ani po jego końcu', () => {
    for (const at of plan) {
      if (at === null) continue;
      expect(at).toBeGreaterThanOrEqual(C.startAt);
      expect(at).toBeLessThanOrEqual(C.startAt + C.duration);
    }
  });

  it('wnętrze liter kruszy się dopiero w drugiej części okna', () => {
    const occupied = new Set(blocks.map((b) => `${b.x},${b.y}`));
    const inner = (b: { x: number; y: number }) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => occupied.has(`${b.x + dx!},${b.y + dy!}`));
    blocks.forEach((b, i) => {
      const at = plan[i];
      if (at != null && inner(b)) expect(at).toBeGreaterThanOrEqual(C.startAt + C.duration * C.innerDelayFraction);
    });
  });
});

describe('planDrips — cieknąca krew', () => {
  const drips = planDrips(blocks, createRng(C.salt + 1));

  it('krople ciekną z dolnych krawędzi liter, nie z akcentu', () => {
    const occupied = new Set(blocks.map((b) => `${b.x},${b.y}`));
    expect(drips).toHaveLength(C.dripCount);
    for (const { block, periodMs, offsetMs } of drips) {
      expect(occupied.has(`${block.x},${block.y + 1}`)).toBe(false);
      expect(block.y).toBeGreaterThanOrEqual(0);
      expect(periodMs).toBeGreaterThanOrEqual(C.dripMinPeriodMs);
      expect(offsetMs).toBeLessThan(periodMs);
    }
    expect(new Set(drips.map((d) => `${d.block.x},${d.block.y}`)).size).toBe(drips.length);
  });

  it('liczba kropel rośnie co okres', () => {
    const d = { block: { x: 0, y: 0 }, periodMs: 1000, offsetMs: 0 };
    expect(dripsReleased(d, 500, 1000)).toBe(0);
    expect(dripsReleased(d, 1999, 1000)).toBe(0);
    expect(dripsReleased(d, 2000, 1000)).toBe(1);
    expect(dripsReleased(d, 4500, 1000)).toBe(3);
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

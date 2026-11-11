import { describe, expect, it } from 'vitest';
import { RenderQuality } from '@/core/displayTypes';
import { HitstopKind } from '@/core/combatFeelTypes';
import { COMBAT_FEEL_CONFIG, COMBAT_FEEL_LEVELS } from '@/config/combatFeelConfig';
import { renderProfile } from '@/systems/RenderQuality';
import { HitstopClock, combatFeelLevel, isFeelOff, isHeavyHit, shatterPieces, slashSegments } from '@/systems/CombatFeel';

/** Stały strumień „losu” do testów geometrii (efekt w grze używa Math.random). */
function seq(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('feel walki (krok U2)', () => {
  it('Niska = gra sprzed upgradu: żaden efekt feelu nie działa', () => {
    expect(isFeelOff(combatFeelLevel(renderProfile(RenderQuality.Low, false)))).toBe(true);
    expect(COMBAT_FEEL_LEVELS[RenderQuality.Low].shatterPieces).toBe(0);
  });

  it('wyższy poziom nie ma mniej efektów niż niższy', () => {
    const order = [RenderQuality.Low, RenderQuality.Medium, RenderQuality.High];
    for (let i = 1; i < order.length; i++) {
      const lower = COMBAT_FEEL_LEVELS[order[i - 1]!];
      const higher = COMBAT_FEEL_LEVELS[order[i]!];
      for (const key of ['hitSparks', 'slashTrail', 'shatter', 'blastOverDark', 'projectileHalo', 'heroHurtFlash', 'hitstop'] as const) {
        if (lower[key]) expect(higher[key]).toBe(true);
      }
      expect(higher.shatterPieces).toBeGreaterThanOrEqual(lower.shatterPieces);
      expect(higher.sparkCount).toBeGreaterThanOrEqual(lower.sparkCount);
    }
  });

  it('„mniej błysków” wyłącza hitstop, a reszta efektów zostaje', () => {
    const calm = combatFeelLevel(renderProfile(RenderQuality.High, true));
    expect(calm.hitstop).toBe(false);
    expect(calm.hitSparks).toBe(true);
    expect(combatFeelLevel(renderProfile(RenderQuality.High, false)).hitstop).toBe(true);
  });

  it('ciężki cios to trafienie od progu z configu', () => {
    const t = COMBAT_FEEL_CONFIG.hitstop.heavyHitDamage;
    expect(isHeavyHit(t)).toBe(true);
    expect(isHeavyHit(t - 1)).toBe(false);
  });
});

describe('zegar hitstopu', () => {
  const { ms, cooldownMs } = COMBAT_FEEL_CONFIG.hitstop;

  it('wyłączony nic nie zatrzymuje', () => {
    const clock = new HitstopClock();
    expect(clock.request(HitstopKind.BossKill, 0, false)).toBe(0);
    expect(clock.shouldHold(16)).toBe(false);
  });

  it('klatka zdarzenia rysuje się normalnie, zatrzymanie trwa od następnej przez przyznany czas', () => {
    const clock = new HitstopClock();
    expect(clock.request(HitstopKind.EliteKill, 1000, true)).toBe(ms[HitstopKind.EliteKill]);
    expect(clock.shouldHold(1016)).toBe(true);
    expect(clock.shouldHold(1016 + ms[HitstopKind.EliteKill] - 1)).toBe(true);
    expect(clock.shouldHold(1016 + ms[HitstopKind.EliteKill])).toBe(false);
  });

  it('w nawale kolejne prośby w czasie przerwy przepadają, zabicie bossa — nie', () => {
    const clock = new HitstopClock();
    clock.request(HitstopKind.HeavyHit, 0, true);
    expect(clock.request(HitstopKind.EliteKill, cooldownMs - 1, true)).toBe(0);
    expect(clock.request(HitstopKind.HeavyHit, cooldownMs, true)).toBe(ms[HitstopKind.HeavyHit]);
    expect(clock.request(HitstopKind.BossKill, cooldownMs + 1, true)).toBe(ms[HitstopKind.BossKill]);
  });

  it('reset przerywa zatrzymanie', () => {
    const clock = new HitstopClock();
    clock.request(HitstopKind.BossKill, 0, true);
    expect(clock.shouldHold(10)).toBe(true);
    clock.reset();
    expect(clock.shouldHold(20)).toBe(false);
  });
});

describe('rozpad i smuga', () => {
  it('kawałki mają tor na każdą klatkę w pełnych pikselach i rozchodzą się na boki', () => {
    const pieces = shatterPieces(8, 2, seq([0.5, 0.3, 0.9, 0.1]));
    expect(pieces).toHaveLength(8);
    for (const piece of pieces) {
      expect(piece.frames).toHaveLength(COMBAT_FEEL_CONFIG.shatter.frames);
      for (const p of piece.frames) {
        expect(Number.isInteger(p.x)).toBe(true);
        expect(Number.isInteger(p.y)).toBe(true);
      }
    }
    const xs = pieces.map((p) => p.frames.at(-1)!.x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(new Set(pieces.map((p) => p.colorIndex))).toEqual(new Set([0, 1]));
  });

  it('smuga pokrywa dokładnie łuk ciosu', () => {
    const segs = slashSegments(1, 2, 4);
    expect(segs).toHaveLength(5);
    expect(segs[0]).toBeCloseTo(0);
    expect(segs.at(-1)).toBeCloseTo(2);
  });
});

describe('czas obrazu', () => {
  it('nie płynie w czasie zatrzymania — animacje efektów czekają na odmrożenie', () => {
    const clock = new HitstopClock();
    clock.shouldHold(0);
    clock.shouldHold(16);
    expect(clock.visualTime).toBe(16);
    clock.request(HitstopKind.BossKill, 16, true);
    for (let t = 32; t < 32 + COMBAT_FEEL_CONFIG.hitstop.ms[HitstopKind.BossKill]; t += 16) clock.shouldHold(t);
    expect(clock.visualTime).toBe(16);
    clock.shouldHold(1000);
    expect(clock.visualTime).toBeGreaterThan(16);
  });
});

import { describe, expect, it } from 'vitest';
import { GRAVEYARD_AMBIENT, GROVE_AMBIENT } from '@/config/ambientConfig';
import {
  GlowPhase,
  RavenPhase,
  alarmRaven,
  glowLightRadius,
  initialGlow,
  initialRaven,
  mothOffset,
  mothScatter,
  pulseFrame,
  stepGlow,
  stepRaven,
  stepWisp,
  wispPosition,
} from '@/systems/AmbientLife';
import type { AmbientThreat, GlowState } from '@/systems/AmbientLife';

const CAP = GROVE_AMBIENT.glowcap;
const CANDLE = GRAVEYARD_AMBIENT.candle;
const RAVENS = GRAVEYARD_AMBIENT.ravens;
const WISPS = GRAVEYARD_AMBIENT.wisps;
const near = (distance: number, dashing = false): AmbientThreat => ({ x: 0, y: 0, distance, dashing });

/** Przepuszcza stan przez kolejne kroki co 50 ms. */
function run(state: GlowState, from: number, to: number, threat: AmbientThreat | null, config = CAP, snuff?: number): GlowState {
  let s = state;
  for (let t = from; t <= to; t += 50) s = stepGlow(s, t, threat, config, snuff).state;
  return s;
}

describe('żywe otoczenie — rekwizyty świecące (krok 156)', () => {
  it('kępa grzybów płoszy się, gdy bohater wejdzie w promień: skulenie → przygaszenie → powrót → pulsuje', () => {
    const calm = initialGlow(true);
    const far = stepGlow(calm, 0, near(CAP.startleRadius + 1), CAP);
    expect(far.event).toBeNull();
    const hit = stepGlow(calm, 100, near(CAP.startleRadius - 1), CAP);
    expect(hit.event).toBe('startle');
    expect(hit.state.phase).toBe(GlowPhase.Flinch);
    const dim = run(hit.state, 150, 100 + CAP.flinchMs + 50, null);
    expect(dim.phase).toBe(GlowPhase.Dim);
    const recover = run(dim, 100 + CAP.flinchMs + 100, 100 + CAP.flinchMs + CAP.dimMs + 200, null);
    expect(recover.phase).toBe(GlowPhase.Recover);
    const back = run(recover, 100 + CAP.flinchMs + CAP.dimMs + 250, 100 + CAP.flinchMs + CAP.dimMs + CAP.recoverMs + 400, null);
    expect(back.phase).toBe(GlowPhase.Calm);
  });

  it('przygaszony grzyb czeka, aż bohater odejdzie; stanie obok nie płoszy w kółko', () => {
    const hit = stepGlow(initialGlow(true), 0, near(5), CAP).state;
    const stay = run(hit, 50, 10_000, near(5));
    expect(stay.phase).toBe(GlowPhase.Dim);
    // Znicz bez przygaszania: po szarpnięciu płomień wraca, a stojący obok bohater nie szarpie nim ponownie.
    let candle = stepGlow(initialGlow(true), 0, near(5), CANDLE).state;
    let startles = 0;
    for (let t = 50; t < 5000; t += 50) {
      const step = stepGlow(candle, t, near(5), CANDLE);
      if (step.event) startles++;
      candle = step.state;
    }
    expect(startles).toBe(0);
    expect(candle.phase).toBe(GlowPhase.Calm);
  });

  it('dash obok znicza gasi go na dobre; zwykły chód — nie; grzybów dash nie gasi', () => {
    const lit = initialGlow(true);
    const walk = stepGlow(lit, 0, near(CANDLE.snuffRadius - 2), CANDLE, CANDLE.snuffRadius);
    expect(walk.state.phase).not.toBe(GlowPhase.Out);
    const dash = stepGlow(lit, 0, near(CANDLE.snuffRadius - 2, true), CANDLE, CANDLE.snuffRadius);
    expect(dash.event).toBe('snuff');
    expect(dash.state.phase).toBe(GlowPhase.Out);
    expect(run(dash.state, 50, 20_000, null, CANDLE, CANDLE.snuffRadius).phase).toBe(GlowPhase.Out);
    expect(stepGlow(lit, 0, near(2, true), CAP).state.phase).toBe(GlowPhase.Flinch);
    expect(initialGlow(false).phase).toBe(GlowPhase.Out);
  });

  it('światło pulsuje skokami w spokoju, maleje po spłoszeniu, wraca schodkami, zgaszone = 0', () => {
    const calm = initialGlow(true);
    const radii = CAP.pulseOffsets.map((_, f) => glowLightRadius(calm, 0, CAP, f));
    expect(new Set(radii).size).toBeGreaterThan(1);
    expect(Math.min(...radii)).toBeGreaterThan(CAP.dimRadius);
    const dim: GlowState = { ...calm, phase: GlowPhase.Dim };
    expect(glowLightRadius(dim, 0, CAP, 0)).toBe(CAP.dimRadius);
    const recover: GlowState = { ...calm, phase: GlowPhase.Recover, since: 0 };
    const mid = glowLightRadius(recover, CAP.recoverMs / 2, CAP, 0);
    expect(mid).toBeGreaterThan(CAP.dimRadius);
    expect(mid).toBeLessThan(CAP.lightRadius);
    expect(mid % 2).toBe(0);
    expect(glowLightRadius(initialGlow(false), 0, CANDLE, 0)).toBe(0);
  });

  it('klatka pulsu krąży w zakresie, z przesunięciem fazy', () => {
    for (let t = 0; t < 3000; t += 77) {
      const f = pulseFrame(t, 6, 3, 6);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(6);
    }
    expect(pulseFrame(0, 6, 2, 6)).toBe(2);
    expect(pulseFrame(1000, 6, 0, 6)).toBe(0);
  });
});

describe('żywe otoczenie — ćmy (krok 156)', () => {
  it('krążą blisko kępy, po spłoszeniu rozpraszają się szeroko i wracają', () => {
    const moths = GROVE_AMBIENT.moths;
    const calm = initialGlow(true);
    expect(mothScatter(calm, 1000, moths)).toBe(0);
    const startled: GlowState = { ...calm, startledAt: 1000 };
    expect(mothScatter(startled, 1000, moths)).toBe(1);
    expect(mothScatter(startled, 1000 + moths.recoverMs / 2, moths)).toBeCloseTo(0.5);
    expect(mothScatter(startled, 1000 + moths.recoverMs, moths)).toBe(0);
    const reach = (scatter: number) => Math.max(...Array.from({ length: 40 }, (_, i) => Math.abs(mothOffset(i * 97, 1, 3, moths, scatter).x)));
    expect(reach(0)).toBeLessThanOrEqual(moths.orbitRadius * 1.2);
    expect(reach(1)).toBeGreaterThan(moths.orbitRadius * 2);
  });
});

describe('żywe otoczenie — kruki (krok 156)', () => {
  it('siedzi, póki bohater daleko; z bliska zrywa się i odlatuje od niego, wznosi się i znika', () => {
    const perched = initialRaven(100, 100);
    expect(stepRaven(perched, 0, 16, { x: 100 + RAVENS.fleeRadius + 5, y: 100, distance: RAVENS.fleeRadius + 5, dashing: false }, RAVENS).event).toBeNull();
    const off = stepRaven(perched, 0, 16, { x: 70, y: 100, distance: 30, dashing: false }, RAVENS);
    expect(off.event).toBe('takeoff');
    expect(off.state.phase).toBe(RavenPhase.Flying);
    expect(off.state.dirX).toBeGreaterThan(0.9);
    let s = off.state;
    for (let t = 16; t < RAVENS.flightMs - 20; t += 16) s = stepRaven(s, t, 16, null, RAVENS).state;
    expect(s.x).toBeGreaterThan(200);
    expect(s.height).toBeGreaterThan(30);
    expect(stepRaven(s, RAVENS.flightMs + 1, 16, null, RAVENS).state.phase).toBe(RavenPhase.Gone);
  });

  it('dash płoszy z dalszej odległości', () => {
    const d = (RAVENS.fleeRadius + RAVENS.dashFleeRadius) / 2;
    const perched = initialRaven(0, 0);
    expect(stepRaven(perched, 0, 16, { x: d, y: 0, distance: d, dashing: false }, RAVENS).event).toBeNull();
    expect(stepRaven(perched, 0, 16, { x: d, y: 0, distance: d, dashing: true }, RAVENS).event).toBe('takeoff');
  });

  it('alarm stada zrywa sąsiada w wyznaczonej chwili, od miejsca spłoszenia; wcześniejszy alarm wygrywa', () => {
    const raven = alarmRaven(alarmRaven(initialRaven(50, 0), 500, { x: 0, y: 0 }), 800, { x: 100, y: 0 });
    expect(raven.alarmAt).toBe(500);
    expect(stepRaven(raven, 499, 16, null, RAVENS).event).toBeNull();
    const off = stepRaven(raven, 500, 16, null, RAVENS);
    expect(off.event).toBe('takeoff');
    expect(off.state.dirX).toBeGreaterThan(0.9);
  });
});

describe('żywe otoczenie — błędne ogniki (krok 156)', () => {
  const bounds = { left: 0, top: 0, right: 320, bottom: 224 };
  const wisp = { homeX: 160, homeY: 112, swayRadius: 10, phase: 0 };

  it('snuje się ósemką wokół domu, nie dalej niż promień kołysania', () => {
    for (let t = 0; t < 10_000; t += 123) {
      const p = wispPosition(wisp, t, WISPS);
      expect(Math.abs(p.x - wisp.homeX)).toBeLessThanOrEqual(wisp.swayRadius + 1e-9);
      expect(Math.abs(p.y - wisp.homeY)).toBeLessThanOrEqual(wisp.swayRadius / 2 + 1e-9);
    }
  });

  it('ucieka od bohatera, ale zostaje w pokoju z dala od murów', () => {
    expect(stepWisp(wisp, 0, 16, { x: 0, y: 0 }, bounds, WISPS)).toBe(wisp);
    let s = wisp;
    const hero = { x: 140, y: 112 };
    for (let t = 0; t < 1000; t += 16) s = stepWisp(s, t, 16, hero, bounds, WISPS);
    expect(s.homeX).toBeGreaterThan(wisp.homeX + 20);
    for (let t = 1000; t < 30_000; t += 16) s = stepWisp(s, t, 16, { x: s.homeX - 10, y: s.homeY }, bounds, WISPS);
    expect(s.homeX).toBeLessThanOrEqual(bounds.right - WISPS.wallMarginPx - s.swayRadius);
  });
});

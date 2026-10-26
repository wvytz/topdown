import { describe, expect, it } from 'vitest';
import { physicsSteps } from '@/systems/PhysicsStep';
import { PHYSICS_STEP_CONFIG } from '@/config/gameConfig';

const MAX = 1000 / 60;
const total = (s: { steps: number; stepMs: number }) => s.steps * s.stepMs;

describe('physicsSteps (krok 114)', () => {
  it('60 Hz: jeden krok 1/60 s — jak dotąd', () => {
    const s = physicsSteps(1000 / 60, MAX, 8);
    expect(s.steps).toBe(1);
    expect(s.stepMs).toBeCloseTo(MAX, 9);
  });

  it.each([75, 120, 144, 165, 240])('%i Hz: każda klatka przesuwa świat o swój czas (żadnej klatki bez ruchu)', (hz) => {
    const delta = 1000 / hz;
    const s = physicsSteps(delta, MAX, 8);
    expect(s.steps).toBe(1);
    expect(total(s)).toBeCloseTo(delta, 9);
  });

  it('wolna klatka dzieli się na równe kroki nie dłuższe niż 1/60 s', () => {
    for (const delta of [20, 33.4, 50, 100]) {
      const s = physicsSteps(delta, MAX, 8);
      expect(s.stepMs).toBeLessThanOrEqual(MAX + 1e-9);
      expect(total(s)).toBeCloseTo(delta, 9);
      expect(s.steps).toBe(Math.ceil(delta / MAX));
    }
  });

  it('po długim zacięciu przycina czas do limitu kroków', () => {
    const s = physicsSteps(1000, MAX, 8);
    expect(s.steps).toBe(8);
    expect(s.stepMs).toBeCloseTo(MAX, 9);
  });

  it('klatka bez upływu czasu nie liczy kroków', () => {
    expect(physicsSteps(0, MAX, 8).steps).toBe(0);
    expect(physicsSteps(-5, MAX, 8).steps).toBe(0);
    expect(physicsSteps(Number.NaN, MAX, 8).steps).toBe(0);
  });

  it('konfiguracja: najdłuższy krok jak stary stały krok Phasera', () => {
    expect(PHYSICS_STEP_CONFIG.maxStepMs).toBeCloseTo(1000 / 60, 9);
    expect(PHYSICS_STEP_CONFIG.maxStepsPerFrame).toBeGreaterThanOrEqual(4);
  });
});

/** Podział klatki na kroki fizyki (krok 114). */
export interface PhysicsSteps {
  /** Ile kroków policzyć w tej klatce (0 = klatka bez upływu czasu). */
  readonly steps: number;
  /** Długość jednego kroku (ms); wszystkie kroki klatki są równe. */
  readonly stepMs: number;
}

/**
 * Dzieli czas klatki na równe kroki nie dłuższe niż `maxStepMs`. Ruch na ekranie rośnie wtedy z każdą klatką
 * o tyle, ile upłynęło czasu — także na monitorach 75–165 Hz, gdzie stały krok 1/60 s dawał klatki bez ruchu.
 * Powyżej `maxSteps` kroków czas klatki jest przycinany (gra na chwilę zwalnia po długim zacięciu).
 */
export function physicsSteps(deltaMs: number, maxStepMs: number, maxSteps: number): PhysicsSteps {
  if (!(deltaMs > 0)) return { steps: 0, stepMs: maxStepMs };
  const steps = Math.min(maxSteps, Math.ceil(deltaMs / maxStepMs - 1e-9));
  const frameMs = Math.min(deltaMs, steps * maxStepMs);
  return { steps, stepMs: frameMs / steps };
}

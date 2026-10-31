import type { Vector2 } from '@/core/types';

/**
 * Ogień walki (krok 144) — czysta część: dobór arkusza kuli, liczba płomieni, miejsca płomieni, światło,
 * wstrząs i pierścień zaciskającego się telegrafu. Warstwa Phasera (`effects/FireEffects.ts`) tylko to rysuje.
 */

/** Arkusz kuli ognia (bok komórki) i całkowita skala — pełne piksele, bez rozmytego skalowania. */
export interface BurstSprite {
  readonly size: number;
  readonly scale: number;
}

/**
 * Najmniejszy arkusz, którego kula (× `cover` średnicy strefy) mieści się w skali 1; większe strefy — największy
 * arkusz w zaokrąglonej skali całkowitej (co najmniej 1).
 */
export function burstSpriteFor(radius: number, sizes: readonly number[], cover: number): BurstSprite {
  const want = Math.max(1, radius * 2 * cover);
  const sorted = [...sizes].sort((a, b) => a - b);
  for (const size of sorted) if (want <= size) return { size, scale: 1 };
  const size = sorted.at(-1)!;
  return { size, scale: Math.max(1, Math.round(want / size)) };
}

/** Ile płomieni zostaje w strefie: jeden na `areaPerFlame` px², w granicach [min, max]. */
export function flameCount(radius: number, cfg: { readonly areaPerFlame: number; readonly min: number; readonly max: number }): number {
  const raw = Math.round((Math.PI * radius * radius) / cfg.areaPerFlame);
  return Math.min(cfg.max, Math.max(cfg.min, raw));
}

/** Miejsca płomieni równomiernie w kole o promieniu `radius × spread` (pierwiastek — bez skupienia w środku). */
export function flameSpots(center: Vector2, radius: number, count: number, spread: number, random: () => number): Vector2[] {
  const spots: Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * radius * spread;
    spots.push({ x: center.x + Math.cos(angle) * dist, y: center.y + Math.sin(angle) * dist });
  }
  return spots;
}

/** Ile iskier albo kłębów dymu: `perRadius` na piksel promienia, skalowane jakością, w granicach [1, max]. */
export function particleCount(radius: number, perRadius: number, max: number, scale: number): number {
  return Math.min(max, Math.max(1, Math.round(radius * perRadius * scale)));
}

/** Siła wstrząsu kamery: rośnie z promieniem, między `min` a `max`. */
export function shakeIntensity(radius: number, cfg: { readonly perRadius: number; readonly min: number; readonly max: number }): number {
  return Math.min(cfg.max, Math.max(cfg.min, radius * cfg.perRadius));
}

/** Szczytowy promień światła ognia (zaokrąglony do `step` — tekstury światła są wspólne dla promienia). */
export function fireLightPeak(radius: number, cfg: { readonly radiusScale: number; readonly minRadius: number; readonly maxRadius: number; readonly step: number }): number {
  const raw = Math.min(cfg.maxRadius, Math.max(cfg.minRadius, radius * cfg.radiusScale));
  return Math.max(cfg.step, Math.round(raw / cfg.step) * cfg.step);
}

/**
 * Promień światła w chwili `age` (ms od wybuchu): pełny błysk, potem gaśnie (kwadratowo) do zera w `durationMs`.
 * Zaokrąglony w dół do `step`; 0 = światło zgasło.
 */
export function fireLightRadius(peak: number, age: number, durationMs: number, step: number): number {
  if (age < 0 || age >= durationMs) return 0;
  const left = 1 - age / durationMs;
  return Math.floor((peak * left * left) / step) * step;
}

/**
 * Pierścień telegrafu zaciskający się na brzeg strefy: od `startScale × r` (po `fromProgress` telegrafu)
 * do dokładnie `r` w chwili uderzenia — przyspiesza pod koniec. `null` — jeszcze go nie ma.
 */
export function closingRingRadius(radius: number, progress: number, startScale: number, fromProgress: number): number | null {
  if (progress < fromProgress) return null;
  const t = Math.min(1, (progress - fromProgress) / Math.max(1e-6, 1 - fromProgress));
  return radius * (startScale - (startScale - 1) * t * t);
}

/** Bramka częstotliwości (np. huk wybuchu): przepuszcza najwyżej raz na `gapMs`. */
export class RateGate {
  private last = Number.NEGATIVE_INFINITY;

  constructor(private readonly gapMs: number) {}

  pass(now: number): boolean {
    if (now - this.last < this.gapMs) return false;
    this.last = now;
    return true;
  }
}

/**
 * Budżet obiektów naraz (pula): `take(n)` daje tyle, ile się mieści (0..n), `release(n)` oddaje.
 * Gdy pula pełna, nowe efekty są pomijane — gra nie tworzy obiektów ponad limit (telefon).
 */
export class FireBudget {
  private used = 0;

  constructor(readonly capacity: number) {}

  get active(): number {
    return this.used;
  }

  take(n: number): number {
    const granted = Math.max(0, Math.min(n, this.capacity - this.used));
    this.used += granted;
    return granted;
  }

  release(n = 1): void {
    this.used = Math.max(0, this.used - n);
  }
}

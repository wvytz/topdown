import type { RenderProfile } from '@/core/displayTypes';
import type { DynamicLightLevel, LightSource } from '@/core/lightTypes';
import type { Vector2 } from '@/core/types';
import { DYNAMIC_LIGHT_CONFIG, DYNAMIC_LIGHT_LEVELS } from '@/config/dynamicLightConfig';
import { lightTouchesView } from '@/systems/lighting';
import type { ViewRect } from '@/systems/lighting';

/**
 * Światło 2.0 (krok U3) — czysta logika: poziom z profilu jakości, promienie błysków, światła wzdłuż promienia
 * i wybór świateł do kadru przy limicie. Phaser (`effects/DynamicLights.ts`) tylko zbiera źródła i maluje.
 */

/** Poziom świateł dynamicznych; „mniej błysków” wyłącza błyski wybuchów i magii, pociski świecą dalej. */
export function dynamicLightLevel(profile: RenderProfile): DynamicLightLevel {
  const level = DYNAMIC_LIGHT_LEVELS[profile.quality];
  return profile.screenFlash ? level : { ...level, flashes: false };
}

/** Niska nie może mieć żadnego światła dynamicznego (plan wycofania, §13.3). */
export function isLightOff(level: DynamicLightLevel): boolean {
  return !level.shots && !level.flashes && !level.beam && !level.tint && level.maxLights <= 0;
}

/** Promień zaokrąglony w dół do wielokrotności `step` (mniej tekstur stempli, skokowe gaśnięcie). */
export function quantizeRadius(radius: number, step: number = DYNAMIC_LIGHT_CONFIG.radiusStep): number {
  if (!(radius > 0)) return 0;
  return Math.floor(radius / step) * step;
}

/** Szczytowy promień światła błysku dla strefy o promieniu `zone` (w granicach z configu). */
export function flashPeakRadius(zone: number): number {
  const { radiusScale, minRadius, maxRadius } = DYNAMIC_LIGHT_CONFIG.flash;
  return quantizeRadius(Math.min(maxRadius, Math.max(minRadius, zone * radiusScale)));
}

/**
 * Promień gasnącego błysku po `ageMs`: szybko na początku, łagodnie pod koniec (kwadrat pozostałego czasu),
 * skokowo co `step`. 0 — błysk zgasł (albo jeszcze go nie ma).
 */
export function flashRadius(peak: number, ageMs: number, durationMs: number = DYNAMIC_LIGHT_CONFIG.flash.durationMs): number {
  if (ageMs < 0 || ageMs >= durationMs || peak <= 0) return 0;
  const left = 1 - ageMs / durationMs;
  return quantizeRadius(peak * left * left);
}

/**
 * Punkty światła wzdłuż promienia: od kryształu do końca co `spacing`, zawsze z końcem; najwyżej `maxPoints`
 * (przy długim promieniu odstęp rośnie, żeby światło pokryło całą długość).
 */
export function beamLightPoints(
  from: Vector2,
  to: Vector2,
  spacing: number = DYNAMIC_LIGHT_CONFIG.beam.spacing,
  maxPoints: number = DYNAMIC_LIGHT_CONFIG.beam.maxPoints,
): Vector2[] {
  if (maxPoints <= 0) return [];
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.min(maxPoints, Math.max(1, Math.ceil(length / Math.max(1, spacing)) + 1));
  if (count === 1) return [{ x: to.x, y: to.y }];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
}

/**
 * Światła do narysowania w kadrze: tylko te, które go dotykają, z promieniem > 0, w kolejności ważności rodzaju
 * (pociski wrogów pierwsze), a w obrębie rodzaju — większe; najwyżej `max`. Kolejność stała dla tych samych danych.
 */
export function selectLights(sources: readonly LightSource[], view: ViewRect, max: number): LightSource[] {
  if (max <= 0) return [];
  const kinds = DYNAMIC_LIGHT_CONFIG.kinds;
  return sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => source.radius > 0 && lightTouchesView(source, source.radius, view))
    .sort((a, b) => kinds[a.source.kind].priority - kinds[b.source.kind].priority || b.source.radius - a.source.radius || a.index - b.index)
    .slice(0, max)
    .map(({ source }) => source);
}

/** Czy obiekt (środek, połowa rozmiaru) jest w kadrze z zapasem `margin` — poświata poza kadrem gaśnie. */
export function inViewWithMargin(at: Vector2, halfSize: number, view: ViewRect, margin: number = DYNAMIC_LIGHT_CONFIG.glowCullMargin): boolean {
  return lightTouchesView(at, halfSize + margin, view);
}

/** Siła (alfa w narożniku) światła Czarnego Słońca na piętrze — rośnie z piętrem w obrębie kręgu wieży. */
export function blackSunAlpha(floor: number): number {
  const { baseAlpha, perFloor, maxAlpha, floorsPerLoop } = DYNAMIC_LIGHT_CONFIG.blackSun;
  const inLoop = ((Math.max(1, Math.floor(floor)) - 1) % floorsPerLoop) + 1;
  return Math.min(maxAlpha, baseAlpha + perFloor * (inLoop - 1));
}

/**
 * Jasność gradientu Czarnego Słońca (0..1) w punkcie kadru (u, v ∈ [0, 1], u w prawo, v w dół): 1 w prawym górnym
 * narożniku, płynnie (smoothstep) do 0 w odległości `reach` przekątnej — bez twardej krawędzi (§13.7).
 */
export function blackSunFalloff(u: number, v: number, reach: number = DYNAMIC_LIGHT_CONFIG.blackSun.reach): number {
  const d = Math.hypot(1 - u, v) / Math.SQRT2;
  if (reach <= 0 || d >= reach) return 0;
  const t = 1 - d / reach;
  return t * t * (3 - 2 * t);
}

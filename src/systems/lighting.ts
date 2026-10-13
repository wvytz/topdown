import type { AmbientProfile } from '@/config/lightingConfig';

/**
 * Krzywe światła w twardych pasmach (bez ditheringu) — czysta logika; Phaser tylko maluje
 * z nich tekstury i składa je w warstwie mroku.
 */

/** t ∈ [0, 1] zaokrąglone w górę do jednego z `bands` równych stopni (0 zostaje 0). */
export function banded(t: number, bands: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped === 0) return 0;
  return Math.ceil(clamped * bands - 1e-9) / bands;
}

/** Przyciemnienie (0–maxDarkness) w odległości `distance` px od gracza. */
export function ambientDarkness(distance: number, profile: AmbientProfile): number {
  const { fullLightRadius, edgeRadius, maxDarkness, bands } = profile;
  if (distance <= fullLightRadius) return 0;
  return banded((distance - fullLightRadius) / (edgeRadius - fullLightRadius), bands) * maxDarkness;
}

/**
 * Ile mroku zdejmuje światło gracza (1 = całość). Warstwę wypełniamy pełnym mrokiem i „wycieramy”
 * światła: wynik = maxDarkness × (1 − siła), więc siła = 1 − ambientDarkness / maxDarkness.
 */
export function playerLightStrength(distance: number, profile: AmbientProfile): number {
  return profile.maxDarkness === 0 ? 1 : 1 - ambientDarkness(distance, profile) / profile.maxDarkness;
}

/** Siła światła punktowego (pochodnia): 1 w środku, pasma do 0 na promieniu. */
export function pointLightStrength(distance: number, radius: number, bands: number): number {
  if (distance >= radius) return 0;
  return banded(1 - distance / radius, bands);
}

/** Profil modyfikatora „Mrok”: miękka krawędź zastąpiona pasmami na ostatnich `softEdge` promienia. */
export function darknessModifierProfile(
  visionRadius: number,
  config: { readonly maxDarkness: number; readonly softEdge: number; readonly bands: number },
): AmbientProfile {
  return {
    fullLightRadius: visionRadius * (1 - config.softEdge),
    edgeRadius: visionRadius,
    maxDarkness: config.maxDarkness,
    bands: config.bands,
  };
}

/** Stempel światła: kwadrat 2r × 2r, alfa 0–255 z siły w środku każdego piksela. */
export interface LightStamp {
  readonly size: number;
  readonly alpha: Uint8Array;
}

export function buildLightStamp(radius: number, strength: (distance: number) => number): LightStamp {
  const size = Math.ceil(radius) * 2;
  const alpha = new Uint8Array(size * size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      alpha[y * size + x] = Math.round(Math.min(1, Math.max(0, strength(d))) * 255);
    }
  }
  return { size, alpha };
}

/** Promień pochodni po migotaniu: skok o jeden z `offsets`, wybrany rzutem `roll` ∈ [0, 1). */
export function flickerRadius(base: number, offsets: readonly number[], roll: number): number {
  if (offsets.length === 0) return base;
  const index = Math.min(offsets.length - 1, Math.floor(roll * offsets.length));
  return base + (offsets[index] ?? 0);
}

export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Czy światło o promieniu `radius` dotyka kadru (pomijamy pochodnie poza ekranem). */
export function lightTouchesView(light: { readonly x: number; readonly y: number }, radius: number, view: ViewRect): boolean {
  return (
    light.x + radius > view.x &&
    light.x - radius < view.x + view.width &&
    light.y + radius > view.y &&
    light.y - radius < view.y + view.height
  );
}

/** Pikselowa elipsa (bez wygładzania) — maska cienia pod postacią; 1 = środek piksela w elipsie. */
export function pixelEllipse(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const rx = width / 2;
  const ry = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5 - rx) / rx;
      const dy = (y + 0.5 - ry) / ry;
      if (dx * dx + dy * dy <= 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}

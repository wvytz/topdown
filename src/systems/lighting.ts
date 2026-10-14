import type { AmbientProfile } from '@/config/lightingConfig';

/**
 * Krzywe światła — czysta logika; Phaser tylko maluje z nich tekstury i składa je w warstwie mroku.
 * Od kroku 28a (decyzja właściciela) światło przechodzi płynnie: bez twardych pasm („kręgów”) z kroku 19a.
 */

/** Płynne przejście t ∈ [0, 1] → [0, 1] (smoothstep): łagodny start i łagodne dojście do pełnej wartości. */
export function smoothFalloff(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Przyciemnienie (0–maxDarkness) w odległości `distance` px od gracza. */
export function ambientDarkness(distance: number, profile: AmbientProfile): number {
  const { fullLightRadius, edgeRadius, maxDarkness } = profile;
  if (distance <= fullLightRadius) return 0;
  return smoothFalloff((distance - fullLightRadius) / (edgeRadius - fullLightRadius)) * maxDarkness;
}

/**
 * Ile mroku zdejmuje światło gracza (1 = całość). Warstwę wypełniamy pełnym mrokiem i „wycieramy”
 * światła: wynik = maxDarkness × (1 − siła), więc siła = 1 − ambientDarkness / maxDarkness.
 */
export function playerLightStrength(distance: number, profile: AmbientProfile): number {
  return profile.maxDarkness === 0 ? 1 : 1 - ambientDarkness(distance, profile) / profile.maxDarkness;
}

/** Siła światła punktowego (pochodnia, latarnia): 1 w środku, płynnie do 0 na promieniu. */
export function pointLightStrength(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  return smoothFalloff(1 - distance / radius);
}

/** Profil modyfikatora „Mrok”: płynne przejście na ostatnich `softEdge` promienia widzenia. */
export function darknessModifierProfile(
  visionRadius: number,
  config: { readonly maxDarkness: number; readonly softEdge: number },
): AmbientProfile {
  return {
    fullLightRadius: visionRadius * (1 - config.softEdge),
    edgeRadius: visionRadius,
    maxDarkness: config.maxDarkness,
  };
}

/**
 * Lewy górny róg warstwy mroku (rozmiar 2·half) — wyśrodkowanej na kadrze kamery (z poprzedniej klatki),
 * przyciętej do granic świata tak jak kamera. `half` ma zapas na ruch kamery w jednej klatce.
 * Wcześniej warstwa była wyśrodkowana na bohaterze: przy brzegu mapy kamera staje, a przy szybkim ruchu
 * (lerp, dash) zostaje w tyle — bohater schodził ze środka kadru i warstwa nie sięgała brzegu ekranu
 * (krok 28: „rozjaśnianie na krańcach”).
 */
export function overlayOrigin(
  viewCenter: { readonly x: number; readonly y: number },
  half: { readonly x: number; readonly y: number },
  world: { readonly width: number; readonly height: number },
): { x: number; y: number } {
  const clamp = (value: number, size: number, extent: number) => Math.max(0, Math.min(value, extent - size));
  return {
    x: clamp(Math.round(viewCenter.x) - half.x, half.x * 2, world.width),
    y: clamp(Math.round(viewCenter.y) - half.y, half.y * 2, world.height),
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

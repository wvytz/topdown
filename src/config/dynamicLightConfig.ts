import { RenderQuality } from '@/core/displayTypes';
import { LightKind } from '@/core/lightTypes';
import type { DynamicLightLevel } from '@/core/lightTypes';
import { SORCERY_COLORS } from '@/config/heroColorConfig';

/**
 * Światło 2.0 (krok U3, etap upgradu z `docs/UPGRADE.md`, STYLEGUIDE §13.6): pociski, magia i wybuchy wycierają mrok
 * jak pochodnie, a na Wysokiej dostają barwną poświatę. Same efekty obrazu: widoczność wrogów w „Mroku” i we mgle,
 * liczby walki i strumienie RNG się nie zmieniają. **Niska = gra sprzed upgradu** — wszystko tu wyłączone.
 */
export const DYNAMIC_LIGHT_LEVELS: Readonly<Record<RenderQuality, DynamicLightLevel>> = {
  [RenderQuality.Low]: { shots: false, flashes: false, beam: false, tint: false, blackSun: false, maxLights: 0 },
  [RenderQuality.Medium]: { shots: true, flashes: true, beam: true, tint: false, blackSun: true, maxLights: 12 },
  [RenderQuality.High]: { shots: true, flashes: true, beam: true, tint: true, blackSun: true, maxLights: 20 },
};

/** Wygląd światła jednego rodzaju. */
export interface LightKindStyle {
  /** Promień (px świata); błyski biorą promień z wybuchu (`flash`). */
  readonly radius: number;
  /** Barwa poświaty na Wysokiej. */
  readonly color: number;
  /** Alfa poświaty ADD w środku (brzeg gaśnie płynnie jak stempel pochodni). */
  readonly tintAlpha: number;
  /** Kolejność przy limicie świateł: mniejsza liczba — ważniejsze. */
  readonly priority: number;
}

export const DYNAMIC_LIGHT_CONFIG = {
  kinds: {
    // Pocisk wroga pierwszy: w tłumie i w mroku najważniejsze jest to, co rani.
    [LightKind.EnemyShot]: { radius: 26, color: 0xff5a3c, tintAlpha: 0.3, priority: 0 },
    [LightKind.Magic]: { radius: 30, color: SORCERY_COLORS.light, tintAlpha: 0.32, priority: 1 },
    [LightKind.Shot]: { radius: 26, color: 0xffe2a8, tintAlpha: 0.22, priority: 1 },
    [LightKind.Blast]: { radius: 0, color: 0xffc070, tintAlpha: 0.34, priority: 2 },
    [LightKind.Beam]: { radius: 30, color: SORCERY_COLORS.base, tintAlpha: 0.26, priority: 3 },
  } satisfies Record<LightKind, LightKindStyle>,
  /**
   * Promienie zaokrąglane w dół do wielokrotności — mniej tekstur stempli (jedna na promień), a gasnący błysk
   * maleje skokowo, w duchu pikseli (§13.5), a nie płynnym zoomem.
   */
  radiusStep: 4,
  /** Błysk wybuchu i magii: promień światła = promień strefy × `radiusScale` (w granicach), gaśnie przez `durationMs`. */
  flash: { durationMs: 360, radiusScale: 1.5, minRadius: 28, maxRadius: 128 },
  /** Najwięcej błysków w pamięci naraz (nawała wybuchów) — starsze wypadają. */
  maxFlashes: 16,
  /** Promień-Wyrwa: światło co `spacing` px wzdłuż promienia, najwyżej `maxPoints`. */
  beam: { spacing: 32, maxPoints: 7 },
  /**
   * Światło Czarnego Słońca (STYLEGUIDE §13.7): jedno zimne, stałe światło z tej samej strony (północny wschód — okna
   * wieży) na każdym piętrze, mocniejsze im wyżej — wzmacnia gradient ruiny, nie konkuruje z pochodniami. Rysowane
   * jako łagodny gradient ADD nad mrokiem, przyczepiony do kadru. Alfa w narożniku: `baseAlpha + perFloor × (piętro − 1)`
   * (piętro w obrębie kręgu wieży), najwyżej `maxAlpha`; `reach` — ułamek przekątnej kadru, na którym gaśnie.
   */
  blackSun: { color: 0xa8c0ec, baseAlpha: 0.05, perFloor: 0.018, maxAlpha: 0.16, reach: 0.75, floorsPerLoop: 7 },
  /** Poświata pochodni i ognia (preFX glow) poza kadrem gaśnie — zapas (px świata) ponad brzeg kadru. */
  glowCullMargin: 32,
} as const;

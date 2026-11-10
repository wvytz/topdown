import { GlowGroup, RenderQuality } from '@/core/displayTypes';
import type { QualityChoice } from '@/core/displayTypes';
import type { PlatformId } from '@/core/platform';

/** Jeden poziom jakości: co włącza (krok U1, STYLEGUIDE §13.3). */
export interface QualityLevelConfig {
  readonly glow: readonly GlowGroup[];
  readonly ambientParticles: number;
}

/** Parametry poświaty jednej grupy (preFX glow w Phaserze). */
export interface GlowConfig {
  readonly color: number;
  readonly outerStrength: number;
  readonly innerStrength: number;
  /** Jakość próbkowania glow (0,1 = tanio). */
  readonly quality: number;
  /** Odległość poświaty w pikselach tekstury. */
  readonly distance: number;
}

/**
 * Poziomy jakości obrazu (krok U1, etap „Fundament renderu” z `docs/UPGRADE.md`).
 * **Niska = gra sprzed upgradu** — nic tu nie może być na Niskiej obowiązkowe. Kolejne etapy (U2 feel walki,
 * U3 światło) dopisują swoje efekty do poziomów Średnia i Wysoka.
 */
export const RENDER_QUALITY_CONFIG = {
  levels: {
    [RenderQuality.Low]: { glow: [], ambientParticles: 1 },
    [RenderQuality.Medium]: { glow: [GlowGroup.Torch], ambientParticles: 1 },
    [RenderQuality.High]: { glow: [GlowGroup.Torch, GlowGroup.Fire], ambientParticles: 1.5 },
  } satisfies Record<RenderQuality, QualityLevelConfig>,
  /**
   * Automat: PC na Wysokiej, telefon na Niskiej. Poświata to osobne przejście GPU na każdy świecący obiekt, a pomiar
   * w kontenerze bez GPU nie mówi, ile to kosztuje na prawdziwym telefonie — telefon podnosimy dopiero po pomiarze
   * `?perf=1&gfx=medium` na urządzeniu (krok U1).
   */
  auto: { pc: RenderQuality.High, mobile: RenderQuality.Low } satisfies Record<PlatformId, RenderQuality>,
  /** Kolejność w przełączniku (← →, Enter): Automat → Niska → Średnia → Wysoka. */
  cycle: ['auto', RenderQuality.Low, RenderQuality.Medium, RenderQuality.High] as readonly QualityChoice[],
  glow: {
    [GlowGroup.Torch]: { color: 0xff9a3c, outerStrength: 2, innerStrength: 0, quality: 0.1, distance: 6 },
    [GlowGroup.Fire]: { color: 0xff7a2a, outerStrength: 2.5, innerStrength: 0, quality: 0.1, distance: 6 },
  } satisfies Record<GlowGroup, GlowConfig>,
  /**
   * Parametr adresu wymuszający poziom na tę sesję (bez zapisu): `?gfx=low|medium|high`.
   * Do kadrów „przed | po” (`npm run shots`) i do porównań na telefonie.
   */
  param: 'gfx',
} as const;

export const RENDER_QUALITY_TEXT = {
  quality: (choice: QualityChoice, resolved: RenderQuality) =>
    choice === 'auto' ? `Jakość: AUTO (${QUALITY_NAMES[resolved]})` : `Jakość: ${QUALITY_NAMES[choice]}`,
  reduceFlashes: (on: boolean) => `Mniej błysków: ${on ? 'TAK' : 'NIE'}`,
  forced: (quality: RenderQuality) => `Jakość wymuszona adresem: ${QUALITY_NAMES[quality]}`,
} as const;

export const QUALITY_NAMES: Record<RenderQuality, string> = {
  [RenderQuality.Low]: 'NISKA',
  [RenderQuality.Medium]: 'ŚREDNIA',
  [RenderQuality.High]: 'WYSOKA',
};

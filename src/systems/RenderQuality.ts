import { RenderQuality } from '@/core/displayTypes';
import type { DisplaySettings, QualityChoice, RenderProfile } from '@/core/displayTypes';
import type { PlatformId } from '@/core/platform';
import { RENDER_QUALITY_CONFIG } from '@/config/renderQualityConfig';

/**
 * Jakość obrazu (krok U1, STYLEGUIDE §13.3–13.4): z wyboru gracza, platformy i WebGL — konkretny poziom,
 * a z poziomu i „mniej błysków” — profil, który czytają efekty. Bez Phasera.
 */

const QUALITIES: readonly string[] = Object.values(RenderQuality);

export function isQualityChoice(value: unknown): value is QualityChoice {
  return value === 'auto' || (typeof value === 'string' && QUALITIES.includes(value));
}

/**
 * Poziom, który naprawdę obowiązuje. Kolejność: bez WebGL zawsze Niska (glow wymaga WebGL),
 * potem wymuszenie z adresu, potem wybór gracza, a „auto” — wg platformy.
 */
export function resolveQuality(choice: QualityChoice, platform: PlatformId, webgl: boolean, forced: RenderQuality | null = null): RenderQuality {
  if (!webgl) return RenderQuality.Low;
  if (forced) return forced;
  return choice === 'auto' ? RENDER_QUALITY_CONFIG.auto[platform] : choice;
}

/** Profil efektów; „mniej błysków” działa na każdym poziomie, także na Niskiej. */
export function renderProfile(quality: RenderQuality, reduceFlashes: boolean): RenderProfile {
  const level = RENDER_QUALITY_CONFIG.levels[quality];
  return {
    quality,
    shakeScale: reduceFlashes ? 0 : 1,
    screenFlash: !reduceFlashes,
    lightFlicker: !reduceFlashes,
    glow: new Set(level.glow),
    ambientParticles: level.ambientParticles,
  };
}

/** Następny / poprzedni wybór w przełączniku (z zawijaniem). */
export function cycleQuality(choice: QualityChoice, step: 1 | -1): QualityChoice {
  const order = RENDER_QUALITY_CONFIG.cycle;
  const index = Math.max(0, order.indexOf(choice));
  return order[(index + step + order.length) % order.length] ?? 'auto';
}

export function withQuality(settings: DisplaySettings, quality: QualityChoice): DisplaySettings {
  return { ...settings, quality };
}

export function toggleReduceFlashes(settings: DisplaySettings): DisplaySettings {
  return { ...settings, reduceFlashes: !settings.reduceFlashes };
}

/** `?gfx=low|medium|high` — poziom wymuszony na sesję; inne wartości (także `auto`) nic nie wymuszają. */
export function qualityFromSearch(search: string): RenderQuality | null {
  const value = new URLSearchParams(search).get(RENDER_QUALITY_CONFIG.param);
  return value !== null && QUALITIES.includes(value) ? (value as RenderQuality) : null;
}

/** Liczba ozdobnych cząstek na danym poziomie (Niska — dokładnie tyle co przed upgradem). */
export function scaledParticleCount(base: number, profile: RenderProfile): number {
  return Math.round(base * profile.ambientParticles);
}

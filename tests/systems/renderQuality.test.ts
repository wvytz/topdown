import { describe, expect, it } from 'vitest';
import { GlowGroup, RenderQuality } from '@/core/displayTypes';
import type { QualityChoice } from '@/core/displayTypes';
import { DISPLAY_CONFIG } from '@/config/displayConfig';
import { RENDER_QUALITY_CONFIG } from '@/config/renderQualityConfig';
import { parseDisplaySettings } from '@/systems/DisplaySettings';
import {
  cycleQuality,
  qualityFromSearch,
  renderProfile,
  resolveQuality,
  scaledParticleCount,
  toggleReduceFlashes,
  withQuality,
} from '@/systems/RenderQuality';

describe('jakość obrazu (krok U1)', () => {
  it('Niska = gra sprzed upgradu: bez poświaty, cząstki bez zmian, drżenie i błyski jak dawniej', () => {
    const low = renderProfile(RenderQuality.Low, false);
    expect(low.glow.size).toBe(0);
    expect(low.ambientParticles).toBe(1);
    expect(low.shakeScale).toBe(1);
    expect(low.screenFlash).toBe(true);
    expect(low.lightFlicker).toBe(true);
    expect(scaledParticleCount(37, low)).toBe(37);
  });

  it('wyższy poziom nigdy nie ma mniej efektów niż niższy', () => {
    const order = [RenderQuality.Low, RenderQuality.Medium, RenderQuality.High];
    for (let i = 1; i < order.length; i++) {
      const lower = renderProfile(order[i - 1]!, false);
      const higher = renderProfile(order[i]!, false);
      for (const group of lower.glow) expect(higher.glow.has(group)).toBe(true);
      expect(higher.ambientParticles).toBeGreaterThanOrEqual(lower.ambientParticles);
    }
    expect(renderProfile(RenderQuality.High, false).glow.has(GlowGroup.Fire)).toBe(true);
  });

  it('„mniej błysków” wyłącza drżenie, błyski i migotanie na każdym poziomie, a jakości nie rusza', () => {
    for (const quality of Object.values(RenderQuality)) {
      const calm = renderProfile(quality, true);
      expect(calm.shakeScale).toBe(0);
      expect(calm.screenFlash).toBe(false);
      expect(calm.lightFlicker).toBe(false);
      expect(calm.glow).toEqual(renderProfile(quality, false).glow);
    }
  });

  it('automat: PC wyżej niż telefon, bez WebGL zawsze Niska, adres wygrywa z wyborem', () => {
    expect(resolveQuality('auto', 'pc', true)).toBe(RENDER_QUALITY_CONFIG.auto.pc);
    expect(resolveQuality('auto', 'mobile', true)).toBe(RENDER_QUALITY_CONFIG.auto.mobile);
    expect(resolveQuality('auto', 'mobile', true)).not.toBe(RenderQuality.High);
    expect(resolveQuality(RenderQuality.High, 'pc', false)).toBe(RenderQuality.Low);
    expect(resolveQuality(RenderQuality.High, 'pc', false, RenderQuality.High)).toBe(RenderQuality.Low);
    expect(resolveQuality(RenderQuality.Low, 'pc', true)).toBe(RenderQuality.Low);
    expect(resolveQuality(RenderQuality.High, 'pc', true, RenderQuality.Low)).toBe(RenderQuality.Low);
  });

  it('przełącznik obchodzi wszystkie wybory w kółko', () => {
    let choice: QualityChoice = DISPLAY_CONFIG.defaults.quality;
    const seen = new Set<string>();
    for (let i = 0; i < RENDER_QUALITY_CONFIG.cycle.length; i++) {
      seen.add(choice);
      choice = cycleQuality(choice, 1);
    }
    expect(choice).toBe(DISPLAY_CONFIG.defaults.quality);
    expect(seen.size).toBe(4);
    expect(cycleQuality('auto', -1)).toBe(RenderQuality.High);
  });

  it('?gfx= wymusza tylko znany poziom', () => {
    expect(qualityFromSearch('?gfx=low')).toBe(RenderQuality.Low);
    expect(qualityFromSearch('?perf=1&gfx=high')).toBe(RenderQuality.High);
    expect(qualityFromSearch('?gfx=auto')).toBeNull();
    expect(qualityFromSearch('?gfx=ultra')).toBeNull();
    expect(qualityFromSearch('')).toBeNull();
  });

  it('zapis: stary format dostaje automat, zepsute pola — domyślne, nowe pola przechodzą', () => {
    expect(parseDisplaySettings({ fillWindow: true }, DISPLAY_CONFIG.defaults)).toEqual({ fillWindow: true, quality: 'auto', reduceFlashes: false });
    expect(parseDisplaySettings({ fillWindow: false, quality: 'ultra', reduceFlashes: 1 }, DISPLAY_CONFIG.defaults)).toEqual(DISPLAY_CONFIG.defaults);
    const custom = toggleReduceFlashes(withQuality(DISPLAY_CONFIG.defaults, RenderQuality.Medium));
    expect(parseDisplaySettings(JSON.parse(JSON.stringify(custom)), DISPLAY_CONFIG.defaults)).toEqual(custom);
  });
});

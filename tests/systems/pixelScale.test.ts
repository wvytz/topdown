import { describe, expect, it } from 'vitest';
import { pixelPerfectScale } from '@/systems/pixelScale';

const base = { gameWidth: 960, gameHeight: 540, devicePixelRatio: 1, cameraZoom: 2 };

/** Ile pikseli ekranu (urządzenia) zajmuje jeden piksel świata. */
const worldPixel = (scale: number, dpr = 1, zoom = 2) => scale * dpr * zoom;

describe('pixelPerfectScale', () => {
  it('okno 1920×1080: płótno 2×, piksel świata = 4 piksele ekranu', () => {
    const scale = pixelPerfectScale({ ...base, viewportWidth: 1920, viewportHeight: 1080 });
    expect(scale).toBe(2);
    expect(worldPixel(scale)).toBe(4);
  });

  it('okno 1600×900: skala 1,5 (dopasowanie dałoby 1,667 i nierówne piksele)', () => {
    const scale = pixelPerfectScale({ ...base, viewportWidth: 1600, viewportHeight: 900 });
    expect(scale).toBe(1.5);
    expect(worldPixel(scale)).toBe(3);
  });

  it('skalowanie systemu 125%: liczy się w pikselach urządzenia', () => {
    const dpr = 1.25;
    const scale = pixelPerfectScale({ ...base, devicePixelRatio: dpr, viewportWidth: 1536, viewportHeight: 864 });
    expect(Number.isInteger(worldPixel(scale, dpr))).toBe(true);
    expect(960 * scale).toBeLessThanOrEqual(1536);
    expect(worldPixel(scale, dpr)).toBe(4); // 1536 × 1,25 = 1920 px urządzenia
  });

  it('płótno zawsze mieści się w oknie i piksel świata jest całkowity', () => {
    for (const [w, h, dpr] of [[1366, 768, 1], [1280, 720, 1.5], [2560, 1440, 1], [1000, 700, 1.75], [3840, 2160, 2]] as const) {
      const scale = pixelPerfectScale({ ...base, devicePixelRatio: dpr, viewportWidth: w, viewportHeight: h });
      expect(960 * scale).toBeLessThanOrEqual(w + 1e-9);
      expect(540 * scale).toBeLessThanOrEqual(h + 1e-9);
      expect(Number.isInteger(Math.round(worldPixel(scale, dpr) * 1e9) / 1e9)).toBe(true);
    }
  });

  it('bardzo małe okno: co najmniej 1 piksel ekranu na piksel świata', () => {
    const scale = pixelPerfectScale({ ...base, viewportWidth: 200, viewportHeight: 100 });
    expect(worldPixel(scale)).toBe(1);
  });

  it('telefon (skala ułamkowa): płótno wypełnia ekran na wysokość, zamiast 2/3 przy całkowitych krotnościach', () => {
    const phone = { ...base, devicePixelRatio: 2.625, viewportWidth: 863, viewportHeight: 360 };
    const whole = pixelPerfectScale(phone);
    const fractional = pixelPerfectScale({ ...phone, fractional: true });
    expect(540 * fractional).toBeCloseTo(360);
    expect(960 * fractional).toBeLessThanOrEqual(863);
    expect(fractional).toBeGreaterThan(whole);
  });
});

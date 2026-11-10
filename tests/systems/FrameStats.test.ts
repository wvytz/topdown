import { describe, expect, it } from 'vitest';
import { FrameStats, percentile, perfMeterWanted } from '@/systems/FrameStats';

describe('FrameStats (krok U0: licznik wydajności)', () => {
  it('percentyl z posortowanej listy', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 95)).toBe(95);
    expect(percentile(sorted, 100)).toBe(100);
    expect(percentile([], 50)).toBe(0);
  });

  it('równe 60 FPS: brak wolnych klatek i szarpnięć', () => {
    const stats = new FrameStats(100);
    for (let i = 0; i < 100; i++) stats.push(1000 / 60, 4);
    const s = stats.summary();
    expect(s.fps).toBeCloseTo(60, 0);
    expect(s.slowShare).toBe(0);
    expect(s.jankShare).toBe(0);
    expect(s.workP95).toBe(4);
  });

  it('liczy szarpnięcia i okno ostatnich klatek', () => {
    const stats = new FrameStats(10);
    for (let i = 0; i < 20; i++) stats.push(i < 10 ? 100 : 1000 / 60, 1);
    // Stare, wolne klatki wypadły z okna.
    expect(stats.summary().jankShare).toBe(0);
    stats.push(50, 30);
    const s = stats.summary();
    expect(s.frames).toBe(10);
    expect(s.jankShare).toBeCloseTo(0.1);
    expect(s.intervalMax).toBe(50);
  });

  it('pomija błędne pomiary', () => {
    const stats = new FrameStats();
    stats.push(Number.NaN, 1);
    stats.push(0, 1);
    stats.push(-5, 1);
    expect(stats.summary().frames).toBe(0);
  });

  it('licznik tylko na żądanie z adresu', () => {
    expect(perfMeterWanted('?perf=1')).toBe(true);
    expect(perfMeterWanted('?hero=archer&perf=1')).toBe(true);
    expect(perfMeterWanted('?perf=0')).toBe(false);
    expect(perfMeterWanted('')).toBe(false);
  });
});

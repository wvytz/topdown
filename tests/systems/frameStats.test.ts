import { describe, expect, it } from 'vitest';
import { FrameStats } from '@/systems/FrameStats';

describe('FrameStats — licznik wydajności', () => {
  it('bez pomiarów: 0 FPS i 0 ms', () => {
    const stats = new FrameStats(1000);
    expect(stats.fps).toBe(0);
    expect(stats.worstMs).toBe(0);
  });

  it('równe klatki po 16,67 ms dają ok. 60 FPS', () => {
    const stats = new FrameStats(1000);
    for (let i = 0; i < 120; i++) stats.add(1000 / 60);
    expect(stats.fps).toBeCloseTo(60, 0);
    expect(stats.worstMs).toBeCloseTo(16.67, 1);
  });

  it('pojedyncza długa klatka widać w najdłuższej klatce, a potem wypada z okna', () => {
    const stats = new FrameStats(1000);
    for (let i = 0; i < 30; i++) stats.add(16);
    stats.add(120);
    expect(stats.worstMs).toBe(120);
    for (let i = 0; i < 70; i++) stats.add(16);
    expect(stats.worstMs).toBe(16);
  });

  it('pomija błędne czasy klatek (0, ujemne, NaN)', () => {
    const stats = new FrameStats(1000);
    stats.add(0);
    stats.add(-5);
    stats.add(Number.NaN);
    expect(stats.fps).toBe(0);
  });
});

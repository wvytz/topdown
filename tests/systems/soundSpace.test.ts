import { describe, expect, it } from 'vitest';
import { spatialize } from '@/systems/SoundSpace';

const config = { fullVolumeRadius: 100, fadeRadius: 300, minGain: 0.2, panWidth: 200, maxPan: 0.6 };
const center = { x: 0, y: 0 };

describe('spatialize (krok 116)', () => {
  it('blisko środka widoku — pełna głośność, środek stereo', () => {
    expect(spatialize({ x: 0, y: 50 }, center, config)).toEqual({ pan: 0, gain: 1 });
  });

  it('z boku — z boku, ale nigdy całkiem w jednym uchu', () => {
    expect(spatialize({ x: 100, y: 0 }, center, config).pan).toBeCloseTo(0.3, 9);
    expect(spatialize({ x: -1000, y: 0 }, center, config).pan).toBe(-0.6);
  });

  it('daleko — ciszej, nie mniej niż minGain', () => {
    expect(spatialize({ x: 0, y: 200 }, center, config).gain).toBeCloseTo(0.6, 9);
    expect(spatialize({ x: 0, y: 5000 }, center, config).gain).toBeCloseTo(0.2, 9);
  });
});

import { describe, expect, it } from 'vitest';
import { HUD_GAUGES } from '@/config/hudGaugeConfig';
import { flowStart, gaugeThemeFor, heartbeatLevel, sparklePositions, stringSag } from '@/systems/hudGauges';

describe('żywe wskaźniki bohatera (krok U7e)', () => {
  it('motyw z broni: barbarzyńca krew, Czarodziejka magia, łucznik cięciwa', () => {
    expect(gaugeThemeFor('melee')).toBe('blood');
    expect(gaugeThemeFor('sorcery')).toBe('arcane');
    expect(gaugeThemeFor('archery')).toBe('bowstring');
  });

  it('serce bije dwa razy na okres', () => {
    const p = HUD_GAUGES.heartbeat.periodMs;
    expect(heartbeatLevel(0)).toBe(1);
    expect(heartbeatLevel(p * 0.14)).toBe(0);
    expect(heartbeatLevel(p * 0.2)).toBe(1);
    expect(heartbeatLevel(p * 0.6)).toBe(0);
    expect(heartbeatLevel(p + 1)).toBe(1);
  });

  it('krew i iskry płyną tylko w wypełnionej części', () => {
    expect(flowStart(1234, 0)).toBe(0);
    for (let t = 0; t < 5000; t += 137) {
      expect(flowStart(t, 50)).toBeGreaterThanOrEqual(-HUD_GAUGES.flow.lengthPx);
      expect(flowStart(t, 50)).toBeLessThan(50);
      for (const x of sparklePositions(t, 40)) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(40);
    }
    expect(sparklePositions(100, 0)).toEqual([]);
  });

  it('cięciwa: luźna zwisa najgłębiej na środku, gotowa jest prosta, po napięciu drga', () => {
    expect(stringSag(50, 101, 0, null)).toBe(HUD_GAUGES.string.sagPx);
    expect(stringSag(0, 101, 0, null)).toBe(0);
    expect(stringSag(50, 101, 0.5, null)).toBeLessThan(HUD_GAUGES.string.sagPx);
    expect(stringSag(50, 101, 1, null)).toBe(0);
    expect(Math.abs(stringSag(50, 101, 1, 10))).toBe(1);
    expect(stringSag(50, 101, 1, HUD_GAUGES.string.twangMs)).toBe(0);
  });
});

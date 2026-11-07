import { describe, expect, it } from 'vitest';
import { flagFromSearch, zoomFromSearch } from '@/systems/cameraZoom';
import { BASE_CAMERA_ZOOM, CAMERA_CONFIG, ZOOM_OVERRIDE } from '@/config/gameConfig';
import { HEAVY_SWING_TRIAL } from '@/config/heroConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';

describe('próbny zoom i cięższe ciosy (krok 167)', () => {
  it('bez parametru — zoom 2,0 jak od kroku 18', () => {
    expect(CAMERA_CONFIG.zoom).toBe(BASE_CAMERA_ZOOM);
    expect(zoomFromSearch('', 2, ZOOM_OVERRIDE)).toBe(2);
  });

  it('?zoom=1.6 oddala kamerę; wartości spoza zakresu i śmieci — domyślny', () => {
    expect(zoomFromSearch('?zoom=1.6', 2, ZOOM_OVERRIDE)).toBe(1.6);
    expect(zoomFromSearch('?zoom=1,5', 2, ZOOM_OVERRIDE)).toBe(1.5);
    expect(zoomFromSearch('?zoom=0.5', 2, ZOOM_OVERRIDE)).toBe(2);
    expect(zoomFromSearch('?zoom=3', 2, ZOOM_OVERRIDE)).toBe(2);
    expect(zoomFromSearch('?zoom=abc', 2, ZOOM_OVERRIDE)).toBe(2);
  });

  it('?heavy=1 włącza próbę; cięższy cios ma prawie te same obrażenia na sekundę', () => {
    expect(flagFromSearch('?heavy=1', 'heavy')).toBe(true);
    expect(flagFromSearch('?heavy=0', 'heavy')).toBe(false);
    expect(flagFromSearch('', 'heavy')).toBe(false);
    const heavy = HEAVY_SWING_TRIAL.combat;
    expect(heavy.attackCooldownMs).toBeGreaterThan(PLAYER_COMBAT.attackCooldownMs);
    const dps = (c: { meleeDamage: number; attackCooldownMs: number }) => c.meleeDamage / c.attackCooldownMs;
    expect(dps(heavy) / dps(PLAYER_COMBAT)).toBeGreaterThan(0.95);
    expect(dps(heavy) / dps(PLAYER_COMBAT)).toBeLessThan(1.1);
  });
});

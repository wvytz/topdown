import { describe, expect, it } from 'vitest';
import { flagFromSearch } from '@/systems/cameraZoom';
import { BASE_CAMERA_ZOOM, CAMERA_CONFIG } from '@/config/gameConfig';
import { BARBARIAN_COMBAT, HERO_DEFINITIONS } from '@/config/heroConfig';
import { HeroId } from '@/core/heroTypes';
import { PLAYER_COMBAT } from '@/config/combatConfig';

describe('zoom i cięższe ciosy (krok 167; próbny zoom usunięty w kroku U1)', () => {
  it('zoom zawsze 2,0 jak od kroku 18', () => {
    expect(CAMERA_CONFIG.zoom).toBe(BASE_CAMERA_ZOOM);
    expect(BASE_CAMERA_ZOOM).toBe(2);
  });

  it('flaga z adresu; barbarzyńca ma domyślnie cięższy cios o prawie tych samych obrażeniach na sekundę (krok 171)', () => {
    expect(flagFromSearch('?heavy=1', 'heavy')).toBe(true);
    expect(flagFromSearch('?heavy=0', 'heavy')).toBe(false);
    expect(flagFromSearch('', 'heavy')).toBe(false);
    const heavy = BARBARIAN_COMBAT;
    expect(HERO_DEFINITIONS[HeroId.Barbarian].combat).toBe(BARBARIAN_COMBAT);
    expect(heavy.attackCooldownMs).toBeGreaterThan(PLAYER_COMBAT.attackCooldownMs);
    const dps = (c: { meleeDamage: number; attackCooldownMs: number }) => c.meleeDamage / c.attackCooldownMs;
    expect(dps(heavy) / dps(PLAYER_COMBAT)).toBeGreaterThan(0.95);
    expect(dps(heavy) / dps(PLAYER_COMBAT)).toBeLessThan(1.1);
  });
});

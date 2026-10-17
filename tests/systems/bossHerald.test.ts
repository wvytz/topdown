import { describe, expect, it } from 'vitest';
import { RoomKind } from '@/core/dungeonTypes';
import { BiomeId } from '@/config/biomeConfig';
import { BOSS_HERALD, HERALD_RUMBLE } from '@/config/bossHeraldConfig';
import { roomProximity, rumbleDue, rumbleInterval } from '@/systems/BossHerald';
import { room } from '../helpers/floors';

const arena = room(0, 10, 10, 8, 8, RoomKind.Boss);

describe('zapowiedź bossa (krok 54)', () => {
  it('siła: 1 w arenie, liniowo malejąca do 0 na zasięgu, 0 dalej', () => {
    expect(roomProximity({ x: 12, y: 12 }, arena, 10)).toBe(1);
    expect(roomProximity({ x: 17, y: 17 }, arena, 10)).toBe(1); // krawędź areny
    expect(roomProximity({ x: 22, y: 12 }, arena, 10)).toBeCloseTo(0.5); // 5 kafli od krawędzi (x=17)
    expect(roomProximity({ x: 27, y: 12 }, arena, 10)).toBe(0);
    expect(roomProximity({ x: 40, y: 40 }, arena, 10)).toBe(0);
    // Linia prosta, nie Manhattan: narożnik jest dalej niż bok.
    expect(roomProximity({ x: 21, y: 21 }, arena, 10)).toBeLessThan(roomProximity({ x: 21, y: 12 }, arena, 10));
  });

  it('drżenie: tylko powyżej progu, coraz częstsze ku arenie', () => {
    expect(rumbleInterval(0.2, HERALD_RUMBLE)).toBeNull();
    const far = rumbleInterval(HERALD_RUMBLE.minStrength, HERALD_RUMBLE)!;
    const near = rumbleInterval(1, HERALD_RUMBLE)!;
    expect(far).toBe(HERALD_RUMBLE.intervalMs.far);
    expect(near).toBe(HERALD_RUMBLE.intervalMs.near);
    expect(rumbleInterval(0.7, HERALD_RUMBLE)!).toBeLessThan(far);
    expect(rumbleInterval(0.7, HERALD_RUMBLE)!).toBeGreaterThan(near);
  });

  it('drżenie następuje po upływie odstępu od poprzedniego', () => {
    expect(rumbleDue(1, 1000, 0, HERALD_RUMBLE)).toBe(false); // 1000 < near
    expect(rumbleDue(1, HERALD_RUMBLE.intervalMs.near, 0, HERALD_RUMBLE)).toBe(true);
    expect(rumbleDue(0.1, 100000, 0, HERALD_RUMBLE)).toBe(false);
  });

  it('konfiguracja: każdy biom ma zasięg; drżenie jest ledwo wyczuwalne; iskry tylko w Piekle', () => {
    for (const id of Object.values(BiomeId)) expect(BOSS_HERALD[id].radiusTiles).toBeGreaterThan(5);
    expect(HERALD_RUMBLE.intensity).toBeLessThan(0.003);
    expect(Object.values(BiomeId).filter((id) => BOSS_HERALD[id].sparks !== null)).toEqual([BiomeId.Infernal]);
    for (const id of Object.values(BiomeId)) expect(BOSS_HERALD[id].tint?.maxAlpha ?? 0).toBeLessThanOrEqual(0.08);
  });
});

import { describe, expect, it } from 'vitest';
import { duetForFloor, duetStatus, pushApart } from '@/systems/BossDuet';
import type { DuetMember } from '@/systems/BossDuet';
import { BOSS_RUSH_DUETS } from '@/config/bossRushConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { bossForFloor } from '@/config/bossConfig';

const member = (over: Partial<DuetMember> = {}): DuetMember => ({
  hp: 100,
  maxHp: 100,
  fighting: true,
  defeated: false,
  enraged: false,
  enragedLabel: 'gniew',
  ...over,
});
const TEXT = { name: 'Duet', title: 'Tytuł' };

describe('duet bossów (krok 114)', () => {
  it('arena Króla Pająków dostaje Matkę Pająków — w każdym kręgu', () => {
    const loop = TOWER_CONFIG.floorsPerLoop;
    for (const floor of [3, 3 + loop, 3 + 2 * loop]) {
      const duet = duetForFloor(floor, BOSS_RUSH_DUETS, TOWER_CONFIG);
      expect(duet).not.toBeNull();
      expect(bossForFloor(floor).name).toBe('Król Pająków');
      expect(bossForFloor(duet!.partnerFloorInLoop).name).toBe('Matka Pająków');
    }
  });

  it('pozostałe areny bez duetu (arena 2 z samą Matką zostaje)', () => {
    for (const floor of [1, 2, 4, 5, 6, 7, 9]) expect(duetForFloor(floor, BOSS_RUSH_DUETS, TOWER_CONFIG)).toBeNull();
  });

  it('duet to utrudnienie: obaj bossowie z pełnym HP', () => {
    for (const duet of BOSS_RUSH_DUETS) expect(duet.hpMultiplier).toBeGreaterThanOrEqual(1);
  });

  it('pasek: suma HP obu, null przed walką i po zwycięstwie', () => {
    expect(duetStatus([member({ fighting: false }), member({ fighting: false })], TEXT)).toBeNull();
    const both = duetStatus([member({ hp: 60 }), member({ hp: 30, maxHp: 200 })], TEXT);
    expect(both).toMatchObject({ name: 'Duet', title: 'Tytuł', hp: 90, maxHp: 300, enraged: false });
    const done = [member({ hp: 0, fighting: false, defeated: true }), member({ hp: 0, fighting: false, defeated: true })];
    expect(duetStatus(done, TEXT)).toBeNull();
  });

  it('pokonany boss liczy się jako 0, a pasek nie kurczy się', () => {
    const status = duetStatus([member({ hp: 0, fighting: false, defeated: true }), member({ hp: 40 })], TEXT);
    expect(status).toMatchObject({ hp: 40, maxHp: 200 });
  });

  it('wściekłość od pierwszego wściekłego, z jego okrzykiem', () => {
    const status = duetStatus([member(), member({ enraged: true, enragedLabel: 'Gniew Grzybni!' })], TEXT);
    expect(status).toMatchObject({ enraged: true, enragedLabel: 'Gniew Grzybni!' });
  });
});

describe('duet bossów — rozpychanie (krok 114)', () => {
  it('nachodzący bossowie rozsuwają się po połowie wzdłuż linii środków', () => {
    const push = pushApart({ x: 0, y: 0 }, { x: 30, y: 0 }, 50);
    expect(push).toEqual({ a: { x: -10, y: -0 }, b: { x: 10, y: 0 } });
  });

  it('dość daleko — bez zmian; środki w jednym punkcie — rozsunięcie w poziomie', () => {
    expect(pushApart({ x: 0, y: 0 }, { x: 0, y: 60 }, 50)).toBeNull();
    expect(pushApart({ x: 5, y: 5 }, { x: 5, y: 5 }, 40)).toEqual({ a: { x: -20, y: -0 }, b: { x: 20, y: 0 } });
  });
});

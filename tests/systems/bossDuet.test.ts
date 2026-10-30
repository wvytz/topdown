import { describe, expect, it } from 'vitest';
import { duetForFloor, duetStatus, pushApart } from '@/systems/BossDuet';
import type { DuetMember } from '@/systems/BossDuet';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { BOSS_DUETS, bossById, bossForFloor } from '@/config/bossConfig';

const member = (over: Partial<DuetMember> = {}): DuetMember => ({
  name: 'Boss',
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
  it('piętro 2 (Grzybnia): Król Pająków z Matką Pająków od początku — w każdym kręgu (krok 127)', () => {
    const loop = TOWER_CONFIG.floorsPerLoop;
    for (const floor of [2, 2 + loop, 2 + 2 * loop]) {
      const duet = duetForFloor(floor, BOSS_DUETS, TOWER_CONFIG);
      expect(duet).not.toBeNull();
      expect(duet!.arrival).toBeUndefined();
      expect(bossForFloor(floor).name).toBe('Król Pająków');
      expect(bossById(duet!.partner).name).toBe('Matka Pająków');
    }
  });

  it('pozostałe areny bez duetu', () => {
    for (const floor of [1, 3, 4, 5, 6, 8]) expect(duetForFloor(floor, BOSS_DUETS, TOWER_CONFIG)).toBeNull();
  });

  it('duet to utrudnienie: obaj bossowie z pełnym HP', () => {
    for (const duet of BOSS_DUETS) expect(duet.hpMultiplier).toBeGreaterThanOrEqual(1);
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

  it('każdy boss ma własny pasek (krok 136): imię, HP, wściekłość, pokonany na zero', () => {
    const status = duetStatus(
      [
        member({ name: 'Król Pająków', hp: 0, fighting: false, defeated: true }),
        member({ name: 'Matka Pająków', hp: 70, maxHp: 150, enraged: true }),
      ],
      TEXT,
    );
    expect(status?.members).toEqual([
      { name: 'Król Pająków', hp: 0, maxHp: 100, enraged: false, defeated: true },
      { name: 'Matka Pająków', hp: 70, maxHp: 150, enraged: true, defeated: false },
    ]);
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

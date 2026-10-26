import { describe, expect, it } from 'vitest';
import type { PartyMember } from '@/systems/Party';
import { isPartyDown, livingMembers, nearestLivingMember, spotBeside, straysOutside, targetMember } from '@/systems/Party';

const hero = (x: number, y: number, isDead = false): PartyMember => ({ x, y, isDead });

describe('Party (co-op, etap C0: drużyna zamiast gracza)', () => {
  it('solo: cel wroga to zawsze jedyny bohater, także martwy', () => {
    const alone = hero(10, 10);
    expect(targetMember([alone], { x: 500, y: 0 })).toBe(alone);
    const dead = hero(10, 10, true);
    expect(targetMember([dead], { x: 0, y: 0 })).toBe(dead);
  });

  it('wróg celuje w najbliższego żywego bohatera', () => {
    const p1 = hero(0, 0);
    const p2 = hero(100, 0);
    expect(targetMember([p1, p2], { x: 80, y: 0 })).toBe(p2);
    expect(targetMember([p1, p2], { x: 20, y: 0 })).toBe(p1);
  });

  it('powalony bohater nie przyciąga wrogów', () => {
    const p1 = hero(0, 0, true);
    const p2 = hero(100, 0);
    expect(targetMember([p1, p2], { x: 1, y: 0 })).toBe(p2);
  });

  it('cała drużyna leży: cel to pierwszy gracz, nearest zwraca null', () => {
    const p1 = hero(0, 0, true);
    const p2 = hero(100, 0, true);
    expect(nearestLivingMember([p1, p2], { x: 99, y: 0 })).toBeNull();
    expect(targetMember([p1, p2], { x: 99, y: 0 })).toBe(p1);
  });

  it('remis odległości rozstrzyga kolejność graczy', () => {
    const p1 = hero(-10, 0);
    const p2 = hero(10, 0);
    expect(nearestLivingMember([p1, p2], { x: 0, y: 0 })).toBe(p1);
  });

  it('żywi i koniec runu', () => {
    const p1 = hero(0, 0, true);
    const p2 = hero(0, 0);
    expect(livingMembers([p1, p2])).toEqual([p2]);
    expect(isPartyDown([p1, p2])).toBe(false);
    expect(isPartyDown([p1, { ...p2, isDead: true }])).toBe(true);
  });

  it('pusta drużyna to błąd programisty', () => {
    expect(() => targetMember([], { x: 0, y: 0 })).toThrow();
  });
});

describe('ściąganie drużyny do zamykanego pokoju (co-op, etap C3)', () => {
  const inside = (at: { x: number }) => at.x < 100;
  it('ściąga tylko tych spoza pokoju, bez kotwicy', () => {
    const a = { x: 10, y: 0 };
    const b = { x: 300, y: 0 };
    const c = { x: 50, y: 0 };
    expect(straysOutside([a, b, c], a, inside)).toEqual([b]);
    expect(straysOutside([a], a, inside)).toEqual([]);
  });

  it('stawia obok kotwicy, omijając mur', () => {
    expect(spotBeside({ x: 50, y: 50 }, 24, () => true)).toEqual({ x: 74, y: 50 });
    expect(spotBeside({ x: 50, y: 50 }, 24, (p) => p.x < 74)).toEqual({ x: 26, y: 50 });
    expect(spotBeside({ x: 50, y: 50 }, 24, () => false)).toEqual({ x: 50, y: 50 });
  });
});

import { describe, expect, it } from 'vitest';
import { RunMode } from '@/core/runMode';
import { plural, runSignature } from '@/systems/runSignature';

const base = { heroes: ['Barbarzyńca'], mode: RunMode.Tower, seed: 12345, startFloor: null, practice: false, fromSave: false, itemCount: 7, evolvedCount: 1 };

describe('podpis runu (krok U7)', () => {
  it('mówi kto, tryb, ziarno i zestaw', () => {
    expect(runSignature(base)).toBe('Barbarzyńca · wspinaczka · ziarno 12345 · 7 przedmiotów, 1 przemiana');
  });

  it('co-op, wybór piętra, areny i run testowy', () => {
    expect(runSignature({ ...base, heroes: ['Łucznik', 'Czarodziejka'] })).toContain('Łucznik + Czarodziejka · wspinaczka, co-op');
    expect(runSignature({ ...base, mode: RunMode.FloorSelect, startFloor: 3 })).toContain('od piętra 3');
    expect(runSignature({ ...base, mode: RunMode.BossRush, practice: true, evolvedCount: 0 })).toBe('Barbarzyńca · areny bossów, run testowy · ziarno 12345 · 7 przedmiotów');
    expect(runSignature({ ...base, seed: -1 })).toContain('ziarno 4294967295');
  });

  it('odmienia liczebniki', () => {
    expect([1, 2, 4, 5, 12, 13, 22, 25].map((n) => plural(n, 'a', 'b', 'c'))).toEqual(['a', 'b', 'b', 'c', 'c', 'c', 'b', 'c']);
  });
});

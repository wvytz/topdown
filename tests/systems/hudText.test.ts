import { describe, expect, it } from 'vitest';
import { fadingAlpha, floorHeadline, goldNote, objectiveHint } from '@/systems/hudText';

const ARENA = { fightHint: 'Pokonaj bossa i pomocników', arenaHint: 'teleport dalej' };
const base = { bossRush: false, boss: false, stairsUnlocked: false, onStairs: false, enemiesAlive: 4 };

describe('napisy HUD-u (krok U7)', () => {
  it('cel piętra ma wersję pełną i krótką; klucz nie zależy od liczby wrogów', () => {
    const a = objectiveHint(base, 'Naciśnij E', ARENA);
    const b = objectiveHint({ ...base, enemiesAlive: 3 }, 'Naciśnij E', ARENA);
    expect(a.key).toBe(b.key);
    expect(a.short).toBe('Wrogowie: 4');
    expect(a.long).toContain('komnatę bossa');
  });

  it('schody, boss i areny mają własny cel i barwę', () => {
    expect(objectiveHint({ ...base, stairsUnlocked: true }, 'Naciśnij E', ARENA)).toMatchObject({ key: 'stairs', tone: 'stairs', short: 'Schody otwarte' });
    expect(objectiveHint({ ...base, stairsUnlocked: true, onStairs: true }, 'Stuknij E', ARENA).short).toBe('Stuknij E, aby wspiąć się wyżej');
    expect(objectiveHint({ ...base, boss: true }, 'Naciśnij E', ARENA)).toMatchObject({ key: 'boss', tone: 'boss' });
    expect(objectiveHint({ ...base, bossRush: true }, 'Naciśnij E', ARENA)).toMatchObject({ key: 'arena', tone: 'arena' });
  });

  it('nagłówek piętra: pełny opis modyfikatora tylko na początku piętra', () => {
    const modifier = { name: 'Złota żyła', description: '+50% złota' };
    expect(floorHeadline('Piętro 5', modifier, 1000, 9000)).toBe('Piętro 5 · Złota żyła: +50% złota');
    expect(floorHeadline('Piętro 5', modifier, 9000, 9000)).toBe('Piętro 5 · Złota żyła');
    expect(floorHeadline('Piętro 5', null, 0, 9000)).toBe('Piętro 5');
  });

  it('napis pomocy gaśnie po czasie', () => {
    expect(fadingAlpha(0, 1000, 500)).toBe(1);
    expect(fadingAlpha(1250, 1000, 500)).toBeCloseTo(0.5);
    expect(fadingAlpha(5000, 1000, 500)).toBe(0);
    expect(fadingAlpha(1000, 1000, 0)).toBe(0);
  });

  it('dopisek przy złocie', () => {
    expect(goldNote({ bossRush: false, practice: false }, 'x')).toBe('wynik');
    expect(goldNote({ bossRush: false, practice: true }, 'x')).toContain('bez wyniku');
    expect(goldNote({ bossRush: true, practice: true }, 'tablica aren')).toBe('tablica aren');
  });
});

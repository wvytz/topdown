import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { BossStallDetector, LimitWatch, StuckDetector, floorConnectivityIssues, reachable } from '@/systems/AnomalyDetectors';
import { floorFromAscii, room, sampleFloors } from '../helpers/floors';

const STUCK = { windowMs: 4000, minMovePx: 6, cooldownMs: 30_000 };

describe('wykrywacze anomalii (krok 56)', () => {
  it('utknięcie: ruch wciśnięty, a pozycja stoi — zgłasza po oknie, potem dopiero po odstępie', () => {
    const d = new StuckDetector(STUCK);
    const held = { moveHeld: true, exempt: false, x: 100, y: 100 };
    expect(d.update(0, held)).toBeNull();
    expect(d.update(3000, held)).toBeNull();
    const found = d.update(4100, held);
    expect(found?.kind).toBe('player-stuck');
    expect(found?.data.heldMs).toBe(4100);
    expect(d.update(8000, held)).toBeNull(); // w odstępie
    expect(d.update(40_000, held)?.kind).toBe('player-stuck');
  });

  it('utknięcie: ruch gracza, puszczenie klawiszy i stany wyjątkowe zerują okno', () => {
    const d = new StuckDetector(STUCK);
    let x = 0;
    for (let t = 0; t <= 20_000; t += 500) {
      x += 3; // idzie
      expect(d.update(t, { moveHeld: true, exempt: false, x, y: 0 })).toBeNull();
    }
    const still = { moveHeld: true, exempt: false, x: 5, y: 5 };
    d.update(0, still);
    expect(d.update(3500, { ...still, moveHeld: false })).toBeNull(); // puścił klawisze
    expect(d.update(4000, still)).toBeNull(); // nowe okno
    expect(d.update(7000, { ...still, exempt: true })).toBeNull(); // paraliż / śmierć
    expect(d.update(7500, still)).toBeNull();
  });

  it('boss: HP stoi przez limit czasu = zgłoszenie; zmiana HP albo koniec walki zeruje', () => {
    const d = new BossStallDetector(10_000);
    expect(d.update(0, 500)).toBeNull();
    expect(d.update(9000, 500)).toBeNull();
    expect(d.update(10_500, 500)?.kind).toBe('boss-stalled');
    expect(d.update(12_000, 500)).toBeNull(); // odstęp
    expect(d.update(30_000, 480)).toBeNull(); // HP się zmieniło
    expect(d.update(41_000, 480)?.kind).toBe('boss-stalled');
    expect(d.update(42_000, null)).toBeNull();
    expect(d.update(60_000, 480)).toBeNull(); // nowa walka liczy od początku
  });

  it('limit liczności: raz na odstęp', () => {
    const w = new LimitWatch('wrogowie', 10, 1000);
    expect(w.check(0, 10)).toBeNull();
    expect(w.check(10, 11)?.data).toEqual({ value: 11, limit: 10 });
    expect(w.check(500, 50)).toBeNull();
    expect(w.check(1500, 50)?.kind).toBe('limit:wrogowie');
  });

  it('osiągalność: BFS po kaflach, schody i kraty przejezdne, ściana blokuje', () => {
    const f = floorFromAscii(['#######', '#..#..#', '#..#..#', '#######']);
    expect(reachable(f, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(true);
    expect(reachable(f, { x: 1, y: 1 }, { x: 4, y: 1 })).toBe(false);
    expect(reachable(f, { x: 1, y: 1 }, { x: 99, y: 1 })).toBe(false);
    const g = floorFromAscii(['#####', '#.S.#', '#####']);
    expect(g.tiles[g.stairs.y * g.width + g.stairs.x]).toBe(TileType.StairsLocked);
    expect(reachable(g, { x: 1, y: 1 }, { x: 3, y: 1 })).toBe(true);
  });

  it('spójność: pokój za ścianą i schody poza zasięgiem są zgłaszane', () => {
    const f = floorFromAscii(['########', '#@.#..S#', '#..#...#', '########'], [room(0, 1, 1, 2, 2, RoomKind.Start), room(1, 4, 1, 3, 2, RoomKind.Normal)]);
    const issues = floorConnectivityIssues(f);
    expect(issues.some((i) => i.includes('pokój 1'))).toBe(true);
    expect(issues.some((i) => i.includes('schody'))).toBe(true);
    const ok = floorFromAscii(['#####', '#@.S#', '#####'], [room(0, 1, 1, 2, 1, RoomKind.Start)]);
    expect(floorConnectivityIssues(ok)).toEqual([]);
  });

  it('wygenerowane piętra są spójne (żadnych zgłoszeń na 1–12)', () => {
    for (const floor of sampleFloors([1, 2, 3, 4, 5, 6, 7, 12], 8)) expect(floorConnectivityIssues(floor)).toEqual([]);
  });
});

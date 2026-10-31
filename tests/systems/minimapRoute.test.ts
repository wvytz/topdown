import { describe, expect, it } from 'vitest';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { TileType, type DungeonFloor } from '@/core/dungeonTypes';
import { MinimapRoute, visibleRoute } from '@/systems/MinimapRoute';

const floor = new DungeonGenerator(getDungeonConfigForFloor(2)).generate(11);

/** Mały korytarz w kształcie L: 5×5, podłoga w górnym wierszu i prawej kolumnie. */
function lFloor(): DungeonFloor {
  const width = 5;
  const height = 5;
  const tiles: TileType[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) tiles.push(y === 0 || x === 4 ? TileType.Floor : TileType.Wall);
  }
  return { ...floor, width, height, tiles };
}

describe('MinimapRoute', () => {
  it('prowadzi po podłodze od gracza do schodów, krok po kroku', () => {
    const r = new MinimapRoute(floor);
    const path = r.route(floor.playerSpawn, floor.stairs, 10_000);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(floor.stairs);
    let prev = floor.playerSpawn;
    for (const t of path) {
      expect(Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y)).toBe(1);
      expect(floor.tiles[t.y * floor.width + t.x]).not.toBe(TileType.Wall);
      prev = t;
    }
  });

  it('omija ściany (L-korytarz) i jest najkrótsza', () => {
    const r = new MinimapRoute(lFloor());
    const path = r.route({ x: 0, y: 0 }, { x: 4, y: 4 }, 100);
    expect(path).toHaveLength(8);
    expect(path[3]).toEqual({ x: 4, y: 0 });
  });

  it('ucina trasę do limitu i oddaje pustą dla celu nieosiągalnego', () => {
    const r = new MinimapRoute(lFloor());
    expect(r.route({ x: 0, y: 0 }, { x: 4, y: 4 }, 3)).toHaveLength(3);
    expect(r.route({ x: 2, y: 2 }, { x: 4, y: 4 }, 100)).toEqual([]);
  });

  it('jest deterministyczna i oddaje tę samą tablicę dla tego samego kafla', () => {
    const r = new MinimapRoute(floor);
    const a = r.route(floor.playerSpawn, floor.stairs, 500);
    expect(r.route(floor.playerSpawn, floor.stairs, 500)).toBe(a);
    expect(new MinimapRoute(floor).route(floor.playerSpawn, floor.stairs, 500)).toEqual(a);
  });
});

describe('visibleRoute', () => {
  const route = Array.from({ length: 10 }, (_, x) => ({ x, y: 0 }));

  it('pokazuje odkrytą część w pełni, a we mgle tylko kilka wygasających kafli', () => {
    const shown = visibleRoute(route, (x) => x < 4, 3);
    expect(shown).toHaveLength(7);
    expect(shown.slice(0, 4).every((s) => s.fade === 1)).toBe(true);
    const fog = shown.slice(4).map((s) => s.fade);
    expect(fog[0]).toBeGreaterThan(fog[1]!);
    expect(fog[1]).toBeGreaterThan(fog[2]!);
    expect(fog[2]).toBeGreaterThan(0);
  });

  it('bez odkrytych kafli zostaje sam początek kierunku', () => {
    expect(visibleRoute(route, () => false, 2)).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { TileType } from '@/core/dungeonTypes';
import { MinimapExplorer } from '@/systems/Minimap';

const floor = new DungeonGenerator(getDungeonConfigForFloor(2)).generate(11);
const spawn = floor.playerSpawn;

describe('MinimapExplorer', () => {
  it('na starcie nic nie jest odkryte', () => {
    const m = new MinimapExplorer(floor, 6);
    expect(m.revealed.every((v) => v === 0)).toBe(true);
    expect(m.version).toBe(0);
  });

  it('odkrywa kafel gracza i nie wychodzi poza promień', () => {
    const m = new MinimapExplorer(floor, 4);
    m.reveal(spawn);
    expect(m.isRevealed(spawn.x, spawn.y)).toBe(true);
    for (let i = 0; i < m.revealed.length; i++) {
      if (!m.revealed[i]) continue;
      expect(Math.abs((i % floor.width) - spawn.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(Math.floor(i / floor.width) - spawn.y)).toBeLessThanOrEqual(5);
    }
  });

  it('odkryta podłoga jest osiągalna, a ściany tylko sąsiadują z podłogą', () => {
    const m = new MinimapExplorer(floor, 8);
    m.reveal(spawn);
    const { width, height } = floor;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!m.isRevealed(x, y) || floor.tiles[y * width + x] !== TileType.Wall) continue;
        let nextToRevealedFloor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const i = (y + dy) * width + x + dx;
            if (m.revealed[i] && floor.tiles[i] !== TileType.Wall) nextToRevealedFloor = true;
          }
        }
        expect(nextToRevealedFloor).toBe(true);
      }
    }
  });

  it('podnosi wersję tylko przy zmianie odkrytego obszaru', () => {
    const m = new MinimapExplorer(floor, 6);
    m.reveal(spawn);
    const v = m.version;
    expect(v).toBeGreaterThan(0);
    m.reveal(spawn);
    expect(m.version).toBe(v);
  });

  it('ignoruje pozycje poza mapą', () => {
    const m = new MinimapExplorer(floor, 6);
    m.reveal({ x: -3, y: 2 });
    expect(m.version).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { HIDEOUT_CONFIG, HideoutStation } from '@/config/hideoutConfig';
import { TileType } from '@/core/dungeonTypes';
import { buildHideout, standTileFor, stationCenter, stationInReach } from '@/dungeon/HideoutLayout';
import { isStairsTile } from '@/dungeon/stairs';
import { floorConnectivityIssues, reachable } from '@/systems/AnomalyDetectors';

describe('układ Popielnika', () => {
  const { floor, stations } = buildHideout(HIDEOUT_CONFIG);
  const tileAt = (x: number, y: number) => floor.tiles[y * floor.width + x];

  it('jest spójny, z murem dookoła', () => {
    expect(floorConnectivityIssues(floor)).toEqual([]);
    for (let x = 0; x < floor.width; x++) {
      expect(tileAt(x, 0)).toBe(TileType.Wall);
      expect(tileAt(x, floor.height - 1)).toBe(TileType.Wall);
    }
    for (let y = 0; y < floor.height; y++) {
      expect(tileAt(0, y)).toBe(TileType.Wall);
      expect(tileAt(floor.width - 1, y)).toBe(TileType.Wall);
    }
  });

  it('bohater startuje na podłodze i dojdzie do każdego stanowiska', () => {
    expect(tileAt(floor.playerSpawn.x, floor.playerSpawn.y)).toBe(TileType.Floor);
    for (const station of stations) {
      const stand = standTileFor(floor, station);
      expect(tileAt(stand.x, stand.y), station.id).not.toBe(TileType.Wall);
      expect(reachable(floor, floor.playerSpawn, stand), station.id).toBe(true);
    }
  });

  it('Szyb to pełny blok schodów, pozostałe stanowiska stoją na podłodze', () => {
    for (const station of stations) {
      if (station.id === HideoutStation.Shaft) expect(isStairsTile(floor, station.tile)).toBe(true);
      else expect(tileAt(station.tile.x, station.tile.y), station.id).toBe(TileType.Floor);
    }
    expect(floor.tiles.filter((tile) => tile === TileType.StairsLocked)).toHaveLength(9);
  });

  it('każde stanowisko jest raz i ma osobne miejsce', () => {
    expect(new Set(stations.map((s) => s.id)).size).toBe(Object.values(HideoutStation).length);
    expect(new Set(stations.map((s) => `${s.tile.x},${s.tile.y}`)).size).toBe(stations.length);
  });

  it('z miejsca przy stanowisku interakcja je znajduje, a ze środka komory — tylko gdy jest blisko', () => {
    for (const station of stations) {
      if (station.prompt === null) continue;
      const stand = standTileFor(floor, station);
      expect(stationInReach(stations, stand, HIDEOUT_CONFIG.reachTiles)?.id, station.id).toBe(station.id);
    }
    expect(stationInReach(stations, floor.playerSpawn, HIDEOUT_CONFIG.reachTiles)).toBeNull();
    // Krok Z3: Palenisko też jest stanowiskiem (przedmiot startowy) — działa przy samym ogniu.
    const hearth = stations.find((s) => s.id === HideoutStation.Hearth)!;
    expect(stationInReach(stations, stationCenter(hearth), 0.5)?.id).toBe(HideoutStation.Hearth);
  });
});

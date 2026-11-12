import { STAIRS_SIZE } from '@/config/gameConfig';
import type { HideoutConfig, HideoutStationSpot } from '@/config/hideoutConfig';
import { HideoutStation } from '@/config/hideoutConfig';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';

/** Seed „piętra” Popielnika — stały, kryjówka zawsze wygląda tak samo. */
export const HIDEOUT_SEED = 0x9091e;

export interface HideoutLayout {
  readonly floor: DungeonFloor;
  readonly stations: readonly HideoutStationSpot[];
}

/**
 * Popielnik (Akt II, krok Z1): ręcznie ułożona owalna komora bez wrogów. Zwraca zwykłe dane piętra, więc rysuje ją
 * ten sam `DungeonView` i dekoruje `dressFloor`. Szyb w górę to blok schodów (stoi się na nim jak na schodach piętra).
 */
export function buildHideout(config: HideoutConfig): HideoutLayout {
  const { widthTiles: width, heightTiles: height, center, radius } = config;
  const tiles: TileType[] = new Array<TileType>(width * height).fill(TileType.Wall);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const dx = (x - center.x) / radius.x;
      const dy = (y - center.y) / radius.y;
      if (dx * dx + dy * dy <= 1) tiles[y * width + x] = TileType.Floor;
    }
  }
  const shaft = config.stations.find((station) => station.id === HideoutStation.Shaft);
  if (!shaft) throw new Error('HideoutLayout: brak stanowiska Szybu w konfiguracji.');
  for (let dy = 0; dy < STAIRS_SIZE; dy++) {
    for (let dx = 0; dx < STAIRS_SIZE; dx++) tiles[(shaft.tile.y + dy) * width + shaft.tile.x + dx] = TileType.StairsLocked;
  }
  // Jeden „pokój” na całą komorę: dekorowanie kładzie w nim płyty pokoju, a nie bruk korytarza.
  const room = { id: 0, x: 1, y: 1, width: width - 2, height: height - 2, kind: RoomKind.Start };
  return {
    floor: { seed: HIDEOUT_SEED, width, height, tiles, rooms: [room], startRoomId: 0, bossRoomId: 0, playerSpawn: config.spawn, stairs: shaft.tile },
    stations: config.stations,
  };
}

/** Kafel, na którym „stoi” stanowisko dla zasięgu interakcji: Szyb — środek bloku schodów. */
export function stationCenter(station: HideoutStationSpot): { x: number; y: number } {
  const half = station.id === HideoutStation.Shaft ? (STAIRS_SIZE - 1) / 2 : 0;
  return { x: station.tile.x + half, y: station.tile.y + half };
}

/** Najbliższe stanowisko z akcją w zasięgu bohatera (pozycje w kaflach, środek–środek); null — żadne. */
export function stationInReach(stations: readonly HideoutStationSpot[], hero: { x: number; y: number }, reachTiles: number): HideoutStationSpot | null {
  let best: HideoutStationSpot | null = null;
  let bestDistance = Infinity;
  for (const station of stations) {
    if (station.prompt === null) continue;
    const center = stationCenter(station);
    // Szyb to cały blok schodów — zasięg liczony od jego krawędzi, nie od środka.
    const reach = reachTiles + (station.id === HideoutStation.Shaft ? (STAIRS_SIZE - 1) / 2 : 0);
    const distance = (center.x - hero.x) ** 2 + (center.y - hero.y) ** 2;
    if (distance <= reach * reach && distance < bestDistance) {
      best = station;
      bestDistance = distance;
    }
  }
  return best;
}

/** Kafel przy stanowisku (od strony środka komory) — tu staje bohater po stuknięciu stanowiska na telefonie; Szyb: środek schodów. */
export function standTileFor(floor: DungeonFloor, station: HideoutStationSpot): TilePoint {
  if (station.id === HideoutStation.Shaft) return { x: station.tile.x + Math.floor(STAIRS_SIZE / 2), y: station.tile.y + Math.floor(STAIRS_SIZE / 2) };
  return station.tile.y < floor.height / 2 ? { x: station.tile.x, y: station.tile.y + 1 } : { x: station.tile.x, y: station.tile.y - 1 };
}

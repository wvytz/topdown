import type { Room, TilePoint } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { ambushSpawnTiles } from '@/systems/Ambush';

/**
 * Ustalone fale zasadzki (krok 164, uwaga testera: „pokój z upiorami szybko się nudzi — może lepiej predefined
 * fale”). Zamiast 2 fal upiorów w losowych miejscach zasadzka losuje (z seeda piętra) jeden z ręcznie ułożonych
 * scenariuszy: 3 fale, każda w innym szyku (pierścień wokół gracza, szereg pod ścianą, kleszcze, rogi),
 * czasem z upiorem-elitą albo wrogami biomu. Czysta logika: scenariusz i kafle szyku.
 */
export enum AmbushFormation {
  /** Losowo w pokoju, z dala od gracza (jak przed krokiem 164). */
  Scatter = 'scatter',
  /** Pierścień wokół gracza. */
  Ring = 'ring',
  /** Szereg pod ścianą najdalszą od gracza. */
  Wall = 'wall',
  /** Dwie grupy po przeciwnych stronach gracza (wzdłuż dłuższego boku pokoju). */
  Pincer = 'pincer',
  /** Z czterech rogów pokoju. */
  Corners = 'corners',
}

export interface AmbushWave {
  readonly formation: AmbushFormation;
  /** Upiory w fali. */
  readonly ghosts: number;
  /** Jeden z upiorów jest elitą (Szybki). */
  readonly elite?: boolean;
  /** Dodatkowi zwykli wrogowie biomu (z łupem). */
  readonly mobs?: number;
}

export interface AmbushScenario {
  readonly name: string;
  readonly waves: readonly AmbushWave[];
}

export function pickScenario(scenarios: readonly AmbushScenario[], rng: Rng): AmbushScenario {
  return scenarios[Math.floor(rng.next() * scenarios.length)] ?? scenarios[0]!;
}

/** Ile wrogów w fali razem (do stanu zasadzki). */
export function waveSize(wave: AmbushWave): number {
  return wave.ghosts + (wave.mobs ?? 0);
}

/** Kafle wnętrza pokoju (odstęp 1 od ścian). */
function interior(room: Room): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let y = room.y + 1; y < room.y + room.height - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.width - 1; x++) tiles.push({ x, y });
  }
  return tiles;
}

const chebyshev = (a: TilePoint, b: TilePoint): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** `count` kafli rozłożonych równo po liście (pierwszy, ostatni i pomiędzy). */
function spread(tiles: readonly TilePoint[], count: number): TilePoint[] {
  if (count <= 0 || tiles.length === 0) return [];
  if (count >= tiles.length) return [...tiles];
  const out: TilePoint[] = [];
  for (let i = 0; i < count; i++) out.push(tiles[Math.floor(((i + 0.5) * tiles.length) / count)]!);
  return out;
}

/**
 * Kafle szyku: różne, we wnętrzu pokoju, co najmniej `minDistance` od gracza (pierścień — dokładnie w swoim
 * promieniu). Gdy szyk nie mieści się w pokoju, dopełnia losowo jak `Scatter`.
 */
export function formationTiles(room: Room, player: TilePoint, formation: AmbushFormation, count: number, minDistance: number, rng: Rng): TilePoint[] {
  const all = interior(room);
  let picked: TilePoint[] = [];
  switch (formation) {
    case AmbushFormation.Scatter:
      return ambushSpawnTiles(room, player, count, minDistance, rng);
    case AmbushFormation.Ring: {
      // Najmniejszy promień ≥ minDistance, na którym mieści się cały pierścień; kafle po kącie.
      for (let r = minDistance; r <= minDistance + 2 && picked.length < count; r++) {
        const ring = all
          .filter((t) => chebyshev(t, player) === r)
          .sort((a, b) => Math.atan2(a.y - player.y, a.x - player.x) - Math.atan2(b.y - player.y, b.x - player.x));
        if (ring.length >= count || r === minDistance + 2) picked = spread(ring, count);
      }
      break;
    }
    case AmbushFormation.Wall: {
      const sides = [
        all.filter((t) => t.y === room.y + 1),
        all.filter((t) => t.y === room.y + room.height - 2),
        all.filter((t) => t.x === room.x + 1),
        all.filter((t) => t.x === room.x + room.width - 2),
      ];
      const far = (side: TilePoint[]) => side.reduce((sum, t) => sum + chebyshev(t, player), 0) / Math.max(1, side.length);
      const side = sides.filter((s) => s.length > 0).sort((a, b) => far(b) - far(a))[0] ?? [];
      picked = spread(side.filter((t) => chebyshev(t, player) >= minDistance), count);
      break;
    }
    case AmbushFormation.Pincer: {
      const horizontal = room.width >= room.height;
      const before = all.filter((t) => (horizontal ? t.x < player.x : t.y < player.y) && chebyshev(t, player) >= minDistance);
      const after = all.filter((t) => (horizontal ? t.x > player.x : t.y > player.y) && chebyshev(t, player) >= minDistance);
      // Grupa jak najbliżej osi gracza (kleszcze zamykają się z boków).
      const byAxis = (t: TilePoint) => (horizontal ? Math.abs(t.y - player.y) * 10 + Math.abs(t.x - player.x) : Math.abs(t.x - player.x) * 10 + Math.abs(t.y - player.y));
      const half = Math.ceil(count / 2);
      picked = [...before.sort((a, b) => byAxis(a) - byAxis(b)).slice(0, half), ...after.sort((a, b) => byAxis(a) - byAxis(b)).slice(0, count - half)];
      break;
    }
    case AmbushFormation.Corners: {
      const corners = [
        { x: room.x + 1, y: room.y + 1 },
        { x: room.x + room.width - 2, y: room.y + 1 },
        { x: room.x + 1, y: room.y + room.height - 2 },
        { x: room.x + room.width - 2, y: room.y + room.height - 2 },
      ];
      // Kolejne kafle w rogach na zmianę: róg 1, 2, 3, 4, potem sąsiedzi rogów.
      const ranked = corners.map((c) => all.filter((t) => chebyshev(t, player) >= minDistance).sort((a, b) => chebyshev(a, c) - chebyshev(b, c)));
      for (let i = 0; picked.length < count && i < all.length; i++) {
        for (const list of ranked) {
          const tile = list[i];
          if (tile && picked.length < count && !picked.some((p) => p.x === tile.x && p.y === tile.y)) picked.push(tile);
        }
      }
      break;
    }
  }
  if (picked.length < count) {
    const rest = all.filter((t) => !picked.some((p) => p.x === t.x && p.y === t.y) && chebyshev(t, player) >= 1);
    while (picked.length < count && rest.length > 0) picked.push(rest.splice(Math.floor(rng.next() * rest.length), 1)[0]!);
  }
  return picked.slice(0, count);
}

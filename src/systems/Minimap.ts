import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';

/**
 * Mgła wojny minimapy (krok 68). Czysta logika: które kafle gracz już widział.
 * Odkrywamy podłogę osiągalną po podłodze w promieniu (Czebyszew) od gracza oraz sąsiadujące z nią ściany,
 * więc minimapa nie zdradza pokoi za murem (ani ukrytej komnaty — dostaje piętro w przebraniu).
 */
export class MinimapExplorer {
  /** 1 = odkryty. Indeks jak w `floor.tiles`. */
  readonly revealed: Uint8Array;
  /** Rośnie przy każdej zmianie odkrytego obszaru — rysowanie przerysowuje tylko wtedy. */
  version = 0;
  private lastKey = '';

  constructor(
    readonly floor: DungeonFloor,
    private readonly radius: number,
  ) {
    this.revealed = new Uint8Array(floor.width * floor.height);
  }

  /** Odkrywa okolicę kafla gracza; tanie przy staniu w miejscu i przy ruchu w obrębie kafla. */
  reveal(at: TilePoint): void {
    const { width, height, tiles } = this.floor;
    if (at.x < 0 || at.y < 0 || at.x >= width || at.y >= height) return;
    const key = `${at.x},${at.y}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    let changed = false;
    const mark = (index: number) => {
      if (this.revealed[index] === 0) {
        this.revealed[index] = 1;
        changed = true;
      }
    };
    const seen = new Set<number>([at.y * width + at.x]);
    const queue = [at];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]!;
      mark(cur.y * width + cur.x);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (Math.abs(nx - at.x) > this.radius || Math.abs(ny - at.y) > this.radius) continue;
          const index = ny * width + nx;
          if (tiles[index] === TileType.Wall) {
            mark(index);
          } else if (!seen.has(index)) {
            seen.add(index);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
    if (changed) this.version++;
  }

  isRevealed(x: number, y: number): boolean {
    return this.revealed[y * this.floor.width + x] === 1;
  }
}

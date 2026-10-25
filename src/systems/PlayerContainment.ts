import type { TilePoint } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/**
 * Bezpiecznik położenia gracza (krok 99, zgłoszenie właściciela z Areny 5): fizyka Arcade potrafi przepchnąć
 * ciało przez kafel kolizji, gdy w jednej klatce zsumują się dash, odrzut i napór bossa (rozdzielanie z kaflem
 * ma ograniczony zapas, krata ma tylko jeden kafel grubości). Co klatkę sprawdzamy kafel pod środkiem gracza:
 * dozwolony zapamiętujemy, z niedozwolonego (mur, krata, poza zamkniętą areną) cofamy na ostatni dozwolony.
 */
export class PlayerContainment {
  private lastAllowed: Vector2 | null = null;

  constructor(
    private readonly tileSize: number,
    /** Czy środek gracza może leżeć na tym kafelku (bez muru i kraty; przy zamkniętej arenie — tylko w niej). */
    private readonly isAllowed: (tile: TilePoint) => boolean,
  ) {}

  /** Zwraca pozycję, na którą trzeba cofnąć gracza, albo null, gdy stoi na dozwolonym kafelku. */
  update(position: Vector2): Vector2 | null {
    const tile = { x: Math.floor(position.x / this.tileSize), y: Math.floor(position.y / this.tileSize) };
    if (this.isAllowed(tile)) {
      this.lastAllowed = { x: position.x, y: position.y };
      return null;
    }
    return this.lastAllowed;
  }
}

import type { Vector2 } from '@/core/types';

/**
 * Kierunek patrzenia jako numer wiersza arkusza sprite'ów: 0 = góra ekranu (N), dalej zgodnie
 * z zegarem (NE, E, SE, S, SW, W, NW). Reguła z handoffu: `row = round(angle_deg / 45) % 8`.
 * Zwraca null dla wektora zerowego — wtedy encja zachowuje poprzedni kierunek.
 */
export function facingDirection(vector: Vector2, directions = 8): number | null {
  if (vector.x === 0 && vector.y === 0) return null;
  // atan2(x, -y): 0° w górę ekranu, kąt rośnie zgodnie z zegarem (oś y w dół).
  const degrees = (Math.atan2(vector.x, -vector.y) * 180) / Math.PI;
  const step = 360 / directions;
  return ((Math.round(degrees / step) % directions) + directions) % directions;
}

/** Indeks klatki w arkuszu (wiersze = kierunki, kolumny = klatki). */
export function sheetFrameIndex(direction: number, column: number, columns: number): number {
  return direction * columns + column;
}

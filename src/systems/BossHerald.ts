import type { Room, TilePoint } from '@/core/dungeonTypes';

/**
 * Zapowiedź bossa (krok 54): im bliżej areny, tym silniejsze sygnały — pajęczyny, ślady, odcień światła, drżenie
 * ekranu, iskry. Czysta logika: siła zapowiedzi 0..1 i rozkład drżeń w czasie. Rysowanie i kamera są w Phaserze.
 */

/** Siła zapowiedzi w kaflu: 1 w arenie, liniowo do 0 na `radiusTiles` od jej krawędzi (linia prosta). */
export function roomProximity(tile: TilePoint, room: Room, radiusTiles: number): number {
  const dx = Math.max(room.x - tile.x, 0, tile.x - (room.x + room.width - 1));
  const dy = Math.max(room.y - tile.y, 0, tile.y - (room.y + room.height - 1));
  return Math.max(0, 1 - Math.hypot(dx, dy) / radiusTiles);
}

export interface RumbleConfig {
  /** Poniżej tej siły zapowiedzi ekran nie drży. */
  readonly minStrength: number;
  /** Odstęp między drżeniami: daleko (siła tuż nad progiem) i blisko (siła 1). */
  readonly intervalMs: { readonly far: number; readonly near: number };
  readonly durationMs: number;
  /** Intensywność drżenia kamery przy sile 1 (rośnie liniowo z siłą). */
  readonly intensity: number;
}

/** Czas do następnego drżenia przy danej sile; null, gdy siła jest za mała. */
export function rumbleInterval(strength: number, config: RumbleConfig): number | null {
  if (strength < config.minStrength) return null;
  const t = Math.min(1, Math.max(0, (strength - config.minStrength) / (1 - config.minStrength)));
  return config.intervalMs.far + (config.intervalMs.near - config.intervalMs.far) * t;
}

/** Czy teraz drżenie (poprzednie zaczęło się w `lastAt`). */
export function rumbleDue(strength: number, now: number, lastAt: number, config: RumbleConfig): boolean {
  const interval = rumbleInterval(strength, config);
  return interval !== null && now - lastAt >= interval;
}

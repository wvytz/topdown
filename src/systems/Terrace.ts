import type { TerraceConfig } from '@/core/arenaConditionTypes';
import { ArenaSide } from '@/core/arenaConditionTypes';
import type { TilePoint } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/**
 * Taras na dachu wieży (krok 160, B3): płyty pękają pod pikującymi ptakami i lądowaniem Wiedźmy, po `crackMs`
 * odpadają, a bohater, który wejdzie w dziurę, spada (część HP, powrót na najbliższą całą płytę). Dash przelatuje
 * nad dziurą. Podmuchy wiatru spychają ku przepaści. Czysta logika — Phaser tylko rysuje i przesuwa.
 */

const key = (t: TilePoint): string => `${t.x},${t.y}`;

interface Plate {
  readonly tile: TilePoint;
  readonly crackAt: number;
  readonly holeAt: number;
}

export class TerracePlates {
  private readonly plates = new Map<string, Plate>();
  private patched = false;

  /**
   * `allowed` — kafle, które mogą odpaść (podłoga areny bez okolic wejścia i schodów); limit dziur to
   * `maxHoleFraction` całej podłogi areny (`floorTiles`).
   */
  constructor(
    private readonly allowed: ReadonlySet<string>,
    floorTiles: number,
    private readonly config: TerraceConfig,
  ) {
    this.maxHoles = Math.floor(floorTiles * config.maxHoleFraction);
  }

  private readonly maxHoles: number;

  /** Płyta zaczyna pękać; zwraca true, gdy to nowe pęknięcie (efekt, dźwięk). */
  crack(tile: TilePoint, now: number): boolean {
    if (this.patched || !this.allowed.has(key(tile)) || this.plates.has(key(tile))) return false;
    if (this.plates.size >= this.maxHoles) return false;
    this.plates.set(key(tile), { tile, crackAt: now, holeAt: now + this.config.crackMs });
    return true;
  }

  /** Płyty w promieniu `radiusTiles` (Chebyshev) wokół kafla — lądowanie łamie kilka naraz. */
  crackAround(center: TilePoint, radiusTiles: number, now: number): TilePoint[] {
    const cracked: TilePoint[] = [];
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        const tile = { x: center.x + dx, y: center.y + dy };
        if (this.crack(tile, now)) cracked.push(tile);
      }
    }
    return cracked;
  }

  isHole(tile: TilePoint, now: number): boolean {
    if (this.patched) return false;
    const plate = this.plates.get(key(tile));
    return plate !== undefined && now >= plate.holeAt;
  }

  isCracking(tile: TilePoint, now: number): boolean {
    const plate = this.plates.get(key(tile));
    return !this.patched && plate !== undefined && now < plate.holeAt;
  }

  /** Wszystkie płyty, które pękają albo już odpadły. */
  get all(): readonly Plate[] {
    return [...this.plates.values()];
  }

  /** Po walce dziury zarastają gałęziami — już nie da się spaść. */
  patch(): void {
    this.patched = true;
  }

  get isPatched(): boolean {
    return this.patched;
  }
}

/**
 * Najbliższa bezpieczna płyta (środek kafla, px) dla spadającego bohatera: najpierw ostatnia bezpieczna pozycja,
 * potem pierścienie kafli wokół miejsca upadku.
 */
export function landingTile(from: TilePoint, isSafe: (tile: TilePoint) => boolean, maxRing = 8): TilePoint | null {
  if (isSafe(from)) return from;
  for (let ring = 1; ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const tile = { x: from.x + dx, y: from.y + dy };
        if (isSafe(tile)) return tile;
      }
    }
  }
  return null;
}

/** Obrażenia upadku (co najmniej 1). */
export function fallDamage(maxHp: number, config: TerraceConfig): number {
  return Math.max(1, Math.round(maxHp * config.fall.damageFraction));
}

/** Kierunek podmuchu: w stronę przepaści. */
export function windDirection(side: ArenaSide): Vector2 {
  switch (side) {
    case ArenaSide.North:
      return { x: 0, y: -1 };
    case ArenaSide.East:
      return { x: 1, y: 0 };
    case ArenaSide.South:
      return { x: 0, y: 1 };
    case ArenaSide.West:
      return { x: -1, y: 0 };
  }
}

/** Czy strefa uderzenia łamie płyty: pikowanie (1 płyta) albo lądowanie (strefa bez wyglądu, duża). */
export function crackRadiusFor(look: string | undefined, radius: number, config: TerraceConfig): number | null {
  if (look === 'dive') return 0;
  if (look === undefined && radius >= config.leapMinRadiusPx) return config.leapCrackRadiusTiles;
  return null;
}

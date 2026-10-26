import type { FungalTrailDefinition, WebShot } from '@/core/bossTypes';
import type { Vector2 } from '@/core/types';
import { fungalPatch } from '@/ai/bossAttacks';

/** Przesunięcie dłuższe niż tyle odstępów w jednej klatce to skok albo teleport — bez grzybów po drodze. */
const JUMP_SPACINGS = 3;

/**
 * Ślad grzybów za Grzybowym Pożeraczem (krok 111, prośba właściciela): liczy drogę bossa i co `spacing` px
 * zwraca nowy płat pod jego stopami. Czysta logika — płaty rysuje i sprawdza `BossFight`.
 */
export class FungalTrail {
  private last: Vector2 | null = null;
  private travelled = 0;

  constructor(private readonly definition: FungalTrailDefinition) {}

  /** Boss w `position` (środek); zwraca płat, jeśli od ostatniego przeszedł `spacing` px. */
  step(position: Vector2, now: number, enraged: boolean): WebShot | null {
    const last = this.last;
    this.last = { x: position.x, y: position.y };
    if (!last) return null;
    const moved = Math.hypot(position.x - last.x, position.y - last.y);
    const { spacing, offsetY, patch, enragedDurationMs } = this.definition;
    if (moved > spacing * JUMP_SPACINGS) return null;
    this.travelled += moved;
    if (this.travelled < spacing) return null;
    this.travelled = 0;
    const at = { x: position.x, y: position.y + offsetY };
    return fungalPatch(at, patch, now, enraged ? enragedDurationMs : patch.durationMs);
  }

  /** Boss przestał chodzić po ziemi (skok, uczta) — droga liczy się od nowa w miejscu powrotu. */
  reset(): void {
    this.last = null;
    this.travelled = 0;
  }

  /** Ile płatów śladu może leżeć naraz (nadmiar: najstarsze znikają). */
  maxPatches(enraged: boolean): number {
    return enraged ? this.definition.enragedMaxPatches : this.definition.maxPatches;
  }
}

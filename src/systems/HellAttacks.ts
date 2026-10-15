import type { FirePatchDefinition } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';

/**
 * Ataki wrogów Piekła (krok 41d): skok ogara, rzut łukiem kultysty i płonące ślady na podłodze.
 * Czysta geometria i czas — encje i menedżer tylko wykonują.
 */

/** Miejsce lądowania skoku: cel z chwili zamachu, ale najdalej `maxDistance` od skoczka. */
export function pounceLanding(self: Vector2, target: Vector2, maxDistance: number): Vector2 {
  const dx = target.x - self.x;
  const dy = target.y - self.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxDistance || d === 0) return { x: target.x, y: target.y };
  return { x: self.x + (dx / d) * maxDistance, y: self.y + (dy / d) * maxDistance };
}

/** Czas skoku (ms) z długości i prędkości; najmniej jedna klatka (16 ms). */
export function pounceDurationMs(from: Vector2, to: Vector2, speed: number): number {
  return Math.max(16, (Math.hypot(to.x - from.x, to.y - from.y) / speed) * 1000);
}

/** Punkty smugi żaru co `spacing` px wzdłuż odcinka from → to (bez punktu startu, z końcem). */
export function trailPoints(from: Vector2, to: Vector2, spacing: number): Vector2[] {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.round(d / spacing));
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
}

/** Pozycja bomby w locie: po prostej na podłodze, a nad nią łuk (wysokość do rysowania, parabola). */
export function lobPosition(from: Vector2, to: Vector2, progress: number, arcHeight: number): Vector2 & { readonly height: number } {
  const t = Math.min(1, Math.max(0, progress));
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    height: 4 * arcHeight * t * (1 - t),
  };
}

export interface FirePatch {
  readonly center: Vector2;
  readonly radius: number;
  readonly damage: number;
  readonly expiresAt: number;
}

/**
 * Płonące ślady na podłodze (smuga ogara, kałuża smoły). Teren, nie atak: parzy gracza, którego środek
 * jest w środku (obrażenia przez trafienie z nietykalnością, więc najwyżej raz na jej czas); wrogów nie.
 */
export class FirePatchField {
  private list: FirePatch[] = [];

  get patches(): readonly FirePatch[] {
    return this.list;
  }

  add(center: Vector2, def: FirePatchDefinition, now: number): void {
    this.list.push({ center: { x: center.x, y: center.y }, radius: def.radius, damage: def.damage, expiresAt: now + def.durationMs });
  }

  /** Usuwa wygasłe; zwraca najwyższe obrażenia z plam pod graczem albo 0. */
  update(player: Vector2 | null, now: number): number {
    this.list = this.list.filter((p) => p.expiresAt > now);
    if (!player) return 0;
    let damage = 0;
    for (const p of this.list) {
      if (Math.hypot(player.x - p.center.x, player.y - p.center.y) <= p.radius) damage = Math.max(damage, p.damage);
    }
    return damage;
  }
}

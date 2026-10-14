import type { IntRange } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';

/** Pająki spadające z sufitu (krok 23c, Pajęcze leże). Liczby w biomeConfig. */
export interface CeilingDropConfig {
  /** Pierwszy zrzut po wejściu do pokoju (ms) — chwila na rozejrzenie się. */
  readonly firstDelayMs: number;
  /** Odstęp między kolejnymi zrzutami w tym samym pokoju (ms, losowany). */
  readonly intervalMs: IntRange;
  readonly maxPerRoom: number;
  /** Limit zrzuconych pająków żywych naraz (w całym piętrze). */
  readonly maxAlive: number;
  /** Odległość miejsca lądowania od gracza (px) — zrzut celuje w niego, trzeba się ruszyć. */
  readonly offset: IntRange;
  /** Czas rosnącego cienia (telegraf) do lądowania. */
  readonly telegraphMs: number;
  /** Końcówka telegrafu, w której widać spadającego pająka. */
  readonly fallMs: number;
  /** Promień cienia = strefa obrażeń przy lądowaniu. */
  readonly radius: number;
  readonly damage: number;
  readonly knockback: number;
  /** Ile losowań miejsca, zanim zrzut przepadnie (gracz przy ścianie). */
  readonly placementTries: number;
}

export interface CeilingDrop {
  readonly position: Vector2;
  readonly telegraphStartAt: number;
  readonly landAt: number;
  readonly radius: number;
  readonly damage: number;
  readonly knockback: number;
}

export interface CeilingDropInput {
  readonly now: number;
  readonly player: Vector2;
  /** Pokój, w którym stoi gracz, jeśli zrzuty są w nim dozwolone (zwykły pokój); null = korytarz itp. */
  readonly roomId: number | null;
  /** Zrzucone pająki, które jeszcze żyją (także te w trakcie spadania). */
  readonly aliveDropped: number;
  /** Czy pająk może tu wylądować (podłoga tego samego pokoju) — współrzędne świata. */
  readonly canLandAt: (point: Vector2) => boolean;
}

/**
 * Planuje zrzuty pająków z sufitu: po wejściu gracza do zwykłego pokoju, w rytmie `intervalMs`,
 * najwyżej `maxPerRoom` na pokój i `maxAlive` żywych naraz. Miejsce: blisko gracza, na podłodze pokoju.
 * Deterministyczne (własny strumień RNG); Phaser tylko rysuje cień, upuszcza pająka i zadaje obrażenia.
 */
export class CeilingDropPlanner {
  private readonly dropsInRoom = new Map<number, number>();
  private currentRoom: number | null = null;
  private nextDropAt = Infinity;

  constructor(
    private readonly config: CeilingDropConfig,
    private readonly rng: Rng,
  ) {}

  update(input: CeilingDropInput): CeilingDrop | null {
    if (input.roomId !== this.currentRoom) {
      this.currentRoom = input.roomId;
      this.nextDropAt = input.roomId === null ? Infinity : input.now + this.config.firstDelayMs;
    }
    const room = this.currentRoom;
    if (room === null || input.now < this.nextDropAt) return null;

    const done = this.dropsInRoom.get(room) ?? 0;
    if (done >= this.config.maxPerRoom) {
      this.nextDropAt = Infinity;
      return null;
    }
    // Pełny limit żywych albo brak miejsca: spróbujemy przy następnym odstępie.
    this.nextDropAt = input.now + this.rng.int(this.config.intervalMs.min, this.config.intervalMs.max);
    if (input.aliveDropped >= this.config.maxAlive) return null;

    const position = this.pickLanding(input);
    if (!position) return null;
    this.dropsInRoom.set(room, done + 1);
    return {
      position,
      telegraphStartAt: input.now,
      landAt: input.now + this.config.telegraphMs,
      radius: this.config.radius,
      damage: this.config.damage,
      knockback: this.config.knockback,
    };
  }

  private pickLanding(input: CeilingDropInput): Vector2 | null {
    for (let i = 0; i < this.config.placementTries; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const dist = this.rng.int(this.config.offset.min, this.config.offset.max);
      const point = { x: input.player.x + Math.cos(angle) * dist, y: input.player.y + Math.sin(angle) * dist };
      if (input.canLandAt(point)) return point;
    }
    return null;
  }
}

/** Promień cienia w chwili `now`: rośnie od 0 do pełnego w czasie telegrafu (do rysowania). */
export function dropShadowRadius(drop: CeilingDrop, now: number): number {
  const t = (now - drop.telegraphStartAt) / (drop.landAt - drop.telegraphStartAt);
  return drop.radius * Math.min(1, Math.max(0, t));
}

import type { PiercingShotConfig, PunishConfig } from '@/core/combatWeightTypes';
import { PunishKind } from '@/core/combatWeightTypes';
import { EnemyType } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import type { Rng } from '@/core/random';

/** Wróg, który mógłby ukarać odsłoniętego bohatera. */
export interface PunishCandidate<T> {
  readonly who: T;
  readonly type: EnemyType;
  readonly position: Vector2;
  /** Linia wzroku do bohatera. */
  readonly canSee: boolean;
}

export interface PunishPick<T> {
  readonly who: T;
  readonly kind: PunishKind;
}

/** Jaki atak kary ma archetyp (§5): Kiter strzela, Rusher i Czyhacz taranują; Gniazdownik nie karze. */
export function punishKindFor(type: EnemyType): PunishKind | null {
  switch (type) {
    case EnemyType.Kiter:
      return PunishKind.PiercingShot;
    case EnemyType.Rusher:
    case EnemyType.Lurker:
      return PunishKind.Ram;
    case EnemyType.Nester:
      return null;
  }
}

/** Czy wróg może tym atakiem ukarać bohatera z miejsca, w którym stoi. */
function canPunishFrom(kind: PunishKind, from: Vector2, hero: Vector2, config: PunishConfig): boolean {
  const d = Math.hypot(hero.x - from.x, hero.y - from.y);
  const range = kind === PunishKind.PiercingShot ? config.piercingShot : config.ram;
  return d >= range.minRange && d <= range.maxRange;
}

/**
 * Kto karze (krok U11a, §5 WAGI.md): gdy bohater ma Odsłonięcie III, jeden wróg z linią wzroku dostaje okno na
 * atak kary — najwyżej jeden na `cooldownMs`. Strzelcy mają pierwszeństwo (przeszywający strzał z dystansu),
 * potem taranujący. Wybór z własnego strumienia RNG (sól + seed piętra), więc nagrania odtwarzają się tak samo.
 */
export class PunishPlanner {
  private readyAt = 0;

  constructor(
    private readonly config: PunishConfig,
    private readonly rng: Rng,
  ) {}

  /**
   * Okno kary bossa (krok U11b): boss nie potrzebuje wyboru — zajmuje wspólną przerwę, jeśli minęła.
   * Jedna przerwa dla wrogów i bossa: najwyżej jeden atak kary na `cooldownMs` w całym pokoju.
   */
  claim(now: number): boolean {
    if (now < this.readyAt) return false;
    this.readyAt = now + this.config.cooldownMs;
    return true;
  }

  /** Wybiera karzącego albo null (za wcześnie, nikt nie widzi bohatera, nikt nie stoi w zasięgu). */
  plan<T>(now: number, hero: Vector2, candidates: readonly PunishCandidate<T>[]): PunishPick<T> | null {
    if (now < this.readyAt) return null;
    const shooters: T[] = [];
    const rams: T[] = [];
    for (const candidate of candidates) {
      const kind = punishKindFor(candidate.type);
      if (!kind || !candidate.canSee || !canPunishFrom(kind, candidate.position, hero, this.config)) continue;
      (kind === PunishKind.PiercingShot ? shooters : rams).push(candidate.who);
    }
    const pool = shooters.length > 0 ? shooters : rams;
    if (pool.length === 0) return null;
    this.readyAt = now + this.config.cooldownMs;
    return { who: pool[this.rng.int(0, pool.length - 1)]!, kind: shooters.length > 0 ? PunishKind.PiercingShot : PunishKind.Ram };
  }
}

/** Faza przeszywającego strzału po `elapsedMs` od początku celowania. */
export enum AimPhase {
  /** Celownik idzie za bohaterem. */
  Tracking = 'tracking',
  /** Ostatnie ms: celownik stoi — czas na dash w poprzek linii. */
  Frozen = 'frozen',
  /** Strzał. */
  Fire = 'fire',
}

export function piercingAimPhase(elapsedMs: number, config: PiercingShotConfig): AimPhase {
  if (elapsedMs >= config.aimMs) return AimPhase.Fire;
  return elapsedMs >= config.aimMs - config.freezeMs ? AimPhase.Frozen : AimPhase.Tracking;
}

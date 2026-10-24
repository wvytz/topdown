import type { ArcheryConfig, BowConfig } from '@/core/heroTypes';
import type { StatLimits, StatModifiers } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';

/**
 * Zestaw łucznika (krok 82, ciągły ostrzał od kroku 97): siła strzały, wachlarz salwy, przedmioty.
 * Łuk jest bronią główną, więc bierze to, co u barbarzyńcy daje cios: Ostrze (+obrażenia),
 * Rękawice (krótszy odstęp między strzałami). Kołczan dokłada ładunek salwy (`combat.ranged`).
 */
export function applyArcheryModifiers(base: ArcheryConfig, mods: StatModifiers, limits: StatLimits): ArcheryConfig {
  const cooldown = Math.max(limits.minCooldownMultiplier, 1 + mods.attackCooldownPct);
  const { bow } = base;
  return {
    ...base,
    bow: {
      ...bow,
      damage: Math.max(1, bow.damage + mods.meleeDamage),
      strongDamage: Math.max(1, bow.strongDamage + mods.meleeDamage),
      intervalMs: Math.round(bow.intervalMs * cooldown),
    },
  };
}

/** Parametry jednej strzały z łuku. */
export interface ArrowSpec {
  readonly damage: number;
  readonly knockback: number;
  readonly speed: number;
  /** Przebicia mocnej strzały (bez Szurikena). */
  readonly pierce: number;
  /** Mocna strzała (inny wygląd). */
  readonly strong: boolean;
}

/** Zwykła albo mocna strzała; tylko mocna przebija. */
export function arrowSpec(bow: BowConfig, strong: boolean): ArrowSpec {
  return strong
    ? { damage: bow.strongDamage, knockback: bow.strongKnockback, speed: bow.strongSpeed, pierce: bow.strongPierce, strong }
    : { damage: bow.damage, knockback: bow.knockback, speed: bow.speed, pierce: 0, strong };
}

/** Kierunki strzał salwy: równo rozłożone w wachlarzu wokół kąta celowania (środkowa dokładnie w cel). */
export function volleyDirections(angle: number, arrows: number, spreadDeg: number): Vector2[] {
  const count = Math.max(1, Math.floor(arrows));
  const spread = (spreadDeg * Math.PI) / 180;
  return Array.from({ length: count }, (_, i) => {
    const a = count === 1 ? angle : angle - spread / 2 + (spread * i) / (count - 1);
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

/** Stan łuku w danej klatce. */
export interface BowTick {
  /** LPM przytrzymany — łucznik strzela (spowolniony). */
  readonly firing: boolean;
  /** Strzała wypuszczona w tej klatce: null = nic nie wyleciało, inaczej czy mocna. */
  readonly fired: { readonly strong: boolean } | null;
  /** Kolejna strzała serii będzie mocna (podpowiedź na celowniku). */
  readonly nextStrong: boolean;
}

/**
 * Ciągły ostrzał (krok 97, prośba właściciela po raporcie testera — zamiast naciągania):
 * przytrzymanie LPM strzela od razu i potem co `intervalMs`, jak cios barbarzyńcy.
 * Co `strongEvery`-ta strzała serii jest mocna; puszczenie albo przerwanie (dash, paraliż, salwa) zaczyna serię od nowa.
 */
export class BowRepeater {
  private readyAt = -Infinity;
  private shotsInSeries = 0;

  constructor(private config: BowConfig) {}

  setConfig(config: BowConfig): void {
    this.config = config;
  }

  update(held: boolean, now: number): BowTick {
    if (!held) {
      this.shotsInSeries = 0;
      return { firing: false, fired: null, nextStrong: this.isStrong(1) };
    }
    let fired: { strong: boolean } | null = null;
    if (now >= this.readyAt) {
      this.shotsInSeries++;
      fired = { strong: this.isStrong(this.shotsInSeries) };
      this.readyAt = now + this.config.intervalMs;
    }
    return { firing: true, fired, nextStrong: this.isStrong(this.shotsInSeries + 1) };
  }

  /** Przerwanie serii (bez zmiany odstępu — kolejna strzała, gdy minie przerwa). */
  interrupt(): void {
    this.shotsInSeries = 0;
  }

  private isStrong(shot: number): boolean {
    const every = this.config.strongEvery;
    return every > 0 && shot % every === 0;
  }
}

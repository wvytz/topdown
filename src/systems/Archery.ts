import type { ArcheryConfig, BowConfig } from '@/core/heroTypes';
import type { StatLimits, StatModifiers } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';

/**
 * Zestaw łucznika (krok 82): naciąganie łuku, siła strzały, wachlarz salwy, przedmioty.
 * Łuk jest bronią główną, więc bierze to, co u barbarzyńcy daje cios: Ostrze (+obrażenia),
 * Rękawice (szybsze naciąganie i krótsza przerwa). Kołczan dokłada ładunek salwy (`combat.ranged`).
 */
export function applyArcheryModifiers(base: ArcheryConfig, mods: StatModifiers, limits: StatLimits): ArcheryConfig {
  const cooldown = Math.max(limits.minCooldownMultiplier, 1 + mods.attackCooldownPct);
  const { bow } = base;
  return {
    ...base,
    bow: {
      ...bow,
      minDamage: Math.max(1, bow.minDamage + mods.meleeDamage),
      maxDamage: Math.max(1, bow.maxDamage + mods.meleeDamage),
      drawMs: Math.round(bow.drawMs * cooldown),
      cooldownMs: Math.round(bow.cooldownMs * cooldown),
    },
  };
}

/** Parametry jednej strzały z łuku przy danej sile naciągnięcia (0..1). */
export interface ArrowSpec {
  readonly damage: number;
  readonly knockback: number;
  readonly speed: number;
  /** Przebicia z naciągnięcia (bez Szurikena). */
  readonly pierce: number;
  /** Pełne naciągnięcie. */
  readonly full: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Siła rośnie liniowo z naciągnięciem; przebicie tylko przy pełnym. */
export function arrowSpec(bow: BowConfig, power: number): ArrowSpec {
  const t = Math.min(1, Math.max(0, power));
  const full = t >= 1;
  return {
    damage: Math.round(lerp(bow.minDamage, bow.maxDamage, t)),
    knockback: Math.round(lerp(bow.minKnockback, bow.maxKnockback, t)),
    speed: Math.round(lerp(bow.minSpeed, bow.maxSpeed, t)),
    pierce: full ? bow.fullDrawPierce : 0,
    full,
  };
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
  /** Cięciwa jest naciągana w tej klatce. */
  readonly drawing: boolean;
  /** Siła naciągnięcia 0..1 (0, gdy nie naciąga). */
  readonly power: number;
  /** Siła wypuszczonej w tej klatce strzały; null = nic nie wyleciało. */
  readonly released: number | null;
}

/**
 * Naciąganie łuku: przytrzymanie LPM naciąga (siła rośnie przez `drawMs`), puszczenie wypuszcza strzałę
 * z bieżącą siłą. Po strzale `cooldownMs` przerwy. Przerwanie (dash, paraliż, salwa) zwalnia cięciwę bez strzału.
 * Trzymanie przycisku po strzale nie zaczyna nowego naciągania, dopóki trwa przerwa — zaczyna od razu po niej.
 */
export class BowDraw {
  private drawStartedAt: number | null = null;
  private readyAt = 0;

  constructor(private config: BowConfig) {}

  setConfig(config: BowConfig): void {
    this.config = config;
  }

  get isDrawing(): boolean {
    return this.drawStartedAt !== null;
  }

  power(now: number): number {
    if (this.drawStartedAt === null) return 0;
    if (this.config.drawMs <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.drawStartedAt) / this.config.drawMs));
  }

  update(held: boolean, now: number): BowTick {
    if (this.drawStartedAt === null) {
      if (held && now >= this.readyAt) this.drawStartedAt = now;
      return { drawing: this.drawStartedAt !== null, power: this.power(now), released: null };
    }
    if (held) return { drawing: true, power: this.power(now), released: null };
    const released = this.power(now);
    this.drawStartedAt = null;
    this.readyAt = now + this.config.cooldownMs;
    return { drawing: false, power: 0, released };
  }

  /** Zwalnia cięciwę bez strzału (bez przerwy — można od razu naciągać ponownie). */
  interrupt(): void {
    this.drawStartedAt = null;
  }
}

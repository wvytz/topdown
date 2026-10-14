/** Typy domenowe bossa — czyste dane, bez zależności od Phasera. */
import type { Vector2 } from '@/core/types';

export enum BossAttackKind {
  /** Uderzenie obszarowe wokół bossa. */
  Slam = 'slam',
  /** Pierścień pocisków we wszystkich kierunkach. */
  Nova = 'nova',
  /** Seria stref uderzeń wokół pozycji gracza, wybuchających po kolei. */
  Barrage = 'barrage',
  /** Wylęg (Matka Pająków): boss składa za sobą pajączki-kamikaze. */
  Brood = 'brood',
  /** Rzut siecią (Matka Pająków, krok 25): lepka sieć ląduje za plecami gracza i się rozrasta. */
  Web = 'web',
}

/** Który boss — wybiera wygląd (spriteConfig) i ślady po walce. */
export enum BossId {
  FloorGuardian = 'floor-guardian',
  SpiderQueen = 'spider-queen',
}

export enum BossPhase {
  /** Czeka, aż gracz wejdzie na arenę. */
  Dormant = 'dormant',
  Fighting = 'fighting',
}

interface BaseBossAttackDefinition {
  /** Czas telegrafu przed pierwszym uderzeniem — gracz widzi strefę i może uciec. */
  readonly telegraphMs: number;
  /** Pauza po ostatnim uderzeniu, zanim boss znów się ruszy. */
  readonly recoveryMs: number;
  readonly damage: number;
  readonly knockback: number;
}

export interface SlamAttackDefinition extends BaseBossAttackDefinition {
  readonly radius: number;
}

export interface NovaAttackDefinition extends BaseBossAttackDefinition {
  readonly projectileCount: number;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
  /** Liczba fal; po wściekłości dochodzi jedna więcej. */
  readonly waves: number;
  readonly waveIntervalMs: number;
}

export interface BarrageAttackDefinition extends BaseBossAttackDefinition {
  readonly zoneCount: number;
  readonly zoneRadius: number;
  /** Maksymalne odsunięcie stref (poza pierwszą) od pozycji gracza. */
  readonly spread: number;
  /** Odstęp między wybuchami kolejnych stref. */
  readonly intervalMs: number;
}

export interface BroodAttackDefinition {
  /** Ile pajączków na jeden wylęg (po wściekłości jeden więcej). */
  readonly count: number;
  /** Limit żywych pajączków — wylęg dokłada tylko do limitu. */
  readonly maxAlive: number;
  /** Czas złożenia (animacja wylęgu): pajączki pojawiają się na jego końcu. */
  readonly birthMs: number;
  /** Odległość miejsca wylęgu za bossem (od strony przeciwnej do gracza). */
  readonly spawnDistance: number;
  /** Rozrzut kolejnych pajączków wokół kierunku „za bossem” (stopnie, cały wachlarz). */
  readonly spreadDeg: number;
  readonly recoveryMs: number;
}

/**
 * Rzut siecią: boss celuje za plecy gracza (dalej od siebie, w stronę ucieczki), kłąb sieci leci
 * łukiem i po wylądowaniu rozrasta się w lepką plamę spowalniającą gracza (jak pajęczyny leża).
 */
export interface WebAttackDefinition {
  /** Zamach przed rzutem — miejsce lądowania jest już oznaczone. */
  readonly telegraphMs: number;
  readonly flightMs: number;
  /** Odległość miejsca lądowania za graczem (px, na linii boss → gracz). */
  readonly behindDistance: number;
  /** Ile sieci w rzucie (po wściekłości jedna więcej) … */
  readonly count: number;
  /** … rozstawionych w wachlarzu za graczem (stopnie, cały wachlarz). */
  readonly fanDeg: number;
  /** Promień plamy tuż po wylądowaniu i po rozroście (px). */
  readonly startRadius: number;
  readonly maxRadius: number;
  readonly spreadMs: number;
  /** Jak długo plama leży od wylądowania. */
  readonly durationMs: number;
  /** Spowolnienie odnawiane co klatkę w plamie (`durationMs` = klejenie po wyjściu). */
  readonly slow: { readonly pct: number; readonly durationMs: number };
  readonly recoveryMs: number;
}

/** Pajączek-kamikaze: biegnie do gracza, po zapłonie wybucha. Ginie od jednego trafienia. */
export interface SpiderlingDefinition {
  readonly radius: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  /** Zapłon zaczyna się, gdy pajączek jest tak blisko gracza … */
  readonly primeRange: number;
  /** … albo gdy od wylęgu minie tyle czasu (wybucha „po chwili”, nawet jeśli nie dobiegł). */
  readonly fuseMs: number;
  /** Czas zapłonu (telegraf): pajączek stoi, potem wybucha. */
  readonly primeMs: number;
  readonly blastRadius: number;
  readonly damage: number;
  readonly knockback: number;
}

export interface BossEnrageConfig {
  /** Próg HP (0..1), poniżej którego boss wpada we wściekłość. */
  readonly hpThreshold: number;
  readonly telegraphMultiplier: number;
  readonly restMultiplier: number;
}

export interface BossDefinition {
  readonly id: BossId;
  readonly name: string;
  readonly radius: number;
  readonly color: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  /** Boss podchodzi do gracza, dopóki nie znajdzie się bliżej niż ten dystans. */
  readonly engageDistance: number;
  readonly openingDelayMs: number;
  readonly restBetweenAttacksMs: number;
  /** Sekwencja ataków powtarzana w kółko (wg GDD: sekwencyjne ataki obszarowe). */
  readonly pattern: readonly BossAttackKind[];
  /** Definicje ataków — wymagane tylko te, których używa `pattern`. */
  readonly slam?: SlamAttackDefinition;
  readonly nova?: NovaAttackDefinition;
  readonly barrage?: BarrageAttackDefinition;
  readonly brood?: BroodAttackDefinition;
  readonly web?: WebAttackDefinition;
  /** Pajączki z wylęgu (wymagane razem z `brood`). */
  readonly spiderling?: SpiderlingDefinition;
  readonly enrage: BossEnrageConfig;
}

/** Okrągła strefa obrażeń: telegrafowana od `telegraphStartAt`, uderza w `impactAt`. */
export interface AreaStrike {
  readonly center: Vector2;
  readonly radius: number;
  readonly telegraphStartAt: number;
  readonly impactAt: number;
  readonly damage: number;
  readonly knockback: number;
}

/** Fala pocisków wystrzelonych równomiernie dookoła punktu. */
export interface ProjectileBurst {
  readonly origin: Vector2;
  readonly count: number;
  /** Obrót całej fali (rad) — kolejne fale są przesunięte, żeby nie było „bezpiecznych” linii. */
  readonly angleOffset: number;
  readonly speed: number;
  readonly damage: number;
  readonly knockback: number;
  readonly lifetimeMs: number;
  readonly telegraphStartAt: number;
  readonly fireAt: number;
}

/** Pajączek do wypuszczenia w chwili `at` w miejscu `position`. */
export interface SummonSpawn {
  readonly position: Vector2;
  readonly at: number;
}

/** Rzucona sieć: lot `from` → `to` w [`launchAt`, `landAt`], potem plama rośnie i leży do `expiresAt`. */
export interface WebShot {
  readonly from: Vector2;
  readonly to: Vector2;
  readonly telegraphStartAt: number;
  readonly launchAt: number;
  readonly landAt: number;
  readonly startRadius: number;
  readonly maxRadius: number;
  readonly spreadMs: number;
  readonly expiresAt: number;
  readonly slow: { readonly pct: number; readonly durationMs: number };
}

/** Pełny plan jednego ataku — wszystko z góry zaplanowane w czasie, wykonuje warstwa Phasera. */
export interface BossAttackPlan {
  readonly kind: BossAttackKind;
  readonly strikes: readonly AreaStrike[];
  readonly bursts: readonly ProjectileBurst[];
  readonly spawns: readonly SummonSpawn[];
  readonly webs: readonly WebShot[];
  /** Kiedy boss może znów się ruszać. */
  readonly endsAt: number;
}

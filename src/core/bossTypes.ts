/** Typy domenowe bossa — czyste dane, bez zależności od Phasera. */
import type { ParalysisEffect, PoisonEffect, StatusApplication } from '@/core/combatTypes';
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
  /** Królewski skok (Matka Pająków, krok 26): przysiad, skok łukiem na miejsce gracza, fala przy lądowaniu. */
  Leap = 'leap',
  /** Smagnięcie nogami (Matka Pająków, krok 27): cios wręcz z bliska, zatruwa gracza. U Króla: ścięcie kosami. */
  Lash = 'lash',
  /** Grad sztyletów (Król Pająków, krok 29): seria ukłuć w linii w stronę gracza. */
  Flurry = 'flurry',
  /** Rzut kokonem (Król Pająków, krok 29): kokon ląduje na graczu i paraliżuje. */
  CocoonThrow = 'cocoon-throw',
  /** Wysyp grzybni (Król Pająków, krok 29): wokół gracza wyrastają trujące płaty grzybni (teren). */
  Bloom = 'bloom',
}

/** Który boss — wybiera wygląd (spriteConfig) i ślady po walce. */
export enum BossId {
  FloorGuardian = 'floor-guardian',
  SpiderQueen = 'spider-queen',
  SpiderKing = 'spider-king',
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

/**
 * Wylęg z sufitu (krok 26): boss wydaje zew, potem pajączki spadają po kolei pierścieniem wokół gracza.
 * Każdy cień pojawia się wokół AKTUALNEJ pozycji gracza (pierścień „goni” uciekającego).
 */
export interface BroodAttackDefinition {
  /** Ile pajączków na jeden wylęg (po wściekłości jeden więcej). */
  readonly count: number;
  /** Limit żywych pajączków — wylęg dokłada tylko do limitu. */
  readonly maxAlive: number;
  /** Czas zewu (animacja złożenia): pierwszy cień pojawia się na jego końcu. */
  readonly birthMs: number;
  /** Odległość miejsc lądowania od gracza (px). */
  readonly ringRadius: number;
  /** Losowe odchylenie każdego miejsca od równego podziału pierścienia (stopnie, ±). */
  readonly ringJitterDeg: number;
  /** Odstęp między kolejnymi zrzutami. */
  readonly dropIntervalMs: number;
  /** Czas rosnącego cienia do lądowania pajączka. */
  readonly fallMs: number;
  readonly recoveryMs: number;
}

/** Królewski skok: przysiad (telegraf strefy lądowania), lot łukiem, fala uderzeniowa przy lądowaniu. */
export interface LeapAttackDefinition extends BaseBossAttackDefinition {
  readonly flightMs: number;
  /** Promień fali przy lądowaniu (strefa obrażeń). */
  readonly radius: number;
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

/**
 * Smagnięcie nogami: atak poza wzorem — boss uderza, gdy gracz jest bliżej niż `triggerRange`
 * i minął `cooldownMs`. Strefa przed bossem (środek `reach` px w stronę gracza, promień `radius`).
 */
export interface LashAttackDefinition extends BaseBossAttackDefinition {
  readonly triggerRange: number;
  readonly reach: number;
  readonly radius: number;
  readonly cooldownMs: number;
  /** Status trafienia: trucizna (Matka Pająków), paraliż (ścięcie Króla). */
  readonly status: StatusApplication;
}

/** Grad sztyletów: `count` ukłuć w linii boss → gracz, od `startDistance` co `step` px, jedno po drugim. */
export interface FlurryAttackDefinition extends BaseBossAttackDefinition {
  readonly count: number;
  readonly startDistance: number;
  readonly step: number;
  readonly radius: number;
  readonly intervalMs: number;
}

/** Rzut kokonem: kokon leci łukiem na miejsce gracza; przy lądowaniu strefa obrażeń z paraliżem. */
export interface CocoonThrowDefinition extends BaseBossAttackDefinition {
  readonly flightMs: number;
  readonly radius: number;
  readonly paralysis: ParalysisEffect;
  /** Ile kokonów (po wściekłości jeden więcej — dodatkowe lądują za graczem, w drodze ucieczki). */
  readonly count: number;
  /** Odległość dodatkowych kokonów za graczem (px, na linii boss → gracz, w wachlarzu). */
  readonly behindDistance: number;
}

/**
 * Wysyp grzybni: płaty wyrastają wokół gracza (pierwszy pod nim) po telegrafie, rosną i leżą długo.
 * W płacie: trucizna i spowolnienie odnawiane co klatkę (teren — chroni tylko dash).
 */
export interface BloomAttackDefinition {
  readonly telegraphMs: number;
  readonly count: number;
  readonly ring: { readonly min: number; readonly max: number };
  readonly startRadius: number;
  readonly maxRadius: number;
  readonly spreadMs: number;
  readonly durationMs: number;
  readonly poison: PoisonEffect;
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
  /** Tytuł pod imieniem na planszy otwierającej walkę (HUD); brak = bez planszy. */
  readonly title?: string;
  /** Dopisek przy imieniu na pasku HP po wściekłości (domyślnie „wściekły!”). */
  readonly enragedLabel?: string;
  readonly radius: number;
  readonly color: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  /** Boss podchodzi do gracza, dopóki nie znajdzie się bliżej niż ten dystans. */
  readonly engageDistance: number;
  /** Sprint (krok 27): dalej niż `distance` od gracza boss biegnie z prędkością `speed`. */
  readonly sprint?: { readonly speed: number; readonly distance: number };
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
  readonly leap?: LeapAttackDefinition;
  readonly lash?: LashAttackDefinition;
  readonly flurry?: FlurryAttackDefinition;
  readonly cocoonThrow?: CocoonThrowDefinition;
  readonly bloom?: BloomAttackDefinition;
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
  /** Status nakładany trafieniem (trucizna smagnięcia). */
  readonly status?: StatusApplication;
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

/**
 * Pajączek spadający z sufitu: w `telegraphStartAt` cień pojawia się w miejscu gracz + `offset`
 * (pozycja gracza z tej chwili), w `at` pajączek ląduje.
 */
export interface SummonSpawn {
  readonly offset: Vector2;
  readonly telegraphStartAt: number;
  readonly at: number;
}

/** Skok bossa `from` → `to` w [`launchAt`, `landAt`]; uderzenie przy lądowaniu to osobna strefa w `strikes`. */
export interface BossLeap {
  readonly from: Vector2;
  readonly to: Vector2;
  readonly telegraphStartAt: number;
  readonly launchAt: number;
  readonly landAt: number;
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
  /** Wygląd płatu: sieć (Matka Pająków) albo grzybnia (Król). Brak = sieć. */
  readonly look?: 'web' | 'mycelium';
  /** Dodatkowy status w płacie (trucizna grzybni). */
  readonly status?: StatusApplication;
}

/** Rzucony przedmiot (kokon Króla): tylko lot do pokazania; obrażenia daje strefa w `strikes`. */
export interface ThrownObject {
  readonly from: Vector2;
  readonly to: Vector2;
  readonly launchAt: number;
  readonly landAt: number;
}

/** Pełny plan jednego ataku — wszystko z góry zaplanowane w czasie, wykonuje warstwa Phasera. */
export interface BossAttackPlan {
  readonly kind: BossAttackKind;
  readonly strikes: readonly AreaStrike[];
  readonly bursts: readonly ProjectileBurst[];
  readonly spawns: readonly SummonSpawn[];
  readonly webs: readonly WebShot[];
  readonly leap: BossLeap | null;
  readonly throws: readonly ThrownObject[];
  /** Kiedy boss może znów się ruszać. */
  readonly endsAt: number;
}

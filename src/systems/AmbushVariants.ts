import type { Room, TilePoint } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { ItemId } from '@/core/lootTypes';
import type { AmbientProfile } from '@/config/lightingConfig';
import type { AmbushScenario } from '@/systems/AmbushWaves';

/**
 * Trzy wersje zasadzki (krok 183, projekt właściciela — „każdy encounter rozgrywa się tak samo”). Zasadzka losuje
 * wersję z seeda piętra, a przynęta leży w losowym miejscu pokoju (nie na środku):
 * 1. Butla dżina — fale upiorów wylatują kaskadowo, bez pauzy między falami;
 * 2. Uciekinier — przedmiot błyszczy i odlatuje do areny bossa; boss dostaje jego statystykę, a po walce
 *    przedmiot wypada dodatkowo (nagroda za trudniejszego bossa);
 * 3. Zaduch — mrok, splątanie (spowolnienie), eteryczne strzały z brzegu kręgu światła, potem wstęga do
 *    najdalszego rogu i wielki duch.
 * Czysta logika: losowanie, miejsce przynęty, wzmocnienie bossa, przebieg Zaduchu i geometria strzał.
 */
export enum AmbushVariant {
  Storm = 'storm',
  Flight = 'flight',
  Haunt = 'haunt',
}

/** Rodzaj wzmocnienia bossa przez uciekający przedmiot. */
export enum BossBoon {
  /** Więcej życia (Serce, Wampirzy kieł). */
  Vitality = 'vitality',
  /** Szybszy chód i krótsze przerwy między atakami (Buty, Klepsydra…). */
  Swiftness = 'swiftness',
  /** Mocniejsze ciosy (Ostrze, Rękawice i broń z efektem). */
  Might = 'might',
}

export interface BossEmpowerment {
  readonly hpMultiplier: number;
  readonly damageMultiplier: number;
  readonly speedMultiplier: number;
}

export interface AmbushVariantsConfig {
  readonly weights: Readonly<Record<AmbushVariant, number>>;
  /** Przynęta co najmniej tyle kafli od krawędzi pokoju i od wejść. */
  readonly baitMargin: number;
  readonly baitEntranceGap: number;
  readonly storm: {
    /** Następna fala rusza po tylu ms od poprzedniej, choćby poprzednia jeszcze żyła. */
    readonly cascadeMs: number;
    /** Odstęp między kolejnymi upiorami fali (wylatują z butli jeden po drugim). */
    readonly staggerMs: number;
    /** Lot smugi z przynęty na miejsce upiora. */
    readonly streakMs: number;
    /** Dodatkowe upiory w każdej fali (kaskada ma być nawałnicą). */
    readonly extraGhosts: number;
  };
  readonly flight: {
    /** Przedmiot błyszczy tyle ms, zanim ucieknie. */
    readonly glowMs: number;
    /** Prędkość lotu do areny (px/s). */
    readonly speed: number;
    readonly boonOf: Readonly<Record<ItemId, BossBoon>>;
    readonly boons: Readonly<Record<BossBoon, BossEmpowerment & { readonly label: string }>>;
    /** Nagroda po bossie: przedmiot-uciekinier i tyle dodatkowego złota. */
    readonly rewardGold: number;
  };
  readonly haunt: {
    readonly dread: AmbientProfile;
    /** Mrok gęstnieje tyle ms, zanim przyjdzie pierwsza salwa. */
    readonly darkenMs: number;
    /** Splątanie: spowolnienie bohatera do pojawienia się wielkiego ducha. */
    readonly entangleSlowPct: number;
    /** Liczba strzał w kolejnych salwach. */
    readonly volleys: readonly number[];
    readonly volleyGapMs: number;
    /** Strzała majaczy na brzegu kręgu tyle ms, potem startuje. */
    readonly telegraphMs: number;
    /** Kolejne strzały salwy startują z takim odstępem. */
    readonly launchStaggerMs: number;
    /** Odległość pojawienia się od bohatera (brzeg kręgu światła, px). */
    readonly edgeRadius: number;
    readonly dartSpeed: number;
    /** Strzała leci tyle px za miejsce bohatera, zanim się rozwieje. */
    readonly overshoot: number;
    readonly damage: number;
    readonly hitRadius: number;
    readonly knockback: number;
    /** Wstęga do rogu; wielki duch wynurza się w tym czasie. */
    readonly ribbonMs: number;
    /** Wielki duch co tyle ms wypuszcza strzały. */
    readonly giantVolleyMs: number;
    readonly giantVolley: number;
  };
}

/** Wersja zasadzki z wag (z RNG zasadzki). Bez drogi do areny Uciekinier odpada (`canFlee`). */
export function pickAmbushVariant(config: Pick<AmbushVariantsConfig, 'weights'>, rng: Rng, canFlee: boolean): AmbushVariant {
  const entries = (Object.entries(config.weights) as [AmbushVariant, number][]).filter(([v, w]) => w > 0 && (canFlee || v !== AmbushVariant.Flight));
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [variant, weight] of entries) {
    roll -= weight;
    if (roll < 0) return variant;
  }
  return entries[entries.length - 1]?.[0] ?? AmbushVariant.Storm;
}

/**
 * Miejsce przynęty: losowy kafel pokoju co najmniej `margin` od krawędzi i dalej niż `entranceGap` od wejść.
 * Gdy nic się nie mieści — środek (jak przed krokiem 183).
 */
export function pickBaitTile(room: Room, entrances: readonly TilePoint[], margin: number, entranceGap: number, rng: Rng): TilePoint {
  const center = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
  const tiles: TilePoint[] = [];
  for (let y = room.y + margin; y <= room.y + room.height - 1 - margin; y++) {
    for (let x = room.x + margin; x <= room.x + room.width - 1 - margin; x++) {
      if (entrances.some((e) => Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= entranceGap)) continue;
      tiles.push({ x, y });
    }
  }
  if (tiles.length === 0) return center;
  return tiles[Math.floor(rng.next() * tiles.length)]!;
}

/** Fale Butli dżina: scenariusz z dodatkowymi upiorami w każdej fali. */
export function stormScenario(scenario: AmbushScenario, extraGhosts: number): AmbushScenario {
  return { ...scenario, waves: scenario.waves.map((w) => ({ ...w, ghosts: w.ghosts + extraGhosts })) };
}

/** Wzmocnienie bossa od przedmiotu (relikwie i nieznane — życie). */
export function boonFor(item: ItemId, config: AmbushVariantsConfig['flight']): BossEmpowerment & { readonly label: string; readonly boon: BossBoon } {
  const boon = config.boonOf[item] ?? BossBoon.Vitality;
  return { ...config.boons[boon], boon };
}

/** Długość łamanej (px). */
export function pathLength(points: readonly Vector2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return total;
}

/** Punkt na łamanej po przebyciu `distance` px (za końcem — koniec). */
export function pointAlongPath(points: readonly Vector2[], distance: number): Vector2 {
  if (points.length === 0) return { x: 0, y: 0 };
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg && seg > 0) return { x: a.x + ((b.x - a.x) * left) / seg, y: a.y + ((b.y - a.y) * left) / seg };
    left -= seg;
  }
  return points[points.length - 1]!;
}

/** Najdalszy od bohatera kafel narożny wnętrza pokoju (tam czeka wielki duch Zaduchu). */
export function farthestCorner(room: Room, from: TilePoint): TilePoint {
  const corners: TilePoint[] = [
    { x: room.x + 1, y: room.y + 1 },
    { x: room.x + room.width - 2, y: room.y + 1 },
    { x: room.x + 1, y: room.y + room.height - 2 },
    { x: room.x + room.width - 2, y: room.y + room.height - 2 },
  ];
  const dist = (t: TilePoint) => Math.hypot(t.x - from.x, t.y - from.y);
  return corners.reduce((best, c) => (dist(c) > dist(best) ? c : best));
}

/** Prostokąt w px, w którym mogą stanąć strzały (wnętrze pokoju). */
export interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Miejsca strzał salwy: równo po okręgu wokół bohatera (z losowym obrotem), wciśnięte do wnętrza pokoju —
 * przy murze strzała stoi bliżej, ale nadal widać ją na brzegu światła.
 */
export function edgeArrowPoints(center: Vector2, radius: number, count: number, bounds: PixelBounds, rng: Rng): Vector2[] {
  const turn = rng.next() * Math.PI * 2;
  const out: Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = turn + (i * Math.PI * 2) / Math.max(1, count);
    out.push({
      x: Math.min(bounds.right, Math.max(bounds.left, center.x + Math.cos(angle) * radius)),
      y: Math.min(bounds.bottom, Math.max(bounds.top, center.y + Math.sin(angle) * radius)),
    });
  }
  return out;
}

/** Cel lotu strzały: przez miejsce bohatera i `overshoot` px dalej. */
export function dartTarget(from: Vector2, target: Vector2, overshoot: number): Vector2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: target.x + (dx / d) * overshoot, y: target.y + (dy / d) * overshoot };
}

export enum HauntPhase {
  Waiting = 'waiting',
  /** Kraty opadły, mrok gęstnieje. */
  Darkening = 'darkening',
  /** Salwy eterycznych strzał. */
  Volleys = 'volleys',
  /** Wstęga prowadzi do rogu, wielki duch się wynurza. */
  Ribbon = 'ribbon',
  /** Walka z wielkim duchem. */
  Giant = 'giant',
  Cleared = 'cleared',
}

export type HauntEvent =
  | { readonly kind: 'seal' }
  | { readonly kind: 'volley'; readonly index: number; readonly count: number }
  | { readonly kind: 'ribbon' }
  | { readonly kind: 'giant' }
  | { readonly kind: 'clear' };

/**
 * Przebieg Zaduchu: gracz w głębi → kraty i mrok → salwy co `volleyGapMs` → po ostatniej (gdy strzały
 * zniknęły) wstęga i wynurzanie wielkiego ducha → walka → koniec, gdy duch padł i nie lata już żadna strzała.
 */
export class HauntState {
  private current = HauntPhase.Waiting;
  private volley = -1;
  private phaseAt = 0;

  constructor(private readonly config: Pick<AmbushVariantsConfig['haunt'], 'darkenMs' | 'volleys' | 'volleyGapMs' | 'ribbonMs'>) {}

  get phase(): HauntPhase {
    return this.current;
  }

  update(input: { readonly playerInside: boolean; readonly playerDead: boolean; readonly arrowsAlive: number; readonly giantAlive: boolean }, now: number): HauntEvent | null {
    const { darkenMs, volleys, volleyGapMs, ribbonMs } = this.config;
    switch (this.current) {
      case HauntPhase.Waiting:
        if (!input.playerInside || input.playerDead) return null;
        this.enter(HauntPhase.Darkening, now);
        return { kind: 'seal' };
      case HauntPhase.Darkening:
        if (now - this.phaseAt < darkenMs) return null;
        return this.nextVolley(now);
      case HauntPhase.Volleys:
        if (this.volley + 1 < volleys.length) return now - this.phaseAt >= volleyGapMs ? this.nextVolley(now) : null;
        if (input.arrowsAlive > 0 || now - this.phaseAt < volleyGapMs) return null;
        this.enter(HauntPhase.Ribbon, now);
        return { kind: 'ribbon' };
      case HauntPhase.Ribbon:
        if (now - this.phaseAt < ribbonMs) return null;
        this.enter(HauntPhase.Giant, now);
        return { kind: 'giant' };
      case HauntPhase.Giant:
        if (input.giantAlive || input.arrowsAlive > 0) return null;
        this.enter(HauntPhase.Cleared, now);
        return { kind: 'clear' };
      case HauntPhase.Cleared:
        return null;
    }
  }

  private nextVolley(now: number): HauntEvent {
    this.volley++;
    this.enter(HauntPhase.Volleys, now);
    return { kind: 'volley', index: this.volley, count: this.config.volleys[this.volley] ?? 0 };
  }

  private enter(phase: HauntPhase, now: number): void {
    this.current = phase;
    this.phaseAt = now;
  }
}

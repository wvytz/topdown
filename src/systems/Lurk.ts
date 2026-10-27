/** Czyhacz (krok 123): kryjówka, budzenie i wyskok — czysta logika, bez Phasera. */
import type { Vector2 } from '@/core/types';
import { pounceLanding } from '@/systems/HellAttacks';

export interface LurkConfig {
  /** Bohater bliżej niż tyle (px, środek–środek) i w linii wzroku budzi Czyhacza. */
  readonly triggerRange: number;
  /** Ostrzeżenie przed wyskokiem (ms): kryjówka trzęsie się, a strefa lądowania już się wypełnia. */
  readonly warnMs: number;
  /** Subtelny znak w ukryciu (decyzja właściciela): co `intervalMs` drgnięcie i błysk ślepi przez `durationMs`. */
  readonly tell: { readonly intervalMs: number; readonly durationMs: number };
  readonly leap: {
    /** Najdalszy doskok (px) — bohater dalej: Czyhacz ląduje krócej, w jego stronę. */
    readonly maxDistance: number;
    readonly speed: number;
    /** Promień strefy lądowania = strefa obrażeń. */
    readonly radius: number;
    /** Obrażenia lądowania = cios Czyhacza (ze skalowaniem piętra) × tyle. */
    readonly damageMultiplier: number;
    readonly knockback: number;
  };
  /** Kryjówka trafiona przed wyskokiem: Czyhacz wypada bez doskoku i stoi ogłuszony tyle ms. */
  readonly provokedStunMs: number;
}

export enum LurkPhase {
  /** W kryjówce: niewidoczny, nie rusza się; trafienie kryjówki go wywabia. */
  Hidden = 'hidden',
  /** Obudzony: za chwilę wyskoczy w strefę lądowania. */
  Waking = 'waking',
  /** Poza kryjówką — walczy jak zwykły wróg. */
  Out = 'out',
}

/** Co się stało w tej klatce (dla warstwy Phasera: dźwięk, telegraf, wyskok). */
export enum LurkEvent {
  Woke = 'woke',
  Leapt = 'leapt',
  /** Wywabiony trafieniem kryjówki: bez doskoku, ogłuszony. */
  Provoked = 'provoked',
}

export interface LurkSense {
  readonly now: number;
  /** Najbliższy żywy bohater (co-op: wyzwala bliższy) albo null. */
  readonly hero: Vector2 | null;
  readonly canSeeHero: boolean;
}

/**
 * Maszyna stanów kryjówki: ukryty → (bohater blisko) budzi się → po `warnMs` wyskakuje w miejsce bohatera
 * z chwili przebudzenia. Trafienie w ukryciu lub przy budzeniu: wypada od razu, ogłuszony i bez doskoku.
 */
export class Lurk {
  private current = LurkPhase.Hidden;
  private wakeStart = 0;
  private landing: Vector2 | null = null;
  private wasProvoked = false;

  constructor(
    private readonly config: LurkConfig,
    /** Miejsce kryjówki (środek kafla przy ścianie). */
    readonly den: Vector2,
    /** Przesunięcie rytmu drgnięć — kilku Czyhaczy nie drga naraz. */
    private readonly tellOffsetMs: number,
  ) {}

  get phase(): LurkPhase {
    return this.current;
  }

  get isHiding(): boolean {
    return this.current !== LurkPhase.Out;
  }

  /** Czy wyszedł przez trafienie kryjówki (bez doskoku). */
  get provoked(): boolean {
    return this.wasProvoked;
  }

  /** Miejsce lądowania (od przebudzenia) albo null. */
  get landingAt(): Vector2 | null {
    return this.landing;
  }

  /** Chwila końca ostrzeżenia (wyskok); NaN przed przebudzeniem. */
  get leapAt(): number {
    return this.current === LurkPhase.Hidden ? Number.NaN : this.wakeStart + this.config.warnMs;
  }

  get wakeStartedAt(): number {
    return this.wakeStart;
  }

  /** Subtelny znak w ukryciu: drgnięcie i ślepia w szczelinie. */
  isTelling(now: number): boolean {
    if (this.current !== LurkPhase.Hidden) return false;
    const { intervalMs, durationMs } = this.config.tell;
    const t = (((now + this.tellOffsetMs) % intervalMs) + intervalMs) % intervalMs;
    return t < durationMs;
  }

  /** Postęp ostrzeżenia 0..1 (drżenie kryjówki narasta); 0 w ukryciu, 1 po wyskoku. */
  wakeProgress(now: number): number {
    if (this.current === LurkPhase.Hidden) return 0;
    if (this.current === LurkPhase.Out) return 1;
    return Math.min(1, Math.max(0, (now - this.wakeStart) / Math.max(1, this.config.warnMs)));
  }

  sense(input: LurkSense): LurkEvent | null {
    if (this.current === LurkPhase.Hidden) {
      const hero = input.hero;
      if (!hero || !input.canSeeHero || Math.hypot(hero.x - this.den.x, hero.y - this.den.y) > this.config.triggerRange) return null;
      this.current = LurkPhase.Waking;
      this.wakeStart = input.now;
      this.landing = pounceLanding(this.den, hero, this.config.leap.maxDistance);
      return LurkEvent.Woke;
    }
    if (this.current === LurkPhase.Waking && input.now >= this.leapAt) {
      this.current = LurkPhase.Out;
      return LurkEvent.Leapt;
    }
    return null;
  }

  /** Trafienie kryjówki: wypada od razu (bez doskoku). Zwraca zdarzenie tylko przy zmianie stanu. */
  provoke(): LurkEvent | null {
    if (this.current === LurkPhase.Out) return null;
    this.current = LurkPhase.Out;
    this.landing = null;
    this.wasProvoked = true;
    return LurkEvent.Provoked;
  }
}

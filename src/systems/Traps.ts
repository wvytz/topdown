/**
 * Pułapki ruin (krok 48, prośba właściciela: pierwsze piętro było puste i bez wyzwania).
 * - Płyty z kolcami: pas płyt w poprzek pokoju; dwie grupy (parzyste i nieparzyste) wysuwają kolce na zmianę,
 *   więc zawsze da się przejść — trzeba trafić w rytm. Ranią gracza i wrogów.
 * - Strzałki: płyta naciskowa w linii otworu w murze; nadepnięcie uzbraja otwór (telegraf: linia strzału),
 *   potem salwa strzałek wzdłuż linii. Ranią tylko gracza.
 * Czysta logika: czasy i stany. Liczby w biomeConfig.
 */

export interface SpikeTiming {
  /** Kolce schowane. */
  readonly downMs: number;
  /** Ostrzeżenie: płyta drży, kolce wyglądają ze szczelin. */
  readonly warnMs: number;
  /** Kolce wysunięte — ranią. */
  readonly upMs: number;
}

export interface SpikeConfig {
  /** Szansa, że zwykły pokój dostanie pas kolców. */
  readonly roomChance: number;
  /** Pas tylko w pokojach o krótszym boku co najmniej tylu kafli. */
  readonly minShortSide: number;
  readonly timing: SpikeTiming;
  readonly damage: number;
  readonly knockback: number;
}

export interface DartConfig {
  /** Szansa, że zwykły pokój dostanie pułapkę ze strzałkami. */
  readonly roomChance: number;
  /** Płyta naciskowa tyle kafli od muru z otworem (zakres). */
  readonly plateDistance: { readonly min: number; readonly max: number };
  /** Linia strzału co najmniej tylu kafli (pokój dość szeroki, by był sens uskakiwać). */
  readonly minLine: number;
  /** Od nadepnięcia do pierwszej strzałki (telegraf). */
  readonly windupMs: number;
  readonly volley: number;
  readonly volleyIntervalMs: number;
  /** Po salwie pułapka znów się uzbraja dopiero po tym czasie i zejściu z płyty. */
  readonly cooldownMs: number;
  readonly damage: number;
  readonly knockback: number;
  readonly speed: number;
}

export enum SpikePhase {
  Down = 'down',
  Warn = 'warn',
  Up = 'up',
}

export interface SpikeState {
  readonly phase: SpikePhase;
  /** 0..1 postęp fazy. */
  readonly progress: number;
}

const cycleOf = (t: SpikeTiming) => t.downMs + t.warnMs + t.upMs;

/** Przesunięcie cyklu grupy płyt: grupa 1 jest pół cyklu za grupą 0 (wysuwają się na zmianę). */
export function spikeGroupOffset(timing: SpikeTiming, group: number): number {
  return group % 2 === 0 ? 0 : Math.round(cycleOf(timing) / 2);
}

export function spikeState(timing: SpikeTiming, offsetMs: number, now: number): SpikeState {
  const cycle = cycleOf(timing);
  const t = (((now + offsetMs) % cycle) + cycle) % cycle;
  if (t < timing.downMs) return { phase: SpikePhase.Down, progress: t / timing.downMs };
  if (t < timing.downMs + timing.warnMs) return { phase: SpikePhase.Warn, progress: (t - timing.downMs) / timing.warnMs };
  return { phase: SpikePhase.Up, progress: (t - timing.downMs - timing.warnMs) / timing.upMs };
}

/** Numer cyklu — jedno wysunięcie rani każdego najwyżej raz. */
export function spikeCycleIndex(timing: SpikeTiming, offsetMs: number, now: number): number {
  return Math.floor((now + offsetMs) / cycleOf(timing));
}

export enum DartTrapPhase {
  Ready = 'ready',
  Armed = 'armed',
  Firing = 'firing',
  Cooldown = 'cooldown',
}

/**
 * Pułapka ze strzałkami: gotowa → (nadepnięcie) uzbrojona → salwa → odpoczynek → gotowa, gdy minie czas
 * i gracz zejdzie z płyty. `update` zwraca, ile strzałek wystrzelić w tej klatce.
 */
export class DartTrapState {
  private current = DartTrapPhase.Ready;
  private phaseAt = 0;
  private fired = 0;

  constructor(private readonly config: Pick<DartConfig, 'windupMs' | 'volley' | 'volleyIntervalMs' | 'cooldownMs'>) {}

  get phase(): DartTrapPhase {
    return this.current;
  }

  /** Chwila uzbrojenia (do telegrafu); znaczenie tylko w fazie Armed. */
  get armedAt(): number {
    return this.phaseAt;
  }

  update(playerOnPlate: boolean, now: number): number {
    const c = this.config;
    switch (this.current) {
      case DartTrapPhase.Ready:
        if (playerOnPlate) this.enter(DartTrapPhase.Armed, now);
        return 0;
      case DartTrapPhase.Armed:
        if (now - this.phaseAt < c.windupMs) return 0;
        this.enter(DartTrapPhase.Firing, now);
        this.fired = 0;
        return this.fire(now);
      case DartTrapPhase.Firing:
        return this.fire(now);
      case DartTrapPhase.Cooldown:
        if (now - this.phaseAt >= c.cooldownMs && !playerOnPlate) this.enter(DartTrapPhase.Ready, now);
        return 0;
    }
  }

  private fire(now: number): number {
    const c = this.config;
    const due = Math.min(c.volley, Math.floor((now - this.phaseAt) / c.volleyIntervalMs) + 1);
    const count = due - this.fired;
    this.fired = due;
    if (this.fired >= c.volley) this.enter(DartTrapPhase.Cooldown, now);
    return count;
  }

  private enter(phase: DartTrapPhase, now: number): void {
    this.current = phase;
    this.phaseAt = now;
  }
}

export interface BreakableConfig {
  /** Szansa, że pokój (zwykły albo startowy) dostanie urny i skrzynie. */
  readonly roomChance: number;
  readonly perRoom: { readonly min: number; readonly max: number };
  /** Szansa na skrzynię zamiast urny. */
  readonly crateChance: number;
  /** Urny mają tyle wariantów wyglądu. */
  readonly urnVariants: number;
  readonly radius: number;
}

import type { IntRange, Room, TilePoint } from '@/core/dungeonTypes';
import type { EnemyScalingConfig, PhasingDefinition } from '@/core/combatTypes';
import type { Rng } from '@/core/random';
import type { AmbientProfile } from '@/config/lightingConfig';
import { createRng, deriveSeed } from '@/core/random';

/**
 * Zasadzki (krok 49, pomysł właściciela): co 1–2 piętra jeden pusty pokój z przynętą (przedmiotem) na środku.
 * Wejście w głąb pokoju opuszcza kraty, przyciemnia światło i przywołuje fale upiorów; po ostatniej fali kraty
 * się podnoszą, a przedmiot da się podnieść. Czysta logika: które piętra, stan zasadzki, miejsca pojawienia się.
 */
export interface AmbushConfig {
  /** Pierwsza zasadzka na jednym z tych pięter. */
  readonly firstFloor: IntRange;
  /** Odstęp do następnej (w piętrach). */
  readonly gap: IntRange;
  /** Pokój zasadzki: krótszy bok co najmniej tyle kafli… */
  readonly minSide: number;
  /** …a zwykle (z szansą `preferredChance`) co najmniej tyle (krok 49b). */
  readonly preferredSide: number;
  readonly preferredChance: number;
  /** Kraty opadają, gdy gracz stoi co najmniej tyle kafli od krawędzi pokoju. */
  readonly triggerMargin: number;
  /** Liczba upiorów w kolejnych falach. */
  readonly waves: readonly number[];
  /** Od zamknięcia krat (albo końca fali) do pojawienia się następnej. */
  readonly waveDelayMs: number;
  /** Upiór „wynurza się” tyle ms (telegraf) — dopiero potem atakuje i da się go trafić. */
  readonly riseMs: number;
  /** Upiory pojawiają się co najmniej tyle kafli od gracza. */
  readonly minSpawnDistance: number;
  /**
   * Skalowanie upiorów z piętrem (krok 50a): wolniejsze niż zwykłych wrogów (`ENEMY_SCALING`), bez modyfikatorów
   * piętra — zasadzka ma być nagrodą („jackpot”), nie kłopotem, także w kolejnych kręgach wieży.
   */
  readonly ghostScaling: EnemyScalingConfig;
  /** Mrok zasadzki: druga warstwa ciemności z małym kręgiem światła wokół gracza; czas przejścia. */
  readonly dread: { readonly profile: AmbientProfile; readonly fadeMs: number };
}

const AMBUSH_SCHEDULE_SALT = 0xa3b5;

/** Czy na tym piętrze runu jest zasadzka: harmonogram z seeda runu (pierwsza na 1–2, potem co 1–2 piętra). */
export function hasAmbush(runSeed: number, floor: number, config: Pick<AmbushConfig, 'firstFloor' | 'gap'>): boolean {
  const rng = createRng(deriveSeed(runSeed, AMBUSH_SCHEDULE_SALT));
  let next = rng.int(config.firstFloor.min, config.firstFloor.max);
  while (next < floor) next += rng.int(config.gap.min, config.gap.max);
  return next === floor;
}

/** Bezcielesny w chwili `now` (przenikanie z przesunięciem fazy `offsetMs`). */
export function isPhased(phasing: PhasingDefinition, offsetMs: number, now: number): boolean {
  const cycle = phasing.solidMs + phasing.phasedMs;
  const t = (((now + offsetMs) % cycle) + cycle) % cycle;
  return t >= phasing.solidMs;
}

/** Kafle pojawienia się upiorów: różne, w pokoju (odstęp 1 od ścian), co najmniej `minDistance` od gracza. */
export function ambushSpawnTiles(room: Room, player: TilePoint, count: number, minDistance: number, rng: Rng): TilePoint[] {
  const all: TilePoint[] = [];
  for (let y = room.y + 1; y < room.y + room.height - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.width - 1; x++) all.push({ x, y });
  }
  const far = all.filter((t) => Math.max(Math.abs(t.x - player.x), Math.abs(t.y - player.y)) >= minDistance);
  const pool = far.length >= count ? far : all;
  const out: TilePoint[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!);
  return out;
}

export enum AmbushPhase {
  /** Czeka na gracza. */
  Waiting = 'waiting',
  /** Kraty opadły; przerwa przed falą. */
  Gathering = 'gathering',
  /** Fala w toku. */
  Fighting = 'fighting',
  Cleared = 'cleared',
}

export type AmbushEvent = { readonly kind: 'seal' } | { readonly kind: 'wave'; readonly index: number; readonly count: number } | { readonly kind: 'clear' };

/** Przebieg zasadzki: gracz w głębi pokoju → kraty → fale po kolei (następna po wybiciu poprzedniej) → koniec. */
export class AmbushState {
  private current = AmbushPhase.Waiting;
  private wave = -1;
  private phaseAt = 0;

  constructor(private readonly config: Pick<AmbushConfig, 'waves' | 'waveDelayMs'>) {}

  get phase(): AmbushPhase {
    return this.current;
  }

  update(input: { readonly playerInside: boolean; readonly playerDead: boolean; readonly aliveInWave: number }, now: number): AmbushEvent | null {
    switch (this.current) {
      case AmbushPhase.Waiting:
        if (!input.playerInside || input.playerDead) return null;
        this.enter(AmbushPhase.Gathering, now);
        return { kind: 'seal' };
      case AmbushPhase.Gathering:
        if (now - this.phaseAt < this.config.waveDelayMs) return null;
        this.wave++;
        this.enter(AmbushPhase.Fighting, now);
        return { kind: 'wave', index: this.wave, count: this.config.waves[this.wave]! };
      case AmbushPhase.Fighting:
        if (input.aliveInWave > 0) return null;
        if (this.wave + 1 >= this.config.waves.length) {
          this.enter(AmbushPhase.Cleared, now);
          return { kind: 'clear' };
        }
        this.enter(AmbushPhase.Gathering, now);
        return null;
      case AmbushPhase.Cleared:
        return null;
    }
  }

  private enter(phase: AmbushPhase, now: number): void {
    this.current = phase;
    this.phaseAt = now;
  }
}

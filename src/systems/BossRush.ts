import { RunMode } from '@/core/runMode';
import type { TowerLoopConfig } from '@/systems/TowerLoop';
import { toRoman, towerLoop } from '@/systems/TowerLoop';

/**
 * Areny bossów (krok 90): przebieg jednej areny — walka, dobijanie pomocników, wybór nagrody, teleport.
 * Czysta maszyna stanów; scena gry podaje stan walki i wykonuje zwrócone kroki.
 */
export enum ArenaPhase {
  /** Boss żyje (albo jeszcze śpi). */
  Fight = 'fight',
  /** Boss pokonany, na arenie zostali pomocnicy (świta, galerie). */
  Clearing = 'clearing',
  /** Karty nagrody na ekranie — czekamy na wybór. */
  Reward = 'reward',
  /** Nagroda wybrana — odliczanie do teleportu. */
  Teleport = 'teleport',
  /** Teleport ruszył (scena przechodzi na kolejną arenę). */
  Done = 'done',
}

export interface ArenaSnapshot {
  readonly bossDefeated: boolean;
  readonly enemiesAlive: number;
  readonly playerDead: boolean;
  readonly now: number;
}

/** Krok do wykonania przez scenę (najwyżej jeden na klatkę). */
export type ArenaStep = 'announce-clear' | 'offer-reward' | 'teleport' | null;

export class BossRushArena {
  private current = ArenaPhase.Fight;
  /** Chwila teleportu; null, dopóki pierwsza klatka po wyborze karty jej nie wyznaczy. */
  private teleportAt: number | null = null;

  constructor(private readonly teleportDelayMs: number) {}

  get phase(): ArenaPhase {
    return this.current;
  }

  update(state: ArenaSnapshot): ArenaStep {
    if (state.playerDead) return null;
    switch (this.current) {
      case ArenaPhase.Fight:
        if (!state.bossDefeated) return null;
        if (state.enemiesAlive > 0) {
          this.current = ArenaPhase.Clearing;
          return 'announce-clear';
        }
        this.current = ArenaPhase.Reward;
        return 'offer-reward';
      case ArenaPhase.Clearing:
        if (state.enemiesAlive > 0) return null;
        this.current = ArenaPhase.Reward;
        return 'offer-reward';
      case ArenaPhase.Teleport:
        // Odliczanie od pierwszej klatki po wyborze, w zegarze sceny (wybór zapada, gdy scena stoi).
        this.teleportAt ??= state.now + this.teleportDelayMs;
        if (state.now < this.teleportAt) return null;
        this.current = ArenaPhase.Done;
        return 'teleport';
      default:
        return null;
    }
  }

  /** Gracz wybrał kartę (albo nie było czego wybrać) — odliczanie do teleportu rusza w kolejnej klatce. */
  rewardTaken(): void {
    if (this.current !== ArenaPhase.Reward) return;
    this.current = ArenaPhase.Teleport;
  }
}

/** Tryb z adresu (`?mode=arenas`); null = gracz wybiera na ekranie wyboru. */
export function parseRunMode(search: string, param: string, value: string): RunMode | null {
  return new URLSearchParams(search).get(param) === value ? RunMode.BossRush : null;
}

export const isBossRush = (mode: RunMode | undefined): boolean => mode === RunMode.BossRush;

/** Napis areny w HUD: „Arena 3 · Król Pająków”, w kolejnych kręgach z kręgiem. */
export function arenaLabel(arena: number, bossName: string, config: Pick<TowerLoopConfig, 'floorsPerLoop'>): string {
  const loop = towerLoop(arena, config);
  const base = `Arena ${arena} · ${bossName}`;
  return loop === 0 ? base : `${base} · Krąg ${toRoman(loop + 1)}`;
}

/** Kolejny tryb na ekranie wyboru (dwa tryby — przełącznik). */
export function nextRunMode(mode: RunMode): RunMode {
  return mode === RunMode.BossRush ? RunMode.Tower : RunMode.BossRush;
}

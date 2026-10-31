import type Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { HeroKit } from '@/core/heroTypes';
import type { Vector2 } from '@/core/types';
import type { Player, PlayerActions } from '@/entities/Player';
import type { PlayerInput, PlayerInputContext } from '@/input/playerInput';
import { PartnerBotBrain, type BotDecision } from '@/ai/PartnerBotBrain';
import { nextWaypoint } from '@/ai/botPath';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import { PARTNER_BOT_CONFIG } from '@/config/partnerBotConfig';
import { TILE_SIZE } from '@/config/gameConfig';

/** Co scena gry daje botowi-partnerowi (krok 146). */
export interface BotPartnerDeps {
  /** Bohater bota. */
  readonly self: () => Player;
  /** Bohater gracza, za którym bot idzie. */
  readonly leader: () => Player;
  readonly kit: HeroKit['kind'];
  readonly floor: () => DungeonFloor;
  /** Teleport bota obok gracza (utknął albo został w tyle). */
  readonly warp: (to: Vector2) => void;
}

/**
 * Źródło sterowania P2 z mózgu bota (krok 146) — to samo gniazdo co klawiatura, pad i dotyk.
 * Tu tylko zbieramy obraz świata z Phasera; decyzje podejmuje czysty `PartnerBotBrain`.
 */
export class BotPartnerInput implements PlayerInput {
  private readonly brain = new PartnerBotBrain(PARTNER_BOT_CONFIG);
  /** Ostatnia decyzja — do podglądu w trybie dev (`__game`). */
  lastDecision: BotDecision | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: BotPartnerDeps,
  ) {}

  getActions({ targets }: PlayerInputContext): PlayerActions {
    const now = this.scene.time.now;
    const self = this.deps.self();
    const leader = this.deps.leader();
    const floor = this.deps.floor();
    const ultimate = self.ultimateStatus(now);
    const halfWidth = PARTNER_BOT_CONFIG.bodyHalfWidthPx;
    const decision = this.brain.decide({
      now,
      self: {
        x: self.x,
        y: self.y,
        kit: this.deps.kit,
        downed: self.isDead,
        charges: self.rangedStatus(now).charges,
        ultimateReady: ultimate.charge >= 1 && !ultimate.active,
      },
      leader: { x: leader.x, y: leader.y, downed: leader.isDead },
      targets: [...targets()],
      canSee: (from, to) => hasLineOfSight(floor, from, to, TILE_SIZE),
      navigate: (from, to) => nextWaypoint(floor, from, to, TILE_SIZE, halfWidth),
    });
    this.lastDecision = decision;
    if (decision.warp) this.deps.warp(decision.warp);
    return decision.actions;
  }
}

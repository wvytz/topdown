import type Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { HeroKit } from '@/core/heroTypes';
import type { Vector2 } from '@/core/types';
import type { Player, PlayerActions } from '@/entities/Player';
import type { PlayerInput, PlayerInputContext } from '@/input/playerInput';
import { PartnerBotBrain, type BotDecision, type BotTarget, type BotThreat } from '@/ai/PartnerBotBrain';
import { nextWaypoint } from '@/ai/botPath';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import { PARTNER_BOT_CONFIG } from '@/config/partnerBotConfig';
import { TILE_SIZE } from '@/config/gameConfig';

/** Co scena gry daje botowi-partnerowi (krok 149). */
export interface BotPartnerDeps {
  /** Bohater bota. */
  readonly self: () => Player;
  /** Bohater gracza, za którym bot idzie. */
  readonly leader: () => Player;
  readonly kit: HeroKit['kind'];
  readonly floor: () => DungeonFloor;
  /** Teleport bota obok gracza (utknął albo został w tyle). */
  readonly warp: (to: Vector2) => void;
  /** Czerwone pasy ataku kary (krok U11b). */
  readonly threats?: () => readonly BotThreat[];
  /** Pozycje walczących bossów (krok U9a) — te cele bot goni po całej arenie. */
  readonly bosses?: () => readonly Vector2[];
}

/** Cel na pozycji walczącego bossa dostaje znacznik `boss` (krok U9a). */
function markBosses(targets: Iterable<BotTarget>, bosses: readonly Vector2[]): BotTarget[] {
  const marked: BotTarget[] = [];
  for (const target of targets) {
    const boss = bosses.some((at) => Math.abs(at.x - target.x) < 1 && Math.abs(at.y - target.y) < 1);
    marked.push(boss ? { x: target.x, y: target.y, radius: target.radius, boss } : target);
  }
  return marked;
}

/**
 * Źródło sterowania P2 z mózgu bota (krok 149) — to samo gniazdo co klawiatura, pad i dotyk.
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
      targets: markBosses(targets(), this.deps.bosses?.() ?? []),
      canSee: (from, to) => hasLineOfSight(floor, from, to, TILE_SIZE),
      navigate: (from, to) => nextWaypoint(floor, from, to, TILE_SIZE, halfWidth),
      threats: this.deps.threats?.() ?? [],
    });
    this.lastDecision = decision;
    if (decision.warp) this.deps.warp(decision.warp);
    return decision.actions;
  }
}

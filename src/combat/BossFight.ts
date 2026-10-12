import Phaser from 'phaser';
import type { AreaStrike, BossAttackPlan, ProjectileBurst } from '@/core/bossTypes';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { createRng, deriveSeed } from '@/core/random';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { FLOOR_GUARDIAN, scaleBossForFloor } from '@/config/bossConfig';
import { isHitByAreaStrike } from '@/ai/bossAttacks';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { DungeonView } from '@/dungeon/DungeonView';
import { roomContainsTile } from '@/dungeon/rooms';
import type { CombatEffects } from '@/effects/CombatEffects';
import { Boss } from '@/entities/Boss';
import type { Player } from '@/entities/Player';
import { knockbackFrom } from '@/systems/CombatMath';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';

export interface BossFightDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly player: Player;
  readonly projectiles: ProjectileManager;
  readonly effects: CombatEffects;
  readonly onPlayerHit: () => void;
  /** Wywoływane po pokonaniu bossa, z miejscem jego śmierci (tam wypadają łupy). */
  readonly onDefeated: (position: Vector2) => void;
}

export interface BossStatus {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly enraged: boolean;
}

interface PendingStrike {
  readonly strike: AreaStrike;
  readonly gfx: Phaser.GameObjects.Graphics;
}

interface PendingBurst {
  readonly burst: ProjectileBurst;
  readonly gfx: Phaser.GameObjects.Graphics;
}

const BOSS_SEED_SALT = 0xb055;
const TELEGRAPH_COLOR = 0xff4040;
const TELEGRAPH_DEPTH = 5;

/**
 * Walka z bossem: aktywacja po wejściu gracza na arenę, wykonanie zaplanowanych ataków
 * (telegrafy, strefy, fale pocisków) i zgłoszenie zwycięstwa (odblokowanie schodów).
 */
export class BossFight {
  private boss: Boss | null;
  private readonly arena: Room;
  private strikes: PendingStrike[] = [];
  private bursts: PendingBurst[] = [];

  constructor(private readonly deps: BossFightDeps) {
    const arena = deps.floor.rooms[deps.floor.bossRoomId];
    if (!arena) throw new Error('BossFight: brak komnaty bossa w danych piętra.');
    this.arena = arena;

    const definition = scaleBossForFloor(FLOOR_GUARDIAN, deps.floorNumber, ENEMY_SCALING);
    const spawn = DungeonView.tileToWorldCenter(deps.floor.stairs);
    const rng = createRng(deriveSeed(deps.floor.seed, BOSS_SEED_SALT));
    const boss = new Boss(deps.scene, spawn.x, spawn.y, definition, rng);
    this.boss = boss;

    deps.scene.physics.add.collider(boss, deps.walls);
    deps.scene.physics.add.collider(deps.player, boss);
  }

  /** Stan dla HUD — null, dopóki walka się nie zaczęła lub po zwycięstwie. */
  getStatus(): BossStatus | null {
    const boss = this.boss;
    if (!boss || !boss.isFighting) return null;
    return { name: boss.definition.name, hp: boss.health.value, maxHp: boss.health.max, enraged: boss.isEnraged };
  }

  update(now: number): void {
    const boss = this.boss;
    if (!boss) return;
    const { player } = this.deps;

    if (!boss.isFighting && !player.isDead) {
      const playerTile = DungeonView.worldToTile(player.x, player.y);
      if (roomContainsTile(this.arena, playerTile)) boss.activate(now);
    }

    const plan = boss.tick({ x: player.x, y: player.y }, now);
    if (plan) this.schedule(plan);

    this.updateStrikes(now);
    this.updateBursts(now);
  }

  resolvePlayerMelee(swing: MeleeSwing): void {
    if (!this.boss) return;
    if (resolveMeleeSwing(swing, [this.boss]).length > 0) this.defeat();
  }

  /** Tylko do debugowania (klawisz B w trybie dev). */
  debugDefeat(): void {
    if (this.boss) this.defeat();
  }

  private schedule(plan: BossAttackPlan): void {
    const scene = this.deps.scene;
    for (const strike of plan.strikes) {
      this.strikes.push({ strike, gfx: scene.add.graphics().setDepth(TELEGRAPH_DEPTH) });
    }
    for (const burst of plan.bursts) {
      this.bursts.push({ burst, gfx: scene.add.graphics().setDepth(TELEGRAPH_DEPTH) });
    }
  }

  private updateStrikes(now: number): void {
    const { player, effects, onPlayerHit } = this.deps;
    this.strikes = this.strikes.filter(({ strike, gfx }) => {
      if (now < strike.impactAt) {
        drawAreaTelegraph(gfx, strike, now);
        return true;
      }
      gfx.destroy();
      effects.impact(strike.center.x, strike.center.y, strike.radius);
      if (isHitByAreaStrike(strike, player, player.radius)) {
        const hit = { damage: strike.damage, knockback: knockbackFrom(strike.center, player, strike.knockback) };
        if (player.takeHit(hit, now)) onPlayerHit();
      }
      return false;
    });
  }

  private updateBursts(now: number): void {
    this.bursts = this.bursts.filter(({ burst, gfx }) => {
      if (now < burst.fireAt) {
        drawBurstTelegraph(gfx, burst, now);
        return true;
      }
      gfx.destroy();
      for (let i = 0; i < burst.count; i++) {
        const angle = burst.angleOffset + (i / burst.count) * Math.PI * 2;
        this.deps.projectiles.fire({
          origin: burst.origin,
          direction: { x: Math.cos(angle), y: Math.sin(angle) },
          speed: burst.speed,
          damage: burst.damage,
          knockback: burst.knockback,
          lifetimeMs: burst.lifetimeMs,
        });
      }
      return false;
    });
  }

  private defeat(): void {
    const boss = this.boss;
    if (!boss) return;
    this.deps.effects.deathBurst(boss.x, boss.y, boss.definition.color, boss.radius * 1.5);
    for (const pending of [...this.strikes, ...this.bursts]) pending.gfx.destroy();
    this.strikes = [];
    this.bursts = [];
    const position: Vector2 = { x: boss.x, y: boss.y };
    boss.destroy();
    this.boss = null;
    this.deps.onDefeated(position);
  }
}

/** Obrys strefy + wypełnienie rosnące do chwili uderzenia. */
function drawAreaTelegraph(gfx: Phaser.GameObjects.Graphics, strike: AreaStrike, now: number): void {
  gfx.clear();
  if (now < strike.telegraphStartAt) return;
  const progress = Phaser.Math.Clamp(
    (now - strike.telegraphStartAt) / (strike.impactAt - strike.telegraphStartAt),
    0,
    1,
  );
  gfx.lineStyle(2, TELEGRAPH_COLOR, 0.8).strokeCircle(strike.center.x, strike.center.y, strike.radius);
  gfx.fillStyle(TELEGRAPH_COLOR, 0.12).fillCircle(strike.center.x, strike.center.y, strike.radius);
  gfx.fillStyle(TELEGRAPH_COLOR, 0.3).fillCircle(strike.center.x, strike.center.y, strike.radius * progress);
}

/** Pulsujący pierścień wokół bossa przed wystrzałem fali. */
function drawBurstTelegraph(gfx: Phaser.GameObjects.Graphics, burst: ProjectileBurst, now: number): void {
  gfx.clear();
  const progress = Phaser.Math.Clamp(
    (now - burst.telegraphStartAt) / (burst.fireAt - burst.telegraphStartAt),
    0,
    1,
  );
  gfx.lineStyle(3, 0xffa040, 0.3 + 0.6 * progress).strokeCircle(burst.origin.x, burst.origin.y, 30 + 20 * progress);
}

import Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { SPRITE_SHEETS, TRAP_VISUAL, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { DungeonView } from '@/dungeon/DungeonView';
import type { DartTrap, SpikePlate } from '@/dungeon/TrapPlanner';
import type { Enemy } from '@/entities/Enemy';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { knockbackFrom, scaleForFloor } from '@/systems/CombatMath';
import type { DartConfig, SpikeConfig } from '@/systems/Traps';
import { DartTrapPhase, DartTrapState, SpikePhase, spikeCycleIndex, spikeGroupOffset, spikeState } from '@/systems/Traps';

export interface TrapDeps {
  readonly scene: Phaser.Scene;
  readonly floorNumber: number;
  readonly spikes: { readonly config: SpikeConfig; readonly plates: readonly SpikePlate[] } | null;
  readonly darts: { readonly config: DartConfig; readonly traps: readonly DartTrap[] } | null;
  /** Bohaterowie (co-op, etap C0). */
  readonly party: Party;
  readonly enemies: () => readonly Enemy[];
  readonly projectiles: ProjectileManager;
  readonly onPlayerHit: (player: Player) => void;
}

interface LivePlate {
  readonly plate: SpikePlate;
  readonly at: Vector2;
  readonly sprite: Phaser.GameObjects.Sprite;
  phase: SpikePhase | null;
}

interface LiveDart {
  readonly trap: DartTrap;
  readonly state: DartTrapState;
  readonly plateSprite: Phaser.GameObjects.Sprite;
  readonly shooterSprite: Phaser.GameObjects.Sprite;
  readonly origin: Vector2;
  readonly lineEnd: Vector2;
  phase: DartTrapPhase | null;
}

const play = (sprite: Phaser.GameObjects.Sprite, name: string) => sprite.play(animationKey(TRAP_VISUAL.sheet, name));

/**
 * Pułapki ruin (krok 48): płyty z kolcami (rytm z czystego `systems/Traps`, ranią gracza i wrogów raz na wysunięcie)
 * i pułapki ze strzałkami (płyta naciskowa → telegraf linii → salwa strzałek przez ProjectileManager — ranią tylko
 * gracza). Bez ciał fizycznych. Obrażenia rosną z piętrem jak ciosy wrogów.
 */
export class TrapManager {
  private readonly plates: LivePlate[] = [];
  private readonly darts: LiveDart[] = [];
  private readonly telegraph: Phaser.GameObjects.Graphics;
  /** Cykl każdej grupy, w którym kolce już zraniły danego bohatera. */
  private readonly playerHitCycle = new WeakMap<Player, Map<number, number>>();
  private readonly enemyHitCycle = new WeakMap<Enemy, Map<number, number>>();
  private readonly spikeDamage: number;
  private readonly dartDamage: number;

  constructor(private readonly deps: TrapDeps) {
    const { scene, floorNumber } = deps;
    const scale = (base: number) => scaleForFloor(base, floorNumber, ENEMY_SCALING.damagePerFloor);
    this.spikeDamage = scale(deps.spikes?.config.damage ?? 0);
    this.dartDamage = scale(deps.darts?.config.damage ?? 0);
    this.telegraph = scene.add.graphics().setDepth(RENDER_DEPTH.telegraph);
    const sheet = SPRITE_SHEETS[TRAP_VISUAL.sheet].key;
    for (const plate of deps.spikes?.plates ?? []) {
      const at = DungeonView.tileToWorldCenter(plate.tile);
      this.plates.push({ plate, at, sprite: scene.add.sprite(at.x, at.y, sheet).setDepth(RENDER_DEPTH.floorHazard), phase: null });
    }
    for (const trap of deps.darts?.traps ?? []) {
      const plateAt = DungeonView.tileToWorldCenter(trap.plate);
      const shooterAt = DungeonView.tileToWorldCenter(trap.shooter);
      const last = DungeonView.tileToWorldCenter(trap.line[trap.line.length - 1]!);
      const plateSprite = scene.add.sprite(plateAt.x, plateAt.y, sheet).setDepth(RENDER_DEPTH.floorHazard);
      // Wylot narysowany w dół; obrót w stronę strzału (wielokrotność 90° — bez zniekształceń pikseli).
      const shooterSprite = scene.add
        .sprite(shooterAt.x, shooterAt.y, sheet)
        .setDepth(RENDER_DEPTH.wallDecor + 0.05)
        .setRotation(Math.atan2(trap.direction.y, trap.direction.x) - Math.PI / 2);
      play(plateSprite, 'plate');
      play(shooterSprite, 'shooter');
      this.darts.push({
        trap,
        state: new DartTrapState(deps.darts!.config),
        plateSprite,
        shooterSprite,
        origin: { x: shooterAt.x + (trap.direction.x * TILE_SIZE) / 2, y: shooterAt.y + (trap.direction.y * TILE_SIZE) / 2 },
        lineEnd: { x: last.x + (trap.direction.x * TILE_SIZE) / 2, y: last.y + (trap.direction.y * TILE_SIZE) / 2 },
        phase: null,
      });
    }
  }

  update(now: number): void {
    this.telegraph.clear();
    this.updateSpikes(now);
    this.updateDarts(now);
  }

  private updateSpikes(now: number): void {
    const spikes = this.deps.spikes;
    if (!spikes) return;
    const { config } = spikes;
    const { party } = this.deps;
    for (const live of this.plates) {
      const offset = spikeGroupOffset(config.timing, live.plate.group);
      const state = spikeState(config.timing, offset, now);
      if (state.phase !== live.phase) {
        live.phase = state.phase;
        play(live.sprite, state.phase === SpikePhase.Down ? 'spikeDown' : state.phase === SpikePhase.Warn ? 'spikeWarn' : 'spikeUp');
      }
      if (state.phase === SpikePhase.Warn) {
        const half = TILE_SIZE / 2 - 3;
        this.telegraph.lineStyle(1, TRAP_VISUAL.warnColor, TRAP_VISUAL.warnAlpha).strokeRect(live.at.x - half, live.at.y - half, half * 2, half * 2);
      }
      if (state.phase !== SpikePhase.Up) continue;
      const cycle = spikeCycleIndex(config.timing, offset, now);
      const group = live.plate.group;
      for (const player of party.living) {
        const playerTile = DungeonView.worldToTile(player.x, player.y);
        const hits = this.playerHitCycle.get(player) ?? new Map<number, number>();
        if (playerTile.x !== live.plate.tile.x || playerTile.y !== live.plate.tile.y || hits.get(group) === cycle) continue;
        const hit = { damage: this.spikeDamage, knockback: knockbackFrom(live.at, player, config.knockback) };
        if (player.takeHit(hit, now)) {
          hits.set(group, cycle);
          this.playerHitCycle.set(player, hits);
          this.deps.onPlayerHit(player);
        }
      }
      for (const enemy of this.deps.enemies()) {
        const tile = DungeonView.worldToTile(enemy.x, enemy.y);
        if (tile.x !== live.plate.tile.x || tile.y !== live.plate.tile.y || enemy.isDead) continue;
        const hits = this.enemyHitCycle.get(enemy) ?? new Map<number, number>();
        if (hits.get(group) === cycle) continue;
        hits.set(group, cycle);
        this.enemyHitCycle.set(enemy, hits);
        enemy.takeHit({ damage: this.spikeDamage, knockback: knockbackFrom(live.at, enemy, config.knockback) }, now, live.at);
      }
    }
  }

  private updateDarts(now: number): void {
    const darts = this.deps.darts;
    if (!darts) return;
    const { party, projectiles } = this.deps;
    const tiles = party.living.map((player) => DungeonView.worldToTile(player.x, player.y));
    for (const live of this.darts) {
      // Płytę naciska którykolwiek żywy bohater.
      const onPlate = tiles.some((tile) => tile.x === live.trap.plate.x && tile.y === live.trap.plate.y);
      const shots = live.state.update(onPlate, now);
      const phase = live.state.phase;
      if (phase !== live.phase) {
        live.phase = phase;
        play(live.plateSprite, phase === DartTrapPhase.Ready ? 'plate' : 'platePressed');
        play(live.shooterSprite, phase === DartTrapPhase.Armed || phase === DartTrapPhase.Firing ? 'shooterArmed' : 'shooter');
      }
      if (phase === DartTrapPhase.Armed) {
        this.telegraph.lineStyle(2, TRAP_VISUAL.warnColor, TRAP_VISUAL.lineAlpha).lineBetween(live.origin.x, live.origin.y, live.lineEnd.x, live.lineEnd.y);
      }
      const { config } = darts;
      const length = Math.hypot(live.lineEnd.x - live.origin.x, live.lineEnd.y - live.origin.y);
      for (let i = 0; i < shots; i++) {
        projectiles.fire({
          origin: live.origin,
          direction: live.trap.direction,
          speed: config.speed,
          damage: this.dartDamage,
          knockback: config.knockback,
          lifetimeMs: (length / config.speed) * 1000 + 100,
          visual: { texture: SPRITE_SHEETS[TRAP_VISUAL.dart].key, animation: animationKey(TRAP_VISUAL.dart, 'fly') },
          rotation: Math.atan2(live.trap.direction.y, live.trap.direction.x),
        });
      }
    }
  }
}

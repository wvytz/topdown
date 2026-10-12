import Phaser from 'phaser';
import type {
  DeathSummary,
  FloorSceneData,
  HudData,
  HudSceneData,
  HudSource,
  HudToast,
  Vector2,
} from '@/core/types';
import { SceneKey } from '@/core/types';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { LootDrop, LootTable } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { CAMERA_CONFIG, PLAYER_BASE_STATS, getDungeonConfigForFloor } from '@/config/gameConfig';
import { PLAYER_COMBAT, getEncounterConfigForFloor } from '@/config/combatConfig';
import {
  BOSS_LOOT,
  ENEMY_LOOT,
  HIGHSCORE_CONFIG,
  ITEM_DEFINITIONS,
  ITEM_POOL,
  LOOT_SCALING,
  STAT_LIMITS,
} from '@/config/lootConfig';
import { BossFight } from '@/combat/BossFight';
import { EnemyManager } from '@/combat/EnemyManager';
import { LootManager } from '@/combat/LootManager';
import { ProjectileManager } from '@/combat/ProjectileManager';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { DungeonView } from '@/dungeon/DungeonView';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import { CombatEffects } from '@/effects/CombatEffects';
import { InputController } from '@/input/InputController';
import { Player } from '@/entities/Player';
import { rollLoot } from '@/systems/Loot';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { computeLoadout } from '@/systems/PlayerLoadout';
import { NEW_RUN, RunState } from '@/systems/RunState';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { ShrineSite } from '@/world/ShrineSite';

/** Sole dla RNG — każdy system losuje ze swojego strumienia, niezależnie od pozostałych. */
const ENCOUNTER_SEED_SALT = 0xe11e;
const LOOT_SEED_SALT = 0x1007;
const SHRINE_SEED_SALT = 0x5419;
const TOAST_DURATION_MS = 2500;

export class GameScene extends Phaser.Scene implements HudSource {
  private player!: Player;
  private inputController!: InputController;
  private dungeon!: DungeonFloor;
  private dungeonView!: DungeonView;
  private enemies!: EnemyManager;
  private projectiles!: ProjectileManager;
  private bossFight!: BossFight;
  private loot!: LootManager;
  private lootRng!: Rng;
  private effects!: CombatEffects;
  private run = new RunState(NEW_RUN);
  private startHp: number | null = null;
  private toast: { text: string; at: number } | null = null;
  private death: DeathSummary | null = null;
  private shrine!: ShrineSite;
  private readonly highscores = new HighscoreStorage(
    HighscoreStorage.browserStorage(),
    HIGHSCORE_CONFIG.maxEntries,
    HIGHSCORE_CONFIG.podiumSize,
  );
  private runSeed = 0;
  private floorNumber = 1;
  private stairsUnlocked = false;
  private isTransitioning = false;
  private deathHandled = false;

  constructor() {
    super(SceneKey.Game);
  }

  init(data: FloorSceneData): void {
    this.runSeed = data.runSeed;
    this.floorNumber = data.floor;
    this.run = new RunState(data.run);
    this.startHp = data.run.hp;
    this.toast = null;
    this.death = null;
    this.stairsUnlocked = false;
    this.isTransitioning = false;
    this.deathHandled = false;
  }

  create(): void {
    const generator = new DungeonGenerator(getDungeonConfigForFloor(this.floorNumber));
    this.dungeon = generator.generate(deriveSeed(this.runSeed, this.floorNumber));
    this.dungeonView = new DungeonView(this, this.dungeon);

    this.physics.world.setBounds(0, 0, this.dungeonView.widthPx, this.dungeonView.heightPx);

    const spawn = DungeonView.tileToWorldCenter(this.dungeon.playerSpawn);
    this.player = new Player(this, spawn.x, spawn.y, this.currentLoadout(), this.startHp);
    this.physics.add.collider(this.player, this.dungeonView.layer);

    this.setupCombat();
    this.setupLoot();
    this.setupShrine();
    this.inputController = new InputController(this);
    this.setupCamera();
    this.setupDebugKeys();

    if (!this.scene.isActive(SceneKey.Hud)) {
      const hudData: HudSceneData = { source: this };
      this.scene.launch(SceneKey.Hud, hudData);
    }

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  override update(time: number): void {
    if (this.isTransitioning) return;

    const actions = this.inputController.getActions();
    if (this.player.tick(actions, time)) this.resolvePlayerStrike(time);
    this.enemies.update(time);
    this.bossFight.update(time);
    this.projectiles.update(time);
    this.loot.update(time);
    this.shrine.update(actions.interact);

    if (this.player.isDead) this.handlePlayerDeath();
    else this.checkStairs();
  }

  getHudData(): HudData {
    // HUD może odpytać scenę zanim create() zbuduje gracza (np. w trakcie restartu).
    const ready = Boolean(this.player?.active);
    return {
      floor: this.floorNumber,
      hp: ready ? this.player.health.value : 0,
      maxHp: ready ? this.player.health.max : PLAYER_BASE_STATS.maxHp,
      dashReadiness: ready ? this.player.dashReadiness(this.time.now) : 1,
      enemiesAlive: ready ? this.enemies.aliveCount : 0,
      stairsUnlocked: this.stairsUnlocked,
      isPlayerDead: ready && this.player.isDead,
      boss: ready ? this.bossFight.getStatus() : null,
      gold: this.run.gold,
      items: this.run.itemCounts().map(({ id, count }) => ({
        name: ITEM_DEFINITIONS[id].name,
        count,
        color: ITEM_DEFINITIONS[id].color,
      })),
      toast: this.currentToast(),
      death: this.death,
    };
  }

  private currentLoadout(): PlayerLoadout {
    return computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, this.run.items, ITEM_DEFINITIONS, STAT_LIMITS);
  }

  /** Wywoływane po pokonaniu bossa — zamyka pętlę piętra. */
  private unlockStairs(): void {
    if (this.stairsUnlocked) return;
    this.stairsUnlocked = true;
    this.dungeonView.setTile(this.dungeon.stairs, TileType.StairsOpen);
  }

  private resolvePlayerStrike(now: number): void {
    const combat = this.player.combatConfig;
    const swing: MeleeSwing = {
      origin: { x: this.player.x, y: this.player.y },
      angle: this.player.getAimAngle(),
      combat,
      now,
    };
    const arc = Phaser.Math.DegToRad(combat.meleeArcDeg);
    this.effects.slash(swing.origin.x, swing.origin.y, swing.angle, combat.meleeRange, arc);
    this.enemies.resolvePlayerMelee(swing);
    this.bossFight.resolvePlayerMelee(swing);
  }

  private setupCombat(): void {
    this.effects = new CombatEffects(this);
    const onPlayerHit = (): void => this.effects.playerHit();

    this.projectiles = new ProjectileManager(this, this.dungeonView.layer, this.player, onPlayerHit);
    this.enemies = new EnemyManager({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      walls: this.dungeonView.layer,
      player: this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      onPlayerHit,
      onEnemyKilled: (enemy) => this.dropLoot({ x: enemy.x, y: enemy.y }, ENEMY_LOOT[enemy.definition.type]),
    });

    const rng = createRng(deriveSeed(this.dungeon.seed, ENCOUNTER_SEED_SALT));
    this.enemies.spawnAll(planEncounters(this.dungeon, getEncounterConfigForFloor(this.floorNumber), rng));

    this.bossFight = new BossFight({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      walls: this.dungeonView.layer,
      player: this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      onPlayerHit,
      onDefeated: (position) => {
        this.unlockStairs();
        this.dropLoot(position, BOSS_LOOT);
      },
    });
  }

  private setupLoot(): void {
    this.lootRng = createRng(deriveSeed(this.dungeon.seed, LOOT_SEED_SALT));
    this.loot = new LootManager({
      scene: this,
      walls: this.dungeonView.layer,
      player: this.player,
      // Mikstury zostają na ziemi, dopóki gracz ma pełne HP — można po nie wrócić.
      canCollect: (drop) => drop.kind !== PickupKind.Health || !this.player.health.isFull,
      onCollect: (drop, position) => this.collect(drop, position),
    });
  }

  private setupShrine(): void {
    this.shrine = new ShrineSite({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      player: this.player,
      run: this.run,
      rng: createRng(deriveSeed(this.dungeon.seed, SHRINE_SEED_SALT)),
      onBlessing: (itemId, cost) => {
        const item = ITEM_DEFINITIONS[itemId];
        this.player.applyLoadout(this.currentLoadout());
        this.effects.floatingText(this.player.x, this.player.y, `-${cost}`, '#f5c542');
        this.showToast(`Kapliczka: ${item.name} — ${item.effect}`);
      },
    });
  }

  private dropLoot(position: Vector2, table: LootTable): void {
    this.loot.spawn(position, rollLoot(table, this.floorNumber, LOOT_SCALING, ITEM_POOL, this.lootRng));
  }

  private collect(drop: LootDrop, position: Vector2): void {
    switch (drop.kind) {
      case PickupKind.Gold:
        this.run.addGold(drop.amount);
        this.effects.floatingText(position.x, position.y, `+${drop.amount}`, '#f5c542');
        break;
      case PickupKind.Health:
        this.player.heal(drop.amount);
        this.effects.floatingText(position.x, position.y, `+${drop.amount} HP`, '#ff6b8a');
        break;
      case PickupKind.Item: {
        const item = ITEM_DEFINITIONS[drop.itemId];
        this.run.addItem(drop.itemId);
        this.player.applyLoadout(this.currentLoadout());
        this.showToast(`${item.name}: ${item.effect}`);
        break;
      }
    }
  }

  private showToast(text: string): void {
    this.toast = { text, at: this.time.now };
  }

  private currentToast(): HudToast | null {
    if (!this.toast) return null;
    const remainingMs = TOAST_DURATION_MS - (this.time.now - this.toast.at);
    return remainingMs > 0 ? { text: this.toast.text, remainingMs } : null;
  }

  private handlePlayerDeath(): void {
    if (this.deathHandled) return;
    this.deathHandled = true;

    // Złoto w chwili śmierci to wynik runu.
    const entry = { score: this.run.gold, floor: this.floorNumber, timestamp: Date.now() };
    const { rank, board } = this.highscores.record(entry);
    this.death = { score: entry.score, floor: entry.floor, rank, board };

    // Nowa wspinaczka: nowy seed, piętro 1, pusty run.
    this.input.keyboard?.once('keydown-R', () => {
      const fresh: FloorSceneData = { runSeed: (Date.now() ^ this.runSeed) >>> 0, floor: 1, run: NEW_RUN };
      this.scene.restart(fresh);
    });
  }

  private checkStairs(): void {
    if (!this.stairsUnlocked) return;
    const tile = DungeonView.worldToTile(this.player.x, this.player.y);
    if (tile.x === this.dungeon.stairs.x && tile.y === this.dungeon.stairs.y) {
      this.goToNextFloor();
    }
  }

  private goToNextFloor(): void {
    this.isTransitioning = true;
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const next: FloorSceneData = {
        runSeed: this.runSeed,
        floor: this.floorNumber + 1,
        run: this.run.snapshot(this.player.health.value),
      };
      this.scene.restart(next);
    });
  }

  private setupDebugKeys(): void {
    if (!import.meta.env.DEV) return;
    this.input.keyboard?.on('keydown-B', () => this.bossFight.debugDefeat());
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.dungeonView.widthPx, this.dungeonView.heightPx);
    cam.setZoom(CAMERA_CONFIG.zoom);
    cam.startFollow(this.player, true, CAMERA_CONFIG.lerp, CAMERA_CONFIG.lerp);
    cam.setDeadzone(CAMERA_CONFIG.deadzoneWidth, CAMERA_CONFIG.deadzoneHeight);
    cam.roundPixels = true;
  }
}

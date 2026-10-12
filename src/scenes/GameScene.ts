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
import type { ItemId, LootDrop, LootTable } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { CAMERA_CONFIG, PLAYER_BASE_STATS, getDungeonConfigForFloor } from '@/config/gameConfig';
import { PLAYER_COMBAT, getEncounterConfigForFloor } from '@/config/combatConfig';
import {
  BOSS_LOOT,
  BOSS_REWARD,
  ENEMY_LOOT,
  HIGHSCORE_CONFIG,
  ITEM_DEFINITIONS,
  ITEM_EFFECTS,
  ITEM_POOL,
  LOOT_SCALING,
  SHRINE_CONFIG,
  STAT_LIMITS,
} from '@/config/lootConfig';
import { BossFight } from '@/combat/BossFight';
import { EnemyManager } from '@/combat/EnemyManager';
import { LootManager } from '@/combat/LootManager';
import { PlayerShotManager } from '@/combat/PlayerShotManager';
import { ProjectileManager } from '@/combat/ProjectileManager';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { DungeonView } from '@/dungeon/DungeonView';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import { CombatEffects } from '@/effects/CombatEffects';
import { InputController } from '@/input/InputController';
import { Player } from '@/entities/Player';
import { rollLoot } from '@/systems/Loot';
import { rollItemChoices } from '@/systems/RewardChoice';
import type { RewardSceneData } from '@/scenes/RewardScene';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { computeLoadout } from '@/systems/PlayerLoadout';
import { Timer } from '@/systems/Timer';
import { NEW_RUN, RunState } from '@/systems/RunState';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import type { FloorModifierDefinition, FloorModifierEffects } from '@/core/floorModifierTypes';
import { FLOOR_MODIFIER_CONFIG, FLOOR_MODIFIER_POOL } from '@/config/floorModifierConfig';
import { DarknessOverlay } from '@/effects/DarknessOverlay';
import {
  NO_FLOOR_EFFECTS,
  applyFloorToEnemyLoot,
  applyFloorToLoadout,
  applyFloorToShrine,
  floorEffectsOf,
  floorModifierFor,
} from '@/systems/FloorModifiers';
import { ArenaGates } from '@/world/ArenaGates';
import { ShrineSite } from '@/world/ShrineSite';

/** Sole dla RNG — każdy system losuje ze swojego strumienia, niezależnie od pozostałych. */
const ENCOUNTER_SEED_SALT = 0xe11e;
const LOOT_SEED_SALT = 0x1007;
const SHRINE_SEED_SALT = 0x5419;
const REWARD_SEED_SALT = 0x4e3a;
const TOAST_DURATION_MS = 2500;
/** Komunikat o modyfikatorze piętra wisi dłużej — to ważna informacja na start piętra. */
const FLOOR_MODIFIER_TOAST_MS = 4500;

export class GameScene extends Phaser.Scene implements HudSource {
  private player!: Player;
  private inputController!: InputController;
  private dungeon!: DungeonFloor;
  private dungeonView!: DungeonView;
  private enemies!: EnemyManager;
  private projectiles!: ProjectileManager;
  private playerShots!: PlayerShotManager;
  private bossFight!: BossFight;
  private loot!: LootManager;
  private lootRng!: Rng;
  private effects!: CombatEffects;
  private run = new RunState(NEW_RUN);
  private startHp: number | null = null;
  private toast: { text: string; at: number; durationMs: number } | null = null;
  private floorModifier: FloorModifierDefinition | null = null;
  private floorEffects: FloorModifierEffects = NO_FLOOR_EFFECTS;
  private darkness: DarknessOverlay | null = null;
  private death: DeathSummary | null = null;
  private shrine!: ShrineSite;
  private arenaGates!: ArenaGates;
  /** Cele trafione Burzowym pędem w dashu o numerze `dashHitsFor`. */
  private dashHits = new Set<object>();
  private dashHitsFor = -1;
  /** Wampirzy kieł: odstęp między leczeniami za cios. */
  private healCooldown = new Timer();
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
    this.dashHits = new Set();
    this.dashHitsFor = -1;
    this.healCooldown = new Timer();
  }

  create(): void {
    const generator = new DungeonGenerator(getDungeonConfigForFloor(this.floorNumber));
    this.dungeon = generator.generate(deriveSeed(this.runSeed, this.floorNumber));
    this.dungeonView = new DungeonView(this, this.dungeon);
    this.floorModifier = floorModifierFor(this.runSeed, this.floorNumber, FLOOR_MODIFIER_POOL, FLOOR_MODIFIER_CONFIG);
    this.floorEffects = floorEffectsOf(this.floorModifier);

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

    const vision = this.floorEffects.visionRadius;
    this.darkness = vision !== null ? new DarknessOverlay(this, vision) : null;
    this.darkness?.follow(this.player);

    if (!this.scene.isActive(SceneKey.Hud)) {
      const hudData: HudSceneData = { source: this };
      this.scene.launch(SceneKey.Hud, hudData);
    }

    if (this.floorModifier) {
      this.showToast(`${this.floorModifier.name}: ${this.floorModifier.description}`, FLOOR_MODIFIER_TOAST_MS);
    }
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  override update(time: number): void {
    if (this.isTransitioning) return;

    const actions = this.inputController.getActions();
    const turn = this.player.tick(actions, time);
    if (turn.struck) this.resolvePlayerStrike(time);
    if (turn.shot) {
      const { x, y, combatConfig, effects } = this.player;
      this.playerShots.fire({ x, y }, turn.shot, combatConfig.ranged, effects);
    }
    this.resolveDashStrike(time);
    this.enemies.update(time);
    this.bossFight.update(time);
    this.arenaGates.update();
    this.projectiles.update(time);
    this.playerShots.update(time, (shot) => this.enemies.resolvePlayerShot(shot) ?? this.bossFight.resolvePlayerShot(shot));
    this.loot.update(time);
    this.shrine.update(actions.interact);
    this.darkness?.follow(this.player);

    if (this.player.isDead) this.handlePlayerDeath();
    else this.checkStairs();
  }

  getHudData(): HudData {
    // HUD może odpytać scenę zanim create() zbuduje gracza (np. w trakcie restartu).
    const ready = Boolean(this.player?.active);
    return {
      floor: this.floorNumber,
      floorModifier: this.floorModifier && { name: this.floorModifier.name, description: this.floorModifier.description },
      hp: ready ? this.player.health.value : 0,
      maxHp: ready ? this.player.health.max : PLAYER_BASE_STATS.maxHp,
      dashReadiness: ready ? this.player.dashReadiness(this.time.now) : 1,
      ranged: ready
        ? this.player.rangedStatus(this.time.now)
        : { charges: PLAYER_COMBAT.ranged.maxCharges, maxCharges: PLAYER_COMBAT.ranged.maxCharges, rechargeProgress: 1 },
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
    const loadout = computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, this.run.items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);
    return applyFloorToLoadout(loadout, this.floorEffects);
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
      status: this.player.effects.meleeStatus,
    };
    const arc = Phaser.Math.DegToRad(combat.meleeArcDeg);
    this.effects.slash(swing.origin.x, swing.origin.y, swing.angle, combat.meleeRange, arc);
    const hits = this.enemies.resolvePlayerMelee(swing) + this.bossFight.resolvePlayerMelee(swing);

    // Wampirzy kieł: leczenie za cios, który trafił (raz na cios, niezależnie od liczby celów),
    // najwyżej raz na meleeHealCooldownMs.
    const { meleeHeal: heal, meleeHealCooldownMs } = this.player.effects;
    if (hits > 0 && heal > 0 && !this.player.health.isFull && !this.healCooldown.isActive(now)) {
      this.healCooldown.start(now, meleeHealCooldownMs);
      this.player.heal(heal);
      this.effects.floatingText(this.player.x, this.player.y - 14, `+${heal}`, '#ff6b8a');
    }
  }

  /** Burzowy pęd: w trakcie dasha gracz rani dotkniętych wrogów (każdego raz na dash). */
  private resolveDashStrike(now: number): void {
    const damage = this.player.effects.dashDamage;
    if (damage <= 0 || !this.player.isDashing(now)) return;
    if (this.dashHitsFor !== this.player.dashId) {
      this.dashHitsFor = this.player.dashId;
      this.dashHits = new Set();
    }
    const sweep = { center: { x: this.player.x, y: this.player.y }, radius: this.player.radius, damage, now };
    this.enemies.resolveDashSweep(sweep, this.dashHits);
    this.bossFight.resolveDashSweep(sweep, this.dashHits);
  }

  private setupCombat(): void {
    this.effects = new CombatEffects(this);
    const onPlayerHit = (): void => this.effects.playerHit();

    this.projectiles = new ProjectileManager(this, this.dungeonView.layer, this.player, onPlayerHit);
    this.playerShots = new PlayerShotManager(this, this.dungeonView.layer);
    this.enemies = new EnemyManager({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      floorEffects: this.floorEffects,
      walls: this.dungeonView.layer,
      player: this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      onPlayerHit,
      onEnemyKilled: (enemy) =>
        this.dropLoot({ x: enemy.x, y: enemy.y }, applyFloorToEnemyLoot(ENEMY_LOOT[enemy.definition.type], this.floorEffects)),
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
        this.offerBossReward();
      },
    });

    this.arenaGates = new ArenaGates({
      scene: this,
      floor: this.dungeon,
      view: this.dungeonView,
      player: this.player,
      effects: this.effects,
      isBossFighting: () => this.bossFight.isFighting,
      isBossDefeated: () => this.bossFight.isDefeated,
      onSealed: () => this.showToast('Kraty opadły — nie ma odwrotu!'),
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
      config: applyFloorToShrine(SHRINE_CONFIG, this.floorEffects),
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
      case PickupKind.Item:
        this.grantItem(drop.itemId);
        break;
    }
  }

  private grantItem(itemId: ItemId): void {
    const item = ITEM_DEFINITIONS[itemId];
    this.run.addItem(itemId);
    this.player.applyLoadout(this.currentLoadout());
    this.showToast(`${item.name}: ${item.effect}`);
  }

  /** Nagroda za bossa: gra staje, gracz wybiera 1 z kart. Po wyborze gra rusza dalej. */
  private offerBossReward(): void {
    const rng = createRng(deriveSeed(this.dungeon.seed, REWARD_SEED_SALT));
    const choices = rollItemChoices(ITEM_POOL, BOSS_REWARD.choices, rng);
    if (choices.length === 0) return;

    const owned: Partial<Record<ItemId, number>> = {};
    for (const { id, count } of this.run.itemCounts()) owned[id] = count;

    const data: RewardSceneData = {
      choices,
      owned,
      onPick: (itemId) => {
        this.scene.resume(SceneKey.Game);
        this.grantItem(itemId);
      },
    };
    this.scene.pause();
    this.scene.launch(SceneKey.Reward, data);
  }

  private showToast(text: string, durationMs = TOAST_DURATION_MS): void {
    this.toast = { text, at: this.time.now, durationMs };
  }

  private currentToast(): HudToast | null {
    if (!this.toast) return null;
    const remainingMs = this.toast.durationMs - (this.time.now - this.toast.at);
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

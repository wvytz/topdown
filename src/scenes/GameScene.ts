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
import type { TilesetMeta } from '@/core/tilesetTypes';
import type { ItemId, LootDrop, LootTable } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import { EnemyType } from '@/core/combatTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { CAMERA_CONFIG, getDungeonConfigForFloor } from '@/config/gameConfig';
import type { TilesetAsset } from '@/config/tilesetConfig';
import type { BiomeDefinition } from '@/config/biomeConfig';
import { biomeForFloor } from '@/config/biomeConfig';
import { getEncounterConfigForFloor } from '@/config/combatConfig';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SORCERESS_ORB_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import type { BeamStrike } from '@/systems/Sorcery';
import { beamReach, crystalPoint } from '@/systems/Sorcery';
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
import { CeilingDropManager } from '@/combat/CeilingDropManager';
import { CocoonManager } from '@/combat/CocoonManager';
import { PuffballManager } from '@/combat/PuffballManager';
import { EnemyManager } from '@/combat/EnemyManager';
import { LootManager } from '@/combat/LootManager';
import { PlayerShotManager } from '@/combat/PlayerShotManager';
import { ProjectileManager } from '@/combat/ProjectileManager';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { DungeonView } from '@/dungeon/DungeonView';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import { isStairsTile } from '@/dungeon/stairs';
import { dressFloor } from '@/dungeon/FloorDressing';
import { CombatEffects } from '@/effects/CombatEffects';
import { InputController } from '@/input/InputController';
import { Player } from '@/entities/Player';
import { rollLoot } from '@/systems/Loot';
import { rollItemChoices } from '@/systems/RewardChoice';
import type { RewardSceneData } from '@/scenes/RewardScene';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';
import { Timer } from '@/systems/Timer';
import { NEW_RUN, RunState, newRun } from '@/systems/RunState';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { SharedHighscores } from '@/persistence/SharedHighscores';
import { createRemoteScoreSource } from '@/persistence/remoteScores';
import { PlayerName } from '@/persistence/PlayerName';
import type { ScoreEntry } from '@/systems/Highscores';
import { isNameChar, sanitizePlayerName } from '@/systems/Highscores';
import type { FloorModifierDefinition, FloorModifierEffects } from '@/core/floorModifierTypes';
import { FLOOR_MODIFIER_CONFIG, FLOOR_MODIFIER_POOL } from '@/config/floorModifierConfig';
import { DustMotes } from '@/effects/DustMotes';
import { FogWisps } from '@/effects/FogWisps';
import { LightingOverlay } from '@/effects/LightingOverlay';
import { hexColor } from '@/effects/lightTextures';
import { LIGHTING, TORCH_PLACEMENT } from '@/config/lightingConfig';
import { planTorches } from '@/dungeon/LightPlanner';
import type { TorchSpot } from '@/dungeon/LightPlanner';
import { CombatDecals } from '@/effects/CombatDecals';
import { darknessModifierProfile } from '@/systems/lighting';
import { Torches } from '@/world/Torches';
import { EnemyVisibility } from '@/effects/EnemyVisibility';
import {
  NO_FLOOR_EFFECTS,
  applyFloorToEnemyLoot,
  applyFloorToLoadout,
  applyFloorToShrine,
  floorEffectsOf,
  floorModifierFor,
  limitsVision,
} from '@/systems/FloorModifiers';
import { ArenaGates } from '@/world/ArenaGates';
import { ShrineSite } from '@/world/ShrineSite';
import { StickyWebField } from '@/world/StickyWebField';

/** Sole dla RNG — każdy system losuje ze swojego strumienia, niezależnie od pozostałych. */
const ENCOUNTER_SEED_SALT = 0xe11e;
const LOOT_SEED_SALT = 0x1007;
const SHRINE_SEED_SALT = 0x5419;
const REWARD_SEED_SALT = 0x4e3a;
/** Dekorowanie piętra (czysto wizualne). */
const DRESSING_SEED_SALT = 0xd2e5;
const TORCH_SEED_SALT = 0x7042;
const CEILING_DROP_SEED_SALT = 0xce11;
const COCOON_SEED_SALT = 0xc0c0;
const STICKY_WEB_SEED_SALT = 0x3eb5;
const PUFFBALL_SEED_SALT = 0x9bff;
const TOAST_DURATION_MS = 2500;
/** Komunikat o modyfikatorze piętra wisi dłużej — to ważna informacja na start piętra. */
const FLOOR_MODIFIER_TOAST_MS = 4500;
/** Liczby obrażeń od trucizny nad graczem — zieleń jadu (krok 27). */
const POISON_TEXT_COLOR = '#8cff6a';

export class GameScene extends Phaser.Scene implements HudSource {
  private player!: Player;
  private inputController!: InputController;
  private dungeon!: DungeonFloor;
  private dungeonView!: DungeonView;
  private enemies!: EnemyManager;
  private projectiles!: ProjectileManager;
  private playerShots!: PlayerShotManager;
  private bossFight!: BossFight;
  /** Pająki z sufitu — tylko w biomie, który je ma (krok 23c). */
  private ceilingDrops: CeilingDropManager | null = null;
  /** Kokony na podłodze — tylko w biomie, który je ma (krok 23d). */
  private cocoons: CocoonManager | null = null;
  /** Lepkie pajęczyny na podłodze — tylko w biomie, który je ma (krok 23e). */
  private stickyWebs: StickyWebField | null = null;
  /** Purchawki z trującą chmurą — tylko w biomie, który je ma (krok 28c). */
  private puffballs: PuffballManager | null = null;
  private loot!: LootManager;
  private lootRng!: Rng;
  private effects!: CombatEffects;
  private run = new RunState(NEW_RUN);
  private startHp: number | null = null;
  private toast: { text: string; at: number; durationMs: number } | null = null;
  private floorModifier: FloorModifierDefinition | null = null;
  private floorEffects: FloorModifierEffects = NO_FLOOR_EFFECTS;
  private lighting!: LightingOverlay;
  /** Biom piętra: arkusz kafli, dekorowanie, warianty wrogów. */
  private biome!: BiomeDefinition;
  private torches!: Torches;
  private combatDecals!: CombatDecals;
  private death: DeathSummary | null = null;
  private shrine!: ShrineSite;
  private arenaGates!: ArenaGates;
  /** Cele trafione Burzowym pędem w dashu o numerze `dashHitsFor`. */
  private dashHits = new Set<object>();
  private dashHitsFor = -1;
  /** Wampirzy kieł: odstęp między leczeniami za cios. */
  private healCooldown = new Timer();
  /** Promień Czarodziejki (krok 37) — rysowany co klatkę, gdy świeci. */
  private beamGfx: Phaser.GameObjects.Graphics | null = null;
  private readonly highscores = new SharedHighscores(
    new HighscoreStorage(HighscoreStorage.browserStorage(), HIGHSCORE_CONFIG.maxEntries, HIGHSCORE_CONFIG.podiumSize),
    createRemoteScoreSource(),
    HighscoreStorage.browserStorage(),
    {
      maxEntries: HIGHSCORE_CONFIG.maxEntries,
      podiumSize: HIGHSCORE_CONFIG.podiumSize,
      timeoutMs: HIGHSCORE_CONFIG.remoteTimeoutMs,
      maxOutbox: HIGHSCORE_CONFIG.maxOutbox,
    },
  );
  private readonly playerName = new PlayerName(HighscoreStorage.browserStorage());
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
    // Restart sceny niszczy obiekty — grafika promienia powstanie od nowa.
    this.beamGfx = null;
  }

  create(): void {
    const generator = new DungeonGenerator(getDungeonConfigForFloor(this.floorNumber));
    this.dungeon = generator.generate(deriveSeed(this.runSeed, this.floorNumber));
    const biome = biomeForFloor(this.floorNumber);
    this.biome = biome;
    const tileset = this.cache.json.get(biome.tileset.jsonKey) as TilesetMeta;
    // Pochodnie przed dekorowaniem: detale lica muru omijają kafle z uchwytem.
    const torchSpots = planTorches(this.dungeon, TORCH_PLACEMENT, deriveSeed(this.dungeon.seed, TORCH_SEED_SALT));
    const dressed = dressFloor(this.dungeon, tileset, biome.dressing, deriveSeed(this.dungeon.seed, DRESSING_SEED_SALT), {
      torches: torchSpots,
    });
    this.dungeonView = new DungeonView(this, this.dungeon, dressed, tileset, biome.tileset);
    this.combatDecals = new CombatDecals(this, this.dungeon, biome.tileset, tileset, biome.dressing.combatDecals);
    // Piętro z mgłą (krok 28a) nie losuje „Mroku” — dwa ograniczenia widoku naraz byłyby nieczytelne.
    this.floorModifier = floorModifierFor(
      this.runSeed,
      this.floorNumber,
      FLOOR_MODIFIER_POOL,
      FLOOR_MODIFIER_CONFIG,
      (floor, modifier) => biomeForFloor(floor).fog === null || !limitsVision(modifier),
    );
    this.floorEffects = floorEffectsOf(this.floorModifier);

    this.physics.world.setBounds(0, 0, this.dungeonView.widthPx, this.dungeonView.heightPx);

    const spawn = DungeonView.tileToWorldCenter(this.dungeon.playerSpawn);
    this.player = new Player(this, spawn.x, spawn.y, this.run.hero, this.currentLoadout(), this.startHp);
    this.physics.add.collider(this.player, this.dungeonView.collisionLayer);

    this.setupCombat();
    this.setupLoot();
    this.setupShrine();
    this.inputController = new InputController(this);
    this.setupCamera();
    this.setupDebugKeys();

    this.setupLighting(biome.tileset, tileset, torchSpots);

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
    if (turn.poisonDamage > 0) {
      this.effects.floatingText(this.player.x, this.player.y - this.player.radius, `-${turn.poisonDamage}`, POISON_TEXT_COLOR);
    }
    if (turn.struck) this.resolvePlayerStrike(time);
    if (turn.shot) {
      const { x, y, combatConfig, effects } = this.player;
      this.playerShots.fire({ x, y }, turn.shot, combatConfig.ranged, effects);
    }
    if (turn.orb) this.fireOrb(turn.orb);
    this.updateBeam(turn.beam, turn.beamTicks, time);
    this.resolveDashStrike(time);
    this.enemies.update(time);
    this.ceilingDrops?.update(time);
    this.cocoons?.update(time);
    this.stickyWebs?.update(time);
    this.puffballs?.update(time);
    this.bossFight.update(time);
    this.arenaGates.update();
    this.projectiles.update(time);
    this.playerShots.update(
      time,
      (shot) => {
        const target =
          this.enemies.resolvePlayerShot(shot) ?? this.bossFight.resolvePlayerShot(shot) ?? this.cocoons?.resolvePlayerShot(shot) ?? this.puffballs?.resolvePlayerShot(shot) ?? null;
        if (target && shot.vampiric) this.tryVampireHeal(time);
        return target;
      },
    );
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
      floorModifier: this.floorModifier && { name: this.floorModifier.name, description: this.floorModifier.description },
      hp: ready ? this.player.health.value : 0,
      maxHp: ready ? this.player.health.max : this.hero.stats.maxHp,
      dashReadiness: ready ? this.player.dashReadiness(this.time.now) : 1,
      ranged: ready
        ? this.player.rangedStatus(this.time.now)
        : { charges: this.heroCharges, maxCharges: this.heroCharges, rechargeProgress: 1 },
      beam: ready ? this.player.beamStatus(this.time.now) : null,
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
    const loadout = computeHeroLoadout(this.hero, this.run.items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);
    return applyFloorToLoadout(loadout, this.floorEffects);
  }

  private get hero() {
    return HERO_DEFINITIONS[this.run.hero];
  }

  /** Segmenty HUD przed zbudowaniem gracza: kule Czarodziejki albo ładunki strzału. */
  private get heroCharges(): number {
    return this.hero.sorcery?.orbs.maxOrbs ?? this.hero.combat.ranged.maxCharges;
  }

  /** Kula Czarodziejki wylatuje z kryształu; niesie wszystkie efekty broni z przedmiotów. */
  private fireOrb(direction: Vector2): void {
    const orbs = this.player.sorceryConfig?.orbs;
    if (!orbs) return;
    const { effects } = this.player;
    const origin = crystalPoint(this.player, Math.atan2(direction.y, direction.x), orbs.forwardOffset, orbs.sideOffset);
    this.playerShots.fire(
      origin,
      direction,
      {
        damage: orbs.damage,
        knockback: orbs.knockback,
        projectileSpeed: orbs.speed,
        projectileLifetimeMs: orbs.lifetimeMs,
        projectileRadius: orbs.radius,
      },
      effects,
      {
        texture: SPRITE_SHEETS[SORCERESS_ORB_VISUAL.sheet].key,
        animation: animationKey(SORCERESS_ORB_VISUAL.sheet, SORCERESS_ORB_VISUAL.animation),
        status: { ...effects.shotStatus, ...effects.meleeStatus },
        vampiric: effects.meleeHeal > 0,
      },
    );
  }

  /** Promień Czarodziejki: rysunek co klatkę, obrażenia w klatkach z tickiem; zatrzymuje się na ścianie. */
  private updateBeam(active: boolean, ticks: number, now: number): void {
    const config = this.player.sorceryConfig?.beam;
    if (!active || !config) {
      this.beamGfx?.clear();
      return;
    }
    const angle = this.player.getAimAngle();
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const from = crystalPoint(this.player, angle, config.forwardOffset, config.sideOffset);
    const walls = this.dungeonView.collisionLayer;
    const blocked = (p: Vector2): boolean => walls.getTileAtWorldXY(p.x, p.y)?.collides ?? false;
    const length = blocked(from) ? 0 : beamReach(from, angle, config.range, blocked);
    const to = { x: from.x + dir.x * length, y: from.y + dir.y * length };
    this.drawBeam(from, to);
    for (let i = 0; i < ticks; i++) {
      const beam: BeamStrike = {
        from,
        to,
        halfWidth: config.halfWidth,
        damage: config.damagePerTick,
        knockback: config.knockback,
        now,
        source: { x: this.player.x, y: this.player.y },
      };
      this.enemies.resolvePlayerBeam(beam);
      this.bossFight.resolvePlayerBeam(beam);
      this.cocoons?.resolvePlayerBeam(beam);
      this.puffballs?.resolvePlayerBeam(beam);
    }
  }

  /** Promień w kolorach kryształu (pełne kolory, bez przezroczystości); rdzeń migocze tylko wizualnie. */
  private drawBeam(from: Vector2, to: Vector2): void {
    const gfx = this.beamGfx ?? (this.beamGfx = this.add.graphics().setDepth(RENDER_DEPTH.slash));
    const core = Math.random() < 0.5 ? 1 : 2;
    gfx.clear();
    gfx.lineStyle(5, 0x1d7f9c, 1).lineBetween(from.x, from.y, to.x, to.y);
    gfx.lineStyle(3, 0x39c0d8, 1).lineBetween(from.x, from.y, to.x, to.y);
    gfx.lineStyle(core, 0xe4fbfb, 1).lineBetween(from.x, from.y, to.x, to.y);
    gfx.fillStyle(0x8ae6ef, 1).fillCircle(to.x, to.y, 3);
    gfx.fillStyle(0xe4fbfb, 1).fillCircle(from.x, from.y, 2);
  }

  /** Wampirzy kieł: leczenie za trafienie (raz na cios lub kulę), najwyżej raz na meleeHealCooldownMs. */
  private tryVampireHeal(now: number): void {
    const { meleeHeal: heal, meleeHealCooldownMs } = this.player.effects;
    if (heal <= 0 || this.player.health.isFull || this.healCooldown.isActive(now)) return;
    this.healCooldown.start(now, meleeHealCooldownMs);
    this.player.heal(heal);
    this.effects.floatingText(this.player.x, this.player.y - 14, `+${heal}`, '#ff6b8a');
  }

  /** Wywoływane po pokonaniu bossa — zamyka pętlę piętra. */
  private unlockStairs(): void {
    if (this.stairsUnlocked) return;
    this.stairsUnlocked = true;
    this.dungeonView.openStairs();
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
    const hits =
      this.enemies.resolvePlayerMelee(swing) + this.bossFight.resolvePlayerMelee(swing) + (this.cocoons?.resolvePlayerMelee(swing) ?? 0) +
      (this.puffballs?.resolvePlayerMelee(swing) ?? 0);

    // Wampirzy kieł: leczenie za cios, który trafił (raz na cios, niezależnie od liczby celów).
    if (hits > 0) this.tryVampireHeal(now);
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
    this.cocoons?.resolveDashSweep(sweep, this.dashHits);
    this.puffballs?.resolveDashSweep(sweep, this.dashHits);
  }

  private setupCombat(): void {
    this.effects = new CombatEffects(this);
    const onPlayerHit = (): void => this.effects.playerHit();

    this.projectiles = new ProjectileManager(this, this.dungeonView.collisionLayer, this.player, onPlayerHit, this.combatDecals);
    this.playerShots = new PlayerShotManager(this, this.dungeonView.collisionLayer);
    this.enemies = new EnemyManager({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      floorEffects: this.floorEffects,
      enemyVariants: this.biome.enemyVariants,
      walls: this.dungeonView.collisionLayer,
      player: this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      decals: this.combatDecals,
      onPlayerHit,
      onEnemyKilled: (enemy) =>
        this.dropLoot({ x: enemy.x, y: enemy.y }, applyFloorToEnemyLoot(ENEMY_LOOT[enemy.definition.type], this.floorEffects)),
    });

    const rng = createRng(deriveSeed(this.dungeon.seed, ENCOUNTER_SEED_SALT));
    this.enemies.spawnAll(planEncounters(this.dungeon, getEncounterConfigForFloor(this.floorNumber), rng));

    const drops = this.biome.ceilingDrops;
    this.ceilingDrops = drops
      ? new CeilingDropManager({
          scene: this,
          floor: this.dungeon,
          floorNumber: this.floorNumber,
          config: drops,
          rng: createRng(deriveSeed(this.dungeon.seed, CEILING_DROP_SEED_SALT)),
          player: this.player,
          enemies: this.enemies,
          effects: this.effects,
          onPlayerHit,
        })
      : null;

    const cocoons = this.biome.cocoons;
    this.cocoons = cocoons
      ? new CocoonManager({
          scene: this,
          floor: this.dungeon,
          floorNumber: this.floorNumber,
          config: cocoons,
          rng: createRng(deriveSeed(this.dungeon.seed, COCOON_SEED_SALT)),
          walls: this.dungeonView.collisionLayer,
          player: this.player,
          effects: this.effects,
          decals: this.combatDecals,
          onPlayerHit,
        })
      : null;

    const webs = this.biome.stickyWebs;
    this.stickyWebs = webs
      ? new StickyWebField({
          scene: this,
          floor: this.dungeon,
          config: webs,
          rng: createRng(deriveSeed(this.dungeon.seed, STICKY_WEB_SEED_SALT)),
          player: this.player,
          avoid: this.cocoons?.tiles ?? [],
        })
      : null;

    const puffballs = this.biome.puffballs;
    this.puffballs = puffballs
      ? new PuffballManager({
          scene: this,
          floor: this.dungeon,
          config: puffballs,
          rng: createRng(deriveSeed(this.dungeon.seed, PUFFBALL_SEED_SALT)),
          player: this.player,
        })
      : null;

    this.bossFight = new BossFight({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      walls: this.dungeonView.collisionLayer,
      player: this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      decals: this.combatDecals,
      onPlayerHit,
      spawnRusher: (at) => {
        this.enemies.spawnAt(EnemyType.Rusher, at);
      },
      onDefeated: (position) => {
        this.unlockStairs();
        this.dropLoot(position, BOSS_LOOT);
        // Animacja śmierci bossa trwa chwilę — gracz mógł w tym czasie zginąć (np. od pocisku w locie).
        if (!this.player.isDead) this.offerBossReward();
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
      walls: this.dungeonView.collisionLayer,
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
    const base: ScoreEntry = { score: this.run.gold, floor: this.floorNumber, timestamp: Date.now() };
    const remembered = this.playerName.load();
    if (remembered) {
      this.recordDeath({ ...base, name: remembered });
      return;
    }

    // Pierwsza śmierć bez imienia: panel czeka na wpisanie imienia (Enter zapisuje, Esc pomija).
    const maxLength = HIGHSCORE_CONFIG.nameMaxLength;
    let typed = '';
    this.death = { score: base.score, floor: base.floor, rank: 0, board: { top: [], current: null }, source: 'local', nameEntry: '' };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        this.input.keyboard?.off('keydown', onKey);
        const name = event.key === 'Enter' ? sanitizePlayerName(typed, maxLength) : '';
        if (name) this.playerName.save(name);
        this.recordDeath(name ? { ...base, name } : base);
        return;
      }
      if (event.key === 'Backspace') typed = [...typed].slice(0, -1).join('');
      else if (isNameChar(event.key) && [...typed].length < maxLength) typed += event.key;
      if (this.death) this.death = { ...this.death, nameEntry: typed };
    };
    this.input.keyboard?.on('keydown', onKey);
  }

  /** Zapis wyniku (lokalnie od razu, wspólnie w tle) i czekanie na R. */
  private recordDeath(entry: ScoreEntry): void {
    const { rank, board } = this.highscores.record(entry);
    const death: DeathSummary = { score: entry.score, floor: entry.floor, rank, board, source: 'local', nameEntry: null };
    this.death = death;
    if (this.highscores.hasRemote) {
      this.death = { ...death, source: 'pending' };
      void this.highscores.recordShared(entry).then((shared) => {
        // Scena mogła już ruszyć z nową wspinaczką — podmieniamy tylko panel tej śmierci.
        if (this.death?.board !== board) return;
        this.death = shared ? { ...death, rank: shared.rank, board: shared.board, source: 'shared' } : death;
      });
    }

    // Nowa wspinaczka: nowy seed, piętro 1, pusty run.
    this.input.keyboard?.once('keydown-R', () => {
      // Ten sam bohater co w zakończonym runie.
      const fresh: FloorSceneData = { runSeed: (Date.now() ^ this.runSeed) >>> 0, floor: 1, run: newRun(this.run.hero) };
      this.scene.restart(fresh);
    });
  }

  private checkStairs(): void {
    if (!this.stairsUnlocked) return;
    const tile = DungeonView.worldToTile(this.player.x, this.player.y);
    if (isStairsTile(this.dungeon, tile)) {
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

  /**
   * Światło (krok 19a): mrok z winietą, pochodnie, pyłki. Przy modyfikatorze „Mrok” warstwa
   * mroku jest prawie nieprzezroczysta, a pochodnie świecą tylko jako punkty (nie rozświetlają mroku).
   * Biom z mgłą (krok 28a, Grzybnia): ta sama warstwa w kolorze mgły, z profilem mgły; latarnie ją
   * rozwiewają, dochodzą dryfujące obłoczki i gęstsze zarodniki. „Mrok” ma pierwszeństwo przed mgłą.
   * W „Mroku” i we mgle wrogowie pokazują się dopiero w świetle (krok 30).
   */
  private setupLighting(asset: TilesetAsset, tileset: TilesetMeta, torchSpots: readonly TorchSpot[]): void {
    const vision = this.floorEffects.visionRadius;
    const fog = vision === null ? this.biome.fog : null;
    const profile = vision !== null ? darknessModifierProfile(vision, LIGHTING.darknessModifier) : (fog?.profile ?? LIGHTING.ambient);
    const color = fog?.color ?? hexColor(tileset.colors.ambient);
    this.torches = new Torches(this, torchSpots, asset, tileset, { glow: vision === null });
    this.lighting = new LightingOverlay(this, profile, color, vision === null);
    new DustMotes(this, tileset.colors.ash.map(hexColor), fog?.motes ?? LIGHTING.motes);
    if (fog) new FogWisps(this, fog);
    const torchesLightUp = vision === null;
    const hiding =
      vision !== null || fog
        ? new EnemyVisibility({
            profile,
            revealStrength: LIGHTING.enemyReveal.revealStrength,
            lights: () => (torchesLightUp ? this.torches.lights : []),
            player: this.player,
            actors: () => this.hideableEnemies(),
          })
        : null;
    // Po fizyce: światło gracza i widoczność wrogów nie zostają klatkę za nim.
    const render = () => {
      this.lighting.render(this.player, this.torches.lights);
      hiding?.update();
    };
    render();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, render);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, render));
  }

  /** Wrogowie ukrywani poza światłem: zwykli wrogowie i wszystkie pajączki (bez bossa). */
  private *hideableEnemies(): Iterable<Phaser.GameObjects.Sprite> {
    if (this.enemies) yield* this.enemies.living;
    if (this.cocoons) yield* this.cocoons.spiderlings;
    if (this.bossFight) yield* this.bossFight.minions;
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

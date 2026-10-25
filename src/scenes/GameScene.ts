import Phaser from 'phaser';
import type {
  DeathSummary,
  FloorSceneData,
  HeroSelectData,
  HudData,
  MinimapHudData,
  HudSceneData,
  HudSource,
  HudItemNotice,
  HudToast,
  Vector2,
} from '@/core/types';
import { SceneKey } from '@/core/types';
import { SAVE_TEXT } from '@/config/saveConfig';
import { SaveStorage } from '@/persistence/SaveStorage';
import type { SaveData } from '@/systems/SaveGame';
import { openMainMenu } from '@/scenes/BootScene';
import { RunMode } from '@/core/runMode';
import { FLOOR_SELECT_CONFIG, FLOOR_SELECT_TEXT } from '@/config/floorSelectConfig';
import { BossProgress } from '@/persistence/BossProgress';
import { startFloorInfo, unlocksFloor } from '@/systems/FloorSelect';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import type { TilesetMeta } from '@/core/tilesetTypes';
import type { ItemId, LootDrop, LootTable } from '@/core/lootTypes';
import { ItemKind, PickupKind } from '@/core/lootTypes';
import { itemFrames } from '@/config/spriteConfig';
import { EnemyType } from '@/core/combatTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { CAMERA_CONFIG, STAIRS_SIZE, TILE_SIZE, getDungeonConfigForFloor } from '@/config/gameConfig';
import type { TilesetAsset } from '@/config/tilesetConfig';
import type { BiomeDefinition } from '@/config/biomeConfig';
import { biomeForFloor } from '@/config/biomeConfig';
import { bossForFloor } from '@/config/bossConfig';
import { carveArenaGalleries } from '@/dungeon/ArenaGalleries';
import type { SecretArea } from '@/dungeon/SecretRoom';
import { disguiseFloor, secretArea } from '@/dungeon/SecretRoom';
import { MINIMAP_CONFIG } from '@/config/minimapConfig';
import { PAUSE_CLOCK_KEY, PAUSE_CONFIG } from '@/config/pauseConfig';
import type { PauseReason } from '@/config/pauseConfig';
import { autoPauseEnabled } from '@/systems/PauseClock';
import type { PauseClock } from '@/systems/PauseClock';
import type { PauseSceneData } from '@/scenes/PauseScene';
import { MinimapExplorer } from '@/systems/Minimap';
import { SecretRoomManager } from '@/combat/SecretRoomManager';
import { TrapManager } from '@/combat/TrapManager';
import { AmbushManager } from '@/combat/AmbushManager';
import { AMBUSH_CONFIG } from '@/config/ambushConfig';
import { planAmbushRoom } from '@/dungeon/AmbushPlanner';
import { hasAmbush } from '@/systems/Ambush';
import { BreakableManager } from '@/combat/BreakableManager';
import { planBreakables, planDartTraps, planSpikeStrips } from '@/dungeon/TrapPlanner';
import { getEncounterConfigForFloor } from '@/config/combatConfig';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import {
  ARCHER_ARROW_VISUAL,
  ELITE_VISUAL,
  RETINUE_MARKER_VISUAL,
  SECRET_ROOM_VISUAL,
  SORCERESS_ORB_VISUAL,
  SPRITE_SHEETS,
  animationKey,
} from '@/config/spriteConfig';
import { sorceryOf } from '@/core/heroTypes';
import type { HeroKit } from '@/core/heroTypes';
import { arrowSpec, volleyDirections } from '@/systems/Archery';
import { facingDirection } from '@/systems/Facing';
import type { BeamStrike, OrbSplash } from '@/systems/Sorcery';
import { beamReach, crystalPoint, splashDamage } from '@/systems/Sorcery';
import {
  BOSS_LOOT,
  BREAKABLE_LOOT,
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
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { eliteAffixCount } from '@/systems/TowerLoop';
import { eliteAnnouncement, eliteLoot, isElite, rollElites } from '@/systems/Elites';
import { BossFight } from '@/combat/BossFight';
import { CeilingDropManager } from '@/combat/CeilingDropManager';
import { CocoonManager } from '@/combat/CocoonManager';
import { PuffballManager } from '@/combat/PuffballManager';
import { WallDogManager } from '@/combat/WallDogManager';
import { BrazierManager } from '@/combat/BrazierManager';
import { planShrineLocation } from '@/dungeon/ShrinePlanner';
import { EnemyManager } from '@/combat/EnemyManager';
import { LootManager } from '@/combat/LootManager';
import { PlayerShotManager } from '@/combat/PlayerShotManager';
import type { ShotLook } from '@/combat/PlayerShotManager';
import { ProjectileManager } from '@/combat/ProjectileManager';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { DungeonView } from '@/dungeon/DungeonView';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import { isStairsTile } from '@/dungeon/stairs';
import { dressFloor } from '@/dungeon/FloorDressing';
import { CombatEffects } from '@/effects/CombatEffects';
import type { PlayerInput } from '@/input/playerInput';
import { createPlayerInput } from '@/input/playerInput';
import { bindPadMenu } from '@/input/PadMenuInput';
import { MenuCommand } from '@/systems/gamepadInput';
import { GAMEPAD_CONFIG } from '@/config/gamepadConfig';
import { AIM_ASSIST_MIN_VISIBILITY } from '@/config/touchConfig';
import type { AimTarget } from '@/systems/touchAim';
import { LarderCocoon } from '@/entities/LarderCocoon';
import { Player } from '@/entities/Player';
import type { PlayerActions } from '@/entities/Player';
import { rollLoot } from '@/systems/Loot';
import { rollItemChoices } from '@/systems/RewardChoice';
import type { RewardSceneData } from '@/scenes/RewardScene';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';
import { HealBudget } from '@/systems/HealBudget';
import { Timer } from '@/systems/Timer';
import { NEW_RUN, RunState, newRun } from '@/systems/RunState';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { createBoardHighscores } from '@/persistence/highscoreBoards';
import { PlayerName } from '@/persistence/PlayerName';
import type { ScoreEntry } from '@/systems/Highscores';
import { isNameChar, sanitizePlayerName } from '@/systems/Highscores';
import type { FloorModifierDefinition, FloorModifierEffects } from '@/core/floorModifierTypes';
import { FLOOR_MODIFIER_CONFIG, FLOOR_MODIFIER_POOL } from '@/config/floorModifierConfig';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { UltimateManager } from '@/combat/UltimateManager';
import { applyRage } from '@/systems/Ultimate';
import { BossHeraldEffects } from '@/effects/BossHerald';
import { DustMotes } from '@/effects/DustMotes';
import { BossStallDetector, LimitWatch, StuckDetector, floorConnectivityIssues, reachable } from '@/systems/AnomalyDetectors';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import { sanityIssues } from '@/systems/Diagnostics';
import { InputReplay, canReplay } from '@/systems/InputRecorder';
import { BOSS_HERALD, HERALD_RUMBLE } from '@/config/bossHeraldConfig';
import { FogWisps } from '@/effects/FogWisps';
import { LightingOverlay } from '@/effects/LightingOverlay';
import type { PointLight } from '@/effects/LightingOverlay';
import { hexColor } from '@/effects/lightTextures';
import { LIGHTING, TORCH_PLACEMENT } from '@/config/lightingConfig';
import { planTorches } from '@/dungeon/LightPlanner';
import type { TorchSpot } from '@/dungeon/LightPlanner';
import { CombatDecals } from '@/effects/CombatDecals';
import { darknessModifierProfile } from '@/systems/lighting';
import { Torches } from '@/world/Torches';
import { EnemyVisibility, LIGHT_VISIBILITY_KEY } from '@/effects/EnemyVisibility';
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
import { PlayerContainment } from '@/systems/PlayerContainment';
import { roomContainsTile } from '@/dungeon/rooms';
import { ShrineSite } from '@/world/ShrineSite';
import { StickyWebField } from '@/world/StickyWebField';
import { BOSS_RUSH_CONFIG, BOSS_RUSH_TEXT } from '@/config/bossRushConfig';
import { BossRushArena, arenaLabel, isBossRush } from '@/systems/BossRush';

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
const WALL_DOG_SEED_SALT = 0x4d09;
const BRAZIER_SEED_SALT = 0xb4a2;
const ELITE_SEED_SALT = 0xe117;
const STAIRS_PROMPT = '[E] Wejdź wyżej';
const SECRET_ROOM_SEED_SALT = 0x5ec7;
const SPIKE_SEED_SALT = 0x5b1e;
const AMBUSH_ROOM_SEED_SALT = 0xa3b0;
const AMBUSH_SEED_SALT = 0xa3b1;
const DART_SEED_SALT = 0xda27;
const BREAKABLE_SEED_SALT = 0xb7ea;
const TOAST_DURATION_MS = 2500;
/** Nazwa i efekt zdobytego przedmiotu pod ikonami w HUD (krok 67). */
const ITEM_NOTICE_MS = 3000;
/** Komunikat o modyfikatorze piętra wisi dłużej — to ważna informacja na start piętra. */
const FLOOR_MODIFIER_TOAST_MS = 4500;
/** Liczby obrażeń od trucizny nad graczem — zieleń jadu (krok 27). */
const POISON_TEXT_COLOR = '#8cff6a';

export class GameScene extends Phaser.Scene implements HudSource {
  private player!: Player;
  private inputController!: PlayerInput;
  private dungeon!: DungeonFloor;
  private dungeonView!: DungeonView;
  private enemies!: EnemyManager;
  private projectiles!: ProjectileManager;
  private playerShots!: PlayerShotManager;
  private bossFight!: BossFight;
  /** Ultimate (krok 98); null przed zbudowaniem sceny — szał nie przechodzi na kolejne piętro. */
  private ultimates: UltimateManager | null = null;
  private herald: BossHeraldEffects | null = null;
  /** Pająki z sufitu — tylko w biomie, który je ma (krok 23c). */
  private ceilingDrops: CeilingDropManager | null = null;
  /** Kokony na podłodze — tylko w biomie, który je ma (krok 23d). */
  private cocoons: CocoonManager | null = null;
  /** Lepkie pajęczyny na podłodze — tylko w biomie, który je ma (krok 23e). */
  private stickyWebs: StickyWebField | null = null;
  /** Purchawki z trującą chmurą — tylko w biomie, który je ma (krok 28c). */
  private puffballs: PuffballManager | null = null;
  private wallDogs: WallDogManager | null = null;
  private secretArea: SecretArea | null = null;
  private minimap: MinimapExplorer | null = null;
  private gamePaused = false;
  private secretRoom: SecretRoomManager | null = null;
  private ambushRoomId: number | null = null;
  private ambush: AmbushManager | null = null;
  /** Upiory zasadzki: zawsze widoczne (świecą nad mrokiem), bez łupu. */
  private ambushGhosts = new Set<Phaser.GameObjects.Sprite>();
  private traps: TrapManager | null = null;
  private breakables: BreakableManager | null = null;
  private braziers: BrazierManager | null = null;
  private loot!: LootManager;
  private lootRng!: Rng;
  private effects!: CombatEffects;
  private run = new RunState(NEW_RUN);
  private startHp: number | null = null;
  private toast: { text: string; at: number; durationMs: number } | null = null;
  private itemNotice: { itemId: ItemId; at: number } | null = null;
  private floorModifier: FloorModifierDefinition | null = null;
  private floorEffects: FloorModifierEffects = NO_FLOOR_EFFECTS;
  private lighting!: LightingOverlay;
  /** Biom piętra: arkusz kafli, dekorowanie, warianty wrogów. */
  private biome!: BiomeDefinition;
  private torches!: Torches;
  private combatDecals!: CombatDecals;
  private death: DeathSummary | null = null;
  /**
   * Pad na ekranie śmierci (krok 95): co zrobi A (potwierdzenie), B (wstecz) i Y (dodatkowa), i od kiedy.
   * null — ekran nie czeka na wybór.
   */
  private deathPad: {
    readonly readyAt: number;
    /** Na co czeka ekran: imię (pierwsza śmierć) albo wybór, co dalej. */
    readonly kind: 'name' | 'restart';
    readonly on: (command: MenuCommand) => void;
    /** Tylko przy imieniu: zapis podanego imienia (dotyk — okno przeglądarki); null = bez imienia. */
    readonly submitName?: (name: string | null) => void;
  } | null = null;
  /** Kapliczka piętra; null w arenach bossów (krok 90). */
  private shrine: ShrineSite | null = null;
  private arenaGates!: ArenaGates;
  /** Krok 99: cofa gracza przepchniętego przez mur lub kratę (i poza zamkniętą arenę). */
  private containment!: PlayerContainment;
  /** Wnęki galerii areny (krok 44); pusto, gdy boss piętra ich nie ma. */
  private galleryPosts: readonly TilePoint[] = [];
  /** Wrogowie galerii — zawsze widoczni (za kratą w półmroku byliby niewidzialnym działem). */
  private galleryEnemies = new Set<Phaser.GameObjects.Sprite>();
  /** Cele trafione Burzowym pędem w dashu o numerze `dashHitsFor`. */
  private dashHits = new Set<object>();
  private dashHitsFor = -1;
  /** Wampirzy kieł: odstęp między leczeniami za cios. */
  private healCooldown = new Timer();
  /** Krok 93: sufit leczenia kła na sekundę (procent maks. HP). */
  private healBudget = new HealBudget();
  /** Promień Czarodziejki (krok 37) — rysowany co klatkę, gdy świeci. */
  private beamGfx: Phaser.GameObjects.Graphics | null = null;
  private readonly highscores = createBoardHighscores('tower');
  /** Tablica aren bossów (krok 91a): najpierw osiągnięta arena, potem złoto; własny klucz, kolejka i trasa workera. */
  private readonly arenaHighscores = createBoardHighscores('arenas');
  private readonly playerName = new PlayerName(HighscoreStorage.browserStorage());
  private runSeed = 0;
  /** Zapis gry (krok 91): autozapis przy wejściu na piętro i ręczne sloty z pauzy. */
  private readonly saves = new SaveStorage(SaveStorage.browserStorage());
  /** Stan z wejścia na to piętro — to on trafia do zapisu; null przy odtwarzaniu nagrania (nie ruszamy zapisów). */
  private checkpoint: SaveData | null = null;
  /** Wybór piętra (krok 91): najwyższe piętro z pokonanym bossem; zapisujemy raz na piętro. */
  private readonly bossProgress = new BossProgress(HighscoreStorage.browserStorage());
  private bossProgressSaved = false;
  /** Start w arenie bossa (`?boss=1`). */
  private atBoss = false;
  /**
   * Areny bossów (krok 90): piętro to sama arena — bez wrogów w pokojach, kapliczki, pułapek, zasadzki,
   * ukrytej komnaty i modyfikatora piętra; gracz startuje w arenie, a po walce teleportuje się dalej.
   */
  private bossRushArena: BossRushArena | null = null;
  private floorNumber = 1;
  private stairsUnlocked = false;
  /** Gracz stoi na otwartych schodach (HUD i napis nad schodami). */
  private onStairs = false;
  private stairsPrompt: Phaser.GameObjects.Text | null = null;
  private isTransitioning = false;
  private deathHandled = false;

  constructor() {
    super(SceneKey.Game);
  }

  init(data: FloorSceneData): void {
    this.replay = data.replay && canReplay(data.replay) ? new InputReplay(data.replay) : null;
    this.replayStart = -1;
    this.runSeed = data.runSeed;
    this.bossProgressSaved = false;
    this.checkpoint = this.replay ? null : { runSeed: data.runSeed, floor: data.floor, run: data.run };
    this.atBoss = data.atBoss === true;
    this.bossRushArena = isBossRush(data.run.mode) ? new BossRushArena(BOSS_RUSH_CONFIG.teleportDelayMs) : null;
    this.shrine = null;
    this.floorNumber = data.floor;
    this.run = new RunState(data.run);
    this.startHp = data.run.hp;
    this.toast = null;
    this.itemNotice = null;
    this.death = null;
    this.deathPad = null;
    this.stairsUnlocked = false;
    this.onStairs = false;
    this.stairsPrompt = null;
    this.isTransitioning = false;
    this.deathHandled = false;
    this.dashHits = new Set();
    this.dashHitsFor = -1;
    this.healCooldown = new Timer();
    this.healBudget = new HealBudget();
    this.galleryEnemies = new Set();
    this.secretRoom = null;
    this.minimap = null;
    this.gamePaused = false;
    this.herald = null;
    this.ultimates = null;
    this.ambush = null;
    this.ambushGhosts = new Set();
    this.traps = null;
    this.breakables = null;
    // Restart sceny niszczy obiekty — grafika promienia powstanie od nowa.
    this.beamGfx = null;
  }

  create(): void {
    const generator = new DungeonGenerator(getDungeonConfigForFloor(this.floorNumber));
    const generated = generator.generate(deriveSeed(this.runSeed, this.floorNumber));
    // Galerie za kratami na arenie bossa (krok 44, Strażnik Bram) — przed dekorowaniem, bo zmieniają kafle.
    const galleries = bossForFloor(this.floorNumber).galleries;
    const carved = galleries ? carveArenaGalleries(generated, galleries.sides, galleries.depth) : { floor: generated, posts: [] };
    this.dungeon = carved.floor;
    this.galleryPosts = carved.posts;
    const biome = biomeForFloor(this.floorNumber);
    this.biome = biome;
    const tileset = this.cache.json.get(biome.tileset.jsonKey) as TilesetMeta;
    // Ukryta komnata (krok 46): rysujemy piętro z komnatą w przebraniu muru; prawdziwy obraz czeka na odsłonięcie.
    // Zasadzka (krok 49): co 1–2 piętra jeden zwykły pokój staje się pokojem zasadzki — przed dekorowaniem (kraty).
    this.ambushRoomId = null;
    if (!this.bossRush && hasAmbush(this.runSeed, this.floorNumber, AMBUSH_CONFIG)) {
      const plan = planAmbushRoom(this.dungeon, AMBUSH_CONFIG, createRng(deriveSeed(this.dungeon.seed, AMBUSH_ROOM_SEED_SALT)));
      if (plan) {
        this.dungeon = plan.floor;
        this.ambushRoomId = plan.roomId;
      }
    }
    this.secretArea = this.bossRush ? null : secretArea(this.dungeon);
    const shown = this.secretArea ? disguiseFloor(this.dungeon, this.secretArea) : this.dungeon;
    // Pochodnie przed dekorowaniem: detale lica muru omijają kafle z uchwytem.
    const torchSpots = planTorches(shown, TORCH_PLACEMENT, deriveSeed(this.dungeon.seed, TORCH_SEED_SALT));
    const dress = (floor: DungeonFloor) =>
      dressFloor(floor, tileset, biome.dressing, deriveSeed(this.dungeon.seed, DRESSING_SEED_SALT), { torches: torchSpots });
    const dressed = dress(shown);
    // Minimapa widzi piętro w przebraniu — ukryta komnata nie wyda się przed odsłonięciem.
    // Na arenach bossów jej nie ma (krok 97a): sama arena, nie ma czego szukać.
    this.minimap = this.bossRush ? null : new MinimapExplorer(shown, MINIMAP_CONFIG.revealRadius);
    const secret = this.secretArea ? { dressed: dress(this.dungeon), tiles: this.secretArea.tiles } : null;
    this.dungeonView = new DungeonView(this, this.dungeon, dressed, tileset, biome.tileset, secret);
    this.combatDecals = new CombatDecals(this, this.dungeon, biome.tileset, tileset, biome.dressing.combatDecals);
    // Piętro z mgłą (krok 28a) nie losuje „Mroku” — dwa ograniczenia widoku naraz byłyby nieczytelne. Areny bossów — bez modyfikatora.
    this.floorModifier = this.bossRush
      ? null
      : floorModifierFor(
          this.runSeed,
          this.floorNumber,
          FLOOR_MODIFIER_POOL,
          FLOOR_MODIFIER_CONFIG,
          (floor, modifier) => biomeForFloor(floor).fog === null || !limitsVision(modifier),
        );
    this.floorEffects = floorEffectsOf(this.floorModifier);

    this.physics.world.setBounds(0, 0, this.dungeonView.widthPx, this.dungeonView.heightPx);

    const spawn = DungeonView.tileToWorldCenter(this.atBoss || this.bossRush ? this.bossStartTile() : this.dungeon.playerSpawn);
    this.player = new Player(this, spawn.x, spawn.y, this.run.hero, this.currentLoadout(), this.startHp);
    this.physics.add.collider(this.player, this.dungeonView.collisionLayer);

    this.setupCombat();
    this.setupLoot();
    if (!this.bossRush) {
      this.setupShrine();
      this.setupRuinsProps();
    }
    this.setupSecretRoom();
    this.setupAmbush();
    this.createStairsPrompt();
    this.inputController = createPlayerInput(this);
    this.setupCamera();
    this.setupDebugKeys();
    this.setupPause();

    this.setupLighting(biome.tileset, tileset, torchSpots);

    if (!this.scene.isActive(SceneKey.Hud)) {
      const hudData: HudSceneData = { source: this };
      this.scene.launch(SceneKey.Hud, hudData);
    }

    if (this.bossRush) {
      this.showToast(BOSS_RUSH_TEXT.startToast);
    } else if (this.floorModifier) {
      this.showToast(`${this.floorModifier.name}: ${this.floorModifier.description}`, FLOOR_MODIFIER_TOAST_MS);
    } else if (this.run.practice) {
      this.showToast('Run testowy — wynik nie trafi na tablicę');
    } else if (this.run.fromSave) {
      this.showToast(SAVE_TEXT.loadedToast);
    } else if (this.run.mode === RunMode.FloorSelect && !FLOOR_SELECT_CONFIG.ranked) {
      this.showToast(FLOOR_SELECT_TEXT.startToast(startFloorInfo(this.floorNumber).label));
    }
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.setupDiagnostics();
    // Autozapis „Kontynuuj” (krok 91): stan z wejścia na piętro; po śmierci znika.
    if (this.checkpoint) this.saves.save('auto', this.checkpoint, Date.now());
  }

  /** Dziennik diagnostyczny (krok 55): okruch „nowe piętro” i stan gry do pulsu (po twardym wyrzuceniu to ostatni ślad). */
  private setupDiagnostics(): void {
    diag.startRecording(
      {
        runSeed: this.runSeed,
        floor: this.floorNumber,
        hero: this.run.hero,
        gold: this.run.gold,
        items: [...this.run.items],
        hp: this.startHp,
        practice: this.run.practice,
        startedAt: Date.now(),
      },
      this.time.now,
    );
    this.stuck = new StuckDetector();
    this.bossStall = new BossStallDetector();
    this.lastStairsUnlocked = false;
    this.lastBossFighting = false;
    this.nextProbeAt = 0;
    for (const issue of floorConnectivityIssues(this.dungeon)) diag.note('floor-disconnected', { floor: this.floorNumber, seed: this.runSeed }, 'error', issue);
    diag.note('floor-start', { floor: this.floorNumber, seed: this.runSeed, hero: this.run.hero, biome: this.biome.id, practice: this.run.practice, mode: this.run.mode, gold: this.run.gold });
    diag.setState(() => {
      const tile = DungeonView.worldToTile(this.player.x, this.player.y);
      return {
        scene: 'game',
        floor: this.floorNumber,
        seed: this.runSeed,
        hero: this.run.hero,
        hp: Math.round(this.player.health.value),
        maxHp: Math.round(this.player.health.max),
        gold: this.run.gold,
        items: this.run.items.length,
        tile: `${tile.x},${tile.y}`,
        bossFight: this.bossFight.isFighting,
        bossDefeated: this.bossFight.isDefeated,
        stairsUnlocked: this.stairsUnlocked,
        dead: this.player.isDead,
        transition: this.isTransitioning,
      };
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => diag.setState(null));
  }

  private replay: InputReplay | null = null;
  private replayStart = -1;
  private lastBossFighting = false;
  private nextSanityAt = 0;
  private nextProbeAt = 0;
  private lastStairsUnlocked = false;
  private stuck = new StuckDetector();
  private bossStall = new BossStallDetector();
  private displayLimit = new LimitWatch('obiekty na scenie', DIAGNOSTICS.anomalies.limits.displayObjects);
  private enemyLimit = new LimitWatch('żywi wrogowie', DIAGNOSTICS.anomalies.limits.enemies);
  private moveHeld = false;

  /** Co sekundę: zmiany walki z bossem (okruchy) i kontrola poprawności stanu gracza (NaN, poza mapą, HP poza zakresem). */
  private diagnosticsTick(time: number): void {
    if (this.bossFight.isFighting !== this.lastBossFighting) {
      this.lastBossFighting = this.bossFight.isFighting;
      diag.note(this.lastBossFighting ? 'boss-fight-start' : 'boss-fight-end', { floor: this.floorNumber, defeated: this.bossFight.isDefeated });
    }
    if (this.stairsUnlocked && !this.lastStairsUnlocked) {
      this.lastStairsUnlocked = true;
      const tile = DungeonView.worldToTile(this.player.x, this.player.y);
      if (!reachable(this.dungeon, tile, this.dungeon.stairs)) diag.note('stairs-unreachable', { floor: this.floorNumber, tile: `${tile.x},${tile.y}` }, 'error', 'Schody odblokowane, ale nieosiągalne z miejsca gracza');
    }
    if (time >= this.nextProbeAt) {
      this.nextProbeAt = time + DIAGNOSTICS.anomalies.sampleMs;
      const found = [
        this.stuck.update(time, { moveHeld: this.moveHeld, exempt: this.player.isDead || this.player.isParalyzed(time) || this.player.isDashing(time), x: this.player.x, y: this.player.y }),
        this.bossStall.update(time, this.bossFight.getStatus()?.hp ?? null),
        this.displayLimit.check(time, this.children.length),
        this.enemyLimit.check(time, this.enemies.aliveCount),
      ];
      for (const anomaly of found) if (anomaly) diag.note(anomaly.kind, { floor: this.floorNumber, ...anomaly.data }, 'warn', anomaly.message);
    }
    if (time < this.nextSanityAt) return;
    this.nextSanityAt = time + 1000;
    const issues = sanityIssues(
      { x: this.player.x, y: this.player.y, hp: this.player.health.value, maxHp: this.player.health.max },
      { width: this.dungeon.width * TILE_SIZE, height: this.dungeon.height * TILE_SIZE },
    );
    for (const issue of issues) diag.note('insane-state', { floor: this.floorNumber }, 'error', issue);
  }

  /** Wejście z klawiatury, myszy i pada albo (tryb dev) z odtwarzanego nagrania; prawdziwe wejście trafia do nagrywarki (krok 56). */
  private nextActions(time: number): PlayerActions {
    if (this.replay) {
      if (this.replayStart < 0) {
        this.replayStart = time;
        diag.note('replay-start', { floor: this.floorNumber, seed: this.runSeed, durationS: Math.round(this.replay.durationMs / 1000) });
      }
      const actions = this.replay.actionsAt(time - this.replayStart);
      if (this.replay.finished && time - this.replayStart > this.replay.durationMs) {
        diag.note('replay-finished', { floor: this.floorNumber });
        this.replay = null;
      }
      return actions;
    }
    const actions = this.inputController.getActions({ origin: { x: this.player.x, y: this.player.y }, targets: () => this.aimTargets() });
    diag.recordInput(actions, time);
    return actions;
  }

  override update(time: number): void {
    if (this.isTransitioning) return;
    this.diagnosticsTick(time);
    this.trackBossProgress();

    const actions = this.nextActions(time);
    this.moveHeld = actions.move.x !== 0 || actions.move.y !== 0;
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
    if (turn.ultimate) this.ultimates?.use(turn.ultimate, time);
    if (turn.nova) this.castNova(time);
    if (turn.arrow) this.fireArrow(turn.arrow.direction, turn.arrow.strong);
    if (turn.volley) this.fireVolley(turn.volley);
    this.updateBeam(turn.beam, turn.beamTicks, time);
    this.ultimates?.update(time);
    this.resolveDashStrike(time);
    this.enemies.update(time);
    this.ceilingDrops?.update(time);
    this.cocoons?.update(time);
    this.stickyWebs?.update(time);
    this.puffballs?.update(time);
    this.wallDogs?.update(time);
    this.secretRoom?.update();
    this.ambush?.update(time);
    this.traps?.update(time);
    this.breakables?.update();
    this.braziers?.update(time);
    this.bossFight.update(time);
    this.herald?.update(time);
    this.arenaGates.update();
    this.keepPlayerContained();
    this.projectiles.update(time);
    this.playerShots.update(
      time,
      (shot) => {
        // Krok 93: kieł leczy tylko za trafienie wroga lub bossa, nie kokonu (też spiżarni), purchawki czy urny.
        const creature = this.enemies.resolvePlayerShot(shot) ?? this.bossFight.resolvePlayerShot(shot);
        const target =
          creature ?? this.cocoons?.resolvePlayerShot(shot) ?? this.puffballs?.resolvePlayerShot(shot) ?? this.secretRoom?.resolvePlayerShot(shot) ?? this.breakables?.resolvePlayerShot(shot) ?? null;
        if (creature && !(creature instanceof LarderCocoon) && shot.vampiric) this.tryVampireHeal(time);
        if (target && shot.magic) this.orbSplash(shot.position, shot.damage, target, time);
        return target;
      },
    );
    this.loot.update(time);
    this.shrine?.update(actions.interact);

    if (this.player.isDead) this.handlePlayerDeath();
    else this.checkStairs(actions.interact);
    this.updateBossRush(time);
  }

  getHudData(): HudData {
    // HUD może odpytać scenę zanim create() zbuduje gracza (np. w trakcie restartu).
    const ready = Boolean(this.player?.active);
    return {
      floor: this.floorNumber,
      arenaLabel: this.bossRush ? arenaLabel(this.floorNumber, bossForFloor(this.floorNumber).name, TOWER_CONFIG) : null,
      floorModifier: this.floorModifier && { name: this.floorModifier.name, description: this.floorModifier.description },
      hp: ready ? this.player.health.value : 0,
      maxHp: ready ? this.player.health.max : this.hero.stats.maxHp,
      dashReadiness: ready ? this.player.dashReadiness(this.time.now) : 1,
      ranged: ready
        ? this.player.rangedStatus(this.time.now)
        : { charges: this.heroCharges, maxCharges: this.heroCharges, rechargeProgress: 1 },
      beam: ready ? this.player.beamStatus(this.time.now) : null,
      ultimate: ready ? { ...this.player.ultimateStatus(this.time.now), name: this.hero.ultimate.name } : null,
      enemiesAlive: ready ? this.enemies.aliveCount : 0,
      stairsUnlocked: this.stairsUnlocked,
      onStairs: this.onStairs,
      canInteract: ready && !this.player.isDead && (this.onStairs || (this.shrine?.canOffer ?? false)),
      isPlayerDead: ready && this.player.isDead,
      minimap: ready ? this.minimapData() : null,
      boss: ready ? this.bossFight.getStatus() : null,
      gold: this.run.gold,
      practice: this.run.practice,
      bossRush: this.bossRush,
      items: this.run.itemCounts().map(({ id, count }) => ({
        name: ITEM_DEFINITIONS[id].name,
        count,
        color: ITEM_DEFINITIONS[id].color,
        frame: itemFrames(id, ITEM_DEFINITIONS[id].kind)[0] ?? '',
        rare: ITEM_DEFINITIONS[id].kind === ItemKind.Effect,
      })),
      toast: this.currentToast(),
      itemNotice: this.currentItemNotice(),
      death: this.death,
    };
  }

  /** Odkrywa mgłę wokół gracza i oddaje dane minimapy; arena bossa znika ze znaczników po jego pokonaniu. */
  private minimapData(): MinimapHudData | null {
    if (!this.minimap) return null;
    const player = DungeonView.worldToTile(this.player.x, this.player.y);
    this.minimap.reveal(player);
    const arena = this.dungeon.rooms[this.dungeon.bossRoomId];
    return {
      explorer: this.minimap,
      player,
      stairs: this.dungeon.stairs,
      boss: arena && !this.bossFight.isDefeated ? { x: arena.x + Math.floor(arena.width / 2), y: arena.y + Math.floor(arena.height / 2) } : null,
    };
  }

  private currentLoadout(): PlayerLoadout {
    const loadout = applyFloorToLoadout(computeHeroLoadout(this.hero, this.run.items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS), this.floorEffects);
    // Szał barbarzyńcy (krok 98) mnoży loadout na czas trwania.
    const { ultimate } = this.hero;
    return ultimate.kind === 'rage' && this.ultimates?.isRaging(this.time.now) ? applyRage(loadout, ultimate) : loadout;
  }

  private get hero() {
    return HERO_DEFINITIONS[this.run.hero];
  }

  /** Segmenty HUD przed zbudowaniem gracza: kule Czarodziejki albo ładunki strzału. */
  private get heroCharges(): number {
    return sorceryOf(this.hero.kit)?.orbs.maxOrbs ?? this.hero.combat.ranged.maxCharges;
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
        magic: true,
      },
    );
  }

  /**
   * Strzała łucznika z łuku (krok 82; ciągły ostrzał od kroku 97): mocna strzała serii przebija.
   * Łuk to broń główna, więc strzała niesie wszystkie efekty broni (strzał + cios), jak kula Czarodziejki,
   * i trafia upiory zasadzki (domyślna decyzja z kroku 82, do oceny właściciela).
   */
  private fireArrow(direction: Vector2, strong: boolean): void {
    const archery = this.player.archeryConfig;
    if (!archery) return;
    const { bow } = archery;
    const spec = arrowSpec(bow, strong);
    const origin = crystalPoint(this.player, Math.atan2(direction.y, direction.x), bow.forwardOffset, bow.sideOffset);
    this.playerShots.fire(
      origin,
      direction,
      {
        damage: spec.damage,
        knockback: spec.knockback,
        projectileSpeed: spec.speed,
        projectileLifetimeMs: bow.lifetimeMs,
        projectileRadius: bow.radius,
      },
      this.player.effects,
      this.arrowLook(direction, spec.strong, spec.pierce),
    );
  }

  /** Salwa łucznika (PPM): wachlarz strzał z obrażeniami i lotem ładunków strzału (`combat.ranged`). */
  private fireVolley(aim: Vector2): void {
    const archery = this.player.archeryConfig;
    if (!archery) return;
    const { bow, volley } = archery;
    const angle = Math.atan2(aim.y, aim.x);
    const origin = crystalPoint(this.player, angle, bow.forwardOffset, bow.sideOffset);
    for (const direction of volleyDirections(angle, volley.arrows, volley.spreadDeg)) {
      this.playerShots.fire(origin, direction, this.player.combatConfig.ranged, this.player.effects, this.arrowLook(direction, false, 0));
    }
  }

  private arrowLook(direction: Vector2, strong: boolean, extraPierce: number): ShotLook {
    const { effects } = this.player;
    const sheet = ARCHER_ARROW_VISUAL.sheet;
    return {
      texture: SPRITE_SHEETS[sheet].key,
      animation: animationKey(sheet, strong ? ARCHER_ARROW_VISUAL.fullAnimation : ARCHER_ARROW_VISUAL.animation, facingDirection(direction) ?? 0),
      status: { ...effects.shotStatus, ...effects.meleeStatus },
      vampiric: effects.meleeHeal > 0,
      magic: true,
      extraPierce,
    };
  }

  /** Rozprysk kuli (krok 50): sąsiedzi trafionego dostają ułamek obrażeń; wrogowie, pajączki z bossa i boss. */
  private orbSplash(at: Vector2, orbDamage: number, mainTarget: object, now: number): void {
    const splash = this.player.sorceryConfig?.orbs.splash;
    if (!splash) return;
    const strike: OrbSplash = {
      center: { x: at.x, y: at.y },
      radius: splash.radius,
      damage: splashDamage(orbDamage, splash.damageFraction),
      now,
      source: { x: this.player.x, y: this.player.y },
      exclude: mainTarget,
    };
    this.enemies.resolveSplash(strike);
    this.bossFight.resolveSplash(strike);
    this.effects.splash(at.x, at.y, splash.radius);
  }

  /**
   * Fala uderzeniowa Czarodziejki (krok 97): przy rzucie ostatniej kuli serii rani i odpycha wrogów wokół niej.
   * Magia (trafia upiory), bez efektów przedmiotów — jak rozprysk kuli.
   */
  private castNova(now: number): void {
    const nova = this.player.sorceryConfig?.orbs.nova;
    if (!nova) return;
    const center = { x: this.player.x, y: this.player.y };
    const strike: OrbSplash = { center, radius: nova.radius, damage: nova.damage, knockback: nova.knockback, now, source: center, exclude: null };
    this.enemies.resolveSplash(strike);
    this.bossFight.resolveSplash(strike);
    this.effects.nova(center.x, center.y, nova.radius);
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
      this.secretRoom?.resolvePlayerBeam(beam);
      this.breakables?.resolvePlayerBeam(beam);
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
    const { meleeHeal, meleeHealCooldownMs, meleeHealMaxHpPctPerSec } = this.player.effects;
    if (meleeHeal <= 0 || this.player.health.isFull || this.healCooldown.isActive(now)) return;
    this.healCooldown.start(now, meleeHealCooldownMs);
    const heal = this.healBudget.take(meleeHeal, now, this.player.health.max * meleeHealMaxHpPctPerSec);
    if (heal <= 0) return;
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
    const creatureHits = this.enemies.resolvePlayerMelee(swing) + this.bossFight.resolvePlayerMelee(swing);
    this.cocoons?.resolvePlayerMelee(swing);
    this.puffballs?.resolvePlayerMelee(swing);
    this.secretRoom?.resolvePlayerMelee(swing);
    this.breakables?.resolvePlayerMelee(swing);

    // Wampirzy kieł: leczenie za cios, który trafił wroga lub bossa (raz na cios, niezależnie od liczby celów).
    // Krok 93: kokony, purchawki i urny już nie leczą.
    if (creatureHits > 0) this.tryVampireHeal(now);
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
    this.secretRoom?.resolveDashSweep(sweep, this.dashHits);
    this.breakables?.resolveDashSweep(sweep, this.dashHits);
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
      onEnemyKilled: (enemy) => {
        // Upiory zasadzki rozwiewają się bez łupu — nagrodą jest przynęta.
        this.player.addUltimateKill(this.time.now);
        if (this.ambushGhosts.has(enemy)) return;
        const table = applyFloorToEnemyLoot(ENEMY_LOOT[enemy.definition.type], this.floorEffects);
        this.dropLoot({ x: enemy.x, y: enemy.y }, isElite(enemy.definition) ? eliteLoot(table, ELITE_CONFIG) : table);
      },
      aggroTarget: () => this.ultimates?.aggroTarget ?? null,
      onEliteSpotted: (enemy) => this.showToast(eliteAnnouncement(enemy.definition.affixes ?? [], ELITE_CONFIG), ELITE_VISUAL.toastMs),
    });

    // Areny bossów (krok 90): bez wrogów w pokojach i bez zagrożeń biomu poza areną — tylko boss i jego pomocnicy.
    if (!this.bossRush) {
      const rng = createRng(deriveSeed(this.dungeon.seed, ENCOUNTER_SEED_SALT));
      const spawns = planEncounters(this.dungeon, getEncounterConfigForFloor(this.floorNumber), rng);
      // Elity (krok 42): własny strumień RNG — nie zmienia rozmieszczenia wrogów.
      const eliteRng = createRng(deriveSeed(this.dungeon.seed, ELITE_SEED_SALT));
      this.enemies.spawnAll(spawns, rollElites(spawns, ELITE_CONFIG, this.floorNumber, eliteAffixCount(this.floorNumber, TOWER_CONFIG), eliteRng));
    }
    const biome = this.bossRush ? null : this.biome;

    const drops = biome?.ceilingDrops;
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

    const cocoons = biome?.cocoons;
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

    const webs = biome?.stickyWebs;
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

    const puffballs = biome?.puffballs;
    this.puffballs = puffballs
      ? new PuffballManager({
          scene: this,
          floor: this.dungeon,
          config: puffballs,
          rng: createRng(deriveSeed(this.dungeon.seed, PUFFBALL_SEED_SALT)),
          player: this.player,
        })
      : null;

    // Psy w ścianach palarni (krok 84): pies to zwykły Rusher biomu (wielki czarny dog).
    const wallDogs = biome?.wallDogs;
    this.wallDogs = wallDogs
      ? new WallDogManager({
          scene: this,
          floor: this.dungeon,
          config: wallDogs,
          rng: createRng(deriveSeed(this.dungeon.seed, WALL_DOG_SEED_SALT)),
          player: this.player,
          effects: this.effects,
          spawnDog: (at) => {
            this.enemies.spawnAt(EnemyType.Rusher, at);
          },
        })
      : null;

    // Paleniska Piekła (krok 41b): nie w pokoju kapliczki — jej miejsce liczymy tym samym ziarnem co ShrineSite.
    const braziers = biome?.braziers;
    const shrineTile = planShrineLocation(this.dungeon, createRng(deriveSeed(this.dungeon.seed, SHRINE_SEED_SALT)));
    this.braziers = braziers
      ? new BrazierManager({
          scene: this,
          floor: this.dungeon,
          floorNumber: this.floorNumber,
          config: braziers,
          rng: createRng(deriveSeed(this.dungeon.seed, BRAZIER_SEED_SALT)),
          player: this.player,
          avoid: shrineTile ? [shrineTile] : [],
          onPlayerHit,
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
      // Świta (krok 80): wróg biomu wynurza się (chwilę nietykalny i niegroźny), zanim ruszy.
      spawnHelper: (type, at) => this.enemies.spawnAt(type, at, [], { riseMs: RETINUE_MARKER_VISUAL.riseMs }),
      onDefeated: (position) => {
        this.dropLoot(position, BOSS_LOOT);
        // Areny bossów: nagrodę i teleport prowadzi `updateBossRush` (najpierw arena musi być pusta).
        if (this.bossRush) return;
        this.unlockStairs();
        // Animacja śmierci bossa trwa chwilę — gracz mógł w tym czasie zginąć (np. od pocisku w locie).
        if (!this.player.isDead) this.offerBossReward();
      },
      aggroTarget: () => this.ultimates?.aggroTarget ?? null,
    });

    // Ultimate (R, krok 98): szał, Supernowa, totem.
    this.ultimates = new UltimateManager({
      scene: this,
      player: this.player,
      effects: this.effects,
      playerShots: this.playerShots,
      blast: (strike) => {
        this.enemies.resolveSplash(strike);
        this.bossFight.resolveSplash(strike);
      },
      targets: () => this.aimTargets(),
      onRageChanged: () => this.player.applyLoadout(this.currentLoadout()),
      floorNumber: this.floorNumber,
    });

    // Zapowiedź bossa (krok 54): odcień światła, drżenie i iskry ku arenie; milknie w walce i po niej.
    // W arenach bossów gracz już stoi na arenie — zapowiedź nie ma sensu.
    this.herald = this.bossRush ? null : new BossHeraldEffects({
      scene: this,
      arena: this.dungeon.rooms[this.dungeon.bossRoomId]!,
      config: BOSS_HERALD[this.biome.id],
      rumble: HERALD_RUMBLE,
      player: this.player,
      isSilenced: () => this.bossFight.isFighting || this.bossFight.isDefeated,
    });

    this.arenaGates = new ArenaGates({
      scene: this,
      floor: this.dungeon,
      view: this.dungeonView,
      player: this.player,
      effects: this.effects,
      isBossFighting: () => this.bossFight.isFighting,
      isBossDefeated: () => this.bossFight.isDefeated,
      onSealed: () => {
        diag.note('arena-sealed', { floor: this.floorNumber });
        this.showToast('Kraty opadły — nie ma odwrotu!');
        this.manGalleries();
      },
    });

    const arena = this.dungeon.rooms[this.dungeon.bossRoomId]!;
    this.containment = new PlayerContainment(
      TILE_SIZE,
      (tile) => !this.dungeonView.collisionLayer.hasTileAt(tile.x, tile.y) && (!this.arenaGates.sealed || roomContainsTile(arena, tile)),
    );
  }

  /** Bezpiecznik kroku 99: gracz przepchnięty przez kolizję wraca na ostatnie dozwolone miejsce. */
  private keepPlayerContained(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const back = this.containment.update(body.center);
    if (!back) return;
    diag.note('player-unstuck', { floor: this.floorNumber, sealed: this.arenaGates.sealed }, 'warn', 'Gracz przepchnięty przez kolizję — cofnięty');
    body.reset(back.x, back.y);
  }

  /** Kraty opadły: w galeriach areny stają wrogowie (krok 44); wyjdą, gdy kraty się podniosą. */
  private manGalleries(): void {
    const galleries = bossForFloor(this.floorNumber).galleries;
    if (!galleries) return;
    for (const post of this.galleryPosts) {
      const at = DungeonView.tileToWorldCenter(post);
      this.galleryEnemies.add(this.enemies.spawnAt(galleries.enemy, at));
      this.effects.impact(at.x, at.y, TILE_SIZE * 0.5);
    }
  }

  /** Ukryta komnata za areną (krok 46): odsłania się z bliska, kokony skarbu — w jednym przedmiot. */
  private setupSecretRoom(): void {
    this.secretRoom = this.secretArea
      ? new SecretRoomManager({
          scene: this,
          floor: this.dungeon,
          area: this.secretArea,
          view: this.dungeonView,
          player: this.player,
          effects: this.effects,
          rng: createRng(deriveSeed(this.dungeon.seed, SECRET_ROOM_SEED_SALT)),
          dropLoot: (at, drops) => this.loot.spawn(at, drops),
          onRevealed: () => this.showToast('Ukryta komnata! Rozbij kokony — w jednym jest skarb.', SECRET_ROOM_VISUAL.toastMs),
        })
      : null;
  }

  /** Pokój zasadzki (krok 49): przynęta, kraty, mrok i fale upiorów. */
  private setupAmbush(): void {
    const room = this.ambushRoomId === null ? undefined : this.dungeon.rooms[this.ambushRoomId];
    if (!room) return;
    this.ambush = new AmbushManager({
      scene: this,
      floor: this.dungeon,
      room,
      config: AMBUSH_CONFIG,
      view: this.dungeonView,
      lighting: () => this.lighting ?? null,
      player: this.player,
      enemies: this.enemies,
      effects: this.effects,
      rng: createRng(deriveSeed(this.dungeon.seed, AMBUSH_SEED_SALT)),
      spawnLoot: (at, drops) => this.loot.spawn(at, drops),
      onGhost: (ghost) => this.ambushGhosts.add(ghost),
      toast: (text) => this.showToast(text),
    });
  }

  /**
   * Pułapki i urny ruin (krok 48): pas kolców, strzałki z murów, urny i skrzynie do rozbicia. Każdy planer ma
   * własny strumień RNG; kolejne omijają kafle poprzednich i kapliczkę.
   */
  private setupRuinsProps(): void {
    const { traps, breakables } = this.biome;
    const seed = this.dungeon.seed;
    const shrine = planShrineLocation(this.dungeon, createRng(deriveSeed(seed, SHRINE_SEED_SALT)));
    const avoid: TilePoint[] = shrine ? [shrine] : [];
    const plates = traps?.spikes ? planSpikeStrips(this.dungeon, traps.spikes, createRng(deriveSeed(seed, SPIKE_SEED_SALT)), avoid) : [];
    avoid.push(...plates.map((p) => p.tile));
    const darts = traps?.darts ? planDartTraps(this.dungeon, traps.darts, createRng(deriveSeed(seed, DART_SEED_SALT)), avoid) : [];
    for (const dart of darts) avoid.push(...dart.line);
    if (traps) {
      this.traps = new TrapManager({
        scene: this,
        floorNumber: this.floorNumber,
        spikes: traps.spikes ? { config: traps.spikes, plates } : null,
        darts: traps.darts ? { config: traps.darts, traps: darts } : null,
        player: this.player,
        enemies: () => this.enemies.living,
        projectiles: this.projectiles,
        onPlayerHit: () => this.effects.playerHit(),
      });
    }
    if (breakables) {
      this.breakables = new BreakableManager({
        scene: this,
        spots: planBreakables(this.dungeon, breakables, createRng(deriveSeed(seed, BREAKABLE_SEED_SALT)), avoid),
        radius: breakables.radius,
        effects: this.effects,
        onBroken: (at) => this.dropLoot(at, BREAKABLE_LOOT),
      });
    }
  }

  private setupLoot(): void {
    this.lootRng = createRng(deriveSeed(this.dungeon.seed, LOOT_SEED_SALT));
    this.loot = new LootManager({
      scene: this,
      walls: this.dungeonView.collisionLayer,
      player: this.player,
      // Mikstury zostają na ziemi, dopóki gracz ma pełne HP — można po nie wrócić.
      canCollect: (drop) =>
        (drop.kind !== PickupKind.Health || !this.player.health.isFull) && (this.ambush?.canCollect(drop) ?? true),
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
        diag.note('shrine-offering', { floor: this.floorNumber, item: itemId, cost });
        this.player.applyLoadout(this.currentLoadout());
        this.effects.floatingText(this.player.x, this.player.y, `-${cost}`, '#f5c542');
        this.showItemNotice(itemId);
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
    this.run.addItem(itemId);
    this.player.applyLoadout(this.currentLoadout());
    this.showItemNotice(itemId);
  }

  /** Nagroda za bossa: gra staje, gracz wybiera 1 z kart. Po wyborze gra rusza dalej. */
  /** Pauza (krok 70): Esc / P zawsze; auto-pauza po utracie fokusu albo ukryciu karty. */
  private setupPause(): void {
    for (const key of PAUSE_CONFIG.keys) {
      this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
        if (!event.repeat) this.pauseGame('manual');
      });
    }
    // Pad (krok 95): Start — pauza; na ekranie śmierci A / Y / B jak R / C / M.
    bindPadMenu(this, (command) => {
      if (command === MenuCommand.Pause) this.pauseGame('manual');
      else if (this.deathPad && this.time.now >= this.deathPad.readyAt) this.deathPad.on(command);
    });
    const onFocusLost = () => {
      const enabled = autoPauseEnabled(
        { search: window.location.search, dev: import.meta.env.DEV, webdriver: navigator.webdriver === true },
        PAUSE_CONFIG.autoPauseParam,
      );
      if (enabled) this.pauseGame('focus');
    };
    const { events } = this.game;
    events.on(Phaser.Core.Events.BLUR, onFocusLost);
    events.on(Phaser.Core.Events.HIDDEN, onFocusLost);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      events.off(Phaser.Core.Events.BLUR, onFocusLost);
      events.off(Phaser.Core.Events.HIDDEN, onFocusLost);
    });
  }

  /** Wstrzymuje grę i pokazuje nakładkę; nic nie robi na ekranie śmierci, przy przejściu między piętrami i podczas wyboru nagrody. */
  private pauseGame(reason: PauseReason): void {
    if (this.gamePaused || this.isTransitioning || this.death || !this.player?.active || this.player.isDead) return;
    if (this.scene.isPaused() || this.scene.isActive(SceneKey.Pause)) return;
    this.gamePaused = true;
    (this.registry.get(PAUSE_CLOCK_KEY) as PauseClock | undefined)?.begin();
    diag.note('pause', { floor: this.floorNumber, reason });
    const data: PauseSceneData = {
      reason,
      onResume: () => this.resumeGame(),
      onSave: this.checkpoint ? (slot) => this.saveToSlot(slot) : null,
      onQuit: () => this.quitToMenu(),
    };
    this.scene.pause();
    this.scene.launch(SceneKey.Pause, data);
  }

  /** Pokonany boss odblokowuje start od tego piętra w trybie wyboru piętra (krok 91). Nie przy nagraniu i runie testowym. */
  private trackBossProgress(): void {
    if (this.bossProgressSaved || !this.bossFight.isDefeated) return;
    this.bossProgressSaved = true;
    if (!this.replay && unlocksFloor(this.run.mode, this.run.practice)) {
      const best = this.bossProgress.record(this.floorNumber);
      diag.note('boss-progress', { floor: this.floorNumber, best });
    }
  }

  /** Ręczny zapis (krok 91) — stan z wejścia na piętro, nie bieżąca chwila. */
  private saveToSlot(slot: number): boolean {
    if (!this.checkpoint) return false;
    const ok = this.saves.save(slot, this.checkpoint, Date.now());
    diag.note('save-slot', { slot, floor: this.floorNumber, ok });
    return ok;
  }

  /** Wyjście do menu głównego z pauzy albo ekranu śmierci; autozapis zostaje (Kontynuuj). */
  private quitToMenu(): void {
    if (this.gamePaused) {
      this.gamePaused = false;
      (this.registry.get(PAUSE_CLOCK_KEY) as PauseClock | undefined)?.end();
    }
    diag.note('quit-to-menu', { floor: this.floorNumber });
    this.scene.stop(SceneKey.Pause);
    this.scene.stop(SceneKey.Hud);
    const start: FloorSceneData = { runSeed: (Date.now() ^ this.runSeed) >>> 0, floor: 1, run: newRun(this.run.hero, false, this.run.mode) };
    openMainMenu(this, start);
  }

  private resumeGame(): void {
    if (!this.gamePaused) return;
    this.gamePaused = false;
    (this.registry.get(PAUSE_CLOCK_KEY) as PauseClock | undefined)?.end();
    this.scene.resume();
    // Klawisze puszczone w czasie pauzy nie dotarły do wstrzymanej sceny — bez resetu bohater szedłby sam.
    this.input.keyboard?.resetKeys();
  }

  private offerBossReward(onPicked?: () => void): void {
    const rng = createRng(deriveSeed(this.dungeon.seed, REWARD_SEED_SALT));
    const choices = rollItemChoices(ITEM_POOL, BOSS_REWARD.choices, rng);
    if (choices.length === 0) {
      onPicked?.();
      return;
    }

    const owned: Partial<Record<ItemId, number>> = {};
    for (const { id, count } of this.run.itemCounts()) owned[id] = count;

    const data: RewardSceneData = {
      choices,
      owned,
      onPick: (itemId) => {
        this.scene.resume(SceneKey.Game);
        this.grantItem(itemId);
        onPicked?.();
      },
    };
    diag.note('boss-reward-offered', { floor: this.floorNumber, choices: choices.length });
    this.scene.pause();
    this.scene.launch(SceneKey.Reward, data);
  }

  private showToast(text: string, durationMs = TOAST_DURATION_MS): void {
    this.toast = { text, at: this.time.now, durationMs };
  }

  private showItemNotice(itemId: ItemId): void {
    this.itemNotice = { itemId, at: this.time.now };
  }

  private currentItemNotice(): HudItemNotice | null {
    if (!this.itemNotice) return null;
    const remainingMs = ITEM_NOTICE_MS - (this.time.now - this.itemNotice.at);
    const item = ITEM_DEFINITIONS[this.itemNotice.itemId];
    return remainingMs > 0 ? { name: item.name, effect: item.effect, remainingMs } : null;
  }

  private currentToast(): HudToast | null {
    if (!this.toast) return null;
    const remainingMs = this.toast.durationMs - (this.time.now - this.toast.at);
    return remainingMs > 0 ? { text: this.toast.text, remainingMs } : null;
  }

  private handlePlayerDeath(): void {
    if (this.deathHandled) return;
    this.deathHandled = true;
    diag.note('player-death', { floor: this.floorNumber, gold: this.run.gold, hero: this.run.hero, bossFight: this.bossFight.isFighting });
    // Śmierć kończy run — „Kontynuuj” znika (ręczne sloty zostają).
    if (this.checkpoint) this.saves.remove('auto');

    // Złoto w chwili śmierci to wynik runu.
    const base: ScoreEntry = { score: this.run.gold, floor: this.floorNumber, timestamp: Date.now(), hero: this.run.hero };
    // Bez zapisu i bez pytania o imię: run testowy z adresu (krok 41g), run ze slotu i od wybranego piętra (krok 91).
    // Areny bossów (krok 91a) mają własną tablicę — wynik idzie na nią, a nie na tablicę wspinaczki.
    const unranked = this.run.practice
      ? 'practice'
      : this.run.fromSave
        ? 'fromSave'
        : this.run.mode === RunMode.FloorSelect && !FLOOR_SELECT_CONFIG.ranked
          ? 'floorSelect'
          : null;
    if (unranked) {
      this.death = { score: base.score, floor: base.floor, rank: 0, board: { top: [], current: null }, source: unranked, nameEntry: null, ...this.arenaFlag() };
      this.awaitNewRun();
      return;
    }
    const remembered = this.playerName.load();
    if (remembered) {
      this.recordDeath({ ...base, name: remembered });
      return;
    }

    // Pierwsza śmierć bez imienia: panel czeka na wpisanie imienia (Enter zapisuje, Esc pomija).
    const maxLength = HIGHSCORE_CONFIG.nameMaxLength;
    let typed = '';
    this.death = { score: base.score, floor: base.floor, rank: 0, board: { top: [], current: null }, source: 'local', nameEntry: '', ...this.arenaFlag() };
    const finish = (raw: string | null): void => {
      this.input.keyboard?.off('keydown', onKey);
      this.deathPad = null;
      const name = raw ? sanitizePlayerName(raw, maxLength) : '';
      if (name) this.playerName.save(name);
      this.recordDeath(name ? { ...base, name } : base);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        finish(event.key === 'Enter' ? typed : null);
        return;
      }
      if (event.key === 'Backspace') typed = [...typed].slice(0, -1).join('');
      else if (isNameChar(event.key) && [...typed].length < maxLength) typed += event.key;
      if (this.death) this.death = { ...this.death, nameEntry: typed };
    };
    this.input.keyboard?.on('keydown', onKey);
    // Pad nie wpisze imienia: A zapisuje to, co wpisano z klawiatury (puste = bez imienia), B pomija.
    this.deathPad = {
      readyAt: this.time.now + GAMEPAD_CONFIG.deathInputDelayMs,
      kind: 'name',
      on: (command) => {
        if (command === MenuCommand.Confirm || command === MenuCommand.Back) finish(command === MenuCommand.Confirm ? typed : null);
      },
      submitName: finish,
    };
  }

  /** Znacznik tablicy aren na panelu śmierci (krok 91a). */
  private arenaFlag(): { arenas?: true } {
    return this.bossRush ? { arenas: true } : {};
  }

  /** Zapis wyniku (lokalnie od razu, wspólnie w tle) i czekanie na R. Areny bossów — na własnej tablicy (krok 91a). */
  private recordDeath(entry: ScoreEntry): void {
    const highscores = this.bossRush ? this.arenaHighscores : this.highscores;
    const { rank, board } = highscores.record(entry);
    const death: DeathSummary = { score: entry.score, floor: entry.floor, rank, board, source: 'local', nameEntry: null, ...this.arenaFlag() };
    this.death = death;
    if (highscores.hasRemote) {
      this.death = { ...death, source: 'pending' };
      void highscores.recordShared(entry).then((shared) => {
        // Scena mogła już ruszyć z nową wspinaczką — podmieniamy tylko panel tej śmierci.
        if (this.death?.board !== board) return;
        this.death = shared ? { ...death, rank: shared.rank, board: shared.board, source: 'shared' } : death;
      });
    }

    this.awaitNewRun();
  }

  /** Po śmierci: R — nowa wspinaczka (nowy seed, piętro 1, pusty, zwykły run), C — zmiana bohatera, M — menu. Pad: A / Y / B. */
  private awaitNewRun(): void {
    const freshSeed = (Date.now() ^ this.runSeed) >>> 0;
    let chosen = false;
    const once = (action: () => void) => (): void => {
      if (chosen) return;
      chosen = true;
      this.deathPad = null;
      action();
    };
    const restart = once(() => {
      // Ten sam bohater i tryb co w zakończonym runie.
      // Wybór piętra (krok 91): R zaczyna od tego samego piętra startowego.
      const floor = this.run.mode === RunMode.FloorSelect ? (this.run.startFloor ?? 1) : 1;
      const fresh: FloorSceneData = { runSeed: freshSeed, floor, run: newRun(this.run.hero, false, this.run.mode, floor) };
      this.scene.restart(fresh);
    });
    // C — zmiana bohatera (krok 38): ekran wyboru z zaznaczonym bohaterem zakończonego runu; HUD wróci z grą.
    const changeHero = once(() => {
      const floor = this.run.mode === RunMode.FloorSelect ? (this.run.startFloor ?? 1) : 1;
      const select: HeroSelectData = { runSeed: freshSeed, floor, preselect: this.run.hero, mode: this.run.mode };
      this.scene.stop(SceneKey.Hud);
      this.scene.start(SceneKey.Select, select);
    });
    // M — menu główne (krok 91).
    const toMenu = once(() => this.quitToMenu());
    this.input.keyboard?.once('keydown-R', restart);
    this.input.keyboard?.once('keydown-C', changeHero);
    this.input.keyboard?.once('keydown-M', toMenu);
    const padActions: Partial<Record<MenuCommand, () => void>> = {
      [MenuCommand.Confirm]: restart,
      [MenuCommand.Alt]: changeHero,
      [MenuCommand.Back]: toMenu,
    };
    this.deathPad = { readyAt: this.time.now + GAMEPAD_CONFIG.deathInputDelayMs, kind: 'restart', on: (command) => padActions[command]?.() };
  }

  /** Na co czeka ekran śmierci (krok 96 — przyciski dotykowe); null, gdy bohater żyje albo wybór już padł. */
  get deathChoice(): 'name' | 'restart' | null {
    return this.deathPad?.kind ?? null;
  }

  /** Wybór na ekranie śmierci jak z klawiatury lub pada: Confirm — nowa wspinaczka, Alt — bohater, Back — menu. */
  deathCommand(command: MenuCommand): void {
    this.deathPad?.on(command);
  }

  /** Imię na tablicę z dotyku (okno przeglądarki); null = bez imienia. */
  submitPlayerName(name: string | null): void {
    this.deathPad?.submitName?.(name);
  }

  /** Broń bohatera — przycisk strzału na dotyku nazywa się STRZAŁ, PROMIEŃ albo SALWA (krok 96). */
  get heroKit(): HeroKit['kind'] {
    return this.hero.kit.kind;
  }

  /** Pauza z przycisku na ekranie (krok 96, dotyk) — jak Esc. */
  requestPause(): void {
    this.pauseGame('manual');
  }

  /** Cele automatycznego celowania na dotyku: żywi wrogowie widoczni w świetle (Mrok i mgła ich nie zdradzają) i boss z pomocnikami. */
  private *aimTargets(): Iterable<AimTarget> {
    for (const enemy of this.enemies.living) {
      if (!enemy.active || enemy.isDead) continue;
      const visibility = (enemy.getData(LIGHT_VISIBILITY_KEY) as number | undefined) ?? 1;
      if (visibility >= AIM_ASSIST_MIN_VISIBILITY) yield { x: enemy.x, y: enemy.y, radius: enemy.radius };
    }
    yield* this.bossFight.aimTargets;
  }

  /**
   * Schody (krok 47, zgłoszenie właściciela): samo wejście na nie nie przenosi wyżej — gracz zbyt często wpadał
   * na nie przypadkiem i tracił łupy i ukrytą komnatę. Trzeba stanąć na schodach i nacisnąć E (jak przy kapliczce).
   */
  private checkStairs(interactPressed: boolean): void {
    const tile = DungeonView.worldToTile(this.player.x, this.player.y);
    this.onStairs = this.stairsUnlocked && isStairsTile(this.dungeon, tile);
    this.stairsPrompt?.setVisible(this.onStairs);
    if (this.onStairs && interactPressed) {
      this.stairsPrompt?.setVisible(false);
      this.goToNextFloor();
    }
  }

  /** Napis nad schodami, widoczny, gdy gracz na nich stoi. */
  private createStairsPrompt(): void {
    const { x, y } = DungeonView.tileToWorldCenter(this.dungeon.stairs);
    this.stairsPrompt = this.add
      .text(x + (STAIRS_SIZE - 1) * (TILE_SIZE / 2), y - TILE_SIZE, STAIRS_PROMPT, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffe08a',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.worldText)
      .setVisible(false);
  }

  private goToNextFloor(): void {
    diag.note('stairs-up', { from: this.floorNumber });
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

  private get bossRush(): boolean {
    return this.bossRushArena !== null;
  }

  /** Areny bossów (krok 90): po bossie i pomocnikach — karty nagrody, potem odliczanie i teleport na kolejną arenę. */
  private updateBossRush(now: number): void {
    const arena = this.bossRushArena;
    if (!arena) return;
    const step = arena.update({
      bossDefeated: this.bossFight.isDefeated,
      enemiesAlive: this.enemies.aliveCount,
      playerDead: this.player.isDead,
      now,
    });
    if (step === 'announce-clear') this.showToast(BOSS_RUSH_TEXT.clearToast);
    else if (step === 'offer-reward') {
      diag.note('boss-rush-cleared', { arena: this.floorNumber });
      this.offerBossReward(() => {
        arena.rewardTaken();
        this.showToast(BOSS_RUSH_TEXT.teleportToast, BOSS_RUSH_CONFIG.teleportDelayMs);
      });
    } else if (step === 'teleport') this.teleportToNextArena();
  }

  private teleportToNextArena(): void {
    diag.note('boss-rush-teleport', { from: this.floorNumber });
    this.isTransitioning = true;
    // Łup, którego gracz nie zdążył zebrać, nie przepada.
    this.loot.collectAll();
    this.player.setVelocity(0, 0);
    this.effects.impact(this.player.x, this.player.y, TILE_SIZE);
    const { r, g, b } = BOSS_RUSH_CONFIG.teleportFadeColor;
    this.cameras.main.fadeOut(BOSS_RUSH_CONFIG.teleportFadeMs, r, g, b);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const next: FloorSceneData = { runSeed: this.runSeed, floor: this.floorNumber + 1, run: this.run.snapshot(this.player.health.value) };
      this.scene.restart(next);
    });
  }

  /** `?boss=1`: kafel w arenie, dwa kafle od lewej ściany — dość głęboko, by kraty opadły, i daleko od bossa w środku. */
  private bossStartTile(): { x: number; y: number } {
    const arena = this.dungeon.rooms[this.dungeon.bossRoomId]!;
    return { x: arena.x + 2, y: arena.y + Math.floor(arena.height / 2) };
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
            lights: () => (torchesLightUp ? this.pointLights() : []),
            player: this.player,
            actors: () => this.hideableEnemies(),
          })
        : null;
    // Po fizyce: światło gracza i widoczność wrogów nie zostają klatkę za nim.
    const render = () => {
      this.lighting.render(this.player, this.pointLights());
      hiding?.update();
    };
    render();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, render);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, render));
  }

  /** Światła piętra: pochodnie i paleniska (krok 41b). */
  private pointLights(): PointLight[] {
    return [...this.torches.lights, ...(this.braziers?.lights ?? [])];
  }

  /** Wrogowie ukrywani poza światłem: zwykli wrogowie i wszystkie pajączki (bez bossa). */
  private *hideableEnemies(): Iterable<Phaser.GameObjects.Sprite> {
    if (this.enemies) {
      for (const enemy of this.enemies.living) if (!this.galleryEnemies.has(enemy) && !this.ambushGhosts.has(enemy)) yield enemy;
    }
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

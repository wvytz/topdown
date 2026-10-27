import Phaser from 'phaser';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { MUSIC_BY_BIOME, MUSIC_DUCK, MUTE_KEY } from '@/config/audioConfig';
import type {
  DeathSummary,
  CoopSceneData,
  CoopSelectData,
  FloorSceneData,
  HeroSelectData,
  HudData,
  HudItem,
  HudPartnerData,
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
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import type { TilesetMeta } from '@/core/tilesetTypes';
import type { ItemId, LootDrop, LootTable } from '@/core/lootTypes';
import { ItemKind, PickupKind } from '@/core/lootTypes';
import { itemFrames } from '@/config/spriteConfig';
import { EnemyType } from '@/core/combatTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH, STAIRS_SIZE, TILE_SIZE, getDungeonConfigForFloor } from '@/config/gameConfig';
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
import { ELITE_VISUAL, RETINUE_MARKER_VISUAL, SECRET_ROOM_VISUAL } from '@/config/spriteConfig';
import { sorceryOf } from '@/core/heroTypes';
import type { HeroId, HeroKit } from '@/core/heroTypes';
import {
  BOSS_LOOT,
  BREAKABLE_LOOT,
  BOSS_REWARD,
  ENEMY_LOOT,
  HIGHSCORE_CONFIG,
  ITEM_DEFINITIONS,
  ITEM_POOL,
  LOOT_SCALING,
  SHRINE_CONFIG,
} from '@/config/lootConfig';
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { eliteAffixCount } from '@/systems/TowerLoop';
import { eliteAnnouncement, eliteLoot, isElite, rollElites } from '@/systems/Elites';
import { BossEncounter } from '@/combat/BossEncounter';
import { duetForFloor } from '@/systems/BossDuet';
import { CeilingDropManager } from '@/combat/CeilingDropManager';
import { CocoonManager } from '@/combat/CocoonManager';
import { PuffballManager } from '@/combat/PuffballManager';
import { WallDogManager } from '@/combat/WallDogManager';
import { BrazierManager } from '@/combat/BrazierManager';
import { planShrineLocation } from '@/dungeon/ShrinePlanner';
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
import type { PlayerInput } from '@/input/playerInput';
import { createPlayerInput } from '@/input/playerInput';
import { bindPadMenu } from '@/input/PadMenuInput';
import { MenuCommand } from '@/systems/gamepadInput';
import { GAMEPAD_CONFIG } from '@/config/gamepadConfig';
import { AIM_ASSIST_MIN_VISIBILITY } from '@/config/touchConfig';
import type { AimTarget } from '@/systems/touchAim';
import { LarderCocoon } from '@/entities/LarderCocoon';
import { Party } from '@/entities/Party';
import { spotBeside, straysOutside } from '@/systems/Party';
import { ReviveProgress, reviveHp } from '@/systems/Revive';
import { SOLO_BALANCE, withExtraEnemies } from '@/systems/CoopBalance';
import type { CoopBalanceConfig } from '@/systems/CoopBalance';
import { isDeepInsideRoom } from '@/dungeon/arenaGates';
import { Player } from '@/entities/Player';
import type { PlayerActions } from '@/entities/Player';
import { rollLoot } from '@/systems/Loot';
import { rollItemChoices } from '@/systems/RewardChoice';
import type { RewardSceneData } from '@/scenes/RewardScene';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { NEW_RUN, RunState, newRun } from '@/systems/RunState';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { createBoardHighscores } from '@/persistence/highscoreBoards';
import { PlayerName } from '@/persistence/PlayerName';
import type { ScoreEntry } from '@/systems/Highscores';
import { isNameChar, sanitizePlayerName } from '@/systems/Highscores';
import type { FloorModifierDefinition, FloorModifierEffects } from '@/core/floorModifierTypes';
import { FLOOR_MODIFIER_CONFIG, FLOOR_MODIFIER_POOL } from '@/config/floorModifierConfig';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { HeroCombat, heroLoadout } from '@/combat/HeroCombat';
import type { HeroStrikeTargets } from '@/combat/HeroCombat';
import { COOP_CONFIG } from '@/config/coopConfig';
import { leashPair, leashSpan, partyFocus } from '@/systems/CoopCamera';
import { freshCoop } from '@/systems/Coop';
import { BossHeraldEffects } from '@/effects/BossHerald';
import { DustMotes } from '@/effects/DustMotes';
import { BossStallDetector, LimitWatch, StuckDetector, floorConnectivityIssues, reachable } from '@/systems/AnomalyDetectors';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import { sanityIssues } from '@/systems/Diagnostics';
import { InputReplay, canReplay } from '@/systems/InputRecorder';
import { BOSS_HERALD, HERALD_RUMBLE } from '@/config/bossHeraldConfig';
import { FogWisps } from '@/effects/FogWisps';
import { LightingOverlay } from '@/effects/LightingOverlay';
import { installSmoothPhysics } from '@/world/SmoothPhysics';
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
import { BOSS_RUSH_CONFIG, BOSS_RUSH_DUETS, BOSS_RUSH_TEXT } from '@/config/bossRushConfig';
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
/** Przedmioty do HUD: ikona, licznik kopii, ramka rzadkości. */
function hudItems(counts: readonly { readonly id: ItemId; readonly count: number }[]): HudItem[] {
  return counts.map(({ id, count }) => ({
    name: ITEM_DEFINITIONS[id].name,
    count,
    color: ITEM_DEFINITIONS[id].color,
    frame: itemFrames(id, ITEM_DEFINITIONS[id].kind)[0] ?? '',
    rare: ITEM_DEFINITIONS[id].kind === ItemKind.Effect,
  }));
}

/** Co-op: schody czekają, aż drużyna stanie na nogi. */
const STAIRS_PROMPT_REVIVE = 'Najpierw podnieś partnera';
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

export class GameScene extends Phaser.Scene implements HudSource {
  private player!: Player;
  /** Bohaterowie na piętrze (co-op, etap C0): solo — sam `player`. */
  private party!: Party;
  private inputController!: PlayerInput;
  private dungeon!: DungeonFloor;
  private dungeonView!: DungeonView;
  private enemies!: EnemyManager;
  private projectiles!: ProjectileManager;
  private playerShots!: PlayerShotManager;
  private bossFight!: BossEncounter;
  /**
   * Walka bohaterów (ataki, kieł, ultimate) — po jednym na gracza (co-op, etap C2); pusto przed zbudowaniem sceny,
   * więc szał nie przechodzi na kolejne piętro.
   */
  private heroes: HeroCombat[] = [];
  /** Lokalny co-op (krok 101+): partner i urządzenia graczy; null — gra solo. */
  private coop: CoopSceneData | null = null;
  /** Drugi bohater (co-op); null w grze solo. */
  private partner: Player | null = null;
  private partnerInput: PlayerInput | null = null;
  /** Przedmioty partnera na tym piętrze (decyzja właściciela: każdy zbiera dla siebie; P1 — w `run`). */
  private partnerItems: ItemId[] = [];
  /** Wejście partnera z bieżącej klatki — E przy kapliczce i schodach. */
  private partnerActions: PlayerActions | null = null;
  /** Wskrzeszanie powalonych bohaterów (co-op, etap C4). */
  private readonly revives = new Map<Player, ReviveProgress>();
  private reviveGfx: Phaser.GameObjects.Graphics | null = null;
  private lastReviveAt = 0;
  /** Pozycje bohaterów z poprzedniej klatki — smycz cofa tego, kto się oddala. */
  private leashFrom: [Vector2, Vector2] | null = null;
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
  private itemNotice: { itemId: ItemId; at: number; tag: string } | null = null;
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
  private containment = new Map<Player, PlayerContainment>();
  /** Wnęki galerii areny (krok 44); pusto, gdy boss piętra ich nie ma. */
  private galleryPosts: readonly TilePoint[] = [];
  /** Wrogowie galerii — zawsze widoczni (za kratą w półmroku byliby niewidzialnym działem). */
  private galleryEnemies = new Set<Phaser.GameObjects.Sprite>();
  private readonly highscores = createBoardHighscores('tower');
  /** Tablica aren bossów (krok 91a): najpierw osiągnięta arena, potem złoto; własny klucz, kolejka i trasa workera. */
  private readonly arenaHighscores = createBoardHighscores('arenas');
  /** Co-op (etap C7): osobna tablica drużyn. */
  private readonly coopHighscores = createBoardHighscores('coop');
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
    this.checkpoint = this.replay ? null : { runSeed: data.runSeed, floor: data.floor, run: data.run, ...(data.coop && { coop: data.coop.partner }) };
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
    this.galleryEnemies = new Set();
    this.secretRoom = null;
    this.minimap = null;
    this.gamePaused = false;
    this.herald = null;
    this.heroes = [];
    this.coop = data.coop ?? null;
    this.partner = null;
    this.partnerInput = null;
    this.partnerItems = [...(this.coop?.partner.items ?? [])];
    this.partnerActions = null;
    this.revives.clear();
    this.reviveGfx = null;
    this.lastReviveAt = 0;
    this.leashFrom = null;
    this.ambush = null;
    this.ambushGhosts = new Set();
    this.traps = null;
    this.breakables = null;
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
    // Krok 114: fizyka krokiem klatki obrazu — bez szarpania na monitorach 120/144 Hz.
    installSmoothPhysics(this);

    const spawn = DungeonView.tileToWorldCenter(this.atBoss || this.bossRush ? this.bossStartTile() : this.dungeon.playerSpawn);
    this.player = new Player(this, spawn.x, spawn.y, this.run.hero, this.currentLoadout(), this.startHp);
    this.physics.add.collider(this.player, this.dungeonView.collisionLayer);
    this.partner = this.coop ? this.spawnPartner(this.coop, spawn) : null;
    this.party = new Party(this.partner ? [this.player, this.partner] : [this.player]);

    this.setupCombat();
    this.setupLoot();
    if (!this.bossRush) {
      this.setupShrine();
      this.setupRuinsProps();
    }
    this.setupSecretRoom();
    this.setupAmbush();
    this.createStairsPrompt();
    this.inputController = createPlayerInput(this, this.coop?.devices[0]);
    this.partnerInput = this.coop && this.partner ? createPlayerInput(this, this.coop.devices[1]) : null;
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
    this.setupAudio();
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
  /** Muzyka gra w trybie walki z bossem (krok 116). */
  private musicIntense = false;
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
    this.updateMusic();
    this.trackBossProgress();

    const actions = this.nextActions(time);
    this.moveHeld = actions.move.x !== 0 || actions.move.y !== 0;
    this.heroes[0]?.tick(actions, time);
    // Co-op (etap C2): partner ze swojego urządzenia.
    const partnerHero = this.heroes[1];
    if (partnerHero && this.partnerInput) {
      const partner = partnerHero.player;
      this.partnerActions = this.partnerInput.getActions({ origin: { x: partner.x, y: partner.y }, targets: () => this.aimTargets() });
      partnerHero.tick(this.partnerActions, time);
    }
    const interactOf = (hero: Player) => (hero === this.player ? actions.interact : (this.partnerActions?.interact ?? false));
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
      (shot, owner) => {
        // Co-op: trafienie liczy się strzelcowi (kieł, rozprysk, nietykalność bossa spoza areny).
        const shooter = this.heroes.find((hero) => hero.player === owner) ?? this.heroes[0];
        const attacker = shooter?.player;
        // Krok 93: kieł leczy tylko za trafienie wroga lub bossa, nie kokonu (też spiżarni), purchawki czy urny.
        const creature = this.enemies.resolvePlayerShot(shot) ?? this.bossFight.resolvePlayerShot(shot, attacker);
        const target =
          creature ?? this.cocoons?.resolvePlayerShot(shot) ?? this.puffballs?.resolvePlayerShot(shot) ?? this.secretRoom?.resolvePlayerShot(shot) ?? this.breakables?.resolvePlayerShot(shot) ?? null;
        if (target) shooter?.afterShotHit(shot, target, creature !== null && !(creature instanceof LarderCocoon), time);
        return target;
      },
    );
    this.loot.update(time);
    this.shrine?.update(interactOf);
    this.updateRevives(time);

    // Co-op: run trwa, dopóki stoi choć jeden bohater (powalonego wskrzesza partner).
    if (this.party.isDown) this.handlePlayerDeath();
    else this.checkStairs(interactOf);
    this.updateBossRush(time);
  }

  getHudData(): HudData {
    // HUD może odpytać scenę zanim create() zbuduje gracza (np. w trakcie restartu).
    const ready = Boolean(this.player?.active);
    return {
      floor: this.floorNumber,
      arenaLabel: this.bossRush ? arenaLabel(this.floorNumber, this.bossFight.name, TOWER_CONFIG) : null,
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
      isPlayerDead: ready && this.party.isDown,
      minimap: ready ? this.minimapData() : null,
      boss: ready ? this.bossFight.getStatus() : null,
      gold: this.run.gold,
      practice: this.run.practice,
      bossRush: this.bossRush,
      items: hudItems(this.run.itemCounts()),
      toast: this.currentToast(),
      itemNotice: this.currentItemNotice(),
      death: this.death,
      playerLabel: ready && this.partner ? `P1 · ${this.hero.name}` : '',
      partner: ready ? this.partnerHud() : null,
    };
  }

  /** Panel P2 w HUD (co-op, etap C5). */
  private partnerHud(): HudPartnerData | null {
    const partner = this.partner;
    if (!partner) return null;
    const now = this.time.now;
    const counts = new Map<ItemId, number>();
    for (const id of this.partnerItems) counts.set(id, (counts.get(id) ?? 0) + 1);
    const hero = HERO_DEFINITIONS[this.heroIdOf(partner)];
    return {
      label: `P2 · ${hero.name}`,
      hp: Math.round(partner.health.value),
      maxHp: Math.round(partner.health.max),
      dashReadiness: partner.dashReadiness(now),
      ultimate: { ...partner.ultimateStatus(now), name: hero.ultimate.name },
      downed: partner.isDead && !this.party.isDown,
      reviveProgress: this.revives.get(partner)?.progress ?? 0,
      items: hudItems([...counts].map(([id, count]) => ({ id, count }))),
    };
  }

  /** Odkrywa mgłę wokół gracza i oddaje dane minimapy; arena bossa znika ze znaczników po jego pokonaniu. */
  private minimapData(): MinimapHudData | null {
    if (!this.minimap) return null;
    const player = DungeonView.worldToTile(this.player.x, this.player.y);
    // Co-op: mgłę minimapy odkrywają obaj bohaterowie.
    for (const member of this.party.living) this.minimap.reveal(DungeonView.worldToTile(member.x, member.y));
    this.minimap.reveal(player);
    const arena = this.dungeon.rooms[this.dungeon.bossRoomId];
    return {
      explorer: this.minimap,
      player,
      partner: this.partner ? DungeonView.worldToTile(this.partner.x, this.partner.y) : null,
      stairs: this.dungeon.stairs,
      boss: arena && !this.bossFight.isDefeated ? { x: arena.x + Math.floor(arena.width / 2), y: arena.y + Math.floor(arena.height / 2) } : null,
    };
  }

  /** Loadout pierwszego gracza (przedmioty runu); partner liczy swój w `HeroCombat`. */
  private currentLoadout(): PlayerLoadout {
    return heroLoadout(this.run.hero, this.run.items, this.floorEffects, this.heroes[0]?.ultimates.isRaging(this.time.now) ?? false);
  }

  /**
   * Drugi bohater (co-op, etap C2): obok pierwszego, gdy jest tam podłoga, inaczej na tym samym miejscu
   * (kolizja ciał ich rozsunie). Własne przedmioty i HP z poprzedniego piętra.
   */
  private spawnPartner(coop: CoopSceneData, at: Vector2): Player {
    const { partner } = coop;
    const offset = COOP_CONFIG.partnerSpawnOffsetPx;
    const walls = this.dungeonView.collisionLayer;
    const side = [offset, -offset].map((dx) => ({ x: at.x + dx, y: at.y })).find((p) => !(walls.getTileAtWorldXY(p.x, p.y)?.collides ?? false)) ?? at;
    const player = new Player(this, side.x, side.y, partner.hero, heroLoadout(partner.hero, partner.items, this.floorEffects, false), partner.hp);
    this.physics.add.collider(player, walls);
    this.physics.add.collider(player, this.player);
    return player;
  }

  private get hero() {
    return HERO_DEFINITIONS[this.run.hero];
  }

  /** Segmenty HUD przed zbudowaniem gracza: kule Czarodziejki albo ładunki strzału. */
  private get heroCharges(): number {
    return sorceryOf(this.hero.kit)?.orbs.maxOrbs ?? this.hero.combat.ranged.maxCharges;
  }

  /** Wywoływane po pokonaniu bossa — zamyka pętlę piętra. */
  private unlockStairs(): void {
    if (this.stairsUnlocked) return;
    this.stairsUnlocked = true;
    this.dungeonView.openStairs();
  }

  /** Wabik: pierwszy stojący totem łucznika (każdy bohater ma własne ultimate). */
  private aggroTarget(): Vector2 | null {
    for (const hero of this.heroes) {
      const lure = hero.ultimates.aggroTarget;
      if (lure) return lure;
    }
    return null;
  }

  /** Cele ataków bohaterów na piętrze — kolejność trafień jak przed co-opem. */
  private heroStrikes(): HeroStrikeTargets {
    return {
      melee: (swing, attacker) => {
        const creatureHits = this.enemies.resolvePlayerMelee(swing) + this.bossFight.resolvePlayerMelee(swing, attacker);
        this.cocoons?.resolvePlayerMelee(swing);
        this.puffballs?.resolvePlayerMelee(swing);
        this.secretRoom?.resolvePlayerMelee(swing);
        this.breakables?.resolvePlayerMelee(swing);
        return creatureHits;
      },
      beam: (beam, attacker) => {
        this.enemies.resolvePlayerBeam(beam);
        this.bossFight.resolvePlayerBeam(beam, attacker);
        this.cocoons?.resolvePlayerBeam(beam);
        this.puffballs?.resolvePlayerBeam(beam);
        this.secretRoom?.resolvePlayerBeam(beam);
        this.breakables?.resolvePlayerBeam(beam);
      },
      splash: (strike, attacker) => {
        this.enemies.resolveSplash(strike);
        this.bossFight.resolveSplash(strike, attacker);
      },
      dash: (sweep, alreadyHit, attacker) => {
        this.enemies.resolveDashSweep(sweep, alreadyHit);
        this.bossFight.resolveDashSweep(sweep, alreadyHit, attacker);
        this.cocoons?.resolveDashSweep(sweep, alreadyHit);
        this.puffballs?.resolveDashSweep(sweep, alreadyHit);
        this.secretRoom?.resolveDashSweep(sweep, alreadyHit);
        this.breakables?.resolveDashSweep(sweep, alreadyHit);
      },
    };
  }

  private setupCombat(): void {
    this.effects = new CombatEffects(this);
    const onPlayerHit = (): void => this.effects.playerHit();

    this.projectiles = new ProjectileManager(this, this.dungeonView.collisionLayer, this.party, onPlayerHit, this.combatDecals);
    this.playerShots = new PlayerShotManager(this, this.dungeonView.collisionLayer);
    this.enemies = new EnemyManager({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      floorEffects: this.floorEffects,
      hpMultiplier: this.balance.enemyHpMultiplier,
      enemyVariants: this.biome.enemyVariants,
      walls: this.dungeonView.collisionLayer,
      party: this.party,
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
      aggroTarget: () => this.aggroTarget(),
      onEliteSpotted: (enemy) => this.showToast(eliteAnnouncement(enemy.definition.affixes ?? [], ELITE_CONFIG), ELITE_VISUAL.toastMs),
    });

    // Areny bossów (krok 90): bez wrogów w pokojach i bez zagrożeń biomu poza areną — tylko boss i jego pomocnicy.
    if (!this.bossRush) {
      const rng = createRng(deriveSeed(this.dungeon.seed, ENCOUNTER_SEED_SALT));
      const spawns = planEncounters(this.dungeon, withExtraEnemies(getEncounterConfigForFloor(this.floorNumber), this.balance.extraEnemiesPerRoom), rng);
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
          party: this.party,
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
          party: this.party,
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
          party: this.party,
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
          party: this.party,
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
          party: this.party,
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
          party: this.party,
          avoid: shrineTile ? [shrineTile] : [],
          onPlayerHit,
        })
      : null;

    // Duet bossów (krok 112): na razie tylko w arenach bossów.
    const duet = this.bossRush ? duetForFloor(this.floorNumber, BOSS_RUSH_DUETS, TOWER_CONFIG) : null;
    this.bossFight = new BossEncounter({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      walls: this.dungeonView.collisionLayer,
      party: this.party,
      bossHpMultiplier: this.balance.bossHpMultiplier,
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
        if (!this.party.isDown) this.offerBossReward();
      },
      aggroTarget: () => this.aggroTarget(),
    }, duet);

    // Walka bohaterów (ataki, kieł, ultimate R z kroku 98) — po jednym na gracza.
    this.heroes = this.party.members.map(
      (player) =>
        new HeroCombat({
          scene: this,
          player,
          hero: this.heroIdOf(player),
          // Każdy zbiera dla siebie (decyzja właściciela): P1 — przedmioty runu, partner — własne.
          items: player === this.player ? () => this.run.items : () => this.partnerItems,
          floorEffects: this.floorEffects,
          floorNumber: this.floorNumber,
          effects: this.effects,
          playerShots: this.playerShots,
          walls: this.dungeonView.collisionLayer,
          strikes: this.heroStrikes(),
          aimTargets: () => this.aimTargets(),
        }),
    );

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
      party: this.party,
      effects: this.effects,
      isBossFighting: () => this.bossFight.isFighting,
      isBossDefeated: () => this.bossFight.isDefeated,
      onSealed: () => {
        diag.note('arena-sealed', { floor: this.floorNumber });
        this.showToast('Kraty opadły — nie ma odwrotu!');
        this.manGalleries();
      },
      gather: (anchor, room) => this.gatherParty(anchor, room),
    });

    const arena = this.dungeon.rooms[this.dungeon.bossRoomId]!;
    const isAllowed = (tile: TilePoint) =>
      !this.dungeonView.collisionLayer.hasTileAt(tile.x, tile.y) && (!this.arenaGates.sealed || roomContainsTile(arena, tile));
    // Co-op: każdy bohater ma własny bezpiecznik (osobne „ostatnie dozwolone miejsce”).
    this.containment = new Map(this.party.members.map((hero) => [hero, new PlayerContainment(TILE_SIZE, isAllowed)]));
  }

  /** Bezpiecznik kroku 99: bohater przepchnięty przez kolizję wraca na ostatnie dozwolone miejsce. */
  private keepPlayerContained(): void {
    for (const [hero, containment] of this.containment) {
      const body = hero.body as Phaser.Physics.Arcade.Body;
      const back = containment.update(body.center);
      if (!back) continue;
      diag.note('player-unstuck', { floor: this.floorNumber, sealed: this.arenaGates.sealed, player: this.playerTag(hero) }, 'warn', 'Gracz przepchnięty przez kolizję — cofnięty');
      body.reset(back.x, back.y);
    }
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
          party: this.party,
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
      party: this.party,
      enemies: this.enemies,
      effects: this.effects,
      rng: createRng(deriveSeed(this.dungeon.seed, AMBUSH_SEED_SALT)),
      spawnLoot: (at, drops) => this.loot.spawn(at, drops),
      onGhost: (ghost) => this.ambushGhosts.add(ghost),
      toast: (text) => this.showToast(text),
      gather: (anchor, room) => this.gatherParty(anchor, room),
    });
  }

  /**
   * Co-op (etap C3): kraty opadają, gdy jeden bohater wszedł w głąb pokoju — partnera spoza pokoju
   * przenosimy obok niego, by nikt nie został odcięty od walki (solo nic nie robi).
   */
  private gatherParty(anchor: Player, room: Room): void {
    const walls = this.dungeonView.collisionLayer;
    const isWalkable = (at: Vector2) => !(walls.getTileAtWorldXY(at.x, at.y)?.collides ?? true);
    const inside = (at: Vector2) => isDeepInsideRoom(room, DungeonView.worldToTile(at.x, at.y), COOP_CONFIG.gatherMarginTiles);
    const strays = straysOutside(this.party.members, anchor, inside);
    if (strays.length === 0) return;
    for (const hero of strays) {
      const to = spotBeside(anchor, COOP_CONFIG.partnerSpawnOffsetPx, isWalkable);
      this.effects.impact(hero.x, hero.y, TILE_SIZE * 0.5);
      hero.setPosition(to.x, to.y);
      (hero.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      this.effects.impact(to.x, to.y, TILE_SIZE * 0.5);
    }
    this.leashFrom = null;
    diag.note('coop-gather', { floor: this.floorNumber, room: room.id });
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
        party: this.party,
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
      party: this.party,
      // Mikstury zostają na ziemi, dopóki gracz ma pełne HP — można po nie wrócić.
      canCollect: (drop, collector) =>
        (drop.kind !== PickupKind.Health || !collector.health.isFull) && (this.ambush?.canCollect(drop) ?? true),
      // Co-op (etap C4): złoto do wspólnej sakiewki runu, mikstura i przedmiot dla tego, kto podniósł.
      onCollect: (drop, position, collector) => this.collect(drop, position, collector),
    });
  }

  private setupShrine(): void {
    this.shrine = new ShrineSite({
      scene: this,
      floor: this.dungeon,
      floorNumber: this.floorNumber,
      party: this.party,
      run: this.run,
      rng: createRng(deriveSeed(this.dungeon.seed, SHRINE_SEED_SALT)),
      config: applyFloorToShrine(SHRINE_CONFIG, this.floorEffects),
      onBlessing: (itemId, cost, hero) => {
        diag.note('shrine-offering', { floor: this.floorNumber, item: itemId, cost });
        this.effects.floatingText(hero.x, hero.y, `-${cost}`, '#f5c542');
        sound.play(SoundCue.Shrine, hero);
        this.grantItem(itemId, hero);
      },
    });
  }

  private dropLoot(position: Vector2, table: LootTable): void {
    this.loot.spawn(position, rollLoot(table, this.floorNumber, LOOT_SCALING, ITEM_POOL, this.lootRng));
  }

  private collect(drop: LootDrop, position: Vector2, collector: Player = this.player): void {
    switch (drop.kind) {
      case PickupKind.Gold:
        this.run.addGold(drop.amount);
        this.effects.floatingText(position.x, position.y, `+${drop.amount}`, '#f5c542');
        sound.play(SoundCue.Coin, position);
        break;
      case PickupKind.Health:
        collector.heal(drop.amount);
        this.effects.floatingText(position.x, position.y, `+${drop.amount} HP`, '#ff6b8a');
        sound.play(SoundCue.Heal, position);
        break;
      case PickupKind.Item:
        sound.play(SoundCue.ItemPickup, position);
        this.grantItem(drop.itemId, collector);
        break;
    }
  }

  /** Przedmiot dla bohatera (co-op: dla tego, kto go podniósł albo wybrał). */
  private grantItem(itemId: ItemId, hero: Player = this.player): void {
    if (hero === this.player) this.run.addItem(itemId);
    else this.partnerItems.push(itemId);
    const combat = this.heroes.find((h) => h.player === hero);
    hero.applyLoadout(combat ? combat.loadout() : this.currentLoadout());
    this.showItemNotice(itemId, hero);
  }

  /** Balans co-opu (etap C6); solo — bez zmian. */
  private get balance(): CoopBalanceConfig {
    return this.coop ? COOP_CONFIG.balance : SOLO_BALANCE;
  }

  private heroIdOf(hero: Player): HeroId {
    return hero === this.player ? this.run.hero : (this.coop?.partner.hero ?? this.run.hero);
  }

  /** Numer gracza do napisów w co-opie („P2”); solo — pusto. */
  private playerTag(hero: Player): string {
    if (!this.partner) return '';
    return hero === this.player ? 'P1' : 'P2';
  }

  /**
   * Powaleni bohaterowie (co-op, etap C4): partner stoi obok — pasek rośnie, po pełnym bohater wstaje
   * (`COOP_CONFIG.revive`). Nad powalonym krąg zasięgu i pasek postępu.
   */
  private updateRevives(now: number): void {
    if (!this.partner) return;
    const dtMs = this.lastReviveAt === 0 ? 0 : now - this.lastReviveAt;
    this.lastReviveAt = now;
    const gfx = (this.reviveGfx ??= this.add.graphics().setDepth(RENDER_DEPTH.worldText));
    gfx.clear();
    if (this.party.isDown) return;
    const config = COOP_CONFIG.revive;
    const helpers = this.party.living;
    for (const hero of this.party.members) {
      if (!hero.isDead) continue;
      let progress = this.revives.get(hero);
      if (!progress) {
        progress = new ReviveProgress(config);
        this.revives.set(hero, progress);
        diag.note('coop-downed', { floor: this.floorNumber, player: this.playerTag(hero) });
        this.showToast(`${this.playerTag(hero)} powalony — stań przy nim, by go podnieść!`);
      }
      if (progress.update({ downed: hero, helpers, dtMs })) {
        hero.revive(reviveHp(hero.health.max, config), COOP_CONFIG.reviveInvulnerabilityMs, now);
        this.revives.delete(hero);
        this.effects.impact(hero.x, hero.y, TILE_SIZE);
        this.effects.floatingText(hero.x, hero.y - 12, 'Wstaje!', '#8affa0');
        sound.play(SoundCue.HeroRevive, hero);
        diag.note('coop-revived', { floor: this.floorNumber, player: this.playerTag(hero) });
        continue;
      }
      const helped = progress.isHelped({ downed: hero, helpers });
      gfx.lineStyle(1, helped ? 0x8affa0 : 0xffffff, helped ? 0.9 : 0.35 + 0.25 * Math.sin(now / 200));
      gfx.strokeCircle(hero.x, hero.y, config.radiusPx);
      if (progress.progress > 0) {
        const w = 24;
        gfx.fillStyle(0x000000, 0.7).fillRect(hero.x - w / 2 - 1, hero.y - 21, w + 2, 5);
        gfx.fillStyle(0x8affa0, 1).fillRect(hero.x - w / 2, hero.y - 20, w * progress.progress, 3);
      }
    }
  }

  /** Nagroda za bossa: gra staje, gracz wybiera 1 z kart. Po wyborze gra rusza dalej. */
  /** Pauza (krok 70): Esc / P zawsze; auto-pauza po utracie fokusu albo ukryciu karty. */
  /**
   * Dźwięk piętra (krok 116): klimat muzyki z biomu, słuch w środku kamery (w co-opie — między bohaterami),
   * N — wyciszenie. Bez ekranu śmierci: tam klawiatura wpisuje imię.
   */
  private setupAudio(): void {
    const camera = this.cameras.main;
    sound.setListener(() => ({ x: camera.midPoint.x, y: camera.midPoint.y }));
    sound.setMusic(MUSIC_BY_BIOME[this.biome.id]);
    this.musicIntense = false;
    sound.setMusicIntense(false);
    sound.setMusicDuck(1);
    this.input.keyboard?.on(`keydown-${MUTE_KEY}`, (event: KeyboardEvent) => {
      if (!event.repeat && !this.death) sound.toggleMute();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sound.setListener(null));
  }

  /** Walka z bossem — muzyka z bębnem; po walce wraca spokój. */
  private updateMusic(): void {
    const intense = this.bossFight.isFighting;
    if (intense === this.musicIntense) return;
    this.musicIntense = intense;
    sound.setMusicIntense(intense);
    if (intense) sound.play(SoundCue.BossRoar);
  }

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
    if (this.gamePaused || this.isTransitioning || this.death || !this.player?.active || this.party.isDown) return;
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
    sound.setMusicDuck(MUSIC_DUCK.pause);
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
    sound.setMusicDuck(1);
    // Klawisze puszczone w czasie pauzy nie dotarły do wstrzymanej sceny — bez resetu bohater szedłby sam.
    this.input.keyboard?.resetKeys();
  }

  private offerBossReward(onPicked?: () => void): void {
    const rng = createRng(deriveSeed(this.dungeon.seed, REWARD_SEED_SALT));
    // Co-op (etap C4): każdy bohater wybiera swoją kartę, po kolei P1, potem P2 (także powalony — wstaje z nagrodą później).
    const pickers = [...this.party.members];
    const offerNext = (): void => {
      const hero = pickers.shift();
      if (!hero) {
        onPicked?.();
        return;
      }
      this.offerRewardTo(hero, rollItemChoices(ITEM_POOL, BOSS_REWARD.choices, rng), offerNext);
    };
    offerNext();
  }

  private offerRewardTo(hero: Player, choices: readonly ItemId[], onPicked: () => void): void {
    if (choices.length === 0) {
      onPicked();
      return;
    }

    const owned: Partial<Record<ItemId, number>> = {};
    const items = hero === this.player ? this.run.items : this.partnerItems;
    for (const id of items) owned[id] = (owned[id] ?? 0) + 1;

    const tag = this.playerTag(hero);
    const data: RewardSceneData = {
      choices,
      owned,
      ...(tag && { picker: `${tag} — ${HERO_DEFINITIONS[this.heroIdOf(hero)].name} wybiera` }),
      onPick: (itemId) => {
        this.scene.resume(SceneKey.Game);
        this.grantItem(itemId, hero);
        onPicked();
      },
    };
    diag.note('boss-reward-offered', { floor: this.floorNumber, choices: choices.length });
    this.scene.pause();
    this.scene.launch(SceneKey.Reward, data);
  }

  private showToast(text: string, durationMs = TOAST_DURATION_MS): void {
    this.toast = { text, at: this.time.now, durationMs };
  }

  private showItemNotice(itemId: ItemId, hero: Player = this.player): void {
    this.itemNotice = { itemId, at: this.time.now, tag: this.playerTag(hero) };
  }

  private currentItemNotice(): HudItemNotice | null {
    if (!this.itemNotice) return null;
    const remainingMs = ITEM_NOTICE_MS - (this.time.now - this.itemNotice.at);
    const item = ITEM_DEFINITIONS[this.itemNotice.itemId];
    const name = this.itemNotice.tag ? `${this.itemNotice.tag}: ${item.name}` : item.name;
    return remainingMs > 0 ? { name, effect: item.effect, remainingMs } : null;
  }

  private currentToast(): HudToast | null {
    if (!this.toast) return null;
    const remainingMs = this.toast.durationMs - (this.time.now - this.toast.at);
    return remainingMs > 0 ? { text: this.toast.text, remainingMs } : null;
  }

  private handlePlayerDeath(): void {
    if (this.deathHandled) return;
    this.deathHandled = true;
    // Śmierć drużyny: muzyka cichnie (zabrzmiał już krzyk bohatera).
    sound.setMusic(null);
    diag.note('player-death', { floor: this.floorNumber, gold: this.run.gold, hero: this.run.hero, bossFight: this.bossFight.isFighting });
    // Śmierć kończy run — „Kontynuuj” znika (ręczne sloty zostają).
    if (this.checkpoint) this.saves.remove('auto');

    // Złoto w chwili śmierci to wynik runu.
    const base: ScoreEntry = {
      score: this.run.gold,
      floor: this.floorNumber,
      timestamp: Date.now(),
      hero: this.run.hero,
      ...(this.coop && { partner: this.coop.partner.hero }),
    };
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
  private arenaFlag(): { arenas?: true; coop?: true } {
    return this.bossRush ? { arenas: true } : this.coop ? { coop: true } : {};
  }

  /** Zapis wyniku (lokalnie od razu, wspólnie w tle) i czekanie na R. Areny bossów — na własnej tablicy (krok 91a). */
  private recordDeath(entry: ScoreEntry): void {
    const highscores = this.bossRush ? this.arenaHighscores : this.coop ? this.coopHighscores : this.highscores;
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
      // Co-op: nowy run z tym samym partnerem (bez przedmiotów); run testowy do czasu tablicy co-op (etap C7).
      const coop = this.coop ? freshCoop(this.coop.partner.hero, this.coop.devices) : null;
      const fresh: FloorSceneData = {
        runSeed: freshSeed,
        floor,
        run: newRun(this.run.hero, coop !== null, this.run.mode, floor),
        ...(coop && { coop }),
      };
      this.scene.restart(fresh);
    });
    // C — zmiana bohatera (krok 38): ekran wyboru z zaznaczonym bohaterem zakończonego runu; HUD wróci z grą.
    const changeHero = once(() => {
      const floor = this.run.mode === RunMode.FloorSelect ? (this.run.startFloor ?? 1) : 1;
      this.scene.stop(SceneKey.Hud);
      // Co-op (etap C5): zmiana bohaterów na ekranie co-opu — obaj dołączają i wybierają od nowa.
      if (this.coop) {
        const coop: CoopSelectData = { runSeed: freshSeed, practice: this.run.practice };
        this.scene.start(SceneKey.CoopSelect, coop);
        return;
      }
      const select: HeroSelectData = { runSeed: freshSeed, floor, preselect: this.run.hero, mode: this.run.mode };
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
  /** Schody: wchodzi żywy bohater, który na nich stoi; w co-opie najpierw trzeba podnieść powalonego partnera. */
  private checkStairs(interactPressed: (hero: Player) => boolean): void {
    const climber = this.party.living.find((hero) => isStairsTile(this.dungeon, DungeonView.worldToTile(hero.x, hero.y)));
    this.onStairs = this.stairsUnlocked && climber !== undefined;
    const waiting = this.party.members.some((hero) => hero.isDead);
    this.stairsPrompt?.setText(waiting ? STAIRS_PROMPT_REVIVE : STAIRS_PROMPT).setVisible(this.onStairs);
    if (this.onStairs && climber && !waiting && interactPressed(climber)) {
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
    sound.play(SoundCue.Stairs);
    this.isTransitioning = true;
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const next: FloorSceneData = {
        runSeed: this.runSeed,
        floor: this.floorNumber + 1,
        run: this.run.snapshot(this.player.health.value),
        ...this.coopForNextFloor(),
      };
      this.scene.restart(next);
    });
  }

  /** Co-op na kolejne piętro: partner z obecnym HP (powalony wstaje z minimum — zasady wskrzeszania w etapie C4). */
  private coopForNextFloor(): { coop?: CoopSceneData } {
    const { coop, partner } = this;
    if (!coop || !partner) return {};
    return { coop: { ...coop, partner: { ...coop.partner, items: [...this.partnerItems], hp: partner.isDead ? 1 : partner.health.value } } };
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
            players: () => this.lightBearers(),
            actors: () => this.hideableEnemies(),
          })
        : null;
    // Po fizyce: światło gracza i widoczność wrogów nie zostają klatkę za nim.
    const render = () => {
      this.lighting.render(this.lightBearers(), this.pointLights());
      hiding?.update();
    };
    render();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, render);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, render));
  }

  /**
   * Bohaterowie z własnym kręgiem światła i w kadrze kamery: wszyscy, także powaleni (co-op, etap C4 — partner
   * musi widzieć, kogo podnieść); gdy padną obaj — pierwszy gracz (jak solo).
   */
  private lightBearers(): readonly Player[] {
    return this.party.isDown ? [this.player] : this.party.members;
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
    // Co-op (etap C2): kamera idzie za środkiem między bohaterami, smycz trzyma obu w kadrze.
    const follow = this.partner ? this.setupCoopCamera() : this.player;
    cam.startFollow(follow, true, CAMERA_CONFIG.lerp, CAMERA_CONFIG.lerp);
    cam.setDeadzone(CAMERA_CONFIG.deadzoneWidth, CAMERA_CONFIG.deadzoneHeight);
    cam.roundPixels = true;
  }

  /** Punkt kamery i smycz co-opu: po fizyce, zanim kamera i światło policzą kadr. */
  private setupCoopCamera(): Phaser.GameObjects.Zone {
    const focus = this.add.zone(this.player.x, this.player.y, 1, 1);
    const span = leashSpan(
      { x: GAME_WIDTH / CAMERA_CONFIG.zoom, y: GAME_HEIGHT / CAMERA_CONFIG.zoom },
      COOP_CONFIG.leashMarginPx,
    );
    const step = (): void => {
      this.applyLeash(span);
      const center = partyFocus(this.lightBearers());
      if (center) focus.setPosition(center.x, center.y);
    };
    step();
    // Przed oświetleniem (też POST_UPDATE): kolejność rejestracji — kamera ustawia się w tej samej klatce.
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, step));
    return focus;
  }

  /** Smycz (decyzja właściciela): żywi bohaterowie nie rozejdą się poza kadr — cofa się ten, kto się oddala. */
  private applyLeash(span: Vector2): void {
    const [a, b] = this.party.members;
    // Powalony stoi w miejscu, więc smycz trzyma żywego przy nim (etap C4); po śmierci obu — bez smyczy.
    if (!a || !b || this.party.isDown) {
      this.leashFrom = null;
      return;
    }
    const now: [Vector2, Vector2] = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    const [na, nb] = leashPair(this.leashFrom ?? now, now, span);
    for (const [hero, to] of [[a, na], [b, nb]] as const) {
      if (to.x === hero.x && to.y === hero.y) continue;
      hero.setPosition(to.x, to.y);
      (hero.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    }
    this.leashFrom = [na, nb];
  }
}

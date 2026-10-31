import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type {
  AreaStrike,
  BossAttackPlan,
  BossLeap,
  FeastBite,
  ProjectileBurst,
  SpiderlingDefinition,
  SummonSpawn,
  ThrownObject,
  WebShot,
} from '@/core/bossTypes';
import { TileType } from '@/core/dungeonTypes';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import type { BossHudData, Vector2 } from '@/core/types';
import type { BossDefinition, BossDogDefinition, BossId } from '@/core/bossTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { BOSS_SCALING } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { BOSS_SPAWN_SAFETY, bossById, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { withHpMultiplier } from '@/systems/CoopBalance';
import {
  BOSS_LEAP_VISUAL,
  BOSS_PRESENCE_VISUAL,
  BOSS_PROJECTILE_VISUAL,
  BOSS_PATCH_VISUALS,
  BOSS_WEB_VISUAL,
  DEVOURER_FX_VISUAL,
  KING_COCOON_VISUAL,
  SPORE_BLAST_VISUAL,
  LARDER_VISUAL,
  SPIDERLING_DROP_VISUAL,
  THRONE_ROOM_VISUAL,
  SPRITE_SHEETS,
  animationKey,
} from '@/config/spriteConfig';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { isInWebPatch, leapProgress, webFlightProgress } from '@/ai/bossAttacks';
import { CeilingFallView } from '@/combat/CeilingFallView';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { SpiderlingSwarm } from '@/combat/SpiderlingSwarm';
import { drawAreaTelegraph } from '@/effects/AreaTelegraph';
import { DungeonView } from '@/dungeon/DungeonView';
import { roomContainsTile } from '@/dungeon/rooms';
import { arenaCenter } from '@/dungeon/stairs';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { planBossSpawn, spawnKeepOuts } from '@/dungeon/BossSpawnPlanner';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { CombatDecals } from '@/effects/CombatDecals';
import { Boss } from '@/entities/Boss';
import { BossDog } from '@/entities/BossDog';
import { DogPhase } from '@/ai/BossDogBrain';
import { LarderCocoon } from '@/entities/LarderCocoon';
import { planLarders } from '@/dungeon/LarderPlanner';
import { planThrone, planThroneDecals } from '@/dungeon/ThronePlanner';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import type { Spiderling } from '@/entities/Spiderling';
import { knockbackFrom } from '@/systems/CombatMath';
import { isCaughtByGroundArea, isTouchingHeroBody } from '@/systems/Hurtbox';
import type { MeleeSwing, MeleeTarget } from '@/systems/MeleeResolver';
import { resolveMeleeSwing, swingReaches } from '@/systems/MeleeResolver';
import type { BeamStrike, OrbSplash } from '@/systems/Sorcery';
import { beamReaches, resolveBeam, resolveSplash } from '@/systems/Sorcery';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot, shotTouches } from '@/systems/ShotResolver';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { CLEANER_FX_VISUAL, WITCH_FX_VISUAL, spiderlingVisual } from '@/config/spriteConfig';
import { ShoutSchedule } from '@/systems/BossShouts';
import { EscapeStage, escapeStage, shouldEscape } from '@/systems/BossEscape';
import type { DuetArrival } from '@/systems/BossDuet';
import { arrivalWounds } from '@/systems/BossDuet';
import { planElevator } from '@/dungeon/ElevatorPlanner';
import { BRAZIER_VISUAL, DOG_VISUAL, FIRE_RING_VISUAL, RETINUE_MARKER_VISUAL, SHIELD_ARC_VISUAL, SMOKE_VISUAL } from '@/config/spriteConfig';
import { RetinueSchedule, pickRetinueTiles } from '@/systems/BossRetinue';
import { FungalTrail } from '@/systems/FungalTrail';
import type { EnemyType } from '@/core/combatTypes';
import { fireRingRadius, reflectDirection } from '@/systems/Shield';
import { arenaBrazierSpots } from '@/dungeon/BrazierPlanner';
import { BossAttackKind } from '@/core/bossTypes';
import type { CombatDecalKind } from '@/config/dressingConfig';
import { THRONE_ROOM } from '@/config/dressingConfig';
import { SLUDGE_FX, sludgePuddleSheet } from '@/config/sludgeConfig';
import { SludgeCreepView } from '@/effects/SludgeCreepView';
import { creepTargetDepth, isHeroInCreep, puddlesOverLimit, sludgePuddle, stepCreepDepth } from '@/systems/Sludge';

export interface BossFightDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  /** Bohaterowie (co-op, etap C0): boss celuje w najbliższego żywego, ataki obszarowe ranią każdego. */
  readonly party: Party;
  /** Co-op (etap C6): mnożnik HP bossa; solo — brak (1). */
  readonly bossHpMultiplier?: number;
  readonly projectiles: ProjectileManager;
  readonly effects: CombatEffects;
  /** Trwałe ślady walki: przypalenie po uderzeniu obszarowym, szlam po śmierci bossa. */
  readonly decals: CombatDecals;
  readonly onPlayerHit: (player: Player) => void;
  /** Wywoływane po pokonaniu bossa, z miejscem jego śmierci (tam wypadają łupy). */
  readonly onDefeated: (position: Vector2) => void;
  /** Zarażony wychodzący z kokonu spiżarni (Grzybowy Pożeracz): zwykły Rusher biomu. */
  readonly spawnRusher?: (at: Vector2) => void;
  /** Świta bossa (krok 80): zwykły wróg biomu wychodzący na arenę; zwraca go, by liczyć żywych. */
  readonly spawnHelper?: (type: EnemyType, at: Vector2) => { readonly isDead: boolean; readonly active: boolean };
  /** Wabik (totem łucznika, krok 98): boss i jego dog celują w niego zamiast w gracza; null — w gracza. */
  readonly aggroTarget?: () => Vector2 | null;
  /** Duet (krok 114): który boss walczy (skalowany do `floorNumber`); brak — boss tego piętra. */
  readonly bossId?: BossId;
  /** Duet: przesunięcie miejsca startu od środka areny (px). */
  readonly spawnOffset?: Vector2;
  /** Duet: miejsce drugiego bossa (px) — boss staje od niego co najmniej `BOSS_SPAWN_SAFETY.minBossGapTiles`. */
  readonly spawnAvoid?: Vector2;
  /** Duet: własne ziarno losowania bossa i świty (brak — ziarno piętra), by partner nie powtarzał gospodarza. */
  readonly seed?: number;
  /**
   * Duet z wejściem (krok 126): boss czeka poza areną, aż BossEncounter wywoła `arrive` — wtedy wychodzi z windy
   * w północnym murze, ranny. Bez ucieczki (już raz uciekł).
   */
  readonly arrival?: DuetArrival;
}

/** Bohater, który atakuje bossa (pozycja i czy żyje). */
type Attacker = Vector2 & { readonly isDead: boolean; readonly radius: number };

/** Znacznik świty: za `at` ms wyjdzie wróg. */
interface PendingHelper {
  readonly at: number;
  readonly position: Vector2;
  readonly gfx: Phaser.GameObjects.Graphics;
}

export type BossStatus = BossHudData;

interface PendingStrike {
  readonly strike: AreaStrike;
  readonly gfx: Phaser.GameObjects.Graphics;
  /** Strefy tego samego ataku uderzające razem (hak, smuga) — telegraf obrysowuje ich sumę (krok 110). */
  readonly group: readonly AreaStrike[];
}

/** Rzucona sieć: znacznik lądowania, kłąb w locie, potem plama (krok 25). */
interface ThrownWeb {
  readonly shot: WebShot;
  readonly marker: Phaser.GameObjects.Graphics;
  readonly ball: Phaser.GameObjects.Sprite;
  patch: Phaser.GameObjects.Sprite | null;
  /** Płat ze śladu grzybów (krok 111) — liczy się do limitu śladu. */
  readonly trail?: boolean;
  /** Grzyby już więdną (klatki końcowe). */
  withering?: boolean;
}

/** Pajączek z wylęgu (krok 26): cień pojawia się w `telegraphStartAt` — dopiero wtedy znamy miejsce. */
interface PendingSpawn {
  readonly spawn: SummonSpawn;
  position: Vector2 | null;
  view: CeilingFallView | null;
}

/** Kokon rzucony przez Króla (krok 29): lot łukiem; obrażenia i paraliż daje strefa w `strikes`. */
interface PendingThrow {
  readonly thrown: ThrownObject;
  readonly sprite: Phaser.GameObjects.Sprite;
}

/** Królewski skok w toku: przysiad, lot, lądowanie (krok 26). */
interface ActiveLeap {
  readonly leap: BossLeap;
  readonly shadow: Phaser.GameObjects.Graphics;
}

/** Krok przy dosuwaniu miejsc (sieć, pajączek, lądowanie skoku) do wnętrza areny (px). */
const CLAMP_STEP = 8;
/** Cień lecącej królowej = cienie postaci (STYLEGUIDE §6). */
const LEAP_SHADOW_COLOR = 0x1b1a22;
const LEAP_SHADOW_ALPHA = 0.4;
/** Kolejność kierunków wypchnięcia gracza spod lądującej królowej (w krokach po 45° od preferowanego). */
const PUSH_OUT_STEPS = [0, 1, -1, 2, -2, 3, -3, 4] as const;

interface PendingBurst {
  readonly burst: ProjectileBurst;
  readonly gfx: Phaser.GameObjects.Graphics;
}

const BOSS_SEED_SALT = 0xb055;
const RETINUE_SEED_SALT = 0x5717;
const LARDER_SEED_SALT = 0x1a4d;
const THRONE_SEED_SALT = 0x7407;
const REFLECT_SEED_SALT = 0x2ef1;
const SHOUT_SEED_SALT = 0x5a0f;
/** Winda nie może stać tuż przy wejściu w północnej ścianie (kafle odstępu). */
const ELEVATOR_ENTRANCE_CLEAR = 1;
/** Napisy uczty i leczenia Pożeracza. */
const FEAST_TEXT_COLOR = '#ff5a6e';
const BOSS_DEFAULT_ENRAGED_LABEL = 'wściekły!';
/** Napis przy paraliżu (barwa jak STATUS_TINTS.paralysis). */
const PARALYSIS_TEXT_COLOR = '#d4f0a8';
const TELEGRAPH_COLOR = 0xff4040;
/** Fale Novy to kule wyplute przez bossa (animowany sprite). */
const BOSS_GLOB = {
  texture: SPRITE_SHEETS[BOSS_PROJECTILE_VISUAL.sheet].key,
  animation: animationKey(BOSS_PROJECTILE_VISUAL.sheet, BOSS_PROJECTILE_VISUAL.animation),
};

/**
 * Walka z bossem: aktywacja po wejściu gracza na arenę, wykonanie zaplanowanych ataków
 * (telegrafy, strefy, fale pocisków) i zgłoszenie zwycięstwa (odblokowanie schodów).
 */
export class BossFight {
  private boss: Boss | null;
  private readonly arena: Room;
  private strikes: PendingStrike[] = [];
  private bursts: PendingBurst[] = [];
  private webs: ThrownWeb[] = [];
  private throws: PendingThrow[] = [];
  /** Wylęg z sufitu: zaplanowane cienie i spadające pajączki. */
  private spawns: PendingSpawn[] = [];
  private leap: ActiveLeap | null = null;
  /** Wstrząs „zewu” przy przebudzeniu i przy wściekłości — po razie na walkę. */
  private introduced = false;
  private wasEnraged = false;
  /** Żywe pajączki-kamikaze z telegrafem zapłonu. */
  private readonly spiderlings: SpiderlingSwarm;
  private readonly spiderlingDefinition: SpiderlingDefinition | null;
  /** Trwa animacja śmierci — boss już nie walczy, ale nagroda i kraty czekają na jej koniec. */
  private dying = false;
  /** Spiżarnia Grzybowego Pożeracza (krok 33): kokony z zarażonymi. */
  private larders: LarderCocoon[] = [];
  private readonly larderRng: Rng;
  private pendingFeast: FeastBite | null = null;
  private readonly retinue: RetinueSchedule | null;
  private readonly retinueRng: Rng;
  /** Kierunki odbitych pocisków (krok 113). */
  private readonly reflectRng: Rng;
  private pendingHelpers: PendingHelper[] = [];
  private helpers: Array<{ readonly isDead: boolean; readonly active: boolean }> = [];
  private pendingRelease: { readonly at: number; readonly larders: LarderCocoon[] } | null = null;
  /** Sala tronowa Grzybowego Pożeracza (krok 39): krew na graczu po trafieniu, sok nad bossem przy leczeniu. */
  private readonly throneRoomFx: boolean;

  private readonly shieldArc: Phaser.GameObjects.Graphics | null;
  /** Kat Otchłani (krok 41f): paleniska areny (oddech), pierścień ognia, rozgrzanie tarczy promieniem. */
  private readonly arenaBraziers: Array<{ readonly at: Vector2; readonly sprite: Phaser.GameObjects.Sprite }> = [];
  private readonly fireRingGfx: Phaser.GameObjects.Graphics | null;
  private fireRingStartAt: number | null = null;
  private shieldHeat = 0;
  /** Dog Barona (krok 83): osobny boss-pomocnik u boku bossa; po śmierci wraca po `respawnMs`. */
  private dog: BossDog | null = null;
  private readonly dogDefinition: BossDogDefinition | null;
  private dogRespawnAt: number | null = null;
  private readonly dogGfx: Phaser.GameObjects.Graphics | null;
  /** Ostatnia chwila `update` — zabójstwa psa liczą od niej czas powrotu. */
  private lastNow = 0;
  private lastUntouchableTextAt = -Infinity;
  /** Ślad grzybów za Pożeraczem (krok 111). */
  private readonly trail: FungalTrail | null;
  private nextMoteAt = 0;
  /** Okrzyki z napisami (sprzątaczki, krok 125). */
  private readonly shouts: ShoutSchedule | null;
  private lastSlipTextAt = -Infinity;
  /** Ostatni napis okrzyku — nowy zastępuje go, żeby napisy się nie nakładały. */
  private lastShout: Phaser.GameObjects.Text | null = null;
  private nextPolishAt = 0;
  /** Włosie miotły na stopach zaplątanych bohaterów (brunetka, krok 126). */
  private tangles: Array<{ readonly player: Player; readonly sprite: Phaser.GameObjects.Sprite }> = [];
  /** Sznur wiadra w locie (sprzątaczka). */
  private readonly ropeGfx: Phaser.GameObjects.Graphics | null;
  /** Winda w północnym murze (krok 125): sprite drzwi i miejsce przed nimi, do którego biegnie boss. */
  private readonly elevator: { readonly sprite: Phaser.GameObjects.Sprite; readonly door: Vector2 } | null;
  /** Duet z wejściem (krok 126): boss jeszcze poza areną / chwila wychodzenia z windy (nietykalny). */
  private dormant = false;
  private enteringUntil = -Infinity;
  /** Szlam od ścian areny (Król Szlamu, krok 152): widok, głębokość pasa (px), początek walki, ostatnia klatka. */
  private readonly creepView: SludgeCreepView | null;
  private creepDepth = 0;
  private creepStartAt: number | null = null;
  private creepLastAt = 0;
  private lastSludgeTextAt = -Infinity;
  /** Ucieczka windą w toku. */
  private escape: { arrivedAt: number | null; closing: boolean } | null = null;
  /** Boss odjechał windą (krok 125) — „pokonany” bez śmierci. */
  escaped = false;
  /** Pełne HP bossa (wspólny pasek duetu liczy je także po jego śmierci). */
  readonly maxHp: number;
  /** Miejsce startu bossa (px) — duet rozstawia według niego partnera. */
  readonly spawnPoint: Vector2;

  constructor(private readonly deps: BossFightDeps) {
    const arena = deps.floor.rooms[deps.floor.bossRoomId];
    if (!arena) throw new Error('BossFight: brak komnaty bossa w danych piętra.');
    this.arena = arena;

    const scaled = withHpMultiplier(scaleBossForFloor(this.baseDefinition(), deps.floorNumber, BOSS_SCALING), deps.bossHpMultiplier ?? 1);
    // Wracający z windy boss już raz uciekł — tym razem walczy do końca.
    const definition = deps.arrival ? withoutEscape(scaled) : scaled;
    this.maxHp = definition.maxHp;
    this.spiderlingDefinition = definition.spiderling ?? null;
    const spawn = this.planSpawn(arena, definition.radius);
    this.spawnPoint = spawn;
    const seed = deps.seed ?? deps.floor.seed;
    const rng = createRng(deriveSeed(seed, BOSS_SEED_SALT));
    const boss = new Boss(deps.scene, spawn.x, spawn.y, definition, rng);
    this.boss = boss;
    this.retinue = definition.retinue && deps.spawnHelper ? new RetinueSchedule(definition.retinue) : null;
    this.retinueRng = createRng(deriveSeed(seed, RETINUE_SEED_SALT));
    this.reflectRng = createRng(deriveSeed(seed, REFLECT_SEED_SALT));
    this.trail = definition.trail ? new FungalTrail(definition.trail) : null;
    this.shouts = definition.shouts ? new ShoutSchedule(definition.shouts, createRng(deriveSeed(seed, SHOUT_SEED_SALT))) : null;
    this.creepView = definition.sludge ? new SludgeCreepView(deps.scene, deps.floor, arena, definition.sludge.creep) : null;
    this.ropeGfx = definition.hook?.look === 'bucket' ? deps.scene.add.graphics().setDepth(RENDER_DEPTH.projectile) : null;
    this.elevator = definition.escape || deps.arrival ? this.buildElevator(arena, definition.radius) : null;
    if (deps.arrival) {
      this.dormant = true;
      boss.setVisible(false);
      (boss.body as Phaser.Physics.Arcade.Body).enable = false;
    }

    deps.scene.physics.add.collider(boss, deps.walls);
    for (const member of deps.party.members) deps.scene.physics.add.collider(member, boss);
    this.spiderlings = new SpiderlingSwarm(deps);
    this.dogDefinition = definition.dog ?? null;
    this.dogGfx = this.dogDefinition ? deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) : null;
    if (this.dogDefinition) this.spawnDog(boss, null);
    // Tarcza (Strażnik Bram, krok 41e): łuk chronionego stożka przed bossem.
    this.shieldArc = definition.shield ? deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) : null;
    this.fireRingGfx = definition.fireRing
      ? deps.scene.add.graphics().setDepth(RENDER_DEPTH.groundFlash).setBlendMode(Phaser.BlendModes.ADD)
      : null;
    for (const tile of arenaBrazierSpots(arena, definition.arenaBraziers ?? 0)) {
      const at = DungeonView.tileToWorldCenter(tile);
      const sprite = deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[BRAZIER_VISUAL.sheet].key).setDepth(RENDER_DEPTH.shrine);
      sprite.play(animationKey(BRAZIER_VISUAL.sheet, BRAZIER_VISUAL.idle));
      this.arenaBraziers.push({ at, sprite });
    }

    this.larderRng = createRng(deriveSeed(deps.floor.seed, LARDER_SEED_SALT));
    const feast = definition.feast;
    this.throneRoomFx = Boolean(feast);
    if (feast) {
      const throne = planThrone(deps.floor, arena, THRONE_ROOM.entranceClearTiles);
      this.dressThroneRoom(throne);
      const tiles = planLarders(deps.floor, arena, feast.larders, this.larderRng, throne, THRONE_ROOM.throneClearTiles);
      tiles.forEach((tile, i) => {
        const at = DungeonView.tileToWorldCenter(tile);
        this.larders.push(new LarderCocoon(deps.scene, at.x, at.y, feast.larderRadius, i));
      });
    }
  }

  /**
   * Miejsce startu bossa (krok 131, uwaga testera): środek areny (w duecie — bok środka), chyba że stoi za blisko
   * wejścia areny, bohatera (areny bossów i `&boss=1` stawiają go na arenie) albo drugiego bossa duetu.
   */
  private planSpawn(arena: Room, bossRadius: number): Vector2 {
    const { floor, party } = this.deps;
    const center = arenaCenter(arena);
    const offset = this.deps.spawnOffset ?? { x: 0, y: 0 };
    const desired = { x: center.x + offset.x / TILE_SIZE, y: center.y + offset.y / TILE_SIZE };
    const heroes = party.members.map((member) => ({ x: member.x / TILE_SIZE, y: member.y / TILE_SIZE }));
    const keepOut = spawnKeepOuts(findRoomEntrances(floor, arena), heroes, BOSS_SPAWN_SAFETY);
    const avoid = this.deps.spawnAvoid;
    if (avoid) keepOut.push({ at: { x: avoid.x / TILE_SIZE, y: avoid.y / TILE_SIZE }, minTiles: BOSS_SPAWN_SAFETY.minBossGapTiles });
    const at = planBossSpawn(floor, arena, desired, keepOut, bossRadius / TILE_SIZE);
    return { x: at.x * TILE_SIZE, y: at.y * TILE_SIZE };
  }

  /**
   * Winda w północnym murze areny (krok 125): stoi zamknięta od początku walki (gracz może się domyślić, dokąd boss
   * ucieknie). Bez miejsca w murze — drzwi „niewidoczne” na środku górnej krawędzi areny.
   */
  private buildElevator(arena: Room, bossRadius: number): { readonly sprite: Phaser.GameObjects.Sprite; readonly door: Vector2 } {
    const tile = planElevator(this.deps.floor, arena, ELEVATOR_ENTRANCE_CLEAR) ?? { x: arena.x + Math.floor(arena.width / 2) - 1, y: arena.y - 1 };
    const x = (tile.x + 1) * TILE_SIZE;
    const wallBottom = (tile.y + 1) * TILE_SIZE;
    const { sheet, closed } = CLEANER_FX_VISUAL.elevator;
    const sprite = this.deps.scene.add.sprite(x, wallBottom, SPRITE_SHEETS[sheet].key).setOrigin(0.5, 1).setDepth(RENDER_DEPTH.wallDecor);
    sprite.play(animationKey(sheet, closed));
    return { sprite, door: { x, y: wallBottom + bossRadius + 2 } };
  }

  /** Tron z grzybni i naklejki krwi, grzybni i soku (dekoracje bez kolizji; zostają po walce). */
  private dressThroneRoom(throne: TilePoint | null): void {
    const { scene, floor } = this.deps;
    const rng = createRng(deriveSeed(floor.seed, THRONE_SEED_SALT));
    const decalsKey = SPRITE_SHEETS[THRONE_ROOM_VISUAL.decals].key;
    for (const decal of planThroneDecals(floor, this.arena, throne, THRONE_ROOM.decals, rng)) {
      const at = DungeonView.tileToWorldCenter(decal.tile);
      scene.add.image(at.x, at.y, decalsKey, decal.kind).setDepth(RENDER_DEPTH.floorDecal);
    }
    if (!throne) return;
    const at = DungeonView.tileToWorldCenter(throne);
    scene.add.image(at.x, at.y, SPRITE_SHEETS[THRONE_ROOM_VISUAL.throne].key).setDepth(RENDER_DEPTH.floorFeature);
  }

  /** Jednorazowy efekt sali tronowej (krew albo sok) w punkcie. */
  private playThroneFx(row: number, x: number, y: number): void {
    if (!this.throneRoomFx) return;
    const { sheet, animation } = THRONE_ROOM_VISUAL.fx;
    const sprite = this.deps.scene.add.sprite(x, y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.slash);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
    sprite.play(animationKey(sheet, animation, row));
  }

  /** Walka trwa (boss obudzony i żywy). */
  get isFighting(): boolean {
    return this.boss?.isFighting ?? false;
  }

  /** Boss pokonany (po animacji śmierci) — na tym piętrze nie będzie już walki. */
  get isDefeated(): boolean {
    return this.boss === null && !this.dying;
  }

  /** Gdzie stoi boss (null po śmierci). */
  get position(): Vector2 | null {
    return this.boss && !this.dormant ? { x: this.boss.x, y: this.boss.y } : null;
  }

  /** Ciało bossa na ziemi (żywy, nie w locie skoku) — tylko takie rozpycha duet. */
  get grounded(): (Vector2 & { readonly radius: number }) | null {
    const boss = this.boss;
    return boss && !this.leap && !this.dormant ? { x: boss.x, y: boss.y, radius: boss.radius } : null;
  }

  /** Przesunięcie bossa (rozpychanie duetu); ściany zatrzymają go w kolejnym kroku fizyki. */
  nudge(delta: Vector2): void {
    this.boss?.setPosition(this.boss.x + delta.x, this.boss.y + delta.y);
  }

  /** HP bossa teraz (0 po śmierci). */
  get hp(): number {
    return this.boss?.health.value ?? 0;
  }

  get isEnraged(): boolean {
    return this.boss?.isEnraged ?? false;
  }

  /** Imię bossa (napis areny). */
  get bossName(): string {
    return this.baseDefinition().name;
  }

  private baseDefinition(): BossDefinition {
    return this.deps.bossId ? bossById(this.deps.bossId) : bossForFloor(this.deps.floorNumber);
  }

  /** Stan dla HUD — null, dopóki walka się nie zaczęła lub po zwycięstwie. */
  getStatus(): BossStatus | null {
    const boss = this.boss;
    if (!boss || !boss.isFighting) return null;
    const { name, title, enragedLabel } = boss.definition;
    return {
      name,
      title: title ?? null,
      enragedLabel: enragedLabel ?? BOSS_DEFAULT_ENRAGED_LABEL,
      hp: boss.health.value,
      maxHp: boss.health.max,
      enraged: boss.isEnraged,
    };
  }

  update(now: number): void {
    const boss = this.boss;
    this.drawShieldArc(boss);
    if (boss?.consumeShieldBreak()) {
      this.deps.effects.impact(boss.x, boss.y, boss.radius * 1.4);
      this.deps.effects.deathBurst(boss.x, boss.y, SHIELD_ARC_VISUAL.color, boss.radius);
      sound.play(SoundCue.Break, boss);
    }
    if (!boss) {
      this.fireRingGfx?.clear();
      return;
    }
    // Partner duetu poza areną (krok 126) albo w drzwiach windy.
    if (this.dormant) return;
    if (this.updateEntering(boss, now)) {
      this.lastNow = now;
      return;
    }
    // Walka zaczyna się, gdy którykolwiek żywy bohater wejdzie na arenę.
    if (!boss.isFighting && this.deps.party.living.some((member) => this.isInArena(member))) boss.activate(now);

    this.lastNow = now;
    const burn = boss.tickBurn(now);
    if (burn > 0) this.deps.effects.floatingText(boss.x, boss.y - boss.radius, `-${burn}`, '#ff8a3c');
    if (boss.isDead) {
      this.defeat();
      return;
    }

    // Ucieczka windą (krok 125): przy progu HP boss przerywa walkę i biegnie do windy; zaplanowane strefy dobiegają końca.
    const escape = boss.definition.escape;
    if (escape && !this.escape && boss.isFighting && shouldEscape(boss.health.value, boss.health.max, escape)) this.startEscape(boss);
    if (this.escape) {
      this.updateEscape(boss, now);
      if (!this.boss) return;
      this.updateStrikes(now);
      this.updateTangles(now);
      this.updateWebs(now);
      this.updateThrows(now);
      return;
    }

    const larders = this.larders.map((larder) => larder.position);
    const braziers = this.arenaBraziers.map((b) => b.at);
    const plan = boss.tick(this.aggroPoint(), now, this.spiderlings.count + this.spawns.length, larders, braziers);
    if (boss.isFighting) this.updateShouts(now);
    this.updateFireRing(boss, now);
    this.updateCreep(boss, now);
    if (plan) this.schedule(plan);
    this.updateLarders(boss, now);
    this.updateRetinue(boss, now);
    this.updatePresence(boss);
    this.updateLeap(boss, now);
    this.updateTrail(boss, now);
    this.updateDog(boss, now);
    this.updatePolish(boss, now);

    this.updateStrikes(now);
    this.updateTangles(now);
    this.updateBursts(now);
    this.updateSpawns(now);
    this.updateWebs(now);
    this.updateThrows(now);
    this.spiderlings.update(now);
  }

  /** Pajączki bossa — ukrywane poza światłem jak zwykli wrogowie (krok 30); sam boss zostaje widoczny. */
  get minions(): readonly Spiderling[] {
    return this.spiderlings.living;
  }

  /** Cele automatycznego celowania na dotyku (krok 96): walczący boss, jego pies i pajączki. */
  get aimTargets(): readonly { readonly x: number; readonly y: number; readonly radius: number }[] {
    const boss = this.boss;
    const fighting = boss && boss.isFighting && !boss.isDead && !this.untouchable(boss) ? [boss] : [];
    return [...this.spiderlings.living, ...(this.dog ? [this.dog] : []), ...fighting];
  }

  /** Cele gracza: pajączki (żywa tarcza), kokony spiżarni i boss. */
  private targets(): Array<Boss | Spiderling | LarderCocoon | BossDog> {
    const living: Array<Spiderling | LarderCocoon | BossDog> = [...this.spiderlings.living, ...this.larders, ...(this.dog ? [this.dog] : [])];
    // Uciekająca do windy sprzątaczka (krok 125) jest nietykalna.
    return this.boss && !this.untouchable(this.boss) ? [...living, this.boss] : living;
  }

  /** Uciekająca do windy albo dopiero z niej wychodząca sprzątaczka jest nietykalna. */
  private untouchable(boss: Boss): boolean {
    return boss.isFleeing || this.dormant || this.lastNow < this.enteringUntil;
  }

  /** Partner duetu jeszcze nie wszedł na arenę (krok 126). */
  get isDormant(): boolean {
    return this.dormant;
  }

  /**
   * Wejście z windy (krok 126): drzwi się otwierają, boss wychodzi z nich ranny (`partnerHpRatio` HP) i nietykalny
   * przez `enterMs`, potem drzwi się zamykają i boss rusza do walki z okrzykiem.
   */
  arrive(now: number): void {
    const boss = this.boss;
    const arrival = this.deps.arrival;
    if (!boss || !this.dormant || !arrival) return;
    this.dormant = false;
    this.enteringUntil = now + arrival.enterMs;
    boss.health.takeDamage(arrivalWounds(boss.health.max, arrival));
    const door = this.elevator?.door ?? { x: boss.x, y: boss.y };
    // Krok 131: bohater stojący przed windą odsuwa się, zanim boss z niej wyjdzie (nie pojawia się na twarzy).
    this.pushPlayerOutOf(door, { x: door.x, y: door.y - boss.radius }, boss.radius + BOSS_SPAWN_SAFETY.arrivalClearPx);
    boss.setPosition(door.x, door.y - boss.radius).setAlpha(0).setVisible(true);
    this.deps.scene.tweens.add({ targets: boss, y: door.y, alpha: 1, duration: arrival.enterMs });
    if (this.elevator) {
      const { sheet, open } = CLEANER_FX_VISUAL.elevator;
      this.elevator.sprite.play(animationKey(sheet, open));
      sound.play(SoundCue.Elevator, door);
    }
  }

  /** Koniec wychodzenia z windy: ciało, walka, zamknięte drzwi i okrzyk. */
  private updateEntering(boss: Boss, now: number): boolean {
    if (this.enteringUntil === -Infinity) return false;
    if (now < this.enteringUntil) return true;
    this.enteringUntil = -Infinity;
    (boss.body as Phaser.Physics.Arcade.Body).enable = true;
    boss.activate(now);
    if (this.elevator) {
      const { sheet, close } = CLEANER_FX_VISUAL.elevator;
      this.elevator.sprite.play(animationKey(sheet, close));
    }
    const line = boss.definition.shouts?.arrive;
    if (line && this.shouts) {
      this.shouts.start(now);
      this.shout(this.shouts.force(line, now));
    }
    return false;
  }

  /**
   * Boss i jego pomocnicy są nietykalni z zewnątrz areny (krok 86, uszczelnienie ostrzału zza krat): cios, strzał,
   * promień, rozprysk i dash gracza stojącego poza prostokątem areny nic im nie robią i nie budzą bossa.
   * Gracz musi wejść na arenę — tam walka się zaczyna, a kraty opadają.
   */
  private playerOutsideArena(attacker: Attacker | undefined): boolean {
    // Co-op (etap C2): liczy się bohater, który atakuje; bez wskazania — pierwszy gracz.
    const hero = attacker ?? this.deps.party.leader;
    if (!this.boss || hero.isDead) return false;
    return !this.isInArena(hero);
  }

  private isInArena(point: Vector2): boolean {
    return roomContainsTile(this.arena, DungeonView.worldToTile(point.x, point.y));
  }

  /** Bohater, na którego patrzy boss (zapowiedzi, świta, pajączki z sufitu); solo — zawsze gracz. */
  private focus(): Player {
    const { party } = this.deps;
    return this.boss ? party.targetFor(this.boss) : party.leader;
  }

  /**
   * Krótka informacja przy próbie zranienia bossa z zewnątrz (najwyżej raz na sekundę) — tylko gdy atak
   * naprawdę sięgnąłby bossa albo jego pomocnika. Zwykła walka gdzie indziej na piętrze nie wyświetla napisu.
   */
  private warnUntouchable(reaches: (target: MeleeTarget) => boolean, attacker: Attacker | undefined): void {
    if (!this.targets().some(reaches)) return;
    const { effects } = this.deps;
    const player = attacker ?? this.deps.party.leader;
    if (this.lastNow - this.lastUntouchableTextAt < 1000) return;
    this.lastUntouchableTextAt = this.lastNow;
    effects.floatingText(player.x, player.y - player.radius - 8, 'Wejdź na arenę!', '#c8c0a8');
  }

  /** Cios gracza — zwraca liczbę trafionych (boss i pajączki w łuku; kokony nie liczą się do Wampirzego kła). */
  resolvePlayerMelee(swing: MeleeSwing, attacker?: Attacker): number {
    if (!this.boss) return 0;
    if (this.playerOutsideArena(attacker)) {
      this.warnUntouchable((t) => swingReaches(swing, t), attacker);
      return 0;
    }
    const { hit, killed } = resolveMeleeSwing(swing, this.targets());
    this.handleKills(killed);
    return hit.filter((t) => !(t instanceof LarderCocoon)).length;
  }

  /** Promień Czarodziejki przez bossa, pajączki i kokony spiżarni. */
  /** Rozprysk kuli Czarodziejki (krok 50): pajączki, kokony spiżarni i boss (tarcza działa jak przy ciosie). */
  /** W co celuje boss: totem łucznika albo najbliższy żywy bohater. */
  private aggroPoint(): Vector2 {
    const player = this.focus();
    return this.deps.aggroTarget?.() ?? { x: player.x, y: player.y };
  }

  resolveSplash(splash: OrbSplash, attacker?: Attacker): void {
    if (this.playerOutsideArena(attacker)) return;
    const { killed } = resolveSplash(splash, this.targets());
    this.handleKills(killed);
  }

  resolvePlayerBeam(beam: BeamStrike, attacker?: Attacker): number {
    if (!this.boss) return 0;
    if (this.playerOutsideArena(attacker)) {
      this.warnUntouchable((t) => beamReaches(beam, t), attacker);
      return 0;
    }
    // Promień w tarczę (z przodu) nie rani bossa — zatrzymuje się na żelazie. U Kata rozgrzewa tarczę.
    const shielded = this.boss.isShieldedFrom(beam.source);
    if (shielded) this.heatShield(this.boss, beam.now);
    const targets = shielded ? this.targets().filter((t) => t !== this.boss) : this.targets();
    const { hit, killed } = resolveBeam(beam, targets);
    this.handleKills(killed);
    return hit.filter((t) => !(t instanceof LarderCocoon)).length;
  }

  /**
   * Pocisk gracza trafia najbliższy cel — pajączek między graczem a bossem przyjmuje strzał na siebie.
   * Zwraca trafiony cel (trafienie budzi bossa jak cios wręcz).
   */
  resolvePlayerShot(shot: PlayerShot, attacker?: Attacker): Boss | Spiderling | LarderCocoon | BossDog | null {
    const boss = this.boss;
    if (!boss) return null;
    if (this.playerOutsideArena(attacker)) {
      this.warnUntouchable((t) => shotTouches(shot, t), attacker);
      return null;
    }
    // Tarcza (krok 41e): pocisk, który trafia w nią z przodu, odbija się (już jako pocisk wroga) — od kroku 111
    // w losową stronę, odchylony od strzelca.
    const shield = boss.definition.shield;
    const touches = Math.hypot(shot.position.x - boss.x, shot.position.y - boss.y) <= shot.radius + boss.radius;
    if (shield && touches && !shot.ignore?.has(boss) && boss.isShieldedFrom(shot.position)) {
      const speed = Math.hypot(shot.velocity.x, shot.velocity.y) * shield.reflectSpeed;
      this.deps.projectiles.fire({
        origin: shot.position,
        direction: reflectDirection(shot.velocity, shield.reflectSpread, this.reflectRng.next),
        speed,
        damage: shot.damage,
        knockback: shot.knockback,
        lifetimeMs: 1500,
      });
      this.deps.effects.impact(shot.position.x, shot.position.y, 10);
      sound.play(SoundCue.ShieldBlock, shot.position);
      boss.activate(shot.now);
      return boss;
    }
    const result = resolvePlayerShot(shot, this.targets());
    if (result?.died) this.handleKills([result.target]);
    return result?.target ?? null;
  }

  /** Burzowy pęd przez bossa i pajączki. */
  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>, attacker?: Attacker): void {
    const boss = this.boss;
    if (!boss) return;
    if (this.playerOutsideArena(attacker)) return;
    const { hit, killed } = resolveDashSweep(sweep, this.targets(), alreadyHit);
    if (hit.includes(boss)) this.deps.effects.floatingText(boss.x, boss.y - boss.radius, `-${sweep.damage}`, '#b8a8ff');
    this.handleKills(killed);
  }

  /** Zabity pajączek ginie bez wybuchu; zabity boss kończy walkę. */
  private handleKills(killed: readonly (Boss | Spiderling | LarderCocoon | BossDog)[]): void {
    if (this.dog && killed.includes(this.dog)) this.killDog(this.lastNow);
    this.spiderlings.handleKills(killed.filter((t): t is Spiderling | Boss => !(t instanceof LarderCocoon) && !(t instanceof BossDog)));
    if (this.boss && killed.includes(this.boss)) this.defeat();
  }

  /** Tylko do debugowania (klawisz B w trybie dev). */
  debugDefeat(): void {
    if (this.boss) this.defeat();
  }

  private schedule(plan: BossAttackPlan): void {
    const scene = this.deps.scene;
    if (plan.kind === BossAttackKind.Kindle) this.kindleBraziers(plan);
    if (plan.kind === BossAttackKind.Roar && this.boss && !this.shouts) {
      this.deps.effects.floatingText(this.boss.x, this.boss.y - this.boss.radius - 8, 'Ryk!', '#ff5a3c');
      sound.play(SoundCue.BossRoar, this.boss);
    }
    const line = this.shouts?.onAttack(plan.kind, scene.time.now);
    if (line) this.shout(line);
    // Strefa uderzenia skoku idzie za miejscem lądowania (mogło zostać dosunięte od ściany).
    const planned = plan.leap;
    const landing = planned ? this.startLeap(planned) : null;
    // Strąki zarodników (krok 111) poza podłogą areny dosuwamy w stronę gracza — strefa, strąk i grzyby razem.
    const moved = new Map<Vector2, Vector2>();
    if (landing && planned) moved.set(planned.to, landing);
    const player = this.focus();
    for (const strike of plan.strikes) {
      if (strike.look !== 'spores') continue;
      moved.set(strike.center, this.clampToward(strike.center, { x: player.x, y: player.y }, (p) => this.isArenaFloor(p)));
    }
    // Kwiaty-oczy (krok 137) poza podłogą areny dosuwamy w stronę gracza — kwiat, nasiono i pierścienie pyłku razem.
    for (const web of plan.webs) {
      if (web.look !== 'flower') continue;
      moved.set(web.to, this.clampToward(web.to, { x: player.x, y: player.y }, (p) => this.isArenaFloor(p)));
    }
    if (plan.kind === BossAttackKind.StorkFlight || plan.kind === BossAttackKind.BirdDive) sound.play(SoundCue.WingFlap, this.boss ?? player);
    // Król Szlamu (krok 152): strefy bez własnego wyglądu dostają wygląd bossa (szlam zamiast czerwieni i ognia).
    const strikeLook = this.boss?.definition.strikeLook;
    const strikes = plan.strikes.map((strike) => ({
      ...strike,
      center: moved.get(strike.center) ?? strike.center,
      ...(strike.look === undefined && strikeLook && { look: strikeLook }),
    }));
    // Płat grzybów ze skoku i strąków wyrasta w faktycznym miejscu lądowania.
    const webs = plan.webs.map((web) => {
      const to = moved.get(web.to);
      return to ? { ...web, from: to, to } : web;
    });
    const throws = plan.throws.map((thrown) => ({ ...thrown, to: moved.get(thrown.to) ?? thrown.to }));
    for (const strike of strikes) {
      const group = strikes.filter((other) => other.impactAt === strike.impactAt && other.telegraphStartAt === strike.telegraphStartAt);
      this.strikes.push({ strike, group, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    for (const planned of plan.bursts) {
      const burst = { ...planned, origin: moved.get(planned.origin) ?? planned.origin };
      this.bursts.push({ burst, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    for (const spawn of plan.spawns) this.spawns.push({ spawn, position: null, view: null });
    for (const thrown of throws) {
      const { sheet, animation } = thrownVisual(thrown);
      const sprite = scene.add
        .sprite(thrown.from.x, thrown.from.y, SPRITE_SHEETS[sheet].key)
        .setDepth(RENDER_DEPTH.projectile)
        .setVisible(false)
        .play(animationKey(sheet, animation));
      // Bocian (krok 137) narysowany dziobem na wschód — obracamy go w kierunku lotu.
      if (thrown.look === 'stork') sprite.setRotation(Math.atan2(thrown.to.y - thrown.from.y, thrown.to.x - thrown.from.x));
      this.throws.push({ thrown, sprite });
    }
    for (const shot of webs) this.throwWeb(shot);
    if (plan.feast) this.pendingFeast = plan.feast;
    if (plan.release) {
      // Zew: drżą kokony wybrane już teraz (gracz widzi, które pękną).
      const pool = [...this.larders];
      const chosen: LarderCocoon[] = [];
      while (chosen.length < plan.release.count && pool.length > 0) chosen.push(...pool.splice(this.larderRng.int(0, pool.length - 1), 1));
      for (const larder of chosen) larder.shake();
      this.pendingRelease = { at: plan.release.at, larders: chosen };
    }
  }

  /**
   * Świta (krok 80): w rytmie z definicji pojawiają się znaczniki z dala od gracza, a po telegrafie wychodzą
   * z nich wrogowie biomu. Limit liczy żywych i tych, którzy dopiero wychodzą.
   */
  private updateRetinue(boss: Boss, now: number): void {
    const def = boss.definition.retinue;
    const spawnHelper = this.deps.spawnHelper;
    if (!this.retinue || !def || !spawnHelper || !boss.isFighting) return;
    this.retinue.activate(now);
    this.helpers = this.helpers.filter((h) => h.active && !h.isDead);
    const alive = this.helpers.length + this.pendingHelpers.length;
    const count = this.retinue.due(now, alive, boss.isEnraged);
    if (count > 0) {
      const heroTiles = this.deps.party.living.map((p) => ({ x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE) }));
      for (const tile of pickRetinueTiles(this.deps.floor, this.arena, heroTiles, count, def.minPlayerDistanceTiles, this.retinueRng)) {
        const position = { x: (tile.x + 0.5) * TILE_SIZE, y: (tile.y + 0.5) * TILE_SIZE };
        const gfx = this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph);
        this.pendingHelpers.push({ at: now + def.telegraphMs, position, gfx });
      }
    }
    const { color, alpha, fillAlpha, radius, pulseMs } = RETINUE_MARKER_VISUAL;
    this.pendingHelpers = this.pendingHelpers.filter((pending) => {
      if (now >= pending.at) {
        pending.gfx.destroy();
        this.helpers.push(spawnHelper(def.type, pending.position));
        this.deps.effects.impact(pending.position.x, pending.position.y, radius);
        sound.play(SoundCue.Impact, pending.position);
        return false;
      }
      const pulse = 0.75 + 0.25 * Math.sin((now / pulseMs) * Math.PI);
      const { x, y } = pending.position;
      pending.gfx.clear().fillStyle(color, fillAlpha).fillCircle(x, y, radius * pulse).lineStyle(2, color, alpha).strokeCircle(x, y, radius * pulse);
      return true;
    });
  }

  /**
   * Spiżarnia: kokon trafiony przez gracza pęka i wypuszcza zarażonego; uczta pożera kokon (leczenie
   * i stos wzmocnienia — tylko jeśli kokon jeszcze był); zew rozrywa wybrane kokony.
   */
  private updateLarders(boss: Boss, now: number): void {
    for (const larder of this.larders.filter((l) => l.tornByHit)) this.tearLarder(larder, 'release');
    const feast = this.pendingFeast;
    if (feast && now >= feast.at) {
      this.pendingFeast = null;
      const eaten = this.larders.find((l) => Math.hypot(l.x - feast.target.x, l.y - feast.target.y) < 1);
      const def = boss.definition.feast;
      if (eaten && def) {
        this.tearLarder(eaten, 'eaten');
        boss.heal(def.heal);
        this.playThroneFx(THRONE_ROOM_VISUAL.fx.sapRow, boss.x, boss.y);
        boss.feasted();
        this.deps.effects.floatingText(boss.x, boss.y - boss.radius - 8, `Uczta! +${def.heal}`, FEAST_TEXT_COLOR);
      }
    }
    const release = this.pendingRelease;
    if (release && now >= release.at) {
      this.pendingRelease = null;
      for (const larder of release.larders) if (this.larders.includes(larder)) this.tearLarder(larder, 'release');
    }
  }

  /**
   * Koniec kokonu; łupina zostaje na podłodze. `eaten` — zjedzony przez Pożeracza (ogryzione żebra i krew),
   * `release` — rozdarty od środka, wychodzi zarażony, `empty` — rozdarty bez zarażonego (śmierć bossa).
   */
  private tearLarder(larder: LarderCocoon, mode: 'eaten' | 'release' | 'empty'): void {
    this.larders = this.larders.filter((l) => l !== larder);
    const at = larder.position;
    const { variant } = larder;
    larder.destroy();
    const { sheet } = LARDER_VISUAL;
    const husk = this.deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.deathBurst);
    husk.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => husk.setDepth(RENDER_DEPTH.combatDecal));
    husk.play(animationKey(sheet, mode === 'eaten' ? LARDER_VISUAL.eaten : LARDER_VISUAL.tear, variant));
    if (mode === 'release') this.deps.spawnRusher?.(at);
  }

  /** Wstrząs kamery przy przebudzeniu i przy wejściu we wściekłość (napis daje HUD). */
  private updatePresence(boss: Boss): void {
    const camera = this.deps.scene.cameras.main;
    const { introShake, enrageShake } = BOSS_PRESENCE_VISUAL;
    if (boss.isFighting && !this.introduced) {
      this.introduced = true;
      camera.shake(introShake.durationMs, introShake.intensity);
    }
    if (boss.isEnraged && !this.wasEnraged) camera.shake(enrageShake.durationMs, enrageShake.intensity);
    this.wasEnraged = boss.isEnraged;
  }

  /**
   * Skok: miejsce lądowania, w którym boss się nie mieści (przy ścianie), dosuwamy do środka areny.
   * Zwraca faktyczne miejsce lądowania — tam też trafia strefa uderzenia.
   */
  private startLeap(planned: BossLeap): Vector2 {
    const radius = this.boss?.radius ?? 0;
    const center = arenaCenter(this.arena);
    const anchor = { x: center.x * TILE_SIZE, y: center.y * TILE_SIZE };
    const to = this.clampToward(planned.to, anchor, (point) => this.circleFits(point, radius));
    this.leap = { leap: { ...planned, to }, shadow: this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) };
    return to;
  }

  /**
   * Przysiad (spłaszczenie), lot łukiem (ciało wyłączone — królowa przelatuje nad graczem), cień na ziemi,
   * lądowanie z wstrząsem. Obrażenia zadaje strefa uderzenia (`updateStrikes`).
   */
  private updateLeap(boss: Boss, now: number): void {
    const active = this.leap;
    if (!active) return;
    const { leap, shadow } = active;
    const v = BOSS_LEAP_VISUAL;
    if (now < leap.launchAt) {
      boss.setScale(v.crouch.x, v.crouch.y);
      return;
    }
    const t = leapProgress(leap, now);
    if (t !== null) {
      (boss.body as Phaser.Physics.Arcade.Body).enable = false;
      const ground = { x: leap.from.x + (leap.to.x - leap.from.x) * t, y: leap.from.y + (leap.to.y - leap.from.y) * t };
      const arc = Math.sin(Math.PI * t);
      boss.setScale(1 + (v.apexScale - 1) * arc);
      boss.setPosition(Math.round(ground.x), Math.round(ground.y - arc * v.arcHeight));
      // Cień kurczy się w szczycie lotu (królowa wyżej), rośnie przy lądowaniu.
      const size = 1 - 0.3 * arc;
      shadow
        .clear()
        .fillStyle(LEAP_SHADOW_COLOR, LEAP_SHADOW_ALPHA)
        .fillEllipse(ground.x, ground.y, v.shadow.width * size, v.shadow.height * size);
      return;
    }
    this.finishLeap(boss);
    this.deps.scene.cameras.main.shake(v.landShake.durationMs, v.landShake.intensity);
  }

  /** Królowa na ziemi w miejscu lądowania (także gdy zginie w locie). */
  private finishLeap(boss: Boss): void {
    const active = this.leap;
    if (!active) return;
    active.shadow.destroy();
    this.leap = null;
    boss.setScale(1);
    const { to, from } = active.leap;
    const body = boss.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.reset(to.x, to.y);
    this.pushPlayerOutOf(to, from, boss.radius);
  }

  /**
   * Królowa wylądowała na graczu: wypychamy go poza jej ciało (kolizja nie rozdzieli ciał o wspólnym
   * środku), w stronę od niej, a przy wspólnym środku — dalej w kierunku lotu. Gdy w tę stronę jest mur,
   * próbujemy kolejnych kierunków co 45° — nigdy w mur ani poza arenę. Odrzut strefy uderzenia liczony
   * jest już od nowej pozycji, więc ma kierunek.
   */
  private pushPlayerOutOf(center: Vector2, from: Vector2, radius: number): void {
    for (const player of this.deps.party.living) this.pushOut(player, center, from, radius);
  }

  private pushOut(player: Player, center: Vector2, from: Vector2, radius: number): void {
    const minDistance = radius + player.radius + 1;
    let dx = player.x - center.x;
    let dy = player.y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= minDistance || player.isDead) return;
    if (dist < 1) {
      dx = center.x - from.x;
      dy = center.y - from.y;
    }
    const base = Math.hypot(dx, dy) < 1 ? Math.PI / 2 : Math.atan2(dy, dx);
    for (const step of PUSH_OUT_STEPS) {
      const angle = base + (step * Math.PI) / 4;
      const target = { x: center.x + Math.cos(angle) * minDistance, y: center.y + Math.sin(angle) * minDistance };
      if (!this.circleFits(target, player.radius)) continue;
      (player.body as Phaser.Physics.Arcade.Body).reset(target.x, target.y);
      return;
    }
  }

  /** Okrągłe ciało mieści się na arenie: narożniki kwadratu wpisanego w okrąg nie wchodzą w mur. */
  private circleFits(point: Vector2, radius: number): boolean {
    const r = radius * 0.8;
    return [
      { x: point.x - r, y: point.y - r },
      { x: point.x + r, y: point.y - r },
      { x: point.x - r, y: point.y + r },
      { x: point.x + r, y: point.y + r },
    ].every((corner) => this.isArenaWalkable(corner));
  }

  /** Przesuwa `point` krokami w stronę `anchor`, aż spełni `ok` (najdalej do samego `anchor`). */
  private clampToward(point: Vector2, anchor: Vector2, ok: (p: Vector2) => boolean): Vector2 {
    let p = point;
    const total = Math.hypot(anchor.x - p.x, anchor.y - p.y);
    for (let d = 0; d < total && !ok(p); d += CLAMP_STEP) {
      const t = CLAMP_STEP / Math.max(CLAMP_STEP, Math.hypot(anchor.x - p.x, anchor.y - p.y));
      p = { x: p.x + (anchor.x - p.x) * t, y: p.y + (anchor.y - p.y) * t };
    }
    return p;
  }

  /**
   * Ślad grzybów (krok 111): co kilkadziesiąt px drogi Pożeracza pod jego stopami wyrasta płat; najstarsze
   * znikają ponad limit. W locie skoku i poza walką droga się nie liczy. Do tego zarodniki unoszące się z grzbietu.
   */
  private updateTrail(boss: Boss, now: number): void {
    const trail = this.trail;
    if (!trail) return;
    if (!boss.isFighting || this.leap) {
      trail.reset();
      return;
    }
    this.emitMotes(boss, now);
    const shot = trail.step({ x: boss.x, y: boss.y }, now, boss.isEnraged);
    if (!shot || !this.isArenaFloor(shot.to)) return;
    this.throwWeb(shot, true);
    const trailWebs = this.webs.filter((web) => web.trail);
    for (const web of trailWebs.slice(0, Math.max(0, trailWebs.length - trail.maxPatches(boss.isEnraged)))) {
      this.removeWeb(web);
      this.webs.splice(this.webs.indexOf(web), 1);
    }
  }

  /** Zarodniki z grzbietu Pożeracza: kropki soku unoszą się i gasną (czysto wizualnie). */
  private emitMotes(boss: Boss, now: number): void {
    if (now < this.nextMoteAt) return;
    const { motes } = DEVOURER_FX_VISUAL;
    this.nextMoteAt = now + (boss.isEnraged ? motes.enragedEveryMs : motes.everyMs);
    const x = Math.round(boss.x + Phaser.Math.Between(-motes.spread, motes.spread));
    const y = Math.round(boss.y + Phaser.Math.Between(-motes.spread / 2, motes.spread / 2));
    const color = motes.colors[Phaser.Math.Between(0, motes.colors.length - 1)] ?? motes.colors[0];
    const mote = this.deps.scene.add.rectangle(x, y, 2, 2, color).setDepth(RENDER_DEPTH.slash);
    this.deps.scene.tweens.add({
      targets: mote,
      y: y - motes.rise,
      x: x + Phaser.Math.Between(-4, 4),
      alpha: 0,
      duration: motes.lifeMs,
      onComplete: () => mote.destroy(),
    });
  }

  /** Miejsce lądowania poza areną (gracz przy ścianie) dosuwamy w stronę gracza, aż trafi na podłogę areny. */
  private throwWeb(planned: WebShot, trail = false): void {
    const { scene } = this.deps;
    const player = this.focus();
    const to = this.clampToward(planned.to, { x: player.x, y: player.y }, (p) => this.isArenaFloor(p));
    const shot: WebShot = { ...planned, to };
    const { ball } = BOSS_WEB_VISUAL;
    this.webs.push({
      shot,
      marker: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph),
      ball: scene.add
        .sprite(shot.from.x, shot.from.y, SPRITE_SHEETS[ball.sheet].key)
        .setDepth(RENDER_DEPTH.projectile)
        .setVisible(false)
        .play(animationKey(ball.sheet, ball.animation)),
      patch: null,
      ...(trail && { trail }),
    });
    if (shot.look === 'sludge') this.pruneSludge();
  }

  /** Najwyżej `sludge.maxPuddles` kałuż szlamu naraz — najstarsze znikają. */
  private pruneSludge(): void {
    const max = this.boss?.definition.sludge?.maxPuddles;
    if (max === undefined) return;
    for (const web of puddlesOverLimit(this.webs.filter((w) => w.shot.look === 'sludge'), max)) {
      this.removeWeb(web);
      this.webs.splice(this.webs.indexOf(web), 1);
    }
  }

  /**
   * Szlam od ścian (krok 152): pas rośnie z czasem walki i utraconym HP, przerysowuje się, puszcza bąble i spowalnia
   * bohatera, którego ślad stóp jest w szlamie (teren — dash przechodzi). Przed walką i po niej nie rośnie.
   */
  private updateCreep(boss: Boss, now: number): void {
    const view = this.creepView;
    const creep = boss.definition.sludge?.creep;
    if (!view || !creep || !boss.isFighting) return;
    if (this.creepStartAt === null) {
      this.creepStartAt = now;
      this.creepLastAt = now;
    }
    const target = creepTargetDepth(now - this.creepStartAt, boss.health.value / boss.health.max, creep);
    this.creepDepth = stepCreepDepth(this.creepDepth, target, now - this.creepLastAt, creep);
    this.creepLastAt = now;
    view.update(this.creepDepth, now, (x, y) => this.deps.effects.sludge.bubble(x, y));
    for (const player of this.deps.party.living) {
      if (!isHeroInCreep(player, view.arenaRect, this.creepDepth, creep)) continue;
      if (!player.applyTerrainSlow(creep.slow, now)) continue;
      const text = SLUDGE_FX.creep.text;
      if (now - this.lastSludgeTextAt >= text.minGapMs) {
        this.lastSludgeTextAt = now;
        this.deps.effects.floatingText(player.x, player.y - player.radius - 8, text.label, text.color);
      }
    }
  }

  private isArenaFloor(point: Vector2): boolean {
    return this.arenaTile(point) === TileType.Floor;
  }

  /** Bez muru (zablokowane schody nie kolidują) — tu boss może stanąć. */
  private isArenaWalkable(point: Vector2): boolean {
    const tile = this.arenaTile(point);
    return tile !== null && tile !== TileType.Wall;
  }

  /** Kafel pod punktem, jeśli leży na arenie; null poza nią. */
  private arenaTile(point: Vector2): TileType | null {
    const tile = DungeonView.worldToTile(point.x, point.y);
    const { floor } = this.deps;
    if (!roomContainsTile(this.arena, tile)) return null;
    return floor.tiles[tile.y * floor.width + tile.x] ?? null;
  }

  /** Znacznik lądowania, lot kłębu łukiem, rozrost plamy i spowolnienie gracza w niej (dash przechodzi). */
  private updateWebs(now: number): void {
    const { party } = this.deps;
    this.webs = this.webs.filter((web) => {
      const { shot } = web;
      if (now >= shot.expiresAt) {
        this.removeWeb(web);
        return false;
      }
      if (now < shot.landAt) {
        // Kałuża szlamu rozlewa się w chwili uderzenia — zasięg pokazuje już telegraf strefy.
        if (shot.look !== 'sludge') drawWebMarker(web.marker, shot);
        const t = webFlightProgress(shot, now);
        if (t !== null) {
          const lift = Math.sin(Math.PI * t) * BOSS_WEB_VISUAL.arcHeight;
          web.ball
            .setVisible(true)
            .setPosition(Math.round(shot.from.x + (shot.to.x - shot.from.x) * t), Math.round(shot.from.y + (shot.to.y - shot.from.y) * t - lift));
        }
        return true;
      }
      if (!web.patch) this.landWeb(web);
      this.witherPatch(web, now);
      // Bąble na kałuży szlamu (czysto wizualne).
      if (shot.look === 'sludge' && !web.withering && Math.random() < (this.deps.scene.game.loop.delta || 16) / SLUDGE_FX.bubbles.puddleEveryMs) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * shot.maxRadius * 0.6;
        this.deps.effects.sludge.bubble(shot.to.x + Math.cos(a) * d, shot.to.y + Math.sin(a) * d);
      }
      for (const player of party.members) {
        if (!isInWebPatch(shot, player, now)) continue;
        if (shot.slow) player.applyTerrainSlow(shot.slow, now);
        // Kałuża sprzątaczki (krok 125): poślizg; napis „Ślisko!” przy wejściu na mokre (najwyżej co kilka sekund).
        if (shot.slip && player.applyTerrainSlip(shot.slip, now) && now - this.lastSlipTextAt >= CLEANER_FX_VISUAL.slipText.minGapMs) {
          this.lastSlipTextAt = now;
          this.deps.effects.floatingText(player.x, player.y - player.radius - 8, CLEANER_FX_VISUAL.slipText.text, CLEANER_FX_VISUAL.slipText.color);
        }
        // Grzybnia Króla (krok 29) dodatkowo zatruwa — teren, więc chroni tylko dash.
        if (shot.status) player.applyTerrainStatus(shot.status, now);
      }
      return true;
    });
  }

  /** Kokon w locie: łuk nad ziemią; przy lądowaniu pęka (klatki rozdarcia kokonu leża). */
  private updateThrows(now: number): void {
    this.ropeGfx?.clear();
    this.throws = this.throws.filter(({ thrown, sprite }) => {
      if (now < thrown.launchAt) return true;
      if (now < thrown.landAt) {
        const t = (now - thrown.launchAt) / (thrown.landAt - thrown.launchAt);
        const lift = Math.sin(Math.PI * t) * thrownVisual(thrown).arcHeight;
        sprite
          .setVisible(true)
          .setPosition(Math.round(thrown.from.x + (thrown.to.x - thrown.from.x) * t), Math.round(thrown.from.y + (thrown.to.y - thrown.from.y) * t - lift));
        // Sznur wiadra: od dłoni sprzątaczki do lecącego wiadra.
        if (thrown.look === 'bucket' && this.boss) this.ropeGfx?.lineStyle(1, CLEANER_FX_VISUAL.bucket.rope, 0.9).lineBetween(this.boss.x, this.boss.y, sprite.x, sprite.y);
        return true;
      }
      if (thrown.look !== undefined) {
        // Puszka, strąk, wiadro, ptaki i nasiono znikają w chwili uderzenia strefy (`strikes` rani w tej samej klatce);
        // bocian przelatuje dalej poza pas, a w miejscu nasiona wyrasta kwiat (płat z `webs`).
        sprite.destroy();
        return false;
      }
      sprite.setPosition(Math.round(thrown.to.x), Math.round(thrown.to.y)).setVisible(true);
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
      sprite.play(animationKey(KING_COCOON_VISUAL.sheet, 'burst'));
      return false;
    });
  }

  private landWeb(web: ThrownWeb): void {
    const { shot } = web;
    web.marker.destroy();
    web.ball.destroy();
    const patch = patchVisual(shot);
    const sprite = this.deps.scene.add
      .sprite(Math.round(shot.to.x), Math.round(shot.to.y), SPRITE_SHEETS[patch.sheet].key)
      .setDepth(RENDER_DEPTH.floorHazard);
    const growKey = animationKey(patch.sheet, patch.grow);
    const growFrames = this.deps.scene.anims.get(growKey)?.frames.length ?? 1;
    // Klatki rozrostu odpowiadają promieniowi plamy (webPatchRadius) — tempo z spreadMs.
    sprite.play({ key: growKey, frameRate: (growFrames * 1000) / shot.spreadMs });
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.play(animationKey(patch.sheet, patch.shimmer)));
    web.patch = sprite;
  }

  /** Grzyby więdną przez ostatnie `witherMs` przed zniknięciem płatu (krok 111). */
  private witherPatch(web: ThrownWeb, now: number): void {
    const visual = patchVisual(web.shot);
    if (web.withering || !web.patch || !visual.wither || visual.witherMs === undefined || now < web.shot.expiresAt - visual.witherMs) return;
    web.withering = true;
    web.patch.play(animationKey(visual.sheet, visual.wither));
  }

  private removeWeb(web: ThrownWeb): void {
    web.marker.destroy();
    web.ball.destroy();
    web.patch?.destroy();
  }

  /**
   * Wylęg z sufitu: w chwili cienia miejsce = gracz + przesunięcie z planu (pierścień „goni” gracza),
   * dosunięte w stronę gracza, jeśli wypada poza podłogę areny. Rosnący cień, w końcówce pajączek
   * na nici; przy lądowaniu dołącza do roju. Lądowanie nie rani — zagrożeniem jest wybuch.
   */
  private updateSpawns(now: number): void {
    const definition = this.spiderlingDefinition;
    if (!this.boss || !definition) {
      this.clearSpawns();
      return;
    }
    const { scene } = this.deps;
    const player = this.focus();
    const { fallMs, shadowRadius } = SPIDERLING_DROP_VISUAL;
    this.spawns = this.spawns.filter((pending) => {
      const { spawn } = pending;
      if (now < spawn.telegraphStartAt) return true;
      if (!pending.position) {
        const target = { x: player.x, y: player.y };
        const wanted = { x: target.x + spawn.offset.x, y: target.y + spawn.offset.y };
        pending.position = this.clampToward(wanted, target, (p) => this.isArenaFloor(p));
        pending.view = new CeilingFallView(scene, pending.position, spiderlingVisual(definition.look).sheet, definition.look !== 'beetle');
      }
      if (now < spawn.at) {
        const t = (now - spawn.telegraphStartAt) / (spawn.at - spawn.telegraphStartAt);
        const fallStart = spawn.at - fallMs;
        pending.view?.draw(shadowRadius * Math.min(1, t), null, now < fallStart ? null : (now - fallStart) / fallMs);
        return true;
      }
      pending.view?.destroy();
      this.spiderlings.spawn(pending.position, definition, now);
      return false;
    });
  }

  private clearSpawns(): void {
    for (const pending of this.spawns) pending.view?.destroy();
    this.spawns = [];
  }

  private updateStrikes(now: number): void {
    const { party, effects } = this.deps;
    this.strikes = this.strikes.filter(({ strike, gfx, group }) => {
      if (now < strike.impactAt) {
        drawAreaTelegraph(gfx, strike, now, group);
        return true;
      }
      gfx.destroy();
      if (strike.look === 'smoke') this.playSmokeBurst(strike);
      else if (strike.look === 'water') this.playSplash(strike);
      else if (strike.look === 'tangle') this.playTangleBurst(strike);
      else if (strike.look === 'sludge') {
        // Król Szlamu (krok 152): rozbryzg szlamu w zasięgu strefy; kałużę rozlewa płat z planu.
        effects.sludge.splash(strike.center.x, strike.center.y, strike.radius);
        this.deps.decals.add('slime', strike.center.x, strike.center.y);
      }
      else if (strike.look === 'embers') {
        // Pas bocianów (krok 144): żar spada pod ptakiem — kula ognia, płomienie na podłodze i wypalony ślad.
        // Stref jest kilkadziesiąt: huk i wstrząs FireEffects dławi sam, pula ogranicza płomienie.
        effects.fire.burst(strike.center.x, strike.center.y, strike.radius);
        this.deps.decals.add('scorch', strike.center.x, strike.center.y);
      } else if (strike.look === 'dive') effects.blast(strike.center.x, strike.center.y, strike.radius, group, WITCH_FX_VISUAL.dive);
      else if (strike.look === 'whirl') effects.blast(strike.center.x, strike.center.y, strike.radius, group, WITCH_FX_VISUAL.whirl);
      else if (strike.look === 'spores') {
        // Strąk zarodników (krok 111): wybuch w kolorach soku, rozprysk soku; płat grzybów wyrasta w tej chwili.
        effects.blast(strike.center.x, strike.center.y, strike.radius, [], SPORE_BLAST_VISUAL);
        this.playThroneFx(THRONE_ROOM_VISUAL.fx.sapRow, strike.center.x, strike.center.y);
      } else {
        effects.blast(strike.center.x, strike.center.y, strike.radius, group);
        this.deps.decals.add('scorch', strike.center.x, strike.center.y);
      }
      for (const player of party.members) this.strikePlayer(player, strike, now);
      return false;
    });
  }

  /** Uderzenie obszarowe w jednego bohatera: obrażenia, hak Kata, wezwanie doga, leczenie bossa, paraliż. */
  private strikePlayer(player: Player, strike: AreaStrike, now: number): void {
    const { effects, onPlayerHit } = this.deps;
    if (!isCaughtByGroundArea(strike.center, strike.radius, player)) return;
    const hit = {
      damage: strike.damage,
      knockback: knockbackFrom(strike.center, player, strike.knockback),
      ...(strike.status && { status: strike.status }),
    };
    if (player.takeHit(hit, now)) {
      onPlayerHit(player);
      // Hak Kata: złapany gracz ląduje tuż przed tarczą (zaraz potem uderzenie tarczą).
      if (strike.pullTo && player.body instanceof Phaser.Physics.Arcade.Body) {
        player.body.reset(strike.pullTo.x, strike.pullTo.y);
        // Wiadro sprzątaczki (krok 125) ma swój okrzyk przy rzucie — bez napisu „Hak!”.
        if (this.boss?.definition.hook?.look !== 'bucket') effects.floatingText(player.x, player.y - player.radius - 8, 'Hak!', '#ff8a3c');
      }
      this.playThroneFx(THRONE_ROOM_VISUAL.fx.bloodRow, player.x, player.y);
      const boss = this.boss;
      if (strike.summonsDog) this.callDog(now);
      if (strike.healOnHit && boss) {
        boss.heal(strike.healOnHit);
        this.playThroneFx(THRONE_ROOM_VISUAL.fx.sapRow, boss.x, boss.y);
        effects.floatingText(boss.x, boss.y - boss.radius - 8, `+${strike.healOnHit}`, FEAST_TEXT_COLOR);
      }
      if (strike.root && player.applyRoot(strike.root, now)) this.entangle(player);
      if (strike.status?.paralysis && player.isParalyzed(now)) {
        effects.floatingText(player.x, player.y - player.radius - 8, 'Paraliż!', PARALYSIS_TEXT_COLOR);
      }
    }
  }

  /** Dog u boku bossa (spawn na starcie i po powrocie): pojawia się przy Baronie, z odstępem przed skokiem. */
  private spawnDog(boss: Boss, returnedAt: number | null): void {
    const def = this.dogDefinition;
    if (!def) return;
    const dog = new BossDog(this.deps.scene, boss.x - def.heelDistance, boss.y, def);
    // Pierwszy skok bez odstępu (dog czeka u boku); po powrocie z martwych odstęp liczy się od powrotu.
    if (returnedAt !== null) dog.armSummonCooldown(returnedAt);
    this.deps.scene.physics.add.collider(dog, this.deps.walls);
    this.dog = dog;
    this.dogRespawnAt = null;
  }

  /** Dog: tylko w walce (uśpiony stoi), powrót po śmierci, skok z rogu, kłapnięcia i pasek HP. */
  private updateDog(boss: Boss, now: number): void {
    const def = this.dogDefinition;
    if (!def) return;
    if (!this.dog && this.dogRespawnAt !== null && now >= this.dogRespawnAt && boss.isFighting) this.spawnDog(boss, now);
    const dog = this.dog;
    const gfx = this.dogGfx;
    gfx?.clear();
    if (!dog) return;
    if (!boss.isFighting) {
      dog.setVelocity(0, 0);
      return;
    }
    const { party, effects } = this.deps;
    const decision = dog.tick({ x: boss.x, y: boss.y }, this.aggroPoint(), now);
    if (decision.newBite) {
      const { center, radius, telegraphStartAt, impactAt, damage, knockback } = decision.newBite;
      const strike: AreaStrike = { center, radius, telegraphStartAt, impactAt, damage, knockback };
      this.strikes.push({ strike, group: [strike], gfx: this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    // Skok z rogu: jedno trafienie na szarżę (dash gracza daje nietykalność, więc unik działa).
    const bitten = dog.phase === DogPhase.Lunge && !dog.lungeHit
      ? party.living.find((player) => isTouchingHeroBody(dog, dog.radius, player))
      : undefined;
    if (bitten) {
      dog.lungeHit = true;
      const { damage, knockback } = def.lunge;
      const hit = { damage, knockback: knockbackFrom(dog, bitten, knockback) };
      if (bitten.takeHit(hit, now)) {
        this.deps.onPlayerHit(bitten);
        effects.floatingText(bitten.x, bitten.y - bitten.radius - 8, 'Pogryziony!', SMOKE_VISUAL.text);
      }
      effects.impact(dog.x, dog.y, dog.radius);
      sound.play(SoundCue.Impact, dog);
    }
    if (gfx) this.drawDog(gfx, dog);
  }

  /** Telegraf skoku (linia zasięgu szarży w kierunku zapowiedzi) i pasek HP psa. */
  private drawDog(gfx: Phaser.GameObjects.Graphics, dog: BossDog): void {
    const aim = dog.lungeAim;
    if (aim) {
      const player = this.deps.party.targetFor(dog);
      const toPlayer = Math.hypot(player.x - dog.x, player.y - dog.y) || 1;
      const unit = aim.direction ?? { x: (player.x - dog.x) / toPlayer, y: (player.y - dog.y) / toPlayer };
      const reach = (dog.definition.lunge.speed * dog.definition.lunge.durationMs) / 1000;
      const alpha = aim.direction ? 0.8 : 0.35;
      gfx.lineStyle(dog.radius * 2, TELEGRAPH_COLOR, alpha * 0.25).lineBetween(dog.x, dog.y, dog.x + unit.x * reach, dog.y + unit.y * reach);
      gfx.lineStyle(2, TELEGRAPH_COLOR, alpha).lineBetween(dog.x, dog.y, dog.x + unit.x * reach, dog.y + unit.y * reach);
    }
    const { width, height, offsetY, back, fill } = DOG_VISUAL.bar;
    const x = Math.round(dog.x - width / 2);
    const y = Math.round(dog.y - offsetY);
    gfx.fillStyle(back, 1).fillRect(x - 1, y - 1, width + 2, height + 2);
    gfx.fillStyle(fill, 1).fillRect(x, y, Math.max(0, Math.round(width * (dog.health.value / dog.health.max))), height);
  }

  /** Smuga trafiła gracza: dog (jeśli gotowy) znika z boku Barona i wypada z rogu widoku. */
  private callDog(now: number): void {
    const dog = this.dog;
    if (!dog || !this.boss || !dog.canSummon(now)) return;
    const { effects, scene } = this.deps;
    const player = this.focus();
    const view = scene.cameras.main.worldView;
    const inset = 18;
    const corners: Vector2[] = [
      { x: view.x + inset, y: view.y + inset },
      { x: view.right - inset, y: view.y + inset },
      { x: view.x + inset, y: view.bottom - inset },
      { x: view.right - inset, y: view.bottom - inset },
    ];
    // Najdalszy od gracza róg: dog ma miejsce na zapowiedź i bieg.
    const far = corners.reduce((best, c) => (Math.hypot(c.x - player.x, c.y - player.y) > Math.hypot(best.x - player.x, best.y - player.y) ? c : best));
    const center = arenaCenter(this.arena);
    const anchor = { x: center.x * TILE_SIZE, y: center.y * TILE_SIZE };
    const corner = this.clampToward(far, anchor, (p) => this.circleFits(p, dog.radius));
    dog.summonFrom(corner, now);
    effects.floatingText(player.x, player.y - player.radius - 8, 'Dog!', SMOKE_VISUAL.text);
  }

  /** Dog zabity przez gracza wraca do boku Barona po `respawnMs`; ginący z Baronem nie wraca. */
  private killDog(now: number, announce = true): void {
    const dog = this.dog;
    if (!dog) return;
    this.deps.effects.deathBurst(dog.x, dog.y, 0x3a3f4a, dog.radius * 1.6);
    this.deps.decals.add('splat', dog.x, dog.y);
    dog.destroy();
    this.dog = null;
    this.dogGfx?.clear();
    if (announce && this.dogDefinition) this.dogRespawnAt = now + this.dogDefinition.respawnMs;
  }

  /** Kłąb dymu w strefie smugi: pęcznieje i gaśnie. */
  private playSmokeBurst(strike: AreaStrike): void {
    const { sheet, animation } = SMOKE_VISUAL.puff;
    const { scale, fadeMs } = SMOKE_VISUAL.burst;
    const base = (strike.radius * 2) / 26;
    const sprite = this.deps.scene.add
      .sprite(strike.center.x, strike.center.y, SPRITE_SHEETS[sheet].key)
      .setDepth(RENDER_DEPTH.slash)
      .setScale(base)
      .setAlpha(0.9);
    sprite.play(animationKey(sheet, animation));
    this.deps.scene.tweens.add({ targets: sprite, scale: base * scale, alpha: 0, duration: fadeMs, onComplete: () => sprite.destroy() });
  }

  private updateBursts(now: number): void {
    this.bursts = this.bursts.filter(({ burst, gfx }) => {
      if (now < burst.fireAt) {
        drawBurstTelegraph(gfx, burst, now, this.boss?.definition.strikeLook === 'sludge');
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
          visual: burstVisual(burst),
          ...(!burst.look && { impactDecal: 'slime' as const }),
          ...(!burst.look && this.boss?.definition.sludge && { onLand: (at: Vector2) => this.landGlob(at) }),
        });
      }
      return false;
    });
  }

  /** Kula szlamu z pierścienia rozbiła się o mur albo opadła: mały rozbryzg i kałuża na najbliższej podłodze areny. */
  private landGlob(at: Vector2): void {
    const sludge = this.boss?.definition.sludge;
    if (!sludge) return;
    const center = this.boss ? this.clampToward(at, { x: this.boss.x, y: this.boss.y }, (p) => this.isArenaFloor(p)) : at;
    if (!this.isArenaFloor(center)) return;
    this.deps.effects.sludge.splash(center.x, center.y, sludge.globPuddleRadius, { shake: false });
    this.throwWeb(sludgePuddle(center, sludge.globPuddleRadius, this.lastNow, sludge));
  }

  /** Rozgrzanie tarczy promieniem (Kat): po `heat.ticks` tickach wybuch żaru wokół bossa (telegrafowany). */
  private heatShield(boss: Boss, now: number): void {
    const heat = boss.definition.shield?.heat;
    if (!heat) return;
    this.shieldHeat++;
    if (this.shieldHeat < heat.ticks) return;
    this.shieldHeat = 0;
    const strike = {
      center: { x: boss.x, y: boss.y },
      radius: heat.radius,
      telegraphStartAt: now,
      impactAt: now + heat.telegraphMs,
      damage: heat.damage,
      knockback: heat.knockback,
    };
    this.strikes.push({ strike, group: [strike], gfx: this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    this.deps.effects.floatingText(boss.x, boss.y - boss.radius - 10, 'Żar!', '#ff8a3c');
  }

  /** Oddech palenisk: paleniska areny rosną przez telegraf i buchają w chwili uderzenia stref. */
  private kindleBraziers(plan: BossAttackPlan): void {
    const scene = this.deps.scene;
    const first = plan.strikes[0];
    if (!first) return;
    const leadMs = Math.max(1, first.impactAt - scene.time.now);
    const { sheet, warn, burst, idle } = BRAZIER_VISUAL;
    for (const { sprite } of this.arenaBraziers) {
      const frames = scene.anims.get(animationKey(sheet, warn))?.frames.length ?? 1;
      sprite.play({ key: animationKey(sheet, warn), frameRate: (frames * 1000) / leadMs });
      scene.time.delayedCall(leadMs, () => {
        sprite.play(animationKey(sheet, burst));
        scene.time.delayedCall(700, () => sprite.active && sprite.play(animationKey(sheet, idle)));
      });
    }
  }

  /**
   * Pierścień ognia (Kat, po wściekłości): brzeg areny płonie, wolne koło w środku się kurczy.
   * Gracz poza kołem parzy się (przez trafienie z nietykalnością) i jest odpychany do środka.
   */
  private updateFireRing(boss: Boss, now: number): void {
    const ring = boss.definition.fireRing;
    const gfx = this.fireRingGfx;
    if (!ring || !gfx) return;
    gfx.clear();
    if (!boss.isEnraged || !boss.isFighting) return;
    this.fireRingStartAt ??= now;
    const a = this.arena;
    const center = { x: (a.x + a.width / 2) * TILE_SIZE, y: (a.y + a.height / 2) * TILE_SIZE };
    const start = (Math.min(a.width, a.height) * TILE_SIZE) / 2;
    const radius = fireRingRadius(start, ring.minRadius, ring.shrinkMs, now - this.fireRingStartAt);
    const outer = (Math.hypot(a.width, a.height) * TILE_SIZE) / 2;
    const { fill, fillAlpha, edge, edgeAlpha, edgeWidth } = FIRE_RING_VISUAL;
    // Pas ognia od koła do narożników areny: 64 czworokąty pierścienia (gruba linia okręgu rozpada się
    // w Phaserze na klinowe paski, a wielokąt z dziurką źle się trianguluje).
    const segments = 64;
    gfx.fillStyle(fill, fillAlpha);
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      gfx.fillPoints(
        [
          { x: center.x + Math.cos(t0) * radius, y: center.y + Math.sin(t0) * radius },
          { x: center.x + Math.cos(t0) * outer, y: center.y + Math.sin(t0) * outer },
          { x: center.x + Math.cos(t1) * outer, y: center.y + Math.sin(t1) * outer },
          { x: center.x + Math.cos(t1) * radius, y: center.y + Math.sin(t1) * radius },
        ],
        true,
      );
    }
    gfx.lineStyle(edgeWidth, edge, edgeAlpha).strokeCircle(center.x, center.y, radius);
    for (const player of this.deps.party.living) {
      if (Math.hypot(player.x - center.x, player.y - center.y) <= radius) continue;
      const hit = { damage: ring.damage, knockback: knockbackFrom(player, center, ring.knockback) };
      if (player.takeHit(hit, now)) this.deps.onPlayerHit(player);
    }
  }

  /** Łuk tarczy przed bossem: widać, skąd trafienia się odbijają (tylko w walce). */
  private drawShieldArc(boss: Boss | null): void {
    const gfx = this.shieldArc;
    if (!gfx) return;
    gfx.clear();
    const angle = boss?.shieldAngle;
    if (!boss || angle === null || angle === undefined || !boss.isFighting || boss.isShieldBroken) return;
    const half = ((boss.definition.shield?.arcDeg ?? 0) * Math.PI) / 360;
    const { color, alpha, width, gap } = SHIELD_ARC_VISUAL;
    // Wytrzymałość tarczy widać po łuku: im bliżej pęknięcia, tym cieńszy i bledszy.
    const wear = boss.shieldFraction;
    gfx.lineStyle(Math.max(1, Math.round(width * (0.5 + wear))), color, alpha * (0.5 + 0.5 * wear)).beginPath();
    gfx.arc(boss.x, boss.y, boss.radius + gap, angle - half, angle + half);
    gfx.strokePath();
  }

  private defeat(): void {
    const boss = this.boss;
    if (!boss) return;
    this.deps.effects.deathBurst(boss.x, boss.y, boss.definition.color, boss.radius * 1.5);
    sound.play(SoundCue.BossDeath, boss);
    this.clearFight(boss);
    const position: Vector2 = { x: boss.x, y: boss.y };
    const { visual, facing } = boss;
    boss.destroy();
    this.boss = null;
    if (!visual.death) {
      this.finishDefeat(visual.deathDecal, position);
      return;
    }
    // Animacja śmierci w kierunku z chwili śmierci; nagroda (łupy, karty, schody, kraty) po jej końcu.
    this.dying = true;
    const { sheet, animation } = visual.death;
    const corpse = this.deps.scene.add.sprite(position.x, position.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.boss);
    if (visual.death.risingSmoke) this.startRisingSmoke(position);
    corpse.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      // Plama po bossie zostaje na podłodze (pod postaciami), reszta zwłok znika.
      if (visual.death?.keepCorpse) corpse.setDepth(RENDER_DEPTH.combatDecal);
      else corpse.destroy();
      this.dying = false;
      this.finishDefeat(visual.deathDecal, position);
    });
    corpse.play(animationKey(sheet, animation, facing));
  }

  /** Koniec walki (śmierć albo odjazd windą): zaplanowane ataki, pomocnicy i płaty znikają razem z bossem. */
  private clearFight(boss: Boss): void {
    this.ropeGfx?.clear();
    for (const pending of [...this.strikes, ...this.bursts, ...this.pendingHelpers]) pending.gfx.destroy();
    // Dog ginie razem z Baronem (nie ma już kogo pilnować); nowy już nie wróci.
    this.dogRespawnAt = null;
    if (this.dog) this.killDog(this.lastNow, false);
    this.dogGfx?.destroy();
    this.strikes = [];
    this.bursts = [];
    // Włosie puszcza razem z bossem.
    for (const tangle of this.tangles) this.breakTangle(tangle.sprite);
    this.tangles = [];
    // Świta, która jeszcze nie wyszła, przepada; ta na arenie walczy dalej.
    this.pendingHelpers = [];
    // Sieci są częścią walki — znikają razem z Matką Pająków.
    for (const web of this.webs) this.removeWeb(web);
    for (const { sprite } of this.throws) sprite.destroy();
    this.throws = [];
    this.webs = [];
    // Pajączki giną razem z matką (bez wybuchów), niewyklute już się nie pojawią.
    this.spiderlings.clear();
    // Spiżarnia pustoszeje razem z Pożeraczem (kokony pękają bez zarażonych).
    for (const larder of [...this.larders]) this.tearLarder(larder, 'empty');
    this.pendingFeast = null;
    this.pendingRelease = null;
    this.clearSpawns();
    // Szlam zostaje na podłodze i murach, fiolet schodzi (krok 152).
    this.creepView?.settle();
    // Śmierć w locie: zwłoki na ziemi, w miejscu lądowania.
    this.finishLeap(boss);
  }

  /** Okrzyk nad bossem: napis i piskliwy dźwięk. */
  private shout(line: string): void {
    const boss = this.boss;
    if (!boss) return;
    const { color, offsetY, holdMs, riseMs } = CLEANER_FX_VISUAL.shout;
    if (this.lastShout?.active) this.lastShout.destroy();
    this.lastShout = this.deps.effects.shout(boss.x, boss.y - offsetY, line, color, holdMs, riseMs);
    sound.play(SoundCue.Shout, boss);
  }

  /** Okrzyki „z nudów” w trakcie walki (sprzątaczki, krok 125). */
  private updateShouts(now: number): void {
    const shouts = this.shouts;
    if (!shouts) return;
    shouts.start(now);
    const line = shouts.idle(now);
    if (line) this.shout(line);
  }

  /** Polerowanie: stojąca sprzątaczka sypie błyskami spod miotły (czysto wizualnie). */
  private updatePolish(boss: Boss, now: number): void {
    if (!boss.isIdling || now < this.nextPolishAt) return;
    const { sheet, animation, everyMs, spread } = CLEANER_FX_VISUAL.polish;
    this.nextPolishAt = now + everyMs;
    const x = Math.round(boss.x + Phaser.Math.Between(-spread, spread));
    const y = Math.round(boss.y + Phaser.Math.Between(0, spread));
    const glint = this.deps.scene.add.sprite(x, y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.torchGlow).setBlendMode(Phaser.BlendModes.ADD);
    glint.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => glint.destroy());
    glint.play(animationKey(sheet, animation));
  }

  /** Chlust wody: kilka rozprysków w strefie i plusk. */
  private playSplash(strike: AreaStrike): void {
    const { sheet, animation, count } = CLEANER_FX_VISUAL.splash;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const d = i === 0 ? 0 : strike.radius * 0.6;
      const x = Math.round(strike.center.x + Math.cos(angle) * d);
      const y = Math.round(strike.center.y + Math.sin(angle) * d);
      const splash = this.deps.scene.add.sprite(x, y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.slash);
      splash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => splash.destroy());
      splash.play(animationKey(sheet, animation));
    }
    sound.play(SoundCue.Splash, strike.center);
  }

  /** Plątanie bez ofiary: włosie wyrasta z posadzki i od razu pęka. */
  private playTangleBurst(strike: AreaStrike): void {
    const { sheet, grow } = CLEANER_FX_VISUAL.tangle;
    const sprite = this.deps.scene.add.sprite(strike.center.x, strike.center.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.slash);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.breakTangle(sprite));
    sprite.play(animationKey(sheet, grow));
  }

  /** Zaplątany bohater: włosie na stopach (wyrasta, trzyma) i napis. */
  private entangle(player: Player): void {
    const { sheet, grow, hold, offsetY, text, color } = CLEANER_FX_VISUAL.tangle;
    const sprite = this.deps.scene.add.sprite(player.x, player.y + offsetY, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.player + 0.1);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.play(animationKey(sheet, hold)));
    sprite.play(animationKey(sheet, grow));
    this.tangles.push({ player, sprite });
    this.deps.effects.floatingText(player.x, player.y - player.radius - 8, text, color);
  }

  /** Włosie podąża za bohaterem (odrzut) i pęka, gdy unieruchomienie minie. */
  private updateTangles(now: number): void {
    const { offsetY } = CLEANER_FX_VISUAL.tangle;
    this.tangles = this.tangles.filter(({ player, sprite }) => {
      if (player.isRooted(now) && !player.isDead) {
        sprite.setPosition(player.x, player.y + offsetY);
        return true;
      }
      this.breakTangle(sprite);
      return false;
    });
  }

  private breakTangle(sprite: Phaser.GameObjects.Sprite): void {
    const { sheet, break: shatter } = CLEANER_FX_VISUAL.tangle;
    sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
    sprite.play(animationKey(sheet, shatter));
  }

  /** Próg HP: drzwi windy się otwierają, sprzątaczka krzyczy i biegnie do nich (nietykalna). */
  private startEscape(boss: Boss): void {
    this.escape = { arrivedAt: null, closing: false };
    boss.startFleeing();
    const line = boss.definition.shouts?.escape;
    if (line && this.shouts) this.shout(this.shouts.force(line, this.lastNow));
    if (this.elevator) {
      const { sheet, open } = CLEANER_FX_VISUAL.elevator;
      this.elevator.sprite.play(animationKey(sheet, open));
      sound.play(SoundCue.Elevator, this.elevator.door);
    }
    this.pendingHelpers.forEach((pending) => pending.gfx.destroy());
    this.pendingHelpers = [];
  }

  /** Bieg do windy, wsiadanie (znika w drzwiach), zamknięcie drzwi i odjazd — nagroda jak za pokonanie. */
  private updateEscape(boss: Boss, now: number): void {
    const state = this.escape;
    const def = boss.definition.escape;
    if (!state || !def) return;
    const door = this.elevator?.door ?? { x: boss.x, y: boss.y };
    if (state.arrivedAt === null) {
      if (!boss.fleeTick(door, def.speedMultiplier)) return;
      state.arrivedAt = now;
      // Wsiada: krok w głąb drzwi i znika.
      this.deps.scene.tweens.add({ targets: boss, y: boss.y - boss.radius, alpha: 0, duration: def.boardMs });
      (boss.body as Phaser.Physics.Arcade.Body).enable = false;
    }
    const stage = escapeStage(state.arrivedAt, now, def);
    if (stage === EscapeStage.Closing && !state.closing && this.elevator) {
      state.closing = true;
      const { sheet, close } = CLEANER_FX_VISUAL.elevator;
      this.elevator.sprite.play(animationKey(sheet, close));
    }
    if (stage !== EscapeStage.Gone) return;
    this.clearFight(boss);
    boss.destroy();
    this.boss = null;
    this.escape = null;
    this.escaped = true;
    this.deps.onDefeated(door);
  }

  /** Dym znad plamy po Baronie: kłęby wznoszą się, rosną i gasną przez `rise.durationMs`. */
  private startRisingSmoke(at: Vector2): void {
    const { scene } = this.deps;
    const { rise, puff } = SMOKE_VISUAL;
    const key = SPRITE_SHEETS[puff.sheet].key;
    scene.time.addEvent({
      delay: rise.everyMs,
      repeat: Math.floor(rise.durationMs / rise.everyMs),
      callback: () => {
        const x = at.x + Phaser.Math.Between(-rise.spread, rise.spread);
        const y = at.y + Phaser.Math.Between(-rise.spread / 2, rise.spread / 2);
        const sprite = scene.add.sprite(x, y, key, Phaser.Math.Between(0, 3)).setDepth(RENDER_DEPTH.slash).setScale(rise.scale.from).setAlpha(rise.alpha);
        scene.tweens.add({
          targets: sprite,
          y: y - rise.riseHeight,
          x: x + Phaser.Math.Between(-rise.driftX, rise.driftX),
          scale: rise.scale.to,
          alpha: 0,
          duration: rise.lifeMs,
          onComplete: () => sprite.destroy(),
        });
      },
    });
  }

  private finishDefeat(decal: CombatDecalKind, position: Vector2): void {
    this.deps.decals.add(decal, position.x, position.y);
    this.deps.onDefeated(position);
  }
}

/** Sprite i wysokość łuku rzucanego przedmiotu: kokon Króla, puszka Barona, strąk Pożeracza, wiadro sprzątaczki. */
/** Definicja bez ucieczki windą (krok 126: wracający boss walczy do końca). */
function withoutEscape(definition: BossDefinition): BossDefinition {
  const { escape: _escape, ...rest } = definition;
  return rest;
}

/** Pociski fali: kule szlamu, pyłek kwiatu-oka albo liście wiru (krok 137). */
function burstVisual(burst: ProjectileBurst): { readonly texture: string; readonly animation: string } {
  if (!burst.look) return BOSS_GLOB;
  const { sheet, animation } = WITCH_FX_VISUAL[burst.look];
  return { texture: SPRITE_SHEETS[sheet].key, animation: animationKey(sheet, animation) };
}

/** Wygląd płatu na ziemi: kałuża szlamu bierze arkusz o swoim promieniu (krok 152), reszta z `BOSS_PATCH_VISUALS`. */
function patchVisual(shot: WebShot): { readonly sheet: SpriteSheetId; readonly grow: string; readonly shimmer: string; readonly wither?: string; readonly witherMs?: number } {
  if (shot.look === 'sludge') return { sheet: sludgePuddleSheet(shot.maxRadius), grow: 'grow', shimmer: 'shimmer', wither: 'wither', witherMs: 500 };
  return BOSS_PATCH_VISUALS[shot.look ?? 'web'];
}

function thrownVisual(thrown: ThrownObject): { readonly sheet: SpriteSheetId; readonly animation: string; readonly arcHeight: number } {
  if (thrown.look === 'phlegm') return SLUDGE_FX.phlegm;
  if (thrown.look === 'stork' || thrown.look === 'bird' || thrown.look === 'seed') return WITCH_FX_VISUAL[thrown.look];
  if (thrown.look === 'can') return SMOKE_VISUAL.can;
  if (thrown.look === 'bucket') return CLEANER_FX_VISUAL.bucket;
  if (thrown.look === 'spore') return DEVOURER_FX_VISUAL.pod;
  return KING_COCOON_VISUAL;
}

/** Miejsce lądowania sieci: cienki czerwony obrys pełnego zasięgu i znacznik środka. */
function drawWebMarker(gfx: Phaser.GameObjects.Graphics, shot: WebShot): void {
  gfx.clear();
  gfx.lineStyle(1, TELEGRAPH_COLOR, 0.6).strokeCircle(shot.to.x, shot.to.y, shot.maxRadius);
  gfx.fillStyle(TELEGRAPH_COLOR, 0.25).fillCircle(shot.to.x, shot.to.y, shot.startRadius);
}

/** Pulsujący pierścień wokół bossa przed wystrzałem fali. */
function drawBurstTelegraph(gfx: Phaser.GameObjects.Graphics, burst: ProjectileBurst, now: number, sludge = false): void {
  gfx.clear();
  const progress = Phaser.Math.Clamp(
    (now - burst.telegraphStartAt) / (burst.fireAt - burst.telegraphStartAt),
    0,
    1,
  );
  // Król Szlamu (krok 152): liliowy pierścień szlamu zamiast pomarańczowego.
  const ring = sludge ? SLUDGE_FX.burstRing : { color: 0xffa040, width: 3 };
  gfx.lineStyle(ring.width, ring.color, 0.3 + 0.6 * progress).strokeCircle(burst.origin.x, burst.origin.y, 30 + 20 * progress);
}

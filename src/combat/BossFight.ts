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
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import {
  BOSS_LEAP_VISUAL,
  BOSS_PRESENCE_VISUAL,
  BOSS_PROJECTILE_VISUAL,
  BOSS_PATCH_VISUALS,
  BOSS_WEB_VISUAL,
  KING_COCOON_VISUAL,
  LARDER_VISUAL,
  SPIDERLING_DROP_VISUAL,
  THRONE_ROOM_VISUAL,
  SPIDERLING_VISUAL,
  SPRITE_SHEETS,
  animationKey,
} from '@/config/spriteConfig';
import { isHitByAreaStrike, isInWebPatch, leapProgress, webFlightProgress } from '@/ai/bossAttacks';
import { CeilingFallView } from '@/combat/CeilingFallView';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { SpiderlingSwarm, drawAreaTelegraph } from '@/combat/SpiderlingSwarm';
import { DungeonView } from '@/dungeon/DungeonView';
import { roomContainsTile } from '@/dungeon/rooms';
import { arenaCenter } from '@/dungeon/stairs';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { CombatDecals } from '@/effects/CombatDecals';
import { Boss } from '@/entities/Boss';
import { LarderCocoon } from '@/entities/LarderCocoon';
import { planLarders } from '@/dungeon/LarderPlanner';
import { planThrone, planThroneDecals } from '@/dungeon/ThronePlanner';
import type { Player } from '@/entities/Player';
import type { Spiderling } from '@/entities/Spiderling';
import { knockbackFrom } from '@/systems/CombatMath';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike, OrbSplash } from '@/systems/Sorcery';
import { resolveBeam, resolveSplash } from '@/systems/Sorcery';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { BRAZIER_VISUAL, FIRE_RING_VISUAL, RETINUE_MARKER_VISUAL, SHIELD_ARC_VISUAL } from '@/config/spriteConfig';
import { RetinueSchedule, pickRetinueTiles } from '@/systems/BossRetinue';
import type { EnemyType } from '@/core/combatTypes';
import { fireRingRadius, reflectDirection } from '@/systems/Shield';
import { arenaBrazierSpots } from '@/dungeon/BrazierPlanner';
import { BossAttackKind } from '@/core/bossTypes';
import type { CombatDecalKind } from '@/config/dressingConfig';
import { THRONE_ROOM } from '@/config/dressingConfig';

export interface BossFightDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly player: Player;
  readonly projectiles: ProjectileManager;
  readonly effects: CombatEffects;
  /** Trwałe ślady walki: przypalenie po uderzeniu obszarowym, szlam po śmierci bossa. */
  readonly decals: CombatDecals;
  readonly onPlayerHit: () => void;
  /** Wywoływane po pokonaniu bossa, z miejscem jego śmierci (tam wypadają łupy). */
  readonly onDefeated: (position: Vector2) => void;
  /** Zarażony wychodzący z kokonu spiżarni (Grzybowy Pożeracz): zwykły Rusher biomu. */
  readonly spawnRusher?: (at: Vector2) => void;
  /** Świta bossa (krok 80): zwykły wróg biomu wychodzący na arenę; zwraca go, by liczyć żywych. */
  readonly spawnHelper?: (type: EnemyType, at: Vector2) => { readonly isDead: boolean; readonly active: boolean };
}

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
}

/** Rzucona sieć: znacznik lądowania, kłąb w locie, potem plama (krok 25). */
interface ThrownWeb {
  readonly shot: WebShot;
  readonly marker: Phaser.GameObjects.Graphics;
  readonly ball: Phaser.GameObjects.Sprite;
  patch: Phaser.GameObjects.Sprite | null;
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

  constructor(private readonly deps: BossFightDeps) {
    const arena = deps.floor.rooms[deps.floor.bossRoomId];
    if (!arena) throw new Error('BossFight: brak komnaty bossa w danych piętra.');
    this.arena = arena;

    const definition = scaleBossForFloor(bossForFloor(deps.floorNumber), deps.floorNumber, ENEMY_SCALING);
    this.spiderlingDefinition = definition.spiderling ?? null;
    const center = arenaCenter(arena);
    const spawn = { x: center.x * TILE_SIZE, y: center.y * TILE_SIZE };
    const rng = createRng(deriveSeed(deps.floor.seed, BOSS_SEED_SALT));
    const boss = new Boss(deps.scene, spawn.x, spawn.y, definition, rng);
    this.boss = boss;
    this.retinue = definition.retinue && deps.spawnHelper ? new RetinueSchedule(definition.retinue) : null;
    this.retinueRng = createRng(deriveSeed(deps.floor.seed, RETINUE_SEED_SALT));

    deps.scene.physics.add.collider(boss, deps.walls);
    deps.scene.physics.add.collider(deps.player, boss);
    this.spiderlings = new SpiderlingSwarm(deps);
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
    }
    if (!boss) {
      this.fireRingGfx?.clear();
      return;
    }
    const { player } = this.deps;

    if (!boss.isFighting && !player.isDead) {
      const playerTile = DungeonView.worldToTile(player.x, player.y);
      if (roomContainsTile(this.arena, playerTile)) boss.activate(now);
    }

    const burn = boss.tickBurn(now);
    if (burn > 0) this.deps.effects.floatingText(boss.x, boss.y - boss.radius, `-${burn}`, '#ff8a3c');
    if (boss.isDead) {
      this.defeat();
      return;
    }

    const larders = this.larders.map((larder) => larder.position);
    const braziers = this.arenaBraziers.map((b) => b.at);
    const plan = boss.tick({ x: player.x, y: player.y }, now, this.spiderlings.count + this.spawns.length, larders, braziers);
    this.updateFireRing(boss, now);
    if (plan) this.schedule(plan);
    this.updateLarders(boss, now);
    this.updateRetinue(boss, now);
    this.updatePresence(boss);
    this.updateLeap(boss, now);

    this.updateStrikes(now);
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

  /** Cele gracza: pajączki (żywa tarcza), kokony spiżarni i boss. */
  private targets(): Array<Boss | Spiderling | LarderCocoon> {
    const living = [...this.spiderlings.living, ...this.larders];
    return this.boss ? [...living, this.boss] : living;
  }

  /** Cios gracza — zwraca liczbę trafionych (boss i pajączki w łuku; kokony nie liczą się do Wampirzego kła). */
  resolvePlayerMelee(swing: MeleeSwing): number {
    if (!this.boss) return 0;
    const { hit, killed } = resolveMeleeSwing(swing, this.targets());
    this.handleKills(killed);
    return hit.filter((t) => !(t instanceof LarderCocoon)).length;
  }

  /** Promień Czarodziejki przez bossa, pajączki i kokony spiżarni. */
  /** Rozprysk kuli Czarodziejki (krok 50): pajączki, kokony spiżarni i boss (tarcza działa jak przy ciosie). */
  resolveSplash(splash: OrbSplash): void {
    const { killed } = resolveSplash(splash, this.targets());
    this.handleKills(killed);
  }

  resolvePlayerBeam(beam: BeamStrike): number {
    if (!this.boss) return 0;
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
  resolvePlayerShot(shot: PlayerShot): Boss | Spiderling | LarderCocoon | null {
    const boss = this.boss;
    if (!boss) return null;
    // Tarcza (krok 41e): pocisk, który trafia w nią z przodu, wraca do strzelca (już jako pocisk wroga).
    const shield = boss.definition.shield;
    const touches = Math.hypot(shot.position.x - boss.x, shot.position.y - boss.y) <= shot.radius + boss.radius;
    if (shield && touches && !shot.ignore?.has(boss) && boss.isShieldedFrom(shot.position)) {
      const speed = Math.hypot(shot.velocity.x, shot.velocity.y) * shield.reflectSpeed;
      this.deps.projectiles.fire({
        origin: shot.position,
        direction: reflectDirection(shot.velocity),
        speed,
        damage: shot.damage,
        knockback: shot.knockback,
        lifetimeMs: 1500,
      });
      this.deps.effects.impact(shot.position.x, shot.position.y, 10);
      boss.activate(shot.now);
      return boss;
    }
    const result = resolvePlayerShot(shot, this.targets());
    if (result?.died) this.handleKills([result.target]);
    return result?.target ?? null;
  }

  /** Burzowy pęd przez bossa i pajączki. */
  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    const boss = this.boss;
    if (!boss) return;
    const { hit, killed } = resolveDashSweep(sweep, this.targets(), alreadyHit);
    if (hit.includes(boss)) this.deps.effects.floatingText(boss.x, boss.y - boss.radius, `-${sweep.damage}`, '#b8a8ff');
    this.handleKills(killed);
  }

  /** Zabity pajączek ginie bez wybuchu; zabity boss kończy walkę. */
  private handleKills(killed: readonly (Boss | Spiderling | LarderCocoon)[]): void {
    this.spiderlings.handleKills(killed.filter((t): t is Spiderling | Boss => !(t instanceof LarderCocoon)));
    if (this.boss && killed.includes(this.boss)) this.defeat();
  }

  /** Tylko do debugowania (klawisz B w trybie dev). */
  debugDefeat(): void {
    if (this.boss) this.defeat();
  }

  private schedule(plan: BossAttackPlan): void {
    const scene = this.deps.scene;
    if (plan.kind === BossAttackKind.Kindle) this.kindleBraziers(plan);
    // Strefa uderzenia skoku idzie za miejscem lądowania (mogło zostać dosunięte od ściany).
    const planned = plan.leap;
    const landing = planned ? this.startLeap(planned) : null;
    for (const planStrike of plan.strikes) {
      const strike = landing && planStrike.center === planned?.to ? { ...planStrike, center: landing } : planStrike;
      this.strikes.push({ strike, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    for (const burst of plan.bursts) {
      this.bursts.push({ burst, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    for (const spawn of plan.spawns) this.spawns.push({ spawn, position: null, view: null });
    for (const thrown of plan.throws) {
      const { sheet, animation } = KING_COCOON_VISUAL;
      const sprite = scene.add
        .sprite(thrown.from.x, thrown.from.y, SPRITE_SHEETS[sheet].key)
        .setDepth(RENDER_DEPTH.projectile)
        .setVisible(false)
        .play(animationKey(sheet, animation));
      this.throws.push({ thrown, sprite });
    }
    for (const shot of plan.webs) this.throwWeb(shot);
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
      const { player } = this.deps;
      const playerTile = { x: Math.floor(player.x / TILE_SIZE), y: Math.floor(player.y / TILE_SIZE) };
      for (const tile of pickRetinueTiles(this.deps.floor, this.arena, playerTile, count, def.minPlayerDistanceTiles, this.retinueRng)) {
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
    const { player } = this.deps;
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

  /** Miejsce lądowania poza areną (gracz przy ścianie) dosuwamy w stronę gracza, aż trafi na podłogę areny. */
  private throwWeb(planned: WebShot): void {
    const { scene, player } = this.deps;
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
    });
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
    const { player } = this.deps;
    this.webs = this.webs.filter((web) => {
      const { shot } = web;
      if (now >= shot.expiresAt) {
        this.removeWeb(web);
        return false;
      }
      if (now < shot.landAt) {
        drawWebMarker(web.marker, shot);
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
      if (isInWebPatch(shot, player, now)) {
        player.applyTerrainSlow(shot.slow, now);
        // Grzybnia Króla (krok 29) dodatkowo zatruwa — teren, więc chroni tylko dash.
        if (shot.status) player.applyTerrainStatus(shot.status, now);
      }
      return true;
    });
  }

  /** Kokon w locie: łuk nad ziemią; przy lądowaniu pęka (klatki rozdarcia kokonu leża). */
  private updateThrows(now: number): void {
    this.throws = this.throws.filter(({ thrown, sprite }) => {
      if (now < thrown.launchAt) return true;
      if (now < thrown.landAt) {
        const t = (now - thrown.launchAt) / (thrown.landAt - thrown.launchAt);
        const lift = Math.sin(Math.PI * t) * KING_COCOON_VISUAL.arcHeight;
        sprite
          .setVisible(true)
          .setPosition(Math.round(thrown.from.x + (thrown.to.x - thrown.from.x) * t), Math.round(thrown.from.y + (thrown.to.y - thrown.from.y) * t - lift));
        return true;
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
    const patch = BOSS_PATCH_VISUALS[shot.look ?? 'web'];
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
    const { player, scene } = this.deps;
    const { fallMs, shadowRadius } = SPIDERLING_DROP_VISUAL;
    this.spawns = this.spawns.filter((pending) => {
      const { spawn } = pending;
      if (now < spawn.telegraphStartAt) return true;
      if (!pending.position) {
        const target = { x: player.x, y: player.y };
        const wanted = { x: target.x + spawn.offset.x, y: target.y + spawn.offset.y };
        pending.position = this.clampToward(wanted, target, (p) => this.isArenaFloor(p));
        pending.view = new CeilingFallView(scene, pending.position, SPIDERLING_VISUAL.sheet);
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
    const { player, effects, onPlayerHit } = this.deps;
    this.strikes = this.strikes.filter(({ strike, gfx }) => {
      if (now < strike.impactAt) {
        drawAreaTelegraph(gfx, strike, now);
        return true;
      }
      gfx.destroy();
      effects.impact(strike.center.x, strike.center.y, strike.radius);
      this.deps.decals.add('scorch', strike.center.x, strike.center.y);
      if (isHitByAreaStrike(strike, player, player.radius)) {
        const hit = {
          damage: strike.damage,
          knockback: knockbackFrom(strike.center, player, strike.knockback),
          ...(strike.status && { status: strike.status }),
        };
        if (player.takeHit(hit, now)) {
          onPlayerHit();
          // Hak Kata: złapany gracz ląduje tuż przed tarczą (zaraz potem uderzenie tarczą).
          if (strike.pullTo && player.body instanceof Phaser.Physics.Arcade.Body) {
            player.body.reset(strike.pullTo.x, strike.pullTo.y);
            effects.floatingText(player.x, player.y - player.radius - 8, 'Hak!', '#ff8a3c');
          }
          this.playThroneFx(THRONE_ROOM_VISUAL.fx.bloodRow, player.x, player.y);
          const boss = this.boss;
          if (strike.healOnHit && boss) {
            boss.heal(strike.healOnHit);
            this.playThroneFx(THRONE_ROOM_VISUAL.fx.sapRow, boss.x, boss.y);
            effects.floatingText(boss.x, boss.y - boss.radius - 8, `+${strike.healOnHit}`, FEAST_TEXT_COLOR);
          }
          if (strike.status?.paralysis && player.isParalyzed(now)) {
            effects.floatingText(player.x, player.y - player.radius - 8, 'Paraliż!', PARALYSIS_TEXT_COLOR);
          }
        }
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
          visual: BOSS_GLOB,
          impactDecal: 'slime',
        });
      }
      return false;
    });
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
    this.strikes.push({ strike, gfx: this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
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
    const { player } = this.deps;
    if (player.isDead || Math.hypot(player.x - center.x, player.y - center.y) <= radius) return;
    const hit = { damage: ring.damage, knockback: knockbackFrom(player, center, ring.knockback) };
    if (player.takeHit(hit, now)) this.deps.onPlayerHit();
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
    for (const pending of [...this.strikes, ...this.bursts, ...this.pendingHelpers]) pending.gfx.destroy();
    this.strikes = [];
    this.bursts = [];
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
    // Śmierć w locie: zwłoki na ziemi, w miejscu lądowania.
    this.finishLeap(boss);
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
    corpse.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      corpse.destroy();
      this.dying = false;
      this.finishDefeat(visual.deathDecal, position);
    });
    corpse.play(animationKey(sheet, animation, facing));
  }

  private finishDefeat(decal: CombatDecalKind, position: Vector2): void {
    this.deps.decals.add(decal, position.x, position.y);
    this.deps.onDefeated(position);
  }
}

/** Miejsce lądowania sieci: cienki czerwony obrys pełnego zasięgu i znacznik środka. */
function drawWebMarker(gfx: Phaser.GameObjects.Graphics, shot: WebShot): void {
  gfx.clear();
  gfx.lineStyle(1, TELEGRAPH_COLOR, 0.6).strokeCircle(shot.to.x, shot.to.y, shot.maxRadius);
  gfx.fillStyle(TELEGRAPH_COLOR, 0.25).fillCircle(shot.to.x, shot.to.y, shot.startRadius);
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

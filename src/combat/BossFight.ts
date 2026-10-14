import Phaser from 'phaser';
import type { AreaStrike, BossAttackPlan, BossLeap, ProjectileBurst, SpiderlingDefinition, SummonSpawn, WebShot } from '@/core/bossTypes';
import { TileType } from '@/core/dungeonTypes';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import type { BossHudData, Vector2 } from '@/core/types';
import { createRng, deriveSeed } from '@/core/random';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import {
  BOSS_LEAP_VISUAL,
  BOSS_PRESENCE_VISUAL,
  BOSS_PROJECTILE_VISUAL,
  BOSS_WEB_VISUAL,
  SPIDERLING_DROP_VISUAL,
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
import { stairsCenter } from '@/dungeon/stairs';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { CombatDecals } from '@/effects/CombatDecals';
import { Boss } from '@/entities/Boss';
import type { Player } from '@/entities/Player';
import type { Spiderling } from '@/entities/Spiderling';
import { knockbackFrom } from '@/systems/CombatMath';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { CombatDecalKind } from '@/config/dressingConfig';

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
const BOSS_DEFAULT_ENRAGED_LABEL = 'wściekły!';
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

  constructor(private readonly deps: BossFightDeps) {
    const arena = deps.floor.rooms[deps.floor.bossRoomId];
    if (!arena) throw new Error('BossFight: brak komnaty bossa w danych piętra.');
    this.arena = arena;

    const definition = scaleBossForFloor(bossForFloor(deps.floorNumber), deps.floorNumber, ENEMY_SCALING);
    this.spiderlingDefinition = definition.spiderling ?? null;
    const center = stairsCenter(deps.floor);
    const spawn = { x: center.x * TILE_SIZE, y: center.y * TILE_SIZE };
    const rng = createRng(deriveSeed(deps.floor.seed, BOSS_SEED_SALT));
    const boss = new Boss(deps.scene, spawn.x, spawn.y, definition, rng);
    this.boss = boss;

    deps.scene.physics.add.collider(boss, deps.walls);
    deps.scene.physics.add.collider(deps.player, boss);
    this.spiderlings = new SpiderlingSwarm(deps);
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
    if (!boss) return;
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

    const plan = boss.tick({ x: player.x, y: player.y }, now, this.spiderlings.count + this.spawns.length);
    if (plan) this.schedule(plan);
    this.updatePresence(boss);
    this.updateLeap(boss, now);

    this.updateStrikes(now);
    this.updateBursts(now);
    this.updateSpawns(now);
    this.updateWebs(now);
    this.spiderlings.update(now);
  }

  /** Cele gracza: pajączki (żywa tarcza) i boss. */
  private targets(): Array<Boss | Spiderling> {
    const living = this.spiderlings.living;
    return this.boss ? [...living, this.boss] : living;
  }

  /** Cios gracza — zwraca liczbę trafionych (boss i pajączki w łuku). */
  resolvePlayerMelee(swing: MeleeSwing): number {
    if (!this.boss) return 0;
    const { hit, killed } = resolveMeleeSwing(swing, this.targets());
    this.handleKills(killed);
    return hit.length;
  }

  /**
   * Pocisk gracza trafia najbliższy cel — pajączek między graczem a bossem przyjmuje strzał na siebie.
   * Zwraca trafiony cel (trafienie budzi bossa jak cios wręcz).
   */
  resolvePlayerShot(shot: PlayerShot): Boss | Spiderling | null {
    if (!this.boss) return null;
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
  private handleKills(killed: readonly (Boss | Spiderling)[]): void {
    this.spiderlings.handleKills(killed);
    if (this.boss && killed.includes(this.boss)) this.defeat();
  }

  /** Tylko do debugowania (klawisz B w trybie dev). */
  debugDefeat(): void {
    if (this.boss) this.defeat();
  }

  private schedule(plan: BossAttackPlan): void {
    const scene = this.deps.scene;
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
    for (const shot of plan.webs) this.throwWeb(shot);
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
    const center = stairsCenter(this.deps.floor);
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
      if (isInWebPatch(shot, player, now)) player.applyTerrainSlow(shot.slow, now);
      return true;
    });
  }

  private landWeb(web: ThrownWeb): void {
    const { shot } = web;
    web.marker.destroy();
    web.ball.destroy();
    const { patch } = BOSS_WEB_VISUAL;
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
          visual: BOSS_GLOB,
          impactDecal: 'slime',
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
    // Sieci są częścią walki — znikają razem z Matką Pająków.
    for (const web of this.webs) this.removeWeb(web);
    this.webs = [];
    // Pajączki giną razem z matką (bez wybuchów), niewyklute już się nie pojawią.
    this.spiderlings.clear();
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

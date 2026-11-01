import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { ArenaConditionsConfig, ArenaLayout, RubbleTile } from '@/core/arenaConditionTypes';
import { ArenaSide } from '@/core/arenaConditionTypes';
import type { AreaStrike, BossAttackPlan } from '@/core/bossTypes';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { BossEncounter } from '@/combat/BossEncounter';
import type { Boss } from '@/entities/Boss';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import type { Projectile } from '@/entities/Projectile';
import { reservedTiles, setFloorTile } from '@/dungeon/ArenaConditionPlanner';
import { DungeonView } from '@/dungeon/DungeonView';
import type { DressedFloor } from '@/dungeon/FloorDressing';
import { ARENA_ART, bakeArenaArt } from '@/effects/ArenaConditionArt';
import type { CombatEffects } from '@/effects/CombatEffects';
import { adjustStorkFlight, collapseOrder, mirrorExit, planHedge, rubbleForPhase, tileOf } from '@/systems/ArenaCover';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import { heroGroundPoint } from '@/systems/Hurtbox';
import type { MeleeSwing, MeleeTarget } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike } from '@/systems/Sorcery';
import { resolveBeam } from '@/systems/Sorcery';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';
import { crackRadiusFor, fallDamage, landingTile, TerracePlates, windDirection } from '@/systems/Terrace';
import type { WetLane, WetPuddle } from '@/systems/WetFloor';
import { isWet, liveLanes, planWetLane, rhythmDelay, shouldBossSlide, spillPuddle, sweepFront } from '@/systems/WetFloor';

const key = (t: TilePoint): string => `${t.x},${t.y}`;
const center = (t: TilePoint): Vector2 => DungeonView.tileToWorldCenter(t);

/** Napisy w świecie (barwy jak okrzyki i statusy). */
const TEXT = {
  slip: { text: 'Ślisko!', color: '#bfe6ff' },
  bossSlip: { text: 'Bęc!', color: '#ffe080' },
  collapse: { text: 'Mur się sypie!', color: '#ffd0a0' },
  mirror: { text: 'Przez lustro!', color: '#d8f4ff' },
  fall: { text: 'Spadasz!', color: '#ffb0a0' },
  wind: { text: 'Wiatr!', color: '#d0e8ff' },
  hedge: { text: 'Rośnij!', color: '#90e070' },
  nest: { text: 'Moje gniazdo!', color: '#ff9a50' },
  chlorine: { text: 'Chlor!', color: '#b0f070' },
  textGapMs: 1500,
} as const;

/** Rekwizyt, który przyjmuje trafienia bohatera (wiadro, butla, lustro, gniazdo, kafel żywopłotu). */
class Prop implements MeleeTarget {
  constructor(
    public x: number,
    public y: number,
    readonly radius: number,
    public hitsLeft: number,
    private readonly onHit: (prop: Prop, source: Vector2, now: number) => void,
  ) {}

  get alive(): boolean {
    return this.hitsLeft > 0;
  }

  takeHit(_hit: Hit, now: number, source: Vector2): DamageResult {
    if (!this.alive) return { dealt: 0, died: false };
    this.hitsLeft -= 1;
    this.onHit(this, source, now);
    return { dealt: 0, died: !this.alive };
  }
}

interface Mirror {
  readonly tile: TilePoint;
  readonly prop: Prop;
  readonly sprite: Phaser.GameObjects.Image;
}

interface Nest {
  readonly tile: TilePoint;
  readonly prop: Prop;
  readonly sprite: Phaser.GameObjects.Image;
}

interface HedgeTile {
  readonly tile: TilePoint;
  readonly prop: Prop;
  readonly sprite: Phaser.GameObjects.Image;
}

interface HedgeSegment {
  readonly tiles: readonly TilePoint[];
  readonly growAt: number;
  readonly diesAt: number;
  grown: HedgeTile[] | null;
}

interface Cloud {
  readonly center: Vector2;
  readonly until: number;
  nextTickAt: number;
}

interface Shards {
  readonly center: Vector2;
  readonly until: number;
  readonly specks: readonly Vector2[];
}

export interface ArenaConditionDeps {
  readonly scene: Phaser.Scene;
  /** Piętro (kafle zmieniają się w trakcie walki — linia wzroku i droga wrogów widzą przeszkody). */
  readonly floor: DungeonFloor;
  readonly arena: Room;
  readonly view: DungeonView;
  readonly config: ArenaConditionsConfig;
  readonly layout: ArenaLayout;
  readonly party: Party;
  /** Walka na arenie (tworzona po menedżerze — stąd funkcja). */
  readonly encounter: () => BossEncounter;
  readonly effects: CombatEffects;
  /** Obraz piętra dla faz walącego się muru: [0] — z całym gruzem (startowy), [1] — bez wschodniego, [2] — bez gruzu. */
  readonly rubbleDressings: readonly DressedFloor[];
  readonly rng: Rng;
  readonly onPlayerHit: (player: Player) => void;
}

/**
 * Zmienne warunki areny (krok 160, prośba właściciela „interaktywne, zmienne warunki”): wykonuje decyzje
 * czystych systemów (`WetFloor`, `Terrace`, `ArenaCover`) i rysuje je. Jeden menedżer na arenę piętra.
 */
export class ArenaConditionManager {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly overGfx: Phaser.GameObjects.Graphics;
  private readonly arenaPx: { left: number; top: number; right: number; bottom: number };
  private startedAt: number | null = null;
  private lastTextAt = new Map<string, number>();

  // A1 — mokra posadzka.
  private lanes: WetLane[] = [];
  private laneSigns = new Map<WetLane, Phaser.GameObjects.Image[]>();
  private puddles: WetPuddle[] = [];
  private nextLaneAt = Infinity;
  private readonly buckets: Array<{ readonly prop: Prop; readonly sprite: Phaser.GameObjects.Image }> = [];
  private readonly lastSlideAt = new Map<Boss, number>();
  private readonly sliding = new Set<Boss>();

  // A3 — walący się mur.
  private collapsedPhase = 0;
  private readonly bottles: Array<{ readonly tile: TilePoint; readonly prop: Prop; readonly sprite: Phaser.GameObjects.Image; revealed: boolean }> = [];
  private clouds: Cloud[] = [];

  // A2 — lustra.
  private readonly mirrors = new Map<string, Mirror>();
  private shards: Shards[] = [];
  private readonly teleportReadyAt = new Map<Boss, number>();

  // B3 — taras.
  private readonly plates: TerracePlates | null;
  private readonly openedHoles = new Set<string>();
  private readonly lastSafe = new Map<Player, TilePoint>();
  private readonly fallGraceUntil = new Map<Player, number>();
  private nextGustAt = Infinity;
  private gust: { readonly telegraphUntil: number; readonly until: number } | null = null;

  // B2 — żywopłot.
  private hedges: HedgeSegment[] = [];
  private readonly hedgeTiles = new Map<string, HedgeTile>();
  private nextHedgeAt = Infinity;

  // B1 — gniazda na słupach.
  private readonly nests = new Map<string, Nest>();

  constructor(private readonly deps: ArenaConditionDeps) {
    const { scene, arena, layout, config } = deps;
    bakeArenaArt(scene);
    this.gfx = scene.add.graphics().setDepth(RENDER_DEPTH.floorHazard);
    this.overGfx = scene.add.graphics().setDepth(RENDER_DEPTH.telegraph);
    this.arenaPx = { left: arena.x * TILE_SIZE, top: arena.y * TILE_SIZE, right: (arena.x + arena.width) * TILE_SIZE, bottom: (arena.y + arena.height) * TILE_SIZE };

    const wet = config.wetFloor;
    if (wet) {
      for (const tile of layout.buckets) {
        const at = center(tile);
        const sprite = scene.add.image(at.x, at.y, ARENA_ART.bucket).setDepth(RENDER_DEPTH.shrine);
        const prop = new Prop(at.x, at.y, wet.buckets.radius, 1, (_p, source, now) => this.tipBucket(prop, sprite, source, now));
        this.buckets.push({ prop, sprite });
      }
    }

    const collapse = config.collapse;
    if (collapse) {
      for (const tile of layout.bottles) {
        const at = center(tile);
        const sprite = scene.add.image(at.x, at.y, ARENA_ART.bottle).setDepth(RENDER_DEPTH.shrine).setVisible(false);
        const prop = new Prop(at.x, at.y, collapse.bottles.radius, 1, (_p, _s, now) => this.burstBottle(tile, sprite, now));
        this.bottles.push({ tile, prop, sprite, revealed: false });
      }
    }

    const mirrors = config.mirrors;
    if (mirrors) {
      for (const tile of layout.mirrors) {
        const at = center(tile);
        this.block(tile, true);
        const sprite = scene.add.image(at.x, at.y + TILE_SIZE / 2 + 2, ARENA_ART.mirror).setOrigin(0.5, 1).setDepth(RENDER_DEPTH.shrine);
        const prop = new Prop(at.x, at.y, TILE_SIZE / 2, mirrors.hits, (p, _s, now) => this.hitMirror(tile, p, now));
        this.mirrors.set(key(tile), { tile, prop, sprite });
      }
    }

    const nests = config.nestPillars;
    if (nests) {
      for (const tile of layout.pillars) {
        const at = center(tile);
        this.block(tile, true);
        scene.add.image(at.x, at.y + TILE_SIZE / 2 + 4, ARENA_ART.pillar).setOrigin(0.5, 1).setDepth(RENDER_DEPTH.shrine);
        const sprite = scene.add.image(at.x, at.y - 30, ARENA_ART.nest).setDepth(RENDER_DEPTH.shrine + 0.1);
        const prop = new Prop(at.x, at.y, TILE_SIZE / 2, nests.nestHits, (p, _s, now) => this.hitNest(tile, p, now));
        this.nests.set(key(tile), { tile, prop, sprite });
      }
    }

    const terrace = config.terrace;
    if (terrace && layout.abyss) {
      const reserved = reservedTiles(deps.floor, arena, terrace.clearTiles);
      const allowed = new Set<string>();
      for (let y = arena.y; y < arena.y + arena.height; y++) {
        for (let x = arena.x; x < arena.x + arena.width; x++) {
          const tile = { x, y };
          if (!reserved.has(key(tile)) && !this.nests.has(key(tile)) && this.isFloor(tile)) allowed.add(key(tile));
        }
      }
      this.plates = new TerracePlates(allowed, arena.width * arena.height, terrace);
      this.drawAbyss(layout.abyss);
    } else {
      this.plates = null;
    }
  }

  // ————————————————————————————————————————————— wspólne

  private isFloor(tile: TilePoint): boolean {
    const { floor } = this.deps;
    if (tile.x < 0 || tile.y < 0 || tile.x >= floor.width || tile.y >= floor.height) return false;
    return floor.tiles[tile.y * floor.width + tile.x] !== TileType.Wall;
  }

  private inArena(tile: TilePoint): boolean {
    const { arena } = this.deps;
    return tile.x >= arena.x && tile.y >= arena.y && tile.x < arena.x + arena.width && tile.y < arena.y + arena.height;
  }

  /** Kafel staje się przeszkodą albo podłogą — fizyka i kafle piętra (linia wzroku, droga wrogów) razem. */
  private block(tile: TilePoint, blocked: boolean): void {
    setFloorTile(this.deps.floor, tile, blocked ? TileType.Wall : TileType.Floor);
    this.deps.view.setBlocked(tile, blocked);
  }

  private say(kind: keyof Omit<typeof TEXT, 'textGapMs'>, at: Vector2, now: number): void {
    const last = this.lastTextAt.get(kind) ?? -Infinity;
    if (now - last < TEXT.textGapMs) return;
    this.lastTextAt.set(kind, now);
    const { text, color } = TEXT[kind];
    this.deps.effects.floatingText(at.x, at.y - 24, text, color);
  }

  private fighters(): Boss[] {
    return this.deps.encounter().arenaFights.flatMap((fight) => (fight.arenaFighter ? [fight.arenaFighter] : []));
  }

  update(now: number): void {
    const encounter = this.deps.encounter();
    const fighting = encounter.isFighting;
    const over = encounter.isDefeated;
    if (fighting && this.startedAt === null) this.start(now);
    const enraged = encounter.arenaFights.some((fight) => fight.isEnraged);
    this.gfx.clear();
    this.overGfx.clear();
    this.updateCollapse(encounter.arenaPhase, now);
    if (over) this.dryUp();
    this.updateWet(now, fighting, enraged);
    this.updateClouds(now);
    this.updateMirrors(now);
    this.updateTerrace(now, fighting, enraged, over);
    this.updateHedges(now, fighting, enraged, over);
  }

  private start(now: number): void {
    this.startedAt = now;
    const { config } = this.deps;
    if (config.wetFloor) this.nextLaneAt = now + config.wetFloor.firstAfterMs;
    if (config.terrace?.wind && this.deps.layout.abyss) this.nextGustAt = now + config.terrace.wind.firstAfterMs;
    if (config.hedges) this.nextHedgeAt = now + config.hedges.firstAfterMs;
  }

  /**
   * Po zwycięstwie posadzka od razu schnie, a chmury chloru się rozwiewają: przy łupach i schodach nic już nie
   * ślizga ani nie truje (poślizg zniósłby bohatera ze schodów).
   */
  private dryUp(): void {
    if (this.lanes.length === 0 && this.puddles.length === 0 && this.clouds.length === 0) return;
    for (const signs of this.laneSigns.values()) for (const sign of signs) sign.destroy();
    this.laneSigns.clear();
    this.lanes = [];
    this.puddles = [];
    this.clouds = [];
  }

  // ————————————————————————————————————————————— A1 mokra posadzka

  private updateWet(now: number, fighting: boolean, enraged: boolean): void {
    const wet = this.deps.config.wetFloor;
    if (!wet) return;
    if (fighting && now >= this.nextLaneAt) {
      this.nextLaneAt = now + rhythmDelay(wet.every, enraged);
      const heroes = this.deps.party.living;
      const aim = heroes[this.deps.rng.int(0, Math.max(0, heroes.length - 1))];
      if (aim) this.mopLane(planWetLane(this.arenaPx, heroGroundPoint(aim).y, TILE_SIZE, now, this.deps.rng.chance(0.5), wet));
    }
    const alive = liveLanes(this.lanes, now, wet.maxLanes);
    for (const lane of this.lanes) {
      if (alive.includes(lane)) continue;
      for (const sign of this.laneSigns.get(lane) ?? []) sign.destroy();
      this.laneSigns.delete(lane);
    }
    this.lanes = alive;
    this.puddles = this.puddles.filter((p) => now < p.until);
    this.drawWet(now);

    for (const player of this.deps.party.living) {
      const foot = heroGroundPoint(player);
      if (!isWet(foot, this.lanes, this.puddles, now)) continue;
      if (player.applyTerrainSlip(wet.slip, now)) this.say('slip', player, now);
    }

    const slide = wet.bossSlide;
    for (const boss of this.fighters()) {
      const body = boss.body as Phaser.Physics.Arcade.Body;
      if (this.sliding.has(boss)) {
        if (!boss.isSliding(now)) {
          this.sliding.delete(boss);
          continue;
        }
        if (!body.blocked.none) {
          boss.stopSlide();
          this.sliding.delete(boss);
          boss.daze(slide.stunMs, now);
          this.deps.effects.impact(boss.x, boss.y, boss.radius * 1.6);
          this.deps.scene.cameras.main.shake(140, 0.004);
          sound.play(SoundCue.Impact, boss);
          this.say('bossSlip', boss, now);
        }
        continue;
      }
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      const onWet = isWet({ x: boss.x, y: boss.y + boss.radius * 0.5 }, this.lanes, this.puddles, now);
      if (!shouldBossSlide(speed, onWet, now, this.lastSlideAt.get(boss) ?? -Infinity, slide)) continue;
      this.lastSlideAt.set(boss, now);
      this.sliding.add(boss);
      boss.startSlide({ x: body.velocity.x * slide.speedMultiplier, y: body.velocity.y * slide.speedMultiplier }, slide.slideMs, now);
      this.say('slip', boss, now);
    }
  }

  private mopLane(lane: WetLane): void {
    this.lanes.push(lane);
    const mid = (lane.top + lane.bottom) / 2;
    // Znaki „ślisko” na brzegach otwartej podłogi (za grubym murem ich nie widać).
    const row = Math.floor(mid / TILE_SIZE);
    const cols: number[] = [];
    for (let x = this.deps.arena.x; x < this.deps.arena.x + this.deps.arena.width; x++) if (this.isFloor({ x, y: row })) cols.push(x);
    const edges = cols.length > 0 ? [cols[0]! * TILE_SIZE + 12, (cols.at(-1)! + 1) * TILE_SIZE - 12] : [lane.left + 12, lane.right - 12];
    const signs = edges.map((x) => this.deps.scene.add.image(x, mid, ARENA_ART.sign).setDepth(RENDER_DEPTH.shrine));
    this.laneSigns.set(lane, signs);
    sound.play(SoundCue.Splash, { x: lane.fromLeft ? lane.left : lane.right, y: mid });
  }

  private tipBucket(prop: Prop, sprite: Phaser.GameObjects.Image, source: Vector2, now: number): void {
    const wet = this.deps.config.wetFloor;
    if (!wet) return;
    sprite.setTexture(ARENA_ART.bucketTipped);
    if (source.x > prop.x) sprite.setFlipX(true);
    const puddle = spillPuddle(prop, source, now, wet);
    this.puddles.push(puddle);
    this.deps.effects.splash(puddle.center.x, puddle.center.y, puddle.radius);
    sound.play(SoundCue.Splash, prop);
  }

  private drawWet(now: number): void {
    const wet = this.deps.config.wetFloor;
    if (!wet) return;
    const g = this.gfx;
    for (const lane of this.lanes) {
      const drying = now >= lane.wetUntil ? 1 - (now - lane.wetUntil) / Math.max(1, wet.dryMs) : 1;
      const front = sweepFront(lane, now);
      const x0 = lane.fromLeft ? lane.left : front;
      const x1 = lane.fromLeft ? front : lane.right;
      if (x1 <= x0) continue;
      g.fillStyle(0x8fd0ff, 0.3 * drying).fillRect(x0, lane.top, x1 - x0, lane.bottom - lane.top);
      g.lineStyle(1, 0xffffff, 0.55 * drying);
      for (let x = lane.left + 10; x < lane.right; x += 26) {
        if (x < x0 || x > x1) continue;
        const y = lane.top + 8 + ((x * 7) % (lane.bottom - lane.top - 16));
        g.lineBetween(x, y, x + 9, y - 3);
      }
      // Mop w drodze: jaśniejsza krawędź pasa.
      if (now < lane.startAt + lane.sweepMs) g.fillStyle(0xe0f4ff, 0.7).fillRect(front - 2, lane.top, 4, lane.bottom - lane.top);
    }
    for (const puddle of this.puddles) {
      const fade = Math.min(1, (puddle.until - now) / 800);
      g.fillStyle(0x8fd0ff, 0.32 * fade).fillCircle(puddle.center.x, puddle.center.y, puddle.radius);
      g.lineStyle(1, 0xffffff, 0.5 * fade).strokeCircle(puddle.center.x, puddle.center.y, puddle.radius - 3);
    }
  }

  // ————————————————————————————————————————————— A3 walący się mur, butle chloru

  private updateCollapse(phase: number, now: number): void {
    const collapse = this.deps.config.collapse;
    if (!collapse || phase <= this.collapsedPhase) return;
    const tiles: RubbleTile[] = rubbleForPhase(this.deps.layout.rubble, phase).filter((t) => t.phase > this.collapsedPhase);
    this.collapsedPhase = phase;
    const dressing = this.deps.rubbleDressings[Math.min(phase, this.deps.rubbleDressings.length - 1)];
    if (tiles.length === 0 || !dressing) return;
    const { arena, scene, effects } = this.deps;
    const mid = { x: arena.x + arena.width / 2, y: arena.y + arena.height / 2 };
    const order = collapseOrder(tiles, mid, collapse.rippleMs);
    const anchor = center(order[0]!.tile);
    this.say('collapse', anchor, now);
    scene.cameras.main.shake(order.length * collapse.rippleMs + 200, 0.003);
    order.forEach(({ tile, delayMs }, i) => {
      scene.time.delayedCall(delayMs, () => {
        this.block(tile, false);
        const near: TilePoint[] = [];
        for (let dy = -2; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push({ x: tile.x + dx, y: tile.y + dy });
        this.deps.view.applyDressing(dressing, near);
        const at = center(tile);
        effects.deathBurst(at.x, at.y, 0x9a8a7a, 14);
        if (i % 3 === 0) sound.play(SoundCue.Break, at);
        const bottle = this.bottles.find((b) => b.tile.x === tile.x && b.tile.y === tile.y);
        if (bottle) {
          bottle.revealed = true;
          bottle.sprite.setVisible(true);
        }
      });
    });
    // Wózek sprzątaczek w odsłoniętym zapleczu (dekoracja bez kolizji).
    if (phase === 1 && this.bottles.length > 0) {
      const first = this.bottles[0]!.tile;
      const cart = center({ x: first.x - 1, y: first.y });
      scene.time.delayedCall(order.at(-1)!.delayMs, () => scene.add.image(cart.x, cart.y, ARENA_ART.cart).setDepth(RENDER_DEPTH.floorFeature + 0.2));
    }
  }

  private burstBottle(tile: TilePoint, sprite: Phaser.GameObjects.Image, now: number): void {
    const collapse = this.deps.config.collapse;
    if (!collapse) return;
    const at = center(tile);
    sprite.destroy();
    this.clouds.push({ center: at, until: now + collapse.bottles.cloud.durationMs, nextTickAt: now });
    this.deps.effects.deathBurst(at.x, at.y, 0xb0f070, collapse.bottles.cloud.radius * 0.6);
    sound.play(SoundCue.Break, at);
    this.say('chlorine', at, now);
  }

  private updateClouds(now: number): void {
    const cloud = this.deps.config.collapse?.bottles.cloud;
    if (!cloud) return;
    this.clouds = this.clouds.filter((c) => now < c.until);
    for (const c of this.clouds) {
      const fade = Math.min(1, (c.until - now) / 700);
      const pulse = 0.85 + 0.15 * Math.sin(now / 180);
      this.overGfx.fillStyle(0xa8f060, 0.22 * fade).fillCircle(c.center.x, c.center.y, cloud.radius * pulse);
      this.overGfx.fillStyle(0xd8ff90, 0.14 * fade).fillCircle(c.center.x + 10 * Math.sin(now / 300), c.center.y - 6, cloud.radius * 0.55);
      for (const player of this.deps.party.living) {
        const foot = heroGroundPoint(player);
        if (Math.hypot(foot.x - c.center.x, foot.y - c.center.y) <= cloud.radius) player.applyTerrainStatus({ poison: cloud.poison }, now);
      }
      if (now < c.nextTickAt) continue;
      c.nextTickAt = now + cloud.tickMs;
      for (const boss of this.fighters()) {
        if (Math.hypot(boss.x - c.center.x, boss.y - c.center.y) > cloud.radius + boss.radius * 0.5) continue;
        boss.takeHit({ damage: cloud.bossDamage, knockback: { x: 0, y: 0 } }, now, c.center);
        this.deps.effects.floatingText(boss.x, boss.y - boss.radius, `-${cloud.bossDamage}`, TEXT.chlorine.color);
      }
    }
  }

  // ————————————————————————————————————————————— A2 lustra

  private hitMirror(tile: TilePoint, prop: Prop, now: number): void {
    const config = this.deps.config.mirrors;
    const mirror = this.mirrors.get(key(tile));
    if (!config || !mirror) return;
    const at = center(tile);
    if (prop.alive) {
      if (prop.hitsLeft <= Math.ceil(config.hits / 2)) mirror.sprite.setTexture(ARENA_ART.mirrorCracked);
      this.deps.effects.impact(at.x, at.y - 8, 10);
      sound.play(SoundCue.ShieldBlock, at);
      return;
    }
    // Lustro pęka: szkło na podłodze spowalnia, przejście wolne.
    this.mirrors.delete(key(tile));
    mirror.sprite.destroy();
    this.block(tile, false);
    this.deps.effects.deathBurst(at.x, at.y - 10, 0xd8f4ff, 22);
    sound.play(SoundCue.Break, at);
    const specks: Vector2[] = [];
    for (let i = 0; i < 18; i++) {
      const a = this.deps.rng.next() * Math.PI * 2;
      const r = this.deps.rng.next() * config.shards.radius;
      specks.push({ x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r * 0.7 });
    }
    this.shards.push({ center: at, until: now + config.shards.durationMs, specks });
  }

  private updateMirrors(now: number): void {
    const config = this.deps.config.mirrors;
    if (!config) return;
    this.shards = this.shards.filter((s) => now < s.until);
    for (const s of this.shards) {
      const fade = Math.min(1, (s.until - now) / 1000);
      this.gfx.fillStyle(0xe8f8ff, 0.85 * fade);
      for (const p of s.specks) this.gfx.fillTriangle(p.x, p.y, p.x + 3, p.y + 1, p.x + 1, p.y + 3);
      for (const player of this.deps.party.living) {
        const foot = heroGroundPoint(player);
        if (Math.hypot(foot.x - s.center.x, foot.y - s.center.y) <= config.shards.radius) player.applyTerrainSlow(config.shards.slow, now);
      }
    }
    // Sprzątaczka, która utknie przy lustrze, wychodzi z drugiego.
    const intact = [...this.mirrors.values()];
    if (intact.length < 2) return;
    for (const boss of this.fighters()) {
      if (now < (this.teleportReadyAt.get(boss) ?? 0)) continue;
      const entry = intact.find((m) => Math.hypot(boss.x - m.prop.x, boss.y - m.prop.y) <= boss.radius + TILE_SIZE / 2 + config.teleport.touchPx);
      if (!entry) continue;
      const exitMirror = intact.find((m) => m !== entry)!;
      const exit = mirrorExit(exitMirror.tile, (t) => this.inArena(t) && this.isFloor(t) && !this.isHoleOrCrack(t, now));
      if (!exit) continue;
      const to = center(exit);
      this.teleportReadyAt.set(boss, now + config.teleport.cooldownMs);
      this.deps.effects.deathBurst(boss.x, boss.y, 0xd8f4ff, boss.radius);
      const fight = this.deps.encounter().arenaFights.find((f) => f.arenaFighter === boss);
      fight?.teleport(to);
      this.deps.effects.deathBurst(to.x, to.y, 0xd8f4ff, boss.radius);
      sound.play(SoundCue.Secret, to);
      this.say('mirror', to, now);
    }
  }

  // ————————————————————————————————————————————— B3 taras

  private isHoleOrCrack(tile: TilePoint, now: number): boolean {
    return Boolean(this.plates && (this.plates.isHole(tile, now) || this.plates.isCracking(tile, now)));
  }

  private updateTerrace(now: number, fighting: boolean, enraged: boolean, over: boolean): void {
    const plates = this.plates;
    const terrace = this.deps.config.terrace;
    if (!plates || !terrace) return;
    if (over && !plates.isPatched) plates.patch();
    this.drawPlates(now);
    if (plates.isPatched) {
      for (const player of this.deps.party.members) player.setWindPush({ x: 0, y: 0 });
      return;
    }

    for (const player of this.deps.party.living) {
      const tile = tileOf(heroGroundPoint(player), TILE_SIZE);
      if (!plates.isHole(tile, now)) {
        if (!plates.isCracking(tile, now) && this.isFloor(tile)) this.lastSafe.set(player, tile);
        continue;
      }
      if (player.isDashing(now) || now < (this.fallGraceUntil.get(player) ?? 0)) continue;
      this.fall(player, tile, now);
    }

    // Podmuchy ku przepaści.
    const side = this.deps.layout.abyss;
    const wind = terrace.wind;
    if (side && fighting && !this.gust && now >= this.nextGustAt) {
      this.gust = { telegraphUntil: now + wind.telegraphMs, until: now + wind.telegraphMs + wind.gustMs };
      this.nextGustAt = this.gust.until + rhythmDelay(wind.every, enraged);
      sound.play(SoundCue.WingFlap, this.deps.party.leader);
    }
    const gust = this.gust;
    if (!side) return;
    const dir = windDirection(side);
    const blowing = gust !== null && now >= gust.telegraphUntil && now < gust.until;
    for (const player of this.deps.party.members) player.setWindPush(blowing ? { x: dir.x * wind.pushPx, y: dir.y * wind.pushPx } : { x: 0, y: 0 });
    if (gust && now >= gust.until) this.gust = null;
    if (gust) {
      if (blowing) this.say('wind', this.deps.party.leader, now);
      this.drawWind(dir, now, blowing ? 1 : 0.4);
    }
  }

  private fall(player: Player, tile: TilePoint, now: number): void {
    const terrace = this.deps.config.terrace!;
    const at = center(tile);
    this.fallGraceUntil.set(player, now + terrace.fall.graceMs);
    this.deps.effects.deathBurst(at.x, at.y, 0x101420, 14);
    if (player.takeHit({ damage: fallDamage(player.health.max, terrace), knockback: { x: 0, y: 0 } }, now)) this.deps.onPlayerHit(player);
    const safe = (t: TilePoint): boolean =>
      this.inArena(t) && this.isFloor(t) && !this.isHoleOrCrack(t, now) && !this.deps.view.collisionLayer.hasTileAt(t.x, t.y);
    const land = landingTile(this.lastSafe.get(player) ?? tile, safe) ?? landingTile(tile, safe);
    if (land && !player.isDead) {
      const to = center(land);
      (player.body as Phaser.Physics.Arcade.Body).reset(to.x, to.y);
      player.setAlpha(0.3);
      this.deps.scene.tweens.add({ targets: player, alpha: 1, duration: 400 });
    }
    this.deps.scene.cameras.main.shake(120, 0.004);
    this.say('fall', player, now);
  }

  private drawPlates(now: number): void {
    const plates = this.plates;
    if (!plates) return;
    const g = this.gfx;
    for (const plate of plates.all) {
      const x = plate.tile.x * TILE_SIZE;
      const y = plate.tile.y * TILE_SIZE;
      if (plates.isPatched && now >= plate.holeAt) {
        // Po walce dziury zarastają gałęziami.
        g.fillStyle(0x3a2a18, 1).fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        g.lineStyle(2, 0x6e4c26, 1).lineBetween(x + 3, y + 8, x + 29, y + 20).lineBetween(x + 4, y + 26, x + 28, y + 6);
        continue;
      }
      if (now < plate.holeAt) {
        const blink = 0.5 + 0.5 * Math.sin((now - plate.crackAt) / 60);
        this.overGfx.lineStyle(2, 0xff5040, 0.5 + 0.5 * blink).strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        g.lineStyle(1, 0x1b1410, 0.9).lineBetween(x + 4, y + 7, x + 16, y + 18).lineBetween(x + 16, y + 18, x + 28, y + 10).lineBetween(x + 16, y + 18, x + 13, y + 29);
        continue;
      }
      const k = key(plate.tile);
      if (!this.openedHoles.has(k)) {
        this.openedHoles.add(k);
        this.deps.effects.deathBurst(x + 16, y + 16, 0x5a5048, 16);
        sound.play(SoundCue.Break, { x: x + 16, y: y + 16 });
      }
      g.fillStyle(0x04050c, 1).fillRect(x, y, TILE_SIZE, TILE_SIZE);
      g.fillStyle(0x1b1a22, 1).fillRect(x, y, TILE_SIZE, 3);
      g.fillStyle(0xffb070, 0.9).fillRect(x + ((plate.tile.x * 13) % 24) + 4, y + ((plate.tile.y * 7) % 20) + 8, 1, 1);
      g.fillStyle(0xc0d0ff, 0.7).fillRect(x + ((plate.tile.y * 11) % 22) + 5, y + ((plate.tile.x * 5) % 18) + 6, 1, 1);
    }
  }

  private drawWind(dir: Vector2, now: number, strength: number): void {
    const g = this.overGfx;
    const { left, top, right, bottom } = this.arenaPx;
    g.lineStyle(1, 0xd8e8ff, 0.5 * strength);
    for (let i = 0; i < 18; i++) {
      const phase = ((now / 6 + i * 53) % 400) / 400;
      const across = ((i * 97) % 100) / 100;
      const x = dir.x !== 0 ? (dir.x > 0 ? left + (right - left) * phase : right - (right - left) * phase) : left + (right - left) * across;
      const y = dir.y !== 0 ? (dir.y > 0 ? top + (bottom - top) * phase : bottom - (bottom - top) * phase) : top + (bottom - top) * across;
      g.lineBetween(x, y, x - dir.x * 14, y - dir.y * 14);
    }
  }

  /** Przepaść za bokiem tarasu: noc, gwiazdy i światła ostatniego miasta w dole; balustrada wzdłuż brzegu areny. */
  private drawAbyss(side: ArenaSide): void {
    const { arena, floor, scene } = this.deps;
    // Nad warstwą `overhead` (mur od strony podłogi jest kopiowany nad postacie) — inaczej przepaść schowałaby się pod murem.
    const g = scene.add.graphics().setDepth(RENDER_DEPTH.overhead + 0.05);
    const out = side === ArenaSide.South ? { x: 0, y: 1 } : side === ArenaSide.East ? { x: 1, y: 0 } : side === ArenaSide.West ? { x: -1, y: 0 } : { x: 0, y: -1 };
    const edge: TilePoint[] = [];
    if (out.y !== 0) for (let x = arena.x - 1; x <= arena.x + arena.width; x++) edge.push({ x, y: out.y > 0 ? arena.y + arena.height : arena.y - 1 });
    else for (let y = arena.y - 1; y <= arena.y + arena.height; y++) edge.push({ x: out.x > 0 ? arena.x + arena.width : arena.x - 1, y });
    const isWall = (t: TilePoint): boolean =>
      t.x >= 0 && t.y >= 0 && t.x < floor.width && t.y < floor.height && floor.tiles[t.y * floor.width + t.x] === TileType.Wall;
    for (const start of edge) {
      for (let d = 0; d < 4; d++) {
        const t = { x: start.x + out.x * d, y: start.y + out.y * d };
        if (!isWall(t)) break;
        const x = t.x * TILE_SIZE;
        const y = t.y * TILE_SIZE;
        g.fillStyle(d === 0 ? 0x0a0d1a : 0x05070f, 1).fillRect(x, y, TILE_SIZE, TILE_SIZE);
        for (let s = 0; s < 3; s++) {
          const h = Math.sin((t.x * 31 + t.y * 17 + s * 7) * 12.9898) * 43758.5453;
          const f = h - Math.floor(h);
          const city = d >= 2 && f > 0.55;
          g.fillStyle(city ? 0xffa850 : 0xc8d4ff, city ? 0.95 : 0.7).fillRect(x + Math.floor(f * 28) + 2, y + Math.floor(((f * 7) % 1) * 28) + 2, 1, 1);
        }
      }
    }
    // Balustrada: słupki i poręcz na brzegu areny.
    g.fillStyle(0x9aa0aa, 1);
    for (const t of edge) {
      if (!isWall(t)) continue;
      const x = t.x * TILE_SIZE;
      const y = t.y * TILE_SIZE;
      if (out.y !== 0) {
        const ry = out.y > 0 ? y + 2 : y + TILE_SIZE - 6;
        g.fillRect(x, ry, TILE_SIZE, 3).fillRect(x + 14, ry - 6, 4, 10);
      } else {
        const rx = out.x > 0 ? x + 2 : x + TILE_SIZE - 6;
        g.fillRect(rx, y, 3, TILE_SIZE).fillRect(rx - 3, y + 14, 10, 4);
      }
    }
  }

  // ————————————————————————————————————————————— B2 żywopłot

  private updateHedges(now: number, fighting: boolean, enraged: boolean, over: boolean): void {
    const config = this.deps.config.hedges;
    if (!config) return;
    if (over) {
      for (const segment of this.hedges) this.wilt(segment);
      this.hedges = [];
      return;
    }
    if (fighting && now >= this.nextHedgeAt) {
      this.nextHedgeAt = now + rhythmDelay(config.every, enraged);
      if (this.hedges.length < config.maxAlive) this.sprout(now);
    }
    for (const segment of this.hedges) {
      if (!segment.grown && now >= segment.growAt) segment.grown = this.grow(segment);
      if (!segment.grown) {
        // Telegraf: przerywany zielony obrys kafli, które zaraz wyrosną.
        const t = 1 - (segment.growAt - now) / config.telegraphMs;
        this.overGfx.lineStyle(2, 0x90e070, 0.4 + 0.6 * t);
        for (const tile of segment.tiles) {
          const x = tile.x * TILE_SIZE;
          const y = tile.y * TILE_SIZE;
          for (let i = 0; i < TILE_SIZE; i += 8) {
            this.overGfx.lineBetween(x + i, y + 1, x + i + 4, y + 1).lineBetween(x + i, y + TILE_SIZE - 1, x + i + 4, y + TILE_SIZE - 1);
            this.overGfx.lineBetween(x + 1, y + i, x + 1, y + i + 4).lineBetween(x + TILE_SIZE - 1, y + i, x + TILE_SIZE - 1, y + i + 4);
          }
        }
      }
    }
    const [dead, alive] = this.hedges.reduce<[HedgeSegment[], HedgeSegment[]]>(
      ([d, a], s) => (now >= s.diesAt ? [[...d, s], a] : [d, [...a, s]]),
      [[], []],
    );
    for (const segment of dead) this.wilt(segment);
    this.hedges = alive;
  }

  private bodyTiles(): TilePoint[] {
    const encounter = this.deps.encounter();
    const bodies: Vector2[] = [...this.deps.party.living.map(heroGroundPoint), ...this.fighters(), ...encounter.minions];
    return bodies.map((b) => tileOf(b, TILE_SIZE));
  }

  private sprout(now: number): void {
    const config = this.deps.config.hedges!;
    const witch = this.fighters()[0];
    if (!witch) return;
    const target = this.deps.party.targetFor(witch);
    const bodies = this.bodyTiles();
    const reserved = reservedTiles(this.deps.floor, this.deps.arena, 2);
    const isOpen = (t: TilePoint): boolean => this.inArena(t) && this.isFloor(t);
    const isFree = (t: TilePoint): boolean =>
      isOpen(t) &&
      !reserved.has(key(t)) &&
      !this.isHoleOrCrack(t, now) &&
      !this.hedges.some((s) => s.tiles.some((h) => h.x === t.x && h.y === t.y)) &&
      bodies.every((b) => Math.max(Math.abs(b.x - t.x), Math.abs(b.y - t.y)) > config.clearOfBodiesTiles);
    const heroes = this.deps.party.living.map((p) => tileOf(heroGroundPoint(p), TILE_SIZE));
    const tiles = planHedge(tileOf(witch, TILE_SIZE), heroes, tileOf(heroGroundPoint(target), TILE_SIZE), config, isFree, isOpen);
    if (!tiles) return;
    this.hedges.push({ tiles, growAt: now + config.telegraphMs, diesAt: now + config.telegraphMs + config.lifeMs, grown: null });
    this.say('hedge', witch, now);
  }

  private grow(segment: HedgeSegment): HedgeTile[] {
    const config = this.deps.config.hedges!;
    const bodies = this.bodyTiles();
    const grown: HedgeTile[] = [];
    for (const tile of segment.tiles) {
      // Ktoś wszedł na kafel w czasie telegrafu — tam żywopłot nie wyrasta (nikt nie utknie w krzaku).
      if (bodies.some((b) => b.x === tile.x && b.y === tile.y) || !this.isFloor(tile)) continue;
      this.block(tile, true);
      const at = center(tile);
      const sprite = this.deps.scene.add.image(at.x, at.y + TILE_SIZE / 2 + 2, ARENA_ART.hedge).setOrigin(0.5, 1).setDepth(RENDER_DEPTH.shrine).setScale(1, 0.2);
      this.deps.scene.tweens.add({ targets: sprite, scaleY: 1, duration: 220, ease: 'Back.Out' });
      const hedge: HedgeTile = {
        tile,
        sprite,
        prop: new Prop(at.x, at.y, TILE_SIZE / 2, config.hitsPerTile, (p) => {
          this.deps.effects.deathBurst(p.x, p.y - 8, 0x4a9a44, 10);
          if (!p.alive) this.cutHedge(hedge);
        }),
      };
      this.hedgeTiles.set(key(tile), hedge);
      grown.push(hedge);
    }
    if (grown.length > 0) sound.play(SoundCue.Brood, center(segment.tiles[0]!));
    return grown;
  }

  private cutHedge(hedge: HedgeTile): void {
    if (!this.hedgeTiles.has(key(hedge.tile))) return;
    this.hedgeTiles.delete(key(hedge.tile));
    this.block(hedge.tile, false);
    this.deps.effects.deathBurst(hedge.prop.x, hedge.prop.y - 6, 0x2f7034, 18);
    sound.play(SoundCue.Break, hedge.prop);
    hedge.sprite.destroy();
  }

  private wilt(segment: HedgeSegment): void {
    for (const hedge of segment.grown ?? []) {
      if (!this.hedgeTiles.has(key(hedge.tile))) continue;
      this.hedgeTiles.delete(key(hedge.tile));
      this.block(hedge.tile, false);
      this.deps.scene.tweens.add({ targets: hedge.sprite, scaleY: 0, alpha: 0, duration: 300, onComplete: () => hedge.sprite.destroy() });
    }
  }

  // ————————————————————————————————————————————— B1 gniazda

  private hitNest(tile: TilePoint, prop: Prop, now: number): void {
    const nest = this.nests.get(key(tile));
    if (!nest) return;
    this.deps.effects.deathBurst(nest.sprite.x, nest.sprite.y, 0xf0f0ea, 8);
    if (prop.alive) return;
    nest.sprite.setTexture(ARENA_ART.nestBroken);
    this.deps.scene.tweens.add({ targets: nest.sprite, y: nest.sprite.y + 30, alpha: 0.85, duration: 350, ease: 'Quad.In' });
    sound.play(SoundCue.WingFlap, nest.sprite);
    const witch = this.fighters()[0];
    this.say('nest', witch ?? nest.sprite, now);
  }

  /** Stojące gniazda (każde to jeden bocian w kluczu). */
  private get standingNests(): number {
    return [...this.nests.values()].filter((n) => n.prop.alive).length;
  }

  // ————————————————————————————————————————————— haki walki z bossem

  adjustPlan(plan: BossAttackPlan): BossAttackPlan {
    if (this.nests.size === 0) return plan;
    const storks = plan.throws.filter((t) => t.look === 'stork').length;
    const lost = this.nests.size - this.standingNests;
    return adjustStorkFlight(plan, storks - lost, [...this.nests.values()].map((n) => n.tile), TILE_SIZE);
  }

  onStrikeImpact(strike: AreaStrike): void {
    const plates = this.plates;
    const terrace = this.deps.config.terrace;
    if (!plates || !terrace) return;
    const radius = crackRadiusFor(strike.look, strike.radius, terrace);
    if (radius === null) return;
    const now = this.deps.scene.time.now;
    const tile = tileOf(strike.center, TILE_SIZE);
    const cracked = radius === 0 ? (plates.crack(tile, now) ? [tile] : []) : plates.crackAround(tile, radius, now);
    if (cracked.length > 0) sound.play(SoundCue.Impact, strike.center);
  }

  // ————————————————————————————————————————————— trafienia bohaterów

  /** Rekwizyty do ciosów, promienia i dasha. */
  private props(): Prop[] {
    return [
      ...this.buckets.map((b) => b.prop),
      ...this.bottles.filter((b) => b.revealed).map((b) => b.prop),
      ...[...this.mirrors.values()].map((m) => m.prop),
      ...[...this.nests.values()].map((n) => n.prop),
      ...[...this.hedgeTiles.values()].map((h) => h.prop),
    ].filter((p) => p.alive);
  }

  resolvePlayerMelee(swing: MeleeSwing): void {
    resolveMeleeSwing(swing, this.props());
  }

  resolvePlayerBeam(beam: BeamStrike): void {
    resolveBeam(beam, this.props());
  }

  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    resolveDashSweep(sweep, this.props(), alreadyHit);
  }

  /** Pociski trafiają tylko rekwizyty bez kolizji (wiadra, butle) — lustra, gniazda i żywopłot obsługuje kafel. */
  resolvePlayerShot(shot: PlayerShot): MeleeTarget | null {
    const loose = [...this.buckets.map((b) => b.prop), ...this.bottles.filter((b) => b.revealed).map((b) => b.prop)].filter((p) => p.alive);
    return resolvePlayerShot(shot, loose)?.target ?? null;
  }

  /** Pocisk gracza uderzył w kafel kolizji: lustro odbija (i pęka), gniazdo i żywopłot przyjmują trafienie. */
  onPlayerShotTile(shot: Projectile, tile: TilePoint): 'reflect' | 'absorb' | null {
    const now = this.deps.scene.time.now;
    const from = { x: shot.x, y: shot.y };
    const mirror = this.mirrors.get(key(tile));
    if (mirror) {
      mirror.prop.takeHit({ damage: shot.damage, knockback: { x: 0, y: 0 } }, now, from);
      return mirror.prop.alive ? 'reflect' : 'absorb';
    }
    const nest = this.nests.get(key(tile));
    if (nest) {
      if (nest.prop.alive) nest.prop.takeHit({ damage: shot.damage, knockback: { x: 0, y: 0 } }, now, from);
      return 'absorb';
    }
    const hedge = this.hedgeTiles.get(key(tile));
    if (hedge) {
      hedge.prop.takeHit({ damage: shot.damage, knockback: { x: 0, y: 0 } }, now, from);
      return 'absorb';
    }
    return null;
  }

  /** Pocisk bossa albo wroga uderzył w kafel: lustro odbija (i liczy trafienie). */
  reflectsEnemyShot(shot: Projectile, tile: TilePoint): boolean {
    const mirror = this.mirrors.get(key(tile));
    if (!mirror) return false;
    mirror.prop.takeHit({ damage: 0, knockback: { x: 0, y: 0 } }, this.deps.scene.time.now, { x: shot.x, y: shot.y });
    return mirror.prop.alive;
  }
}

import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import type { Hit } from '@/core/combatTypes';
import { EliteAffix, EnemyType, EnemyVariant } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import type { ItemId, LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { ITEM_DEFINITIONS, ITEM_POOL } from '@/config/lootConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { LOOT_ATLAS } from '@/config/spriteConfig';
import type { EnemyManager } from '@/combat/EnemyManager';
import { DungeonView } from '@/dungeon/DungeonView';
import { GATE_WAIT_CONFIG } from '@/config/gateWaitConfig';
import { type GateWait, gatePosts } from '@/systems/GateWait';
import { findRoomEntrances, isDeepInsideRoom } from '@/dungeon/arenaGates';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { LightingOverlay } from '@/effects/LightingOverlay';
import type { Enemy } from '@/entities/Enemy';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { itemIconFrame } from '@/entities/Pickup';
import type { AmbushConfig } from '@/systems/Ambush';
import { AmbushPhase, AmbushState } from '@/systems/Ambush';
import { type AmbushScenario, formationTiles, pickScenario, waveSize } from '@/systems/AmbushWaves';
import {
  AmbushVariant,
  type BossEmpowerment,
  HauntPhase,
  HauntState,
  boonFor,
  dartTarget,
  edgeArrowPoints,
  farthestCorner,
  pathLength,
  pickAmbushVariant,
  pickBaitTile,
  pointAlongPath,
  stormScenario,
} from '@/systems/AmbushVariants';
import { AMBUSH_FORMATION_TEXT, AMBUSH_SCENARIOS, AMBUSH_VARIANTS, AMBUSH_VARIANT_TEXT } from '@/config/ambushConfig';
import { pickWeightedItem } from '@/systems/Loot';
import { ENEMY_VARIANTS } from '@/config/combatConfig';
import { findTilePath } from '@/ai/botPath';
import { knockbackFrom, scaleForFloor } from '@/systems/CombatMath';

const GHOST_PHASING = ENEMY_VARIANTS[EnemyVariant.Ghost].phasing;
const GHOST_PHASE_CYCLE = GHOST_PHASING ? GHOST_PHASING.solidMs + GHOST_PHASING.phasedMs : 0;
/** Barwy duchowej poświaty (czysto wizualne). */
const SPIRIT_TINT = 0x9fffe0;
const HAUNT_TINT = 0x9fe0b0;
/** Strzała Zaduchu „trzyma się” w majaczeniu dłużej, niż trwa telegraf — start daje menedżer. */
const ARROW_HOLD_MS = 4000;

/** Arena bossa widziana przez zasadzkę (Uciekinier, krok 183). */
export interface AmbushBossLink {
  /** Środkowy kafel areny — cel ucieczki po korytarzach. */
  readonly arenaTile: TilePoint;
  readonly name: () => string;
  readonly target: () => Vector2 | null;
  readonly defeated: () => boolean;
  readonly empower: (boon: BossEmpowerment) => void;
}

export interface AmbushDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly room: Room;
  readonly config: AmbushConfig;
  readonly view: DungeonView;
  readonly lighting: () => LightingOverlay | null;
  /** Bohaterowie (co-op, etap C0). */
  readonly party: Party;
  readonly enemies: EnemyManager;
  readonly effects: CombatEffects;
  /** RNG zasadzki: wersja, przedmiot-przynęta, jego miejsce i miejsca upiorów. */
  readonly rng: Rng;
  readonly spawnLoot: (at: { x: number; y: number }, drops: readonly LootDrop[]) => void;
  /** Upiory zasadzki: zawsze widoczne (świecą nad mrokiem), bez łupu. */
  readonly onGhost: (enemy: Enemy) => void;
  readonly toast: (text: string) => void;
  /** Co-op (etap C3): przy zamknięciu krat ściąga partnera spoza pokoju do bohatera w środku. */
  readonly gather: (anchor: Player, room: Room) => void;
  /** Wrogowie spoza pokoju czekają pod kratami, po ich podniesieniu ruszają zrywem (krok 132). */
  readonly gateWait: GateWait<Enemy>;
  /** Trafienie bohatera eteryczną strzałą (krok 183). */
  readonly hurt: (player: Player, hit: Hit) => void;
  /** Arena bossa (Uciekinier); null — bez bossa (np. areny testowe). */
  readonly boss: AmbushBossLink | null;
  /** Przedmiot uciekł do bossa — po walce wypadnie dodatkowo (krok 183). */
  readonly onStolen: (item: ItemId) => void;
  /** `?ambush=…` (krok 183, run testowy): wymuszona wersja. */
  readonly forceVariant?: AmbushVariant | undefined;
}

interface PendingGhost {
  readonly at: TilePoint;
  readonly dueAt: number;
  readonly elite: boolean;
  readonly mob: boolean;
  readonly phaseOffsetMs: number;
}

interface Arrow {
  readonly enemy: Enemy;
  readonly launchAt: number;
  launched: boolean;
}

/**
 * Pokój zasadzki (krok 49; od kroku 183 w trzech wersjach): przynęta w losowym miejscu pustego pokoju. Gdy
 * gracz wejdzie w głąb — zależnie od wersji: Butla dżina (kraty, mrok, kaskada fal z przynęty), Uciekinier
 * (przedmiot ucieka do areny i wzmacnia bossa) albo Zaduch (mrok, splątanie, eteryczne strzały, wielki duch).
 * Przebieg z czystych `systems/Ambush` i `systems/AmbushVariants`.
 */
export class AmbushManager {
  readonly variant: AmbushVariant;
  private readonly gates: readonly TilePoint[];
  private readonly itemId: ItemId;
  private readonly baitTile: TilePoint;
  private readonly bait: LootDrop | null = null;
  private readonly dreadProfile: AmbushConfig['dread']['profile'];
  // Butla dżina
  private readonly storm: AmbushState | null = null;
  private readonly scenario: AmbushScenario | null = null;
  private pending: PendingGhost[] = [];
  private wave: Enemy[] = [];
  // Uciekinier
  private readonly flightPath: Vector2[] | null = null;
  private flight: 'waiting' | 'glow' | 'flying' | 'done' = 'waiting';
  private flightAt = 0;
  private flightTravelled = 0;
  private lastTrailAt = 0;
  private wisp: Phaser.GameObjects.Sprite | null = null;
  private aura: Phaser.GameObjects.Arc | null = null;
  // Zaduch
  private readonly haunt: HauntState | null = null;
  private arrows: Arrow[] = [];
  private giant: Enemy | null = null;
  private ribbon: Phaser.GameObjects.Graphics | null = null;
  private ribbonUntil = 0;
  private nextGiantVolleyAt = 0;

  private dreadTarget = 0;
  private dread = 0;
  private lastNow = 0;
  private dt = 0;

  constructor(private readonly deps: AmbushDeps) {
    this.gates = findRoomEntrances(deps.floor, deps.room);
    this.itemId = pickWeightedItem(ITEM_POOL, deps.rng)!;
    this.flightPath = this.planFlight();
    const picked = pickAmbushVariant(AMBUSH_VARIANTS, deps.rng, this.flightPath !== null);
    this.variant = deps.forceVariant && (deps.forceVariant !== AmbushVariant.Flight || this.flightPath) ? deps.forceVariant : picked;
    this.baitTile = pickBaitTile(deps.room, this.gates, AMBUSH_VARIANTS.baitMargin, AMBUSH_VARIANTS.baitEntranceGap, deps.rng);
    this.dreadProfile = this.variant === AmbushVariant.Haunt ? AMBUSH_VARIANTS.haunt.dread : deps.config.dread.profile;
    const baitAt = DungeonView.tileToWorldCenter(this.baitTile);
    if (this.variant === AmbushVariant.Flight) {
      // Przynęta-uciekinier to nie łup: ikona przedmiotu, którą da się porwać po korytarzach.
      this.wisp = deps.scene.add.sprite(baitAt.x, baitAt.y, LOOT_ATLAS.key, itemIconFrame(this.itemId)).setDepth(RENDER_DEPTH.item);
      return;
    }
    this.bait = { kind: PickupKind.Item, itemId: this.itemId };
    deps.spawnLoot(baitAt, [this.bait]);
    if (this.variant === AmbushVariant.Storm) {
      this.scenario = stormScenario(pickScenario(AMBUSH_SCENARIOS, deps.rng), AMBUSH_VARIANTS.storm.extraGhosts);
      this.storm = new AmbushState({ waves: this.scenario.waves.map(waveSize), waveDelayMs: deps.config.waveDelayMs, cascadeMs: AMBUSH_VARIANTS.storm.cascadeMs });
    } else {
      this.haunt = new HauntState(AMBUSH_VARIANTS.haunt);
    }
  }

  /** Droga uciekiniera: kafle od przynęty… (środek pokoju zasadzki) do środka areny; null — brak areny albo drogi. */
  private planFlight(): Vector2[] | null {
    const { boss, room, floor } = this.deps;
    if (!boss) return null;
    const from = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
    const tiles = findTilePath(floor, from, boss.arenaTile, floor.width * floor.height);
    return tiles ? tiles.map((t) => DungeonView.tileToWorldCenter(t)) : null;
  }

  /** Zasadzka rozstrzygnięta — ikonka na minimapie znika (krok 163). */
  get cleared(): boolean {
    if (this.storm) return this.storm.phase === AmbushPhase.Cleared;
    if (this.haunt) return this.haunt.phase === HauntPhase.Cleared;
    return this.flight === 'flying' || this.flight === 'done';
  }

  /** Przynęta leży, dopóki zasadzka trwa — podnieść ją można dopiero po rozstrzygnięciu. */
  canCollect(drop: LootDrop): boolean {
    return drop !== this.bait || this.cleared;
  }

  update(now: number): void {
    const { party, room, config } = this.deps;
    const dt = this.lastNow === 0 ? 0 : now - this.lastNow;
    this.lastNow = now;
    this.dt = dt;
    const inside = party.living.find((player) => isDeepInsideRoom(room, DungeonView.worldToTile(player.x, player.y), config.triggerMargin));
    if (this.storm) this.updateStorm(inside, now);
    else if (this.haunt) this.updateHaunt(inside, now);
    else this.updateFlight(inside !== undefined, now);
    // Mrok narasta i opada płynnie (krok 28a: bez twardych przejść).
    const step = dt / config.dread.fadeMs;
    this.dread = this.dreadTarget > this.dread ? Math.min(this.dreadTarget, this.dread + step) : Math.max(this.dreadTarget, this.dread - step);
    this.deps.lighting()?.setDread(this.dread, this.dreadProfile);
  }

  // ——— wspólne ———

  private seal(inside: Player | undefined, text: string): void {
    const { view, effects, scene, floor, room, gateWait } = this.deps;
    if (inside) this.deps.gather(inside, room);
    gateWait.seal(room, gatePosts(floor, room, this.gates, TILE_SIZE, GATE_WAIT_CONFIG.postOffsetTiles));
    for (const gate of this.gates) {
      view.sealGate(gate);
      const at = DungeonView.tileToWorldCenter(gate);
      effects.impact(at.x, at.y, TILE_SIZE * 0.6);
    }
    scene.cameras.main.shake(160, 0.004);
    sound.play(SoundCue.GatesSlam);
    sound.play(SoundCue.Ambush);
    this.dreadTarget = 1;
    this.deps.toast(text);
  }

  private release(): void {
    for (const gate of this.gates) this.deps.view.releaseGate(gate);
    this.deps.gateWait.release(this.deps.room, this.deps.scene.time.now);
    this.dreadTarget = 0;
    this.deps.toast('Upiory rozwiały się — nagroda jest twoja.');
  }

  private spawnGhost(at: Vector2, options: { readonly elite?: boolean; readonly phaseOffsetMs?: number; readonly riseMs: number; readonly variant?: EnemyVariant }): Enemy {
    const ghost = this.deps.enemies.spawnAt(EnemyType.Rusher, at, options.elite ? [EliteAffix.Swift] : [], {
      variant: options.variant ?? EnemyVariant.Ghost,
      phaseOffsetMs: options.phaseOffsetMs ?? 0,
      riseMs: options.riseMs,
      scaling: this.deps.config.ghostScaling,
    });
    this.deps.onGhost(ghost);
    return ghost;
  }

  /** Smuga duchowej mgły z punktu do punktu (czysto wizualna). */
  private streak(from: Vector2, to: Vector2, ms: number, color: number): void {
    const dot = this.deps.scene.add.circle(from.x, from.y, 4, color, 0.9).setDepth(RENDER_DEPTH.darkness + 0.2).setBlendMode(Phaser.BlendModes.ADD);
    this.deps.scene.tweens.add({ targets: dot, x: to.x, y: to.y, scale: 1.8, alpha: 0.2, duration: ms, ease: 'Quad.easeOut', onComplete: () => dot.destroy() });
  }

  // ——— 1. Butla dżina ———

  private updateStorm(inside: Player | undefined, now: number): void {
    const state = this.storm!;
    this.wave = this.wave.filter((g) => g.active && !g.isDead);
    this.flushPending(now);
    const event = state.update({ playerInside: inside !== undefined, playerDead: this.deps.party.isDown, aliveInWave: this.wave.length + this.pending.length }, now);
    if (event?.kind === 'seal') this.seal(inside, AMBUSH_VARIANT_TEXT.storm);
    else if (event?.kind === 'wave') this.summon(event.index, now);
    else if (event?.kind === 'clear') this.release();
  }

  /** Fala scenariusza: upiory wylatują z przynęty jeden po drugim w szyk fali (krok 164, kaskada — krok 183). */
  private summon(index: number, now: number): void {
    const { room, config, party, rng } = this.deps;
    const scenario = this.scenario!;
    const wave = scenario.waves[index];
    if (!wave) return;
    // Etap C0 co-opu: szyk liczony od pierwszego żywego bohatera.
    const player = party.living[0] ?? party.leader;
    const tiles = formationTiles(room, DungeonView.worldToTile(player.x, player.y), wave.formation, waveSize(wave), config.minSpawnDistance, rng);
    const { staggerMs } = AMBUSH_VARIANTS.storm;
    tiles.forEach((tile, i) => {
      // Przesunięcie fazy przenikania rozłożone na cały cykl: upiory nie znikają wszystkie naraz.
      const phaseOffsetMs = Math.floor((i * GHOST_PHASE_CYCLE) / Math.max(1, wave.ghosts));
      this.pending.push({ at: tile, dueAt: now + i * staggerMs, elite: Boolean(wave.elite) && i === 0, mob: i >= wave.ghosts, phaseOffsetMs });
    });
    this.deps.toast(`Fala ${index + 1}/${scenario.waves.length} — ${AMBUSH_FORMATION_TEXT[wave.formation]}`);
  }

  private flushPending(now: number): void {
    const { config, enemies, effects } = this.deps;
    const baitAt = DungeonView.tileToWorldCenter(this.baitTile);
    const due = this.pending.filter((p) => p.dueAt <= now);
    if (due.length === 0) return;
    this.pending = this.pending.filter((p) => p.dueAt > now);
    for (const p of due) {
      const at = DungeonView.tileToWorldCenter(p.at);
      this.streak(baitAt, at, AMBUSH_VARIANTS.storm.streakMs, SPIRIT_TINT);
      if (p.mob) {
        // Wróg biomu: zwykły łup; tylko szarżownik — strzelec w mroku zasadzki byłby nieuczciwy.
        this.wave.push(enemies.spawnAt(EnemyType.Rusher, at, [], { riseMs: config.riseMs }));
      } else {
        this.wave.push(this.spawnGhost(at, { elite: p.elite, phaseOffsetMs: p.phaseOffsetMs, riseMs: config.riseMs }));
      }
      effects.impact(at.x, at.y, TILE_SIZE * 0.5);
    }
  }

  // ——— 2. Uciekinier ———

  private updateFlight(inside: boolean, now: number): void {
    const wisp = this.wisp;
    if (!wisp || this.flight === 'done') return;
    const { scene, toast } = this.deps;
    const glow = AMBUSH_VARIANTS.flight;
    if (this.flight === 'waiting') {
      if (!inside || this.deps.party.isDown) return;
      this.flight = 'glow';
      this.flightAt = now;
      this.aura = scene.add.circle(wisp.x, wisp.y, 10, SPIRIT_TINT, 0.35).setDepth(RENDER_DEPTH.item - 0.01).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: this.aura, scale: 2.2, alpha: 0.1, duration: 420, yoyo: true, repeat: -1 });
      sound.play(SoundCue.Ambush);
      toast(AMBUSH_VARIANT_TEXT.flightGlow);
      return;
    }
    if (this.flight === 'glow') {
      // Przedmiot drży i jaśnieje, zanim się zerwie.
      const t = (now - this.flightAt) / glow.glowMs;
      wisp.setTint(Math.floor(now / 90) % 2 === 0 ? SPIRIT_TINT : 0xffffff);
      wisp.y = DungeonView.tileToWorldCenter(this.baitTile).y - Math.min(1, t) * 6;
      if (t < 1) return;
      this.flight = 'flying';
      this.flightTravelled = 0;
      // W locie świeci nad mrokiem korytarzy.
      wisp.setDepth(RENDER_DEPTH.darkness + 0.2);
      this.aura?.setDepth(RENDER_DEPTH.darkness + 0.19);
      // Najpierw na środek pokoju, potem drogą do areny.
      this.flightPathFrom = { x: wisp.x, y: wisp.y };
      toast(AMBUSH_VARIANT_TEXT.flight(ITEM_DEFINITIONS[this.itemId].name));
      sound.play(SoundCue.Dash, { x: wisp.x, y: wisp.y });
      return;
    }
    // Lot: łamana droga + na końcu prosto do bossa.
    this.flightTravelled += (glow.speed * Math.min(100, this.dt)) / 1000;
    const path = [this.flightPathFrom!, ...this.flightPath!];
    const bossAt = this.deps.boss?.target() ?? null;
    const full = bossAt ? [...path, bossAt] : path;
    const at = pointAlongPath(full, this.flightTravelled);
    wisp.setPosition(at.x, at.y);
    this.aura?.setPosition(at.x, at.y);
    if (now - this.lastTrailAt > 60) {
      this.lastTrailAt = now;
      this.streak(at, { x: at.x + (Math.random() - 0.5) * 10, y: at.y + (Math.random() - 0.5) * 10 }, 400, SPIRIT_TINT);
    }
    if (this.flightTravelled < pathLength(full)) return;
    this.arrive(at);
  }

  private flightPathFrom: Vector2 | null = null;

  /** Uciekinier dotarł: wzmacnia bossa (albo, gdy boss już padł, po prostu spada na ziemię). */
  private arrive(at: Vector2): void {
    const { boss, effects, scene, toast } = this.deps;
    this.flight = 'done';
    this.wisp?.destroy();
    this.aura?.destroy();
    this.wisp = null;
    this.aura = null;
    if (!boss || boss.defeated()) {
      this.deps.spawnLoot(at, [{ kind: PickupKind.Item, itemId: this.itemId }]);
      return;
    }
    const boon = boonFor(this.itemId, AMBUSH_VARIANTS.flight);
    boss.empower(boon);
    this.deps.onStolen(this.itemId);
    effects.impact(at.x, at.y, TILE_SIZE * 1.4);
    scene.cameras.main.shake(220, 0.004);
    sound.play(SoundCue.BossRoar, at);
    toast(AMBUSH_VARIANT_TEXT.flightArrive(boss.name(), ITEM_DEFINITIONS[this.itemId].name, boon.label));
  }

  // ——— 3. Zaduch ———

  private updateHaunt(inside: Player | undefined, now: number): void {
    const state = this.haunt!;
    const cfg = AMBUSH_VARIANTS.haunt;
    this.updateArrows(now);
    if (this.giant && (!this.giant.active || this.giant.isDead)) this.giant = null;
    const event = state.update(
      { playerInside: inside !== undefined, playerDead: this.deps.party.isDown, arrowsAlive: this.arrows.length, giantAlive: this.giant !== null },
      now,
    );
    if (event?.kind === 'seal') {
      this.seal(inside, AMBUSH_VARIANT_TEXT.haunt);
      this.deps.scene.cameras.main.flash(500, 30, 50, 40);
    } else if (event?.kind === 'volley') {
      if (event.index === 0) this.deps.toast(AMBUSH_VARIANT_TEXT.hauntArrows);
      this.volley(event.count, now);
    } else if (event?.kind === 'ribbon') this.raiseGiant(now);
    else if (event?.kind === 'giant') {
      this.deps.toast(AMBUSH_VARIANT_TEXT.hauntGiant);
      sound.play(SoundCue.BossRoar, this.giant ? { x: this.giant.x, y: this.giant.y } : undefined);
      this.deps.scene.cameras.main.shake(260, 0.005);
      this.nextGiantVolleyAt = now + cfg.giantVolleyMs;
    } else if (event?.kind === 'clear') {
      this.ribbon?.destroy();
      this.ribbon = null;
      this.release();
    }
    // Splątanie: czas zwalnia (bohater ciężki jak we śnie), aż wynurzy się wielki duch.
    const phase = state.phase;
    if (phase === HauntPhase.Darkening || phase === HauntPhase.Volleys || phase === HauntPhase.Ribbon) {
      for (const hero of this.deps.party.living) hero.applyTerrainSlow({ pct: cfg.entangleSlowPct, durationMs: 250 }, now);
    }
    if (phase === HauntPhase.Giant && this.giant && now >= this.nextGiantVolleyAt) {
      this.nextGiantVolleyAt = now + cfg.giantVolleyMs;
      this.giantVolley(now);
    }
    this.drawRibbon(now);
  }

  /** Salwa: strzały majaczą na brzegu kręgu światła wokół bohatera, potem startują po kolei. */
  private volley(count: number, now: number): void {
    const { party, room, rng } = this.deps;
    const cfg = AMBUSH_VARIANTS.haunt;
    const hero = party.living[0] ?? party.leader;
    const inner = TILE_SIZE * 1.5;
    const bounds = {
      left: room.x * TILE_SIZE + inner,
      top: room.y * TILE_SIZE + inner,
      right: (room.x + room.width) * TILE_SIZE - inner,
      bottom: (room.y + room.height) * TILE_SIZE - inner,
    };
    edgeArrowPoints({ x: hero.x, y: hero.y }, cfg.edgeRadius, count, bounds, rng).forEach((at, i) => {
      this.addArrow(at, now + cfg.telegraphMs + i * cfg.launchStaggerMs);
    });
  }

  private addArrow(at: Vector2, launchAt: number): void {
    const enemy = this.spawnGhost(at, { riseMs: launchAt - this.deps.scene.time.now + ARROW_HOLD_MS });
    // Strzała pęka od jednego trafienia — trudność to trafić w locie, po ciemku i w splątaniu.
    enemy.health.setMax(1);
    this.arrows.push({ enemy, launchAt, launched: false });
  }

  private updateArrows(now: number): void {
    const cfg = AMBUSH_VARIANTS.haunt;
    const damage = scaleForFloor(cfg.damage, this.deps.floorNumber, this.deps.config.ghostScaling.damagePerFloor);
    const { party, enemies, effects } = this.deps;
    this.arrows = this.arrows.filter((arrow) => {
      const { enemy } = arrow;
      if (!enemy.active || enemy.isDead) return false;
      if (!arrow.launched) {
        if (now < arrow.launchAt) return true;
        const target = party.nearestLiving(enemy) ?? party.leader;
        enemy.dart(dartTarget({ x: enemy.x, y: enemy.y }, { x: target.x, y: target.y }, cfg.overshoot), cfg.dartSpeed, now);
        arrow.launched = true;
        sound.play(SoundCue.Dash, { x: enemy.x, y: enemy.y });
        return true;
      }
      const hit = party.living.find((hero) => Math.hypot(hero.x - enemy.x, hero.y - enemy.y) <= cfg.hitRadius + 8);
      if (hit) {
        this.deps.hurt(hit, { damage, knockback: knockbackFrom(enemy, hit, cfg.knockback), status: { slow: { pct: 0.2, durationMs: 600 } } });
        effects.deathBurst(enemy.x, enemy.y, HAUNT_TINT, enemy.radius);
        enemies.dismiss(enemy);
        return false;
      }
      if (!enemy.isDarting) {
        effects.deathBurst(enemy.x, enemy.y, HAUNT_TINT, enemy.radius * 0.6);
        enemies.dismiss(enemy);
        return false;
      }
      return true;
    });
  }

  /** Wstęga do najdalszego rogu i wielki duch, który się tam wynurza. */
  private raiseGiant(now: number): void {
    const { party, room } = this.deps;
    const cfg = AMBUSH_VARIANTS.haunt;
    const hero = party.living[0] ?? party.leader;
    const corner = farthestCorner(room, DungeonView.worldToTile(hero.x, hero.y));
    const at = DungeonView.tileToWorldCenter(corner);
    this.giant = this.spawnGhost(at, { riseMs: cfg.ribbonMs, variant: EnemyVariant.GreatGhost });
    this.ribbon = this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.darkness + 0.15).setBlendMode(Phaser.BlendModes.ADD);
    this.ribbonUntil = now + cfg.ribbonMs + 2500;
    this.deps.toast(AMBUSH_VARIANT_TEXT.hauntRibbon);
    sound.play(SoundCue.Nova, at);
  }

  /** Wielki duch wypuszcza strzały ze swojego kłębu — krótszy telegraf. */
  private giantVolley(now: number): void {
    const giant = this.giant;
    if (!giant) return;
    const cfg = AMBUSH_VARIANTS.haunt;
    for (let i = 0; i < cfg.giantVolley; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.addArrow({ x: giant.x + side * 22, y: giant.y - 10 }, now + cfg.telegraphMs * 0.6 + i * cfg.launchStaggerMs);
    }
  }

  /** Eteryczna wstęga: falująca smuga od bohatera do wielkiego ducha (czysto wizualna). */
  private drawRibbon(now: number): void {
    const ribbon = this.ribbon;
    if (!ribbon) return;
    ribbon.clear();
    const giant = this.giant;
    if (!giant || now > this.ribbonUntil) {
      ribbon.destroy();
      this.ribbon = null;
      return;
    }
    const hero = this.deps.party.living[0] ?? this.deps.party.leader;
    const dx = giant.x - hero.x;
    const dy = giant.y - hero.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const fade = Math.min(1, (this.ribbonUntil - now) / 800);
    for (const [width, alpha] of [[6, 0.18], [2, 0.6]] as const) {
      ribbon.lineStyle(width, HAUNT_TINT, alpha * fade);
      ribbon.beginPath();
      const steps = Math.max(8, Math.floor(len / 8));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wave = Math.sin(t * 9 - now / 140) * 6 * Math.sin(t * Math.PI);
        const x = hero.x + dx * t + nx * wave;
        const y = hero.y + dy * t + ny * wave;
        if (i === 0) ribbon.moveTo(x, y);
        else ribbon.lineTo(x, y);
      }
      ribbon.strokePath();
    }
  }
}

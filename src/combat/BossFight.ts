import Phaser from 'phaser';
import type { AreaStrike, BossAttackPlan, ProjectileBurst, SpiderlingDefinition, SummonSpawn } from '@/core/bossTypes';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { createRng, deriveSeed } from '@/core/random';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { BOSS_PROJECTILE_VISUAL, SPIDERLING_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { isHitByAreaStrike } from '@/ai/bossAttacks';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { DungeonView } from '@/dungeon/DungeonView';
import { roomContainsTile } from '@/dungeon/rooms';
import { stairsCenter } from '@/dungeon/stairs';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { CombatDecals } from '@/effects/CombatDecals';
import { Boss } from '@/entities/Boss';
import type { Player } from '@/entities/Player';
import { Spiderling } from '@/entities/Spiderling';
import { knockbackFrom } from '@/systems/CombatMath';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';
import { RENDER_DEPTH } from '@/config/renderLayers';

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

export interface BossStatus {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly enraged: boolean;
}

interface PendingStrike {
  readonly strike: AreaStrike;
  readonly gfx: Phaser.GameObjects.Graphics;
}

interface PendingBurst {
  readonly burst: ProjectileBurst;
  readonly gfx: Phaser.GameObjects.Graphics;
}

const BOSS_SEED_SALT = 0xb055;
const TELEGRAPH_COLOR = 0xff4040;
/** Plama po zabitym pajączku (kolor chityny bossa). */
const SPIDERLING_DEATH_COLOR = 0x7a3a4a;
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
  /** Wylęg zaplanowany na koniec złożenia (pajączek pojawia się dopiero wtedy). */
  private spawns: SummonSpawn[] = [];
  /** Żywe pajączki-kamikaze z telegrafem zapłonu. */
  private spiderlings: Array<{ readonly spiderling: Spiderling; readonly gfx: Phaser.GameObjects.Graphics }> = [];
  private readonly spiderlingDefinition: SpiderlingDefinition | null;
  private readonly spiderlingGroup: Phaser.Physics.Arcade.Group;

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
    this.spiderlingGroup = deps.scene.physics.add.group();
    deps.scene.physics.add.collider(this.spiderlingGroup, deps.walls);
  }

  /** Walka trwa (boss obudzony i żywy). */
  get isFighting(): boolean {
    return this.boss?.isFighting ?? false;
  }

  /** Boss pokonany — na tym piętrze nie będzie już walki. */
  get isDefeated(): boolean {
    return this.boss === null;
  }

  /** Stan dla HUD — null, dopóki walka się nie zaczęła lub po zwycięstwie. */
  getStatus(): BossStatus | null {
    const boss = this.boss;
    if (!boss || !boss.isFighting) return null;
    return { name: boss.definition.name, hp: boss.health.value, maxHp: boss.health.max, enraged: boss.isEnraged };
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

    const plan = boss.tick({ x: player.x, y: player.y }, now, this.spiderlings.length + this.spawns.length);
    if (plan) this.schedule(plan);

    this.updateStrikes(now);
    this.updateBursts(now);
    this.updateSpawns(now);
    this.updateSpiderlings(now);
  }

  /** Cele gracza: pajączki (żywa tarcza) i boss. */
  private targets(): Array<Boss | Spiderling> {
    const living = this.spiderlings.map(({ spiderling }) => spiderling);
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
    for (const target of killed) {
      if (target instanceof Spiderling) this.removeSpiderling(target, false);
    }
    if (this.boss && killed.includes(this.boss)) this.defeat();
  }

  /** Tylko do debugowania (klawisz B w trybie dev). */
  debugDefeat(): void {
    if (this.boss) this.defeat();
  }

  private schedule(plan: BossAttackPlan): void {
    const scene = this.deps.scene;
    for (const strike of plan.strikes) {
      this.strikes.push({ strike, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    for (const burst of plan.bursts) {
      this.bursts.push({ burst, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    this.spawns.push(...plan.spawns);
  }

  /** Wylęg w zaplanowanej chwili; miejsce poza areną (boss przy ścianie) zastępuje pozycja bossa. */
  private updateSpawns(now: number): void {
    const boss = this.boss;
    const definition = this.spiderlingDefinition;
    if (!boss || !definition) {
      this.spawns = [];
      return;
    }
    this.spawns = this.spawns.filter((spawn) => {
      if (now < spawn.at) return true;
      const inArena = roomContainsTile(this.arena, DungeonView.worldToTile(spawn.position.x, spawn.position.y));
      const at = inArena ? spawn.position : { x: boss.x, y: boss.y };
      const spiderling = new Spiderling(this.deps.scene, at.x, at.y, definition, now);
      this.spiderlingGroup.add(spiderling);
      this.spiderlings.push({ spiderling, gfx: this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
      return false;
    });
  }

  /** Pościg, telegraf zapłonu (strefa wybuchu) i wybuch raniący gracza. */
  private updateSpiderlings(now: number): void {
    const { player, onPlayerHit } = this.deps;
    const target: Vector2 = { x: player.x, y: player.y };
    for (const { spiderling, gfx } of [...this.spiderlings]) {
      const decision = spiderling.tick(target, now);
      const definition = spiderling.definition;
      const blast: AreaStrike = {
        center: { x: spiderling.x, y: spiderling.y },
        radius: definition.blastRadius,
        telegraphStartAt: spiderling.explosionAt - definition.primeMs,
        impactAt: spiderling.explosionAt,
        damage: definition.damage,
        knockback: definition.knockback,
      };
      if (!decision.explode) {
        if (Number.isFinite(spiderling.explosionAt)) drawAreaTelegraph(gfx, blast, now);
        continue;
      }
      this.deps.effects.impact(blast.center.x, blast.center.y, blast.radius);
      this.deps.decals.add('scorch', blast.center.x, blast.center.y);
      this.playBurst(blast.center);
      if (!player.isDead && isHitByAreaStrike(blast, player, player.radius)) {
        const hit = { damage: blast.damage, knockback: knockbackFrom(blast.center, player, blast.knockback) };
        if (player.takeHit(hit, now)) onPlayerHit();
      }
      this.removeSpiderling(spiderling, true);
    }
  }

  /** Arkusz wybuchu pajączka (bez kierunków), usuwany po ostatniej klatce. */
  private playBurst(at: Vector2): void {
    const { sheet, animation } = SPIDERLING_VISUAL.burst;
    const sprite = this.deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.deathBurst);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
    sprite.play(animationKey(sheet, animation));
  }

  /** Usuwa pajączka; zabity (nie wybuchły) zostawia plamę. */
  private removeSpiderling(spiderling: Spiderling, exploded: boolean): void {
    const index = this.spiderlings.findIndex((entry) => entry.spiderling === spiderling);
    if (index < 0) return;
    const [entry] = this.spiderlings.splice(index, 1);
    entry?.gfx.destroy();
    if (!exploded) {
      this.deps.effects.deathBurst(spiderling.x, spiderling.y, SPIDERLING_DEATH_COLOR, spiderling.radius * 1.5);
      this.deps.decals.add('splat', spiderling.x, spiderling.y);
    }
    spiderling.destroy();
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
        const hit = { damage: strike.damage, knockback: knockbackFrom(strike.center, player, strike.knockback) };
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
    this.deps.decals.add(boss.visual.deathDecal, boss.x, boss.y);
    for (const pending of [...this.strikes, ...this.bursts]) pending.gfx.destroy();
    this.strikes = [];
    this.bursts = [];
    // Pajączki giną razem z matką (bez wybuchów), niewyklute już się nie pojawią.
    for (const { spiderling } of [...this.spiderlings]) this.removeSpiderling(spiderling, false);
    this.spawns = [];
    const position: Vector2 = { x: boss.x, y: boss.y };
    boss.destroy();
    this.boss = null;
    this.deps.onDefeated(position);
  }
}

/** Obrys strefy + wypełnienie rosnące do chwili uderzenia. */
function drawAreaTelegraph(gfx: Phaser.GameObjects.Graphics, strike: AreaStrike, now: number): void {
  gfx.clear();
  if (now < strike.telegraphStartAt) return;
  const progress = Phaser.Math.Clamp(
    (now - strike.telegraphStartAt) / (strike.impactAt - strike.telegraphStartAt),
    0,
    1,
  );
  gfx.lineStyle(2, TELEGRAPH_COLOR, 0.8).strokeCircle(strike.center.x, strike.center.y, strike.radius);
  gfx.fillStyle(TELEGRAPH_COLOR, 0.12).fillCircle(strike.center.x, strike.center.y, strike.radius);
  gfx.fillStyle(TELEGRAPH_COLOR, 0.3).fillCircle(strike.center.x, strike.center.y, strike.radius * progress);
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

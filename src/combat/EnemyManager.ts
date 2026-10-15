import Phaser from 'phaser';
import type { Hit, LobAttackDefinition, MeleeAttackDefinition, PounceAttackDefinition, ProjectileAttackDefinition } from '@/core/combatTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { ENEMY_DEFINITIONS, ENEMY_SCALING, ENEMY_VARIANTS } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { ENEMY_PROJECTILE_VISUALS, FIRE_PATCH_VISUAL, LOB_VISUALS, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { FirePatchField, lobPosition, trailPoints } from '@/systems/HellAttacks';
import type { EnemyType, EnemyVariant } from '@/core/combatTypes';
import { EliteAffix } from '@/core/combatTypes';
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { ELITE_VISUAL } from '@/config/spriteConfig';
import { applyElite, lifestealHeal } from '@/systems/Elites';
import { attachEliteMarker } from '@/effects/EliteMarker';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';
import { facingDirection } from '@/systems/Facing';
import type { EnemySpawn } from '@/dungeon/EncounterPlanner';
import { DungeonView } from '@/dungeon/DungeonView';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { CombatDecals } from '@/effects/CombatDecals';
import type { EnemyAttackHandler } from '@/entities/Enemy';
import { Enemy } from '@/entities/Enemy';
import type { Player } from '@/entities/Player';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { directionTo, distance, knockbackFrom, scaleForFloor } from '@/systems/CombatMath';
import { scaleEnemyForFloor } from '@/systems/EnemyScaling';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { applyFloorToEnemy } from '@/systems/FloorModifiers';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike } from '@/systems/Sorcery';
import { resolveBeam } from '@/systems/Sorcery';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

export interface EnemyManagerDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  /** Modyfikator piętra (prędkość, HP, obrażenia zwykłych wrogów). */
  readonly floorEffects: FloorModifierEffects;
  /** Warianty archetypów w biomie piętra (wygląd i ewentualnie atak). */
  readonly enemyVariants: Readonly<Record<EnemyType, EnemyVariant>>;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly player: Player;
  readonly projectiles: ProjectileManager;
  readonly effects: CombatEffects;
  /** Trwałe ślady walki (plama w miejscu śmierci wroga). */
  readonly decals: CombatDecals;
  readonly onPlayerHit: () => void;
  readonly onEnemyKilled: (enemy: Enemy) => void;
}

/** Bomba smolna w locie (krok 41d). */
interface LobbedBomb {
  readonly attack: LobAttackDefinition;
  readonly from: Vector2;
  readonly to: Vector2;
  readonly launchAt: number;
  readonly landAt: number;
  readonly arcHeight: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
}

/** Wybuch Wybuchowej elity po śmierci (krok 42): strefa wypełnia się do detonacji. */
interface PendingBlast {
  readonly at: Vector2;
  readonly startAt: number;
  readonly detonateAt: number;
  readonly damage: number;
}

/** Spawnuje przeciwników, karmi ich percepcją i rozstrzyga trafienia w obie strony. */
export class EnemyManager implements EnemyAttackHandler {
  private readonly group: Phaser.Physics.Arcade.Group;
  private enemies: Enemy[] = [];
  /** Wrogowie Piekła (krok 41d): płonące ślady, bomby w locie, telegrafy skoków i upadków. */
  private readonly firePatches = new FirePatchField();
  private bombs: LobbedBomb[] = [];
  private blasts: PendingBlast[] = [];
  /** Ognista elita: miejsce ostatniego kawałka smugi żaru. */
  private readonly trailFrom = new WeakMap<Enemy, Vector2>();
  private readonly telegraphs: Phaser.GameObjects.Graphics;
  private readonly fire: Phaser.GameObjects.Graphics;

  constructor(private readonly deps: EnemyManagerDeps) {
    this.group = deps.scene.physics.add.group();
    deps.scene.physics.add.collider(this.group, deps.walls);
    deps.scene.physics.add.collider(this.group, this.group);
    this.telegraphs = deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph);
    this.fire = deps.scene.add.graphics().setDepth(RENDER_DEPTH.groundFlash).setBlendMode(Phaser.BlendModes.ADD);
  }

  get aliveCount(): number {
    return this.enemies.length;
  }

  /** Żywi wrogowie — m.in. do ukrywania ich poza światłem (krok 30). */
  get living(): readonly Enemy[] {
    return this.enemies;
  }

  /** Spawny piętra; `elites[i]` to cechy i-tego spawnu (pusto = zwykły wróg, krok 42). */
  spawnAll(spawns: readonly EnemySpawn[], elites: readonly (readonly EliteAffix[])[] = []): void {
    spawns.forEach((spawn, i) => this.spawnAt(spawn.type, DungeonView.tileToWorldCenter(spawn.tile), elites[i] ?? []));
  }

  /** Wróg archetypu w wariancie biomu, ze skalowaniem piętra i modyfikatorem (także pająk z sufitu); z cechami — elita. */
  spawnAt(type: EnemyType, position: Vector2, affixes: readonly EliteAffix[] = []): Enemy {
    const base = enemyDefinitionFor(ENEMY_DEFINITIONS[type], this.deps.enemyVariants[type], ENEMY_VARIANTS);
    const scaled = scaleEnemyForFloor(base, this.deps.floorNumber, ENEMY_SCALING);
    const definition = applyElite(applyFloorToEnemy(scaled, this.deps.floorEffects), affixes, ELITE_CONFIG);
    const enemy = new Enemy(this.deps.scene, position.x, position.y, definition);
    this.group.add(enemy);
    this.enemies.push(enemy);
    if (affixes.length > 0) {
      attachEliteMarker(enemy, affixes);
      this.trailFrom.set(enemy, position);
    }
    return enemy;
  }

  /** Obrażenia zagrożeń elit (żar, wybuch) rosną z piętrem jak ciosy wrogów. */
  private hazardDamage(base: number): number {
    return scaleForFloor(base, this.deps.floorNumber, ENEMY_SCALING.damagePerFloor);
  }

  /** Wampiryczna elita leczy się z trafienia gracza. */
  private lifesteal(enemy: Enemy, damage: number): void {
    if (!enemy.hasAffix(EliteAffix.Vampiric) || enemy.isDead || !enemy.active) return;
    const heal = Math.min(lifestealHeal(damage, ELITE_CONFIG), enemy.health.max - enemy.health.value);
    if (heal <= 0) return;
    enemy.health.heal(heal);
    this.deps.effects.floatingText(enemy.x, enemy.y, `+${heal}`, ELITE_VISUAL.lifestealText);
  }

  /** Ognista elita w ruchu zostawia smugę żaru (jak skok ogara, ale cały czas). */
  private updateFieryTrail(enemy: Enemy, now: number): void {
    if (!enemy.hasAffix(EliteAffix.Fiery)) return;
    const from = this.trailFrom.get(enemy) ?? { x: enemy.x, y: enemy.y };
    const { trail } = ELITE_CONFIG.fiery;
    if (Math.hypot(enemy.x - from.x, enemy.y - from.y) < trail.spacing) return;
    this.firePatches.add(from, { ...trail, damage: this.hazardDamage(trail.damage) }, now);
    this.trailFrom.set(enemy, { x: enemy.x, y: enemy.y });
  }

  variantOf(type: EnemyType): EnemyVariant {
    return this.deps.enemyVariants[type];
  }

  update(now: number): void {
    const { player, floor } = this.deps;
    const target: Vector2 = { x: player.x, y: player.y };
    for (const enemy of [...this.enemies]) {
      const burn = enemy.tickBurn(now);
      if (burn > 0) this.deps.effects.floatingText(enemy.x, enemy.y, `-${burn}`, '#ff8a3c');
      if (enemy.isDead) {
        this.kill(enemy);
        continue;
      }
      const canSeeTarget = !player.isDead && hasLineOfSight(floor, enemy, target, TILE_SIZE);
      enemy.tick({ target, canSeeTarget }, now, this);
      this.updateFieryTrail(enemy, now);
    }
    this.updateHellAttacks(now);
  }

  /** Bomby w locie, płonące ślady i telegrafy (skok: linia do celu; rzut: strefa upadku). */
  private updateHellAttacks(now: number): void {
    const { player } = this.deps;
    this.telegraphs.clear();
    for (const enemy of this.enemies) {
      const aim = enemy.pounceTelegraph;
      if (aim) this.telegraphs.lineStyle(2, 0xff3b30, 0.7).lineBetween(enemy.x, enemy.y, aim.x, aim.y);
    }
    this.bombs = this.bombs.filter((bomb) => {
      const progress = (now - bomb.launchAt) / (bomb.landAt - bomb.launchAt);
      if (progress >= 1) {
        this.landBomb(bomb, now);
        return false;
      }
      const at = lobPosition(bomb.from, bomb.to, progress, bomb.arcHeight);
      bomb.sprite.setPosition(Math.round(at.x), Math.round(at.y - at.height));
      bomb.shadow.setPosition(Math.round(at.x), Math.round(at.y));
      // Ta sama czerwona strefa co telegrafy bossów: wypełnia się do chwili upadku.
      this.drawLandingZone(bomb, now);
      return true;
    });
    this.updateBlasts(now);
    const damage = this.firePatches.update(player.isDead ? null : player, now);
    if (damage > 0 && player.takeHit({ damage, knockback: { x: 0, y: 0 } }, now)) this.deps.onPlayerHit();
    this.drawFirePatches(now);
  }

  private drawLandingZone(bomb: LobbedBomb, now: number): void {
    const progress = Phaser.Math.Clamp((now - bomb.launchAt) / (bomb.landAt - bomb.launchAt), 0, 1);
    this.drawZone(bomb.to, bomb.attack.blastRadius, progress, 0xff3b30);
  }

  private drawZone(at: Vector2, radius: number, progress: number, color: number): void {
    this.telegraphs.lineStyle(2, color, 0.8).strokeCircle(at.x, at.y, radius);
    this.telegraphs.fillStyle(color, 0.12).fillCircle(at.x, at.y, radius);
    this.telegraphs.fillStyle(color, 0.3).fillCircle(at.x, at.y, radius * progress);
  }

  /** Wybuchy Wybuchowych elit: strefa wypełnia się, potem trafia gracza w promieniu. */
  private updateBlasts(now: number): void {
    const { player, effects } = this.deps;
    const { radius, delayMs, knockback } = ELITE_CONFIG.volatile;
    this.blasts = this.blasts.filter((blast) => {
      if (now < blast.detonateAt) {
        this.drawZone(blast.at, radius, (now - blast.startAt) / delayMs, ELITE_VISUAL.volatileZone);
        return true;
      }
      effects.impact(blast.at.x, blast.at.y, radius);
      this.deps.decals.add('splat', blast.at.x, blast.at.y);
      if (!player.isDead && distance(blast.at, player) <= radius + player.radius) {
        const hit: Hit = { damage: blast.damage, knockback: knockbackFrom(blast.at, player, knockback) };
        if (player.takeHit(hit, now)) this.deps.onPlayerHit();
      }
      return false;
    });
  }

  private drawFirePatches(now: number): void {
    const { outer, inner, alpha, innerScale } = FIRE_PATCH_VISUAL;
    this.fire.clear();
    // Migotanie skokowe w rytmie animacji (efekt czysto wizualny).
    const flicker = Math.floor(now / 160) % 2 === 0 ? 0 : -1;
    for (const patch of this.firePatches.patches) {
      this.fire.fillStyle(outer, alpha).fillCircle(patch.center.x, patch.center.y, patch.radius + flicker);
      this.fire.fillStyle(inner, alpha).fillCircle(patch.center.x, patch.center.y, patch.radius * innerScale + flicker);
    }
  }

  private landBomb(bomb: LobbedBomb, now: number): void {
    const { player, effects } = this.deps;
    bomb.sprite.destroy();
    bomb.shadow.destroy();
    effects.impact(bomb.to.x, bomb.to.y, bomb.attack.blastRadius);
    if (!player.isDead && distance(bomb.to, player) <= bomb.attack.blastRadius + player.radius) {
      const hit: Hit = { damage: bomb.attack.damage, knockback: knockbackFrom(bomb.to, player, bomb.attack.knockback) };
      if (player.takeHit(hit, now)) this.deps.onPlayerHit();
    }
    this.firePatches.add(bomb.to, bomb.attack.patch, now);
  }

  pounceHit(enemy: Enemy, attack: PounceAttackDefinition): boolean {
    const { player, scene } = this.deps;
    if (player.isDead || distance(enemy, player) > attack.hitRadius + player.radius) return false;
    const hit: Hit = { damage: attack.damage, knockback: knockbackFrom(enemy, player, attack.knockback) };
    // Dash i nietykalność chronią: wtedy skok jest chybiony (postój ogara).
    if (!player.takeHit(hit, scene.time.now)) return false;
    this.deps.onPlayerHit();
    this.lifesteal(enemy, hit.damage);
    return true;
  }

  pounceTrail(_enemy: Enemy, attack: PounceAttackDefinition, from: Vector2, to: Vector2): void {
    const now = this.deps.scene.time.now;
    for (const point of trailPoints(from, to, attack.trail.spacing)) this.firePatches.add(point, attack.trail, now);
  }

  lobBomb(enemy: Enemy, attack: LobAttackDefinition, target: Vector2): void {
    const { scene } = this.deps;
    const look = LOB_VISUALS[enemy.definition.variant];
    const dir = directionTo(enemy, target);
    const offset = look?.forwardOffset ?? 0;
    const from = { x: enemy.x + dir.x * offset, y: enemy.y + dir.y * offset };
    const now = scene.time.now;
    const texture = look ? SPRITE_SHEETS[look.sheet].key : SPRITE_SHEETS.tarBomb.key;
    const sprite = scene.add.sprite(from.x, from.y, texture).setDepth(RENDER_DEPTH.projectile);
    if (look) sprite.play(animationKey(look.sheet, look.animation));
    // Cień na podłodze: bomba leci łukiem nad nim (stała alfa jak cienie postaci).
    const shadow = scene.add.ellipse(from.x, from.y, 10, 5, 0x1b1a22, 0.4).setDepth(RENDER_DEPTH.actorShadow);
    this.bombs.push({
      attack,
      from,
      to: { x: target.x, y: target.y },
      launchAt: now,
      landAt: now + attack.flightMs,
      arcHeight: look?.arcHeight ?? 24,
      sprite,
      shadow,
    });
  }

  /** Cios gracza — trafia wszystkich przeciwników w łuku. Zwraca liczbę trafionych. */
  resolvePlayerMelee(swing: MeleeSwing): number {
    const { hit, killed } = resolveMeleeSwing(swing, [...this.enemies]);
    for (const enemy of killed) this.kill(enemy);
    return hit.length;
  }

  /** Promień Czarodziejki (krok 37): rani wszystkich na odcinku; zwraca liczbę trafionych. */
  resolvePlayerBeam(beam: BeamStrike): number {
    const { hit, killed } = resolveBeam(beam, [...this.enemies]);
    for (const enemy of killed) this.kill(enemy);
    return hit.length;
  }

  /** Pocisk gracza — zwraca trafionego przeciwnika albo null. */
  resolvePlayerShot(shot: PlayerShot): Enemy | null {
    const result = resolvePlayerShot(shot, this.enemies);
    if (result?.died) this.kill(result.target);
    return result?.target ?? null;
  }

  /** Burzowy pęd: rani przeciwników dotkniętych w trakcie dasha (każdego raz na dash). */
  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    const { hit, killed } = resolveDashSweep(sweep, [...this.enemies], alreadyHit);
    for (const enemy of hit) this.deps.effects.floatingText(enemy.x, enemy.y, `-${sweep.damage}`, '#b8a8ff');
    for (const enemy of killed) this.kill(enemy);
  }

  meleeStrike(enemy: Enemy, attack: MeleeAttackDefinition): void {
    const { player, scene } = this.deps;
    // Sprawdzamy w chwili uderzenia, nie zamachu — gracz może uciec z zasięgu podczas telegrafu.
    if (distance(enemy, player) > attack.hitRange) return;
    const hit: Hit = {
      damage: attack.damage,
      knockback: knockbackFrom(enemy, player, attack.knockback),
      ...(attack.status && { status: attack.status }),
    };
    if (player.takeHit(hit, scene.time.now)) {
      this.deps.onPlayerHit();
      this.lifesteal(enemy, hit.damage);
    }
  }

  fireProjectile(enemy: Enemy, attack: ProjectileAttackDefinition, target: Vector2): void {
    const direction = directionTo(enemy, target);
    // Pocisk startuje kawałek przed strzelcem (wg sprite'ów), w kierunku rzutu.
    const look = ENEMY_PROJECTILE_VISUALS[enemy.definition.variant];
    const offset = look?.forwardOffset ?? 0;
    // Fala ma wiersze kierunków lotu (8 klatek obrotu co 45°), kula maga jest bez kierunków.
    const row = look?.directional ? (facingDirection(direction) ?? 0) : 0;
    this.deps.projectiles.fire({
      origin: { x: enemy.x + direction.x * offset, y: enemy.y + direction.y * offset },
      direction,
      ...(look && {
        visual: { texture: SPRITE_SHEETS[look.sheet].key, animation: animationKey(look.sheet, look.animation, row) },
      }),
      speed: attack.projectileSpeed,
      damage: attack.damage,
      knockback: attack.knockback,
      lifetimeMs: attack.projectileLifetimeMs,
      ...(attack.wave && { wave: attack.wave }),
      ...(attack.status && { status: attack.status }),
      ...(enemy.hasAffix(EliteAffix.Vampiric) && { onHit: (damage: number) => this.lifesteal(enemy, damage) }),
    });
  }

  private kill(enemy: Enemy): void {
    const now = this.deps.scene.time.now;
    const at = { x: enemy.x, y: enemy.y };
    if (enemy.hasAffix(EliteAffix.Fiery)) {
      const patch = ELITE_CONFIG.fiery.deathPatch;
      this.firePatches.add(at, { ...patch, damage: this.hazardDamage(patch.damage) }, now);
    }
    if (enemy.hasAffix(EliteAffix.Volatile)) {
      const { delayMs, damage } = ELITE_CONFIG.volatile;
      this.blasts.push({ at, startAt: now, detonateAt: now + delayMs, damage: this.hazardDamage(damage) });
    }
    this.deps.effects.deathBurst(enemy.x, enemy.y, enemy.definition.color, enemy.radius);
    this.deps.decals.add('splat', enemy.x, enemy.y);
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.deps.onEnemyKilled(enemy);
    enemy.destroy();
  }
}

import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { BroodAttackDefinition, Hit, LobAttackDefinition, MeleeAttackDefinition, PounceAttackDefinition, ProjectileAttackDefinition } from '@/core/combatTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { ENEMY_DEFINITIONS, ENEMY_SCALING, ENEMY_VARIANTS } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { ENEMY_PROJECTILE_VISUALS, LOB_VISUALS, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { FirePatchField, lobPosition, trailPoints } from '@/systems/HellAttacks';
import type { EnemyScalingConfig, EnemyVariant } from '@/core/combatTypes';
import { EliteAffix, EnemyType } from '@/core/combatTypes';
import { BroodLedger, broodCapacity, broodSpawnPoints } from '@/systems/Brood';
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { ELITE_VISUAL, SHIELD_CHARGE_VISUAL } from '@/config/spriteConfig';
import { applyElite, bombDamageToShielded, isElite, lifestealHeal } from '@/systems/Elites';
import type { ShieldChargeConfig } from '@/systems/ShieldCharge';
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
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { directionTo, distance, knockbackFrom, scaleForFloor } from '@/systems/CombatMath';
import { withHpMultiplier } from '@/systems/CoopBalance';
import { isCaughtByGroundArea } from '@/systems/Hurtbox';
import { drawZoneTelegraph } from '@/effects/AreaTelegraph';
import { FirePatchRenderer } from '@/effects/FirePatchRenderer';
import { scaleEnemyForFloor } from '@/systems/EnemyScaling';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { applyFloorToEnemy } from '@/systems/FloorModifiers';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike, OrbSplash } from '@/systems/Sorcery';
import { resolveBeam, resolveSplash } from '@/systems/Sorcery';
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
  /** Co-op (etap C6): mnożnik HP wrogów; solo — brak (1). */
  readonly hpMultiplier?: number;
  /** Warianty archetypów w biomie piętra (wygląd i ewentualnie atak). */
  readonly enemyVariants: Readonly<Record<EnemyType, EnemyVariant>>;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  /** Bohaterowie (co-op, etap C0): wrogowie celują w najbliższego żywego, zagrożenia ranią każdego. */
  readonly party: Party;
  readonly projectiles: ProjectileManager;
  readonly effects: CombatEffects;
  /** Trwałe ślady walki (plama w miejscu śmierci wroga). */
  readonly decals: CombatDecals;
  readonly onPlayerHit: (player: Player) => void;
  readonly onEnemyKilled: (enemy: Enemy) => void;
  /** Wabik (totem łucznika, krok 98): wrogowie celują w niego zamiast w bohaterów; null — w najbliższego bohatera. */
  readonly aggroTarget?: () => Vector2 | null;
  /** Elita pierwszy raz widzi gracza z bliska (krok 44: komunikat z podpowiedzią). */
  readonly onEliteSpotted?: (enemy: Enemy) => void;
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
  private readonly spotted = new WeakSet<Enemy>();
  /** Gniazdownicy i ich czerwie (krok 122). */
  private readonly broods = new BroodLedger<Enemy, Enemy>();
  private readonly telegraphs: Phaser.GameObjects.Graphics;
  private readonly fire: FirePatchRenderer;

  constructor(private readonly deps: EnemyManagerDeps) {
    this.group = deps.scene.physics.add.group();
    deps.scene.physics.add.collider(this.group, deps.walls);
    deps.scene.physics.add.collider(this.group, this.group);
    this.telegraphs = deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph);
    this.fire = new FirePatchRenderer(deps.scene);
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
  spawnAt(
    type: EnemyType,
    position: Vector2,
    affixes: readonly EliteAffix[] = [],
    options: {
      readonly variant?: EnemyVariant;
      readonly phaseOffsetMs?: number;
      readonly riseMs?: number;
      /** Własne skalowanie z piętrem (upiory zasadzki) — wtedy bez modyfikatora piętra. */
      readonly scaling?: EnemyScalingConfig;
    } = {},
  ): Enemy {
    const base = enemyDefinitionFor(ENEMY_DEFINITIONS[type], options.variant ?? this.deps.enemyVariants[type], ENEMY_VARIANTS);
    const scaled = scaleEnemyForFloor(base, this.deps.floorNumber, options.scaling ?? ENEMY_SCALING);
    const modified = options.scaling ? scaled : applyFloorToEnemy(scaled, this.deps.floorEffects);
    const definition = withHpMultiplier(applyElite(modified, affixes, ELITE_CONFIG), this.deps.hpMultiplier ?? 1);
    const enemy = new Enemy(this.deps.scene, position.x, position.y, definition, options);
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

  /** Czerw z gniazda (krok 122): bez łupu i bez ładowania ultimate za zabicie. */
  isBroodling(enemy: Enemy): boolean {
    return this.broods.isMinion(enemy);
  }

  variantOf(type: EnemyType): EnemyVariant {
    return this.deps.enemyVariants[type];
  }

  update(now: number): void {
    const { party, floor } = this.deps;
    const lure = this.deps.aggroTarget?.() ?? null;
    for (const enemy of [...this.enemies]) {
      // Czerw mógł zginąć w tej klatce razem ze swoim gniazdem.
      if (!enemy.active) continue;
      const burn = enemy.tickBurn(now);
      if (burn > 0) this.deps.effects.floatingText(enemy.x, enemy.y, `-${burn}`, '#ff8a3c');
      if (enemy.isDead) {
        this.kill(enemy);
        continue;
      }
      const target: Vector2 = lure ?? party.targetPointFor(enemy);
      const canSeeTarget = !party.isDown && hasLineOfSight(floor, enemy, target, TILE_SIZE);
      enemy.tick({ target, canSeeTarget }, now, this);
      this.updateFieryTrail(enemy, now);
      const nearest = party.nearestLiving(enemy);
      if (canSeeTarget && nearest && isElite(enemy.definition) && !this.spotted.has(enemy) && distance(enemy, nearest) <= ELITE_VISUAL.spotRange) {
        this.spotted.add(enemy);
        this.deps.onEliteSpotted?.(enemy);
      }
    }
    this.updateHellAttacks(now);
  }

  /** Bomby w locie, płonące ślady i telegrafy (skok: linia do celu; rzut: strefa upadku). */
  private updateHellAttacks(now: number): void {
    this.telegraphs.clear();
    for (const enemy of this.enemies) {
      const aim = enemy.pounceTelegraph;
      if (aim) this.telegraphs.lineStyle(2, 0xff3b30, 0.7).lineBetween(enemy.x, enemy.y, aim.x, aim.y);
      const lane = enemy.chargeTelegraph;
      if (lane) this.drawChargeLane(enemy, lane.from, lane.to);
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
    const living = this.deps.party.living;
    // Bez żywych bohaterów i tak usuwamy wygasłe plamy.
    if (living.length === 0) this.firePatches.update(null, now);
    for (const player of living) {
      const damage = this.firePatches.update(player, now);
      if (damage > 0 && player.takeHit({ damage, knockback: { x: 0, y: 0 } }, now)) this.deps.onPlayerHit(player);
    }
    this.fire.draw(this.firePatches, now);
  }

  /** Tor szarży Tarczownika: pas szerokości wroga i linia środka (ten sam czerwony co inne telegrafy), ucięty na ścianie. */
  private drawChargeLane(enemy: Enemy, from: Vector2, end: Vector2): void {
    const { laneAlpha, lineAlpha, color, clipStep } = SHIELD_CHARGE_VISUAL;
    const length = distance(from, end);
    let to = from;
    for (let d = clipStep; d <= length; d += clipStep) {
      const t = d / length;
      const point = { x: from.x + (end.x - from.x) * t, y: from.y + (end.y - from.y) * t };
      if (!hasLineOfSight(this.deps.floor, from, point, TILE_SIZE)) break;
      to = point;
    }
    this.telegraphs.lineStyle(enemy.radius * 2, color, laneAlpha).lineBetween(from.x, from.y, to.x, to.y);
    this.telegraphs.lineStyle(2, color, lineAlpha).lineBetween(from.x, from.y, to.x, to.y);
  }

  /**
   * Bomby wrogów ranią Tarczownika (krok 99, pomysł właściciela): wciągnięcie go pod bombę kultysty albo wybuch elity
   * się opłaca. Tarcza nie chroni przed wybuchem z góry.
   */
  private blastShielded(at: Vector2, radius: number, damage: number, knockback: number, now: number): void {
    for (const enemy of [...this.enemies]) {
      if (!enemy.hasAffix(EliteAffix.Shielded) || enemy.isDead || distance(at, enemy) > radius + enemy.radius) continue;
      const dealt = bombDamageToShielded(damage, ELITE_CONFIG);
      const result = enemy.takeHit({ damage: dealt, knockback: knockbackFrom(at, enemy, knockback), unblockable: true }, now, at);
      this.deps.effects.floatingText(enemy.x, enemy.y, `-${result.dealt}`, '#ffd23c');
      if (result.died) this.kill(enemy);
    }
  }

  /** Strefa wybuchu bomby: ten sam telegraf co ataki bossów (krok 110), wypełnia się do lądowania. */
  private drawLandingZone(bomb: LobbedBomb, now: number): void {
    const zone = { center: bomb.to, radius: bomb.attack.blastRadius, telegraphStartAt: bomb.launchAt, impactAt: bomb.landAt };
    drawZoneTelegraph(this.telegraphs, zone, now);
  }

  /** Wybuchy Wybuchowych elit: strefa wypełnia się, potem trafia bohaterów w promieniu. */
  private updateBlasts(now: number): void {
    const { party, effects } = this.deps;
    const { radius, knockback } = ELITE_CONFIG.volatile;
    this.blasts = this.blasts.filter((blast) => {
      if (now < blast.detonateAt) {
        const zone = { center: blast.at, radius, telegraphStartAt: blast.startAt, impactAt: blast.detonateAt, tint: ELITE_VISUAL.volatileZone };
        drawZoneTelegraph(this.telegraphs, zone, now);
        return true;
      }
      effects.blast(blast.at.x, blast.at.y, radius);
      this.deps.decals.add('splat', blast.at.x, blast.at.y);
      for (const player of party.living) {
        if (!isCaughtByGroundArea(blast.at, radius, player)) continue;
        const hit: Hit = { damage: blast.damage, knockback: knockbackFrom(blast.at, player, knockback) };
        if (player.takeHit(hit, now)) this.deps.onPlayerHit(player);
      }
      this.blastShielded(blast.at, radius, blast.damage, knockback, now);
      return false;
    });
  }

  private landBomb(bomb: LobbedBomb, now: number): void {
    const { party, effects } = this.deps;
    bomb.sprite.destroy();
    bomb.shadow.destroy();
    effects.blast(bomb.to.x, bomb.to.y, bomb.attack.blastRadius);
    for (const player of party.living) {
      if (!isCaughtByGroundArea(bomb.to, bomb.attack.blastRadius, player)) continue;
      const hit: Hit = { damage: bomb.attack.damage, knockback: knockbackFrom(bomb.to, player, bomb.attack.knockback) };
      if (player.takeHit(hit, now)) this.deps.onPlayerHit(player);
    }
    this.blastShielded(bomb.to, bomb.attack.blastRadius, bomb.attack.damage, bomb.attack.knockback, now);
    this.firePatches.add(bomb.to, bomb.attack.patch, now);
  }

  chargeHit(enemy: Enemy, charge: ShieldChargeConfig): boolean {
    const { party, scene } = this.deps;
    const damage = Math.round(enemy.definition.attack.damage * charge.damageMultiplier);
    let hitAny = false;
    for (const player of party.living) {
      if (distance(enemy, player) > charge.hitRadius + enemy.radius + player.radius) continue;
      const hit: Hit = { damage, knockback: knockbackFrom(enemy, player, charge.knockback) };
      // Dash i nietykalność chronią: tarczownik biegnie dalej (i może wbić się w ścianę).
      if (!player.takeHit(hit, scene.time.now)) continue;
      this.deps.onPlayerHit(player);
      this.lifesteal(enemy, damage);
      hitAny = true;
    }
    return hitAny;
  }

  chargeWall(enemy: Enemy): void {
    const { scene, effects } = this.deps;
    const { shakeMs, shakeIntensity, impactRadius, text, textColor } = SHIELD_CHARGE_VISUAL;
    effects.impact(enemy.x, enemy.y, impactRadius);
    sound.play(SoundCue.Impact, enemy);
    scene.cameras.main.shake(shakeMs, shakeIntensity);
    effects.floatingText(enemy.x, enemy.y, text, textColor);
  }

  broodCapacity(enemy: Enemy, attack: BroodAttackDefinition): number {
    return broodCapacity(attack, this.broods.aliveOf(enemy), this.broods.spawnedBy(enemy));
  }

  /** Wylęg Gniazdownika: czerwie wykluwają się przed gniazdem (miejsce za ścianą — w samym gnieździe). */
  brood(enemy: Enemy, attack: BroodAttackDefinition, target: Vector2): void {
    const count = this.broodCapacity(enemy, attack);
    if (count <= 0) return;
    const nest = { x: enemy.x, y: enemy.y };
    for (const point of broodSpawnPoints(nest, target, count, attack)) {
      const at = hasLineOfSight(this.deps.floor, nest, point, TILE_SIZE) ? point : nest;
      const grub = this.spawnAt(EnemyType.Rusher, at, [], { variant: attack.minion, riseMs: attack.hatchMs });
      this.broods.add(enemy, grub);
      this.deps.effects.deathBurst(at.x, at.y, enemy.definition.color, grub.radius);
    }
    sound.play(SoundCue.Brood, nest);
  }

  pounceHit(enemy: Enemy, attack: PounceAttackDefinition): boolean {
    const { party, scene } = this.deps;
    let hitAny = false;
    for (const player of party.living) {
      if (distance(enemy, player) > attack.hitRadius + player.radius) continue;
      const hit: Hit = { damage: attack.damage, knockback: knockbackFrom(enemy, player, attack.knockback) };
      // Dash i nietykalność chronią: wtedy skok jest chybiony (postój ogara).
      if (!player.takeHit(hit, scene.time.now)) continue;
      this.deps.onPlayerHit(player);
      this.lifesteal(enemy, hit.damage);
      hitAny = true;
    }
    return hitAny;
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

  /** Rozprysk kuli Czarodziejki (krok 50). */
  resolveSplash(splash: OrbSplash): void {
    const { killed } = resolveSplash(splash, [...this.enemies]);
    for (const enemy of killed) this.kill(enemy);
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
    const { party, scene } = this.deps;
    for (const player of party.living) {
      // Sprawdzamy w chwili uderzenia, nie zamachu — bohater może uciec z zasięgu podczas telegrafu.
      if (distance(enemy, player) > attack.hitRange) continue;
      const hit: Hit = {
        damage: attack.damage,
        knockback: knockbackFrom(enemy, player, attack.knockback),
        ...(attack.status && { status: attack.status }),
      };
      if (player.takeHit(hit, scene.time.now)) {
        this.deps.onPlayerHit(player);
        this.lifesteal(enemy, hit.damage);
      }
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
    // Ten sam wróg może paść dwa razy w jednej klatce (np. cios trafił gniazdo i jego czerwia).
    if (!this.enemies.includes(enemy)) return;
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
    sound.play(SoundCue.EnemyDeath, at);
    this.deps.decals.add('splat', enemy.x, enemy.y);
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.deps.onEnemyKilled(enemy);
    this.broods.remove(enemy);
    enemy.destroy();
    // Gniazdo padło — jego czerwie giną razem z nim (krok 122).
    for (const grub of this.broods.release(enemy)) this.kill(grub);
  }
}

import Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Hit } from '@/core/combatTypes';
import { PunishKind, type CombatWeightConfig } from '@/core/combatWeightTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { AimPhase, PunishPlanner, piercingAimPhase, type PunishCandidate } from '@/ai/PunishPlanner';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import type { Enemy } from '@/entities/Enemy';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { directionTo, knockbackFrom } from '@/systems/CombatMath';
import { ChargeOutcome, ChargePhase, ShieldCharge, type ShieldChargeConfig } from '@/systems/ShieldCharge';
import { beamReach, distanceToSegment } from '@/systems/Sorcery';
import { type UiText, uiText } from '@/ui/UiText';

/** Czego menedżer potrzebuje od wrogów piętra. */
export interface PunishEnemies {
  readonly living: readonly Enemy[];
  /** Stworki nawały i czerwie nie karzą. */
  isBroodling(enemy: Enemy): boolean;
  /** Efekt wbicia w ścianę (ten sam co po szarży Tarczownika). */
  chargeWall(enemy: Enemy): void;
}

export interface PunishManagerDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly party: Party;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly enemies: PunishEnemies;
  readonly config: CombatWeightConfig;
  readonly rng: Rng;
  readonly onPlayerHit: (player: Player) => void;
}

/** Celowanie przeszywającego strzału. */
interface AimAct {
  readonly kind: PunishKind.PiercingShot;
  readonly enemy: Enemy;
  readonly target: Player;
  readonly startAt: number;
  readonly bang: UiText;
  direction: Vector2;
}

/** Taran: zamach z pasem na posadzce, bieg, postój. */
interface RamAct {
  readonly kind: PunishKind.Ram;
  readonly enemy: Enemy;
  readonly charge: ShieldCharge;
  readonly bang: UiText;
  launched: boolean;
}

/** Przeszywający strzał w locie: przelatuje przez wrogów, kończy na murze, trafia każdego bohatera raz. */
interface Bolt {
  readonly from: Vector2;
  readonly direction: Vector2;
  readonly length: number;
  readonly startAt: number;
  readonly damage: number;
  readonly hit: Set<Player>;
  travelled: number;
}

/** Długość smugi pocisku (px). */
const BOLT_TAIL = 26;
/** Barwa ogłuszonego po wbiciu w ścianę (jak Tarczownik). */
const STUN_TINT = 0x8fa8ff;

/**
 * Atak kary (krok U11a, wersja lekka systemu wag — docs/WAGI.md §11 i §5): gdy bohater ma Odsłonięcie III,
 * jeden wróg z linią wzroku dostaje okno na mocny atak, którego nie da się zablokować — ratuje tylko dash
 * (albo zasłona). Kiter: przeszywający strzał z czerwoną linią celownika (ostatnie ms celownik stoi), pocisk
 * przelatuje przez innych wrogów. Rusher i Czyhacz: taran po czerwonym pasie; wbity w ścianę stoi ogłuszony.
 * Decyzje (kto, kiedy) — `ai/PunishPlanner`; tu wykonanie i rysunek. Czerwień nad mrokiem — widać ją zawsze.
 */
export class PunishManager {
  private readonly planner: PunishPlanner;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private act: AimAct | RamAct | null = null;
  private bolts: Bolt[] = [];
  private readonly ramConfig: ShieldChargeConfig;

  constructor(private readonly deps: PunishManagerDeps) {
    this.planner = new PunishPlanner(deps.config.punish, deps.rng);
    this.gfx = deps.scene.add.graphics().setDepth(RENDER_DEPTH.combatFx);
    // Taran to szarża bez stożka tarczy i bez przerwy — przerwę liczy planer.
    this.ramConfig = { ...deps.config.punish.ram, cooldownMs: 0, aimConeDeg: 360 };
    deps.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  update(now: number): void {
    this.gfx.clear();
    if (this.act?.kind === PunishKind.PiercingShot) this.updateAim(this.act, now);
    else if (this.act?.kind === PunishKind.Ram) this.updateRam(this.act, now);
    else this.tryStart(now);
    this.updateBolts(now);
  }

  /** Odsłonięty bohater (pęknięcia III) — planer wybiera karzącego. */
  private tryStart(now: number): void {
    const hero = this.deps.party.living.find((p) => p.weights.isBroken);
    if (!hero) return;
    const { enemies, floor } = this.deps;
    const candidates: PunishCandidate<Enemy>[] = [];
    for (const enemy of enemies.living) {
      // Stworki nawały, czerwie i upiory zasadzki nie karzą.
      if (enemies.isBroodling(enemy) || enemy.definition.phasing || !enemy.canBeSeized(now)) continue;
      candidates.push({ who: enemy, type: enemy.definition.type, position: { x: enemy.x, y: enemy.y }, canSee: hasLineOfSight(floor, enemy, hero, TILE_SIZE) });
    }
    const pick = this.planner.plan(now, hero, candidates);
    if (!pick) return;
    const { visual } = this.deps.config;
    const enemy = pick.who;
    enemy.seize(visual.punishTint);
    enemy.setVelocity(0, 0);
    const bang = uiText(this.deps.scene, enemy.x, enemy.y, '!!', { color: visual.punishCss, size: 2 })
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.worldText);
    sound.play(SoundCue.PunishWarn, enemy);
    if (pick.kind === PunishKind.PiercingShot) {
      this.act = { kind: PunishKind.PiercingShot, enemy, target: hero, startAt: now, bang, direction: directionTo(enemy, hero) };
    } else {
      const charge = new ShieldCharge(this.ramConfig);
      charge.start(now, enemy, hero);
      this.act = { kind: PunishKind.Ram, enemy, charge, bang, launched: false };
    }
  }

  /** Przeszywający strzał: linia za bohaterem, potem zamrożona, potem pocisk. */
  private updateAim(act: AimAct, now: number): void {
    const { enemy } = act;
    if (!enemy.active || enemy.isDead) {
      this.finish();
      return;
    }
    const config = this.deps.config.punish.piercingShot;
    enemy.setVelocity(0, 0);
    this.placeBang(act.bang, enemy);
    const phase = piercingAimPhase(now - act.startAt, config);
    if (phase === AimPhase.Tracking) {
      const target = act.target.isDead ? this.deps.party.nearestLiving(enemy) : act.target;
      if (target) act.direction = directionTo(enemy, target);
    }
    enemy.punishPose(act.direction, false);
    const angle = Math.atan2(act.direction.y, act.direction.x);
    const length = this.reach(enemy, angle, config.range);
    if (phase === AimPhase.Fire) {
      const damage = Math.max(1, Math.round(enemy.definition.attack.damage * config.damageMultiplier));
      this.bolts.push({ from: { x: enemy.x, y: enemy.y }, direction: act.direction, length, startAt: now, damage, hit: new Set(), travelled: 0 });
      sound.play(SoundCue.PunishStrike, enemy);
      this.finish();
      return;
    }
    const { punishColor } = this.deps.config.visual;
    const to = { x: enemy.x + act.direction.x * length, y: enemy.y + act.direction.y * length };
    if (phase === AimPhase.Frozen) {
      // Zamrożony celownik: gruba, pełna linia — teraz dash w poprzek.
      this.gfx.lineStyle(3, punishColor, 1).lineBetween(enemy.x, enemy.y, to.x, to.y);
      this.gfx.lineStyle(1, 0xffffff, 0.9).lineBetween(enemy.x, enemy.y, to.x, to.y);
    } else {
      const pulse = 0.45 + 0.35 * Math.abs(Math.sin(now / 70));
      this.gfx.lineStyle(1, punishColor, pulse).lineBetween(enemy.x, enemy.y, to.x, to.y);
    }
  }

  /** Taran: pas na posadzce w zamachu, bieg po prostej, trafia raz; ściana ogłusza. */
  private updateRam(act: RamAct, now: number): void {
    const { enemy, charge } = act;
    if (!enemy.active || enemy.isDead) {
      this.finish();
      return;
    }
    const config = this.ramConfig;
    const dir = charge.direction;
    switch (charge.phase(now)) {
      case ChargePhase.Windup: {
        enemy.setVelocity(0, 0);
        enemy.punishPose(dir, false);
        this.placeBang(act.bang, enemy);
        this.drawLane(enemy, dir, now);
        break;
      }
      case ChargePhase.Charging: {
        if (!act.launched) {
          act.launched = true;
          act.bang.setVisible(false);
          sound.play(SoundCue.PunishStrike, enemy);
        }
        const blocked = enemy.body instanceof Phaser.Physics.Arcade.Body && !enemy.body.blocked.none;
        const outcome = charge.advance(now, enemy, blocked);
        if (outcome === ChargeOutcome.Continue && this.ramHits(enemy)) charge.registerHit(now);
        if (charge.phase(now) === ChargePhase.Charging) {
          enemy.setVelocity(dir.x * config.speed, dir.y * config.speed);
          enemy.punishPose(dir, true);
        } else {
          enemy.setVelocity(0, 0);
          if (outcome === ChargeOutcome.Wall) {
            this.deps.enemies.chargeWall(enemy);
            enemy.seize(STUN_TINT);
          }
        }
        break;
      }
      case ChargePhase.Ready:
        this.finish();
        break;
      default:
        enemy.setVelocity(0, 0);
    }
  }

  /** Taran rani każdego żywego bohatera, którego dotknie (dash i nietykalność chronią). */
  private ramHits(enemy: Enemy): boolean {
    const { ram } = this.deps.config.punish;
    const damage = Math.max(1, Math.round(enemy.definition.attack.damage * ram.damageMultiplier));
    let hitAny = false;
    for (const player of this.deps.party.living) {
      if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > ram.hitRadius + enemy.radius + player.radius) continue;
      const hit: Hit = { damage, knockback: knockbackFrom(enemy, player, ram.knockback) };
      if (!player.takeHit(hit, this.deps.scene.time.now)) continue;
      this.deps.onPlayerHit(player);
      hitAny = true;
    }
    return hitAny;
  }

  /** Pociski kary: smuga leci po prostej, trafia bohaterów na swojej drodze, gaśnie na murze. */
  private updateBolts(now: number): void {
    if (this.bolts.length === 0) return;
    const { piercingShot } = this.deps.config.punish;
    const { punishColor } = this.deps.config.visual;
    this.bolts = this.bolts.filter((bolt) => {
      const prev = bolt.travelled;
      bolt.travelled = Math.min(bolt.length, (piercingShot.speed * (now - bolt.startAt)) / 1000);
      const at = (d: number): Vector2 => ({ x: bolt.from.x + bolt.direction.x * d, y: bolt.from.y + bolt.direction.y * d });
      const head = at(bolt.travelled);
      const swept = { a: at(prev), b: head };
      for (const player of this.deps.party.living) {
        if (bolt.hit.has(player) || distanceToSegment(player, swept.a, swept.b) > player.radius + piercingShot.halfWidth) continue;
        bolt.hit.add(player);
        const hit: Hit = { damage: bolt.damage, knockback: { x: bolt.direction.x * piercingShot.knockback, y: bolt.direction.y * piercingShot.knockback } };
        if (player.takeHit(hit, now)) this.deps.onPlayerHit(player);
      }
      const tail = at(Math.max(0, bolt.travelled - BOLT_TAIL));
      this.gfx.lineStyle(3, punishColor, 1).lineBetween(tail.x, tail.y, head.x, head.y);
      this.gfx.lineStyle(1, 0xffffff, 1).lineBetween(tail.x, tail.y, head.x, head.y);
      return bolt.travelled < bolt.length;
    });
  }

  /** Pas taranu na posadzce: od wroga do muru albo pełnego wybiegu, szerokość ciała z zapasem trafienia. */
  private drawLane(enemy: Enemy, dir: Vector2, now: number): void {
    const { ram } = this.deps.config.punish;
    const length = this.reach(enemy, Math.atan2(dir.y, dir.x), ram.maxDistance);
    const half = enemy.radius + ram.hitRadius;
    const nx = -dir.y * half;
    const ny = dir.x * half;
    const to = { x: enemy.x + dir.x * length, y: enemy.y + dir.y * length };
    const corners = [
      new Phaser.Math.Vector2(enemy.x + nx, enemy.y + ny),
      new Phaser.Math.Vector2(to.x + nx, to.y + ny),
      new Phaser.Math.Vector2(to.x - nx, to.y - ny),
      new Phaser.Math.Vector2(enemy.x - nx, enemy.y - ny),
    ];
    const { punishColor } = this.deps.config.visual;
    const pulse = 0.18 + 0.12 * Math.abs(Math.sin(now / 90));
    this.gfx.fillStyle(punishColor, pulse).fillPoints(corners, true);
    this.gfx.lineStyle(1, punishColor, 0.9).strokePoints(corners, true);
  }

  /** Zasięg po prostej do pierwszego muru (kafel kolizji). */
  private reach(from: Vector2, angle: number, range: number): number {
    const walls = this.deps.walls;
    return beamReach(from, angle, range, (p) => walls.getTileAtWorldXY(p.x, p.y)?.collides ?? false);
  }

  private placeBang(bang: UiText, enemy: Enemy): void {
    // Miga co 120 ms — „!!” czytelne w tłumie.
    bang.setVisible(Math.floor(this.deps.scene.time.now / 120) % 2 === 0);
    bang.setPosition(Math.round(enemy.x), Math.round(enemy.y - enemy.radius - 8));
  }

  /** Koniec aktu kary: wróg wraca do własnego AI. */
  private finish(): void {
    const act = this.act;
    if (!act) return;
    act.bang.destroy();
    if (act.enemy.active && !act.enemy.isDead) act.enemy.release();
    this.act = null;
  }

  private destroy(): void {
    this.act?.bang.destroy();
    this.act = null;
    this.bolts = [];
    this.gfx.destroy();
  }
}

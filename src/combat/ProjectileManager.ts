import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import type { StatusApplication, WaveShape } from '@/core/combatTypes';
import { isHitByWave } from '@/systems/EnemyVariants';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { HERO_HURTBOX, PROJECTILE_RADIUS } from '@/config/combatConfig';
import { isTouchingHeroBody } from '@/systems/Hurtbox';
import { knockbackFrom, normalize } from '@/systems/CombatMath';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { CombatDecalKind } from '@/config/dressingConfig';
import type { CombatDecals } from '@/effects/CombatDecals';

export interface ProjectileSpec {
  readonly origin: Vector2;
  /** Kierunek lotu (nie musi być znormalizowany). */
  readonly direction: Vector2;
  readonly speed: number;
  readonly damage: number;
  readonly knockback: number;
  readonly lifetimeMs: number;
  /** Wygląd z arkusza sprite'ów (np. kula maga); brak = domyślny pomarańczowy pocisk. */
  readonly visual?: { readonly texture: string; readonly animation: string };
  /** Ślad na podłodze, gdy pocisk rozbije się o ścianę albo wygaśnie (np. szlam bossa). */
  readonly impactDecal?: CombatDecalKind;
  /** Wywołanie w miejscu końca lotu (ściana albo wygaśnięcie) — kula szlamu zostawia kałużę (krok 153). */
  readonly onLand?: (at: Vector2) => void;
  /** Fala (nietoperz): trafia w całej szerokości półksiężyca zamiast w okręgu ciała. */
  readonly wave?: WaveShape;
  /** Status nakładany trafieniem (krok 28b: trucizna kuli zarodników grzybca). */
  readonly status?: StatusApplication;
  /** Wywołanie po trafieniu gracza (krok 42: wampiryczna elita leczy się z trafienia pociskiem). */
  readonly onHit?: (damage: number) => void;
  /** Obrót sprite'a (radiany) — strzałka pułapki leci grotem do przodu (krok 48). */
  readonly rotation?: number;
  /** Dźwięk wystrzału (krok 116); domyślnie cichy pocisk wroga. */
  readonly sound?: SoundCue;
}

/** Pociski przeciwników: lot, kolizja ze ścianami, trafienie gracza, wygasanie. */
export class ProjectileManager {
  private readonly group: Phaser.Physics.Arcade.Group;
  /** Ślady zostawiane przez pociski (pocisk → rodzaj śladu); tylko pociski z `impactDecal`. */
  private readonly impactDecals = new WeakMap<Projectile, CombatDecalKind>();
  /** Kształt fal — trafienie liczymy sami (czysta funkcja), nie przez okrągłe ciało fizyczne. */
  private readonly waves = new WeakMap<Projectile, WaveShape>();
  private readonly hitCallbacks = new WeakMap<Projectile, (damage: number) => void>();
  private readonly landCallbacks = new WeakMap<Projectile, (at: Vector2) => void>();
  /** Lustra areny (krok 160): czy kafel odbija pocisk. */
  private reflects: ((projectile: Projectile, tile: { readonly x: number; readonly y: number }) => boolean) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    walls: Phaser.Tilemaps.TilemapLayer,
    private readonly party: Party,
    private readonly onPlayerHit: (player: Player) => void,
    private readonly decals?: CombatDecals,
  ) {
    this.group = scene.physics.add.group({ classType: Projectile });

    scene.physics.add.collider(this.group, walls, (projectile, tile) => {
      if (!(projectile instanceof Projectile)) return;
      // Lustro areny (krok 160) odbija także pociski bossa i wrogów (fizyka odbiła je już — sprężystość 1).
      if (tile instanceof Phaser.Tilemaps.Tile && this.reflects?.(projectile, tile)) return;
      this.splash(projectile);
    });
    for (const member of party.members) {
      scene.physics.add.overlap(member, this.group, (_player, projectile) => {
        // Prostokąt fizyki 24×24 to tylko zgrubny test — trafia dopiero dotknięcie tułowia (krok 110).
        if (!(projectile instanceof Projectile) || this.waves.has(projectile)) return;
        if (isTouchingHeroBody(projectile, PROJECTILE_RADIUS, member)) this.handlePlayerOverlap(projectile, member);
      });
    }
  }

  fire(spec: ProjectileSpec): void {
    sound.play(spec.sound ?? SoundCue.EnemyShot, spec.origin);
    const projectile = new Projectile(this.scene, spec.origin.x, spec.origin.y, spec.visual?.texture);
    projectile.damage = spec.damage;
    projectile.knockback = spec.knockback;
    projectile.expiresAt = this.scene.time.now + spec.lifetimeMs;
    if (spec.status) projectile.status = spec.status;
    projectile.setDepth(RENDER_DEPTH.projectile);

    this.group.add(projectile, true);
    // Ciało zawsze o promieniu PROJECTILE_RADIUS, wyśrodkowane w klatce (kula maga ma 16×16).
    projectile.setCircle(PROJECTILE_RADIUS, projectile.width / 2 - PROJECTILE_RADIUS, projectile.height / 2 - PROJECTILE_RADIUS);
    if (spec.visual) projectile.play(spec.visual.animation);
    if (spec.rotation !== undefined) projectile.setRotation(spec.rotation);
    if (spec.impactDecal) this.impactDecals.set(projectile, spec.impactDecal);
    if (spec.wave) this.waves.set(projectile, spec.wave);
    if (spec.onHit) this.hitCallbacks.set(projectile, spec.onHit);
    if (spec.onLand) this.landCallbacks.set(projectile, spec.onLand);
    const dir = normalize(spec.direction);
    projectile.setVelocity(dir.x * spec.speed, dir.y * spec.speed);
    // Sprężystość 1: lustra areny odbijają (krok 160); o zwykły mur pocisk i tak się rozbija.
    projectile.setBounce(1);
  }

  /** Lustra areny (krok 160). */
  setReflector(reflects: ((projectile: Projectile, tile: { readonly x: number; readonly y: number }) => boolean) | null): void {
    this.reflects = reflects;
  }

  update(now: number): void {
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Projectile)) continue;
      if (now >= child.expiresAt) {
        this.splash(child);
        continue;
      }
      const wave = this.waves.get(child);
      const velocity = child.body?.velocity;
      if (!wave || !velocity) continue;
      // Fala znika na pierwszym trafionym bohaterze (co-op: drugi stoi za nim bezpiecznie).
      for (const member of this.party.living) {
        if (child.active && isHitByWave(child, velocity, wave, member, HERO_HURTBOX.body.radius)) this.handlePlayerOverlap(child, member);
      }
    }
  }

  /** Koniec lotu (ściana albo wygaśnięcie): ślad na podłodze, jeśli pocisk go zostawia. */
  private splash(projectile: Projectile): void {
    const kind = this.impactDecals.get(projectile);
    if (kind) this.decals?.add(kind, projectile.x, projectile.y);
    this.landCallbacks.get(projectile)?.({ x: projectile.x, y: projectile.y });
    projectile.destroy();
  }

  private handlePlayerOverlap(projectile: Projectile, player: Player): void {
    // Pocisk zniszczony na pierwszym bohaterze nie trafia drugiego w tej samej klatce.
    if (!projectile.active) return;
    const now = this.scene.time.now;
    const velocity = projectile.body?.velocity;
    // Odrzut w kierunku lotu pocisku.
    const from = velocity
      ? { x: projectile.x - velocity.x, y: projectile.y - velocity.y }
      : { x: projectile.x, y: projectile.y };
    const hit = {
      damage: projectile.damage,
      knockback: knockbackFrom(from, player, projectile.knockback),
      status: projectile.status,
    };

    // Dash/nietykalność: pocisk przelatuje przez gracza.
    if (player.takeHit(hit, now)) {
      this.hitCallbacks.get(projectile)?.(hit.damage);
      projectile.destroy();
      this.onPlayerHit(player);
    }
  }
}

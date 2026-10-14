import Phaser from 'phaser';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { COCOON_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SpiderlingSwarm, drawAreaTelegraph } from '@/combat/SpiderlingSwarm';
import { planCocoons } from '@/dungeon/CocoonPlanner';
import { DungeonView } from '@/dungeon/DungeonView';
import type { CombatDecals } from '@/effects/CombatDecals';
import type { CombatEffects } from '@/effects/CombatEffects';
import { Cocoon } from '@/entities/Cocoon';
import type { Player } from '@/entities/Player';
import type { Spiderling } from '@/entities/Spiderling';
import type { CocoonConfig } from '@/systems/Cocoons';
import { cocoonBlastCatches } from '@/systems/Cocoons';
import { scaleForFloor } from '@/systems/CombatMath';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

export interface CocoonDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly config: CocoonConfig;
  readonly rng: Rng;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly player: Player;
  readonly effects: CombatEffects;
  readonly decals: CombatDecals;
  readonly onPlayerHit: () => void;
}

/** Barwa napisu o spowolnieniu (jak barwa statusu). */
const SLOW_TEXT_COLOR = '#8ad8ff';

/**
 * Kokony leża (krok 23d): rozmieszczenie (czysty planer), budzenie bliskością, telegraf strefy,
 * wybuch spowalniający gracza i wypuszczający pajączka-kamikaze. Cios, strzał i Burzowy pęd
 * rozrywają kokon od razu. Bez kolizji — nie zmienia linii wzroku Kiterów.
 */
export class CocoonManager {
  private cocoons: Array<{ readonly cocoon: Cocoon; readonly gfx: Phaser.GameObjects.Graphics }> = [];
  private readonly swarm: SpiderlingSwarm;
  private readonly spiderling: CocoonConfig['spiderling'];
  /** Kafle kokonów z planu — pajęczyny (krok 23e) trzymają się od nich z daleka. */
  readonly tiles: readonly TilePoint[];

  constructor(private readonly deps: CocoonDeps) {
    this.swarm = new SpiderlingSwarm(deps);
    const { spiderling } = deps.config;
    this.spiderling = { ...spiderling, damage: scaleForFloor(spiderling.damage, deps.floorNumber, ENEMY_SCALING.damagePerFloor) };
    this.tiles = planCocoons(deps.floor, deps.config, deps.rng);
    for (const tile of this.tiles) {
      const at = DungeonView.tileToWorldCenter(tile);
      this.cocoons.push({
        cocoon: new Cocoon(deps.scene, at.x, at.y, deps.config),
        gfx: deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph),
      });
    }
  }

  /** Cele gracza: pajączki z kokonów i całe kokony. */
  private targets(): Array<Cocoon | Spiderling> {
    return [...this.swarm.living, ...this.cocoons.map(({ cocoon }) => cocoon)];
  }

  update(now: number): void {
    const { player } = this.deps;
    const target = player.isDead ? null : { x: player.x, y: player.y };
    this.cocoons = this.cocoons.filter(({ cocoon, gfx }) => {
      if (!cocoon.tick(target, now)) {
        if (Number.isFinite(cocoon.burstAt)) this.drawTelegraph(cocoon, gfx, now);
        return true;
      }
      gfx.destroy();
      this.burst(cocoon, now);
      return false;
    });
    this.swarm.update(now);
  }

  /** Cios gracza — liczba trafionych pajączków (kokon nie liczy się do Wampirzego kła). */
  resolvePlayerMelee(swing: MeleeSwing): number {
    const { hit, killed } = resolveMeleeSwing(swing, this.targets());
    this.swarm.handleKills(killed);
    return hit.filter((t) => !(t instanceof Cocoon)).length;
  }

  resolvePlayerShot(shot: PlayerShot): Cocoon | Spiderling | null {
    const result = resolvePlayerShot(shot, this.targets());
    if (result?.died) this.swarm.handleKills([result.target]);
    return result?.target ?? null;
  }

  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    const { killed } = resolveDashSweep(sweep, this.targets(), alreadyHit);
    this.swarm.handleKills(killed);
  }

  /** Strefa wybuchu w czasie drżenia: ten sam telegraf co wybuch pajączka. */
  private drawTelegraph(cocoon: Cocoon, gfx: Phaser.GameObjects.Graphics, now: number): void {
    const { blastRadius, fuseMs } = this.deps.config;
    drawAreaTelegraph(gfx, {
      center: { x: cocoon.x, y: cocoon.y },
      radius: blastRadius,
      telegraphStartAt: cocoon.burstAt - fuseMs,
      impactAt: cocoon.burstAt,
      damage: 0,
      knockback: 0,
    }, now);
  }

  private burst(cocoon: Cocoon, now: number): void {
    const { config, player, effects } = this.deps;
    const at = { x: cocoon.x, y: cocoon.y };
    cocoon.destroy();
    this.playTear(at);
    effects.impact(at.x, at.y, config.blastRadius);
    if (!player.isDead && cocoonBlastCatches(at, config.blastRadius, player, player.radius) && player.applySlow(config.slow, now)) {
      effects.floatingText(player.x, player.y - 14, 'Spowolnienie', SLOW_TEXT_COLOR);
    }
    for (let i = 0; i < config.spiderlings; i++) this.swarm.spawn(at, this.spiderling, now);
  }

  /** Rozdarcie kokonu; ostatnia klatka (strzępy) zostaje na podłodze jako trwały ślad. */
  private playTear(at: { x: number; y: number }): void {
    const { sheet, burst } = COCOON_VISUAL;
    const sprite = this.deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.deathBurst);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.setDepth(RENDER_DEPTH.combatDecal));
    sprite.play(animationKey(sheet, burst));
  }
}

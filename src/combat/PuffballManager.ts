import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { PUFFBALL_VISUALS, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { drawAreaTelegraph } from '@/effects/AreaTelegraph';
import { planCocoons } from '@/dungeon/CocoonPlanner';
import { DungeonView } from '@/dungeon/DungeonView';
import type { Party } from '@/entities/Party';
import { Puffball } from '@/entities/Puffball';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike } from '@/systems/Sorcery';
import { resolveBeam } from '@/systems/Sorcery';
import type { PuffballConfig } from '@/systems/Puffballs';
import { isInPoisonCloud } from '@/systems/Puffballs';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

export interface PuffballDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly config: PuffballConfig;
  readonly rng: Rng;
  /** Bohaterowie (co-op, etap C0). */
  readonly party: Party;
}

interface Cloud {
  readonly center: Vector2;
  readonly burstAt: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  fading: boolean;
}

/**
 * Purchawki Grzybni (krok 28c): rozmieszczenie (czysty planer kokonów — te same reguły miejsca),
 * budzenie bliskością, telegraf strefy, pęknięcie w trującą chmurę. Chmura to teren: truje gracza,
 * którego środek jest w środku (chroni tylko dash), i po chwili się rozwiewa. Cios, strzał i Burzowy pęd
 * rozrywają purchawkę od razu. Wrogów chmura nie truje — to ich biom.
 */
export class PuffballManager {
  private puffballs: Array<{ readonly puffball: Puffball; readonly gfx: Phaser.GameObjects.Graphics }> = [];
  private clouds: Cloud[] = [];

  constructor(private readonly deps: PuffballDeps) {
    for (const tile of planCocoons(deps.floor, deps.config, deps.rng)) {
      const at = DungeonView.tileToWorldCenter(tile);
      this.puffballs.push({
        puffball: new Puffball(deps.scene, at.x, at.y, deps.config),
        gfx: deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph),
      });
    }
  }

  private targets(): Puffball[] {
    return this.puffballs.map(({ puffball }) => puffball);
  }

  update(now: number): void {
    const { party } = this.deps;
    this.puffballs = this.puffballs.filter(({ puffball, gfx }) => {
      const nearest = party.nearestLiving(puffball);
      const target = nearest ? { x: nearest.x, y: nearest.y } : null;
      if (!puffball.tick(target, now)) {
        if (Number.isFinite(puffball.burstAt)) this.drawTelegraph(puffball, gfx, now);
        return true;
      }
      gfx.destroy();
      this.burst(puffball, now);
      return false;
    });
    this.updateClouds(now);
  }

  /** Cios gracza — purchawki nie liczą się do Wampirzego kła. */
  resolvePlayerMelee(swing: MeleeSwing): number {
    resolveMeleeSwing(swing, this.targets());
    return 0;
  }

  resolvePlayerBeam(beam: BeamStrike): number {
    resolveBeam(beam, this.targets());
    return 0;
  }

  resolvePlayerShot(shot: PlayerShot): Puffball | null {
    return resolvePlayerShot(shot, this.targets())?.target ?? null;
  }

  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    resolveDashSweep(sweep, this.targets(), alreadyHit);
  }

  /** Telegraf: pełny zasięg chmury, ten sam wygląd co strefy kokonu i pajączka. */
  private drawTelegraph(puffball: Puffball, gfx: Phaser.GameObjects.Graphics, now: number): void {
    const { fuseMs, cloud } = this.deps.config;
    drawAreaTelegraph(gfx, {
      center: { x: puffball.x, y: puffball.y },
      radius: cloud.maxRadius,
      telegraphStartAt: puffball.burstAt - fuseMs,
      impactAt: puffball.burstAt,
    }, now);
  }

  private burst(puffball: Puffball, now: number): void {
    const { scene, config } = this.deps;
    const center = { x: puffball.x, y: puffball.y };
    puffball.destroy();
    this.playHusk(center);
    sound.play(SoundCue.OrbSplash, center);

    const { cloud: look } = PUFFBALL_VISUALS[config.look ?? 'puffball'];
    const sprite = scene.add
      .sprite(center.x, center.y, SPRITE_SHEETS[look.sheet].key)
      .setDepth(RENDER_DEPTH.telegraph)
      .setAlpha(look.alpha);
    const growKey = animationKey(look.sheet, look.grow);
    const growFrames = scene.anims.get(growKey)?.frames.length ?? 1;
    // Klatki rozrostu odpowiadają promieniowi chmury (poisonCloudRadius) — tempo z spreadMs.
    sprite.play({ key: growKey, frameRate: (growFrames * 1000) / config.cloud.spreadMs });
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.play(animationKey(look.sheet, look.swirl)));
    this.clouds.push({ center, burstAt: now, sprite, fading: false });
  }

  private updateClouds(now: number): void {
    const { party, config, scene } = this.deps;
    const { durationMs } = config.cloud;
    const { fadeMs } = PUFFBALL_VISUALS[config.look ?? 'puffball'].cloud;
    this.clouds = this.clouds.filter((cloud) => {
      const age = now - cloud.burstAt;
      if (age >= durationMs) {
        cloud.sprite.destroy();
        return false;
      }
      // Rozwiewanie tylko wizualnie: chmura truje do samego końca, więc gaśnie dopiero w ostatnich fadeMs.
      if (!cloud.fading && age >= durationMs - fadeMs) {
        cloud.fading = true;
        scene.tweens.add({ targets: cloud.sprite, alpha: 0, duration: fadeMs });
      }
      for (const player of party.living) {
        if (isInPoisonCloud(config.cloud, cloud.center, cloud.burstAt, player, now)) player.applyAirborneStatus({ poison: config.cloud.poison }, now);
      }
      return true;
    });
  }

  /** Pęknięcie; ostatnia klatka (sflaczała skórka) zostaje na podłodze jako trwały ślad. */
  private playHusk(at: Vector2): void {
    const { sheet, burst } = PUFFBALL_VISUALS[this.deps.config.look ?? 'puffball'];
    const sprite = this.deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.deathBurst);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.setDepth(RENDER_DEPTH.combatDecal));
    sprite.play(animationKey(sheet, burst));
  }
}

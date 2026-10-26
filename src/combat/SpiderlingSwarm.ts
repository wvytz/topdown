import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { AreaStrike, SpiderlingDefinition } from '@/core/bossTypes';
import type { Vector2 } from '@/core/types';
import { SPIDERLING_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { drawAreaTelegraph } from '@/effects/AreaTelegraph';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { CombatDecals } from '@/effects/CombatDecals';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { Spiderling } from '@/entities/Spiderling';
import { knockbackFrom } from '@/systems/CombatMath';
import { isCaughtByGroundArea } from '@/systems/Hurtbox';

export interface SpiderlingSwarmDeps {
  readonly scene: Phaser.Scene;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  /** Bohaterowie (co-op, etap C0): pajączki gonią najbliższego, wybuch rani każdego w zasięgu. */
  readonly party: Party;
  readonly effects: CombatEffects;
  readonly decals: CombatDecals;
  readonly onPlayerHit: (player: Player) => void;
}

/** Plama po zabitym pajączku (kolor chityny Matki Pająków). */
const SPIDERLING_DEATH_COLOR = 0x7a3a4a;

/**
 * Pajączki-kamikaze: pościg, telegraf zapłonu (strefa wybuchu) i wybuch raniący gracza.
 * Wspólne dla wylęgu Matki Pająków (BossFight) i kokonów leża (krok 23d).
 */
export class SpiderlingSwarm {
  private entries: Array<{ readonly spiderling: Spiderling; readonly gfx: Phaser.GameObjects.Graphics }> = [];
  private readonly group: Phaser.Physics.Arcade.Group;

  constructor(private readonly deps: SpiderlingSwarmDeps) {
    this.group = deps.scene.physics.add.group();
    deps.scene.physics.add.collider(this.group, deps.walls);
  }

  get count(): number {
    return this.entries.length;
  }

  /** Żywe pajączki — cele ciosu, strzału i dasha gracza. */
  get living(): Spiderling[] {
    return this.entries.map(({ spiderling }) => spiderling);
  }

  spawn(at: Vector2, definition: SpiderlingDefinition, now: number): void {
    const spiderling = new Spiderling(this.deps.scene, at.x, at.y, definition, now);
    this.group.add(spiderling);
    this.entries.push({ spiderling, gfx: this.deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
  }

  update(now: number): void {
    const { party, onPlayerHit } = this.deps;
    for (const { spiderling, gfx } of [...this.entries]) {
      const target: Vector2 = party.targetPointFor(spiderling);
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
      this.deps.effects.blast(blast.center.x, blast.center.y, blast.radius);
      this.deps.decals.add('scorch', blast.center.x, blast.center.y);
      this.playBurst(blast.center);
      for (const player of party.living) {
        if (!isCaughtByGroundArea(blast.center, blast.radius, player)) continue;
        const hit = { damage: blast.damage, knockback: knockbackFrom(blast.center, player, blast.knockback) };
        if (player.takeHit(hit, now)) onPlayerHit(player);
      }
      this.remove(spiderling, true);
    }
  }

  /** Zabite przez gracza giną bez wybuchu; cele spoza roju są pomijane. */
  handleKills(killed: readonly object[]): void {
    for (const target of killed) if (target instanceof Spiderling) this.remove(target, false);
  }

  /** Wszystkie giną bez wybuchu (np. razem z Matką Pająków). */
  clear(): void {
    for (const { spiderling } of [...this.entries]) this.remove(spiderling, false);
  }

  /** Arkusz wybuchu pajączka (bez kierunków), usuwany po ostatniej klatce. */
  private playBurst(at: Vector2): void {
    const { sheet, animation } = SPIDERLING_VISUAL.burst;
    const sprite = this.deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.deathBurst);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
    sprite.play(animationKey(sheet, animation));
  }

  /** Usuwa pajączka; zabity (nie wybuchły) zostawia plamę. */
  private remove(spiderling: Spiderling, exploded: boolean): void {
    const index = this.entries.findIndex((entry) => entry.spiderling === spiderling);
    if (index < 0) return;
    const [entry] = this.entries.splice(index, 1);
    entry?.gfx.destroy();
    if (!exploded) {
      this.deps.effects.deathBurst(spiderling.x, spiderling.y, SPIDERLING_DEATH_COLOR, spiderling.radius * 1.5);
      sound.play(SoundCue.EnemyDeath, spiderling);
      this.deps.decals.add('splat', spiderling.x, spiderling.y);
    }
    spiderling.destroy();
  }
}

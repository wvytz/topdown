import Phaser from 'phaser';
import type { EnemyVariant } from '@/core/combatTypes';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { LURKER_HIDEOUT_VISUAL, SPRITE_SHEETS } from '@/config/spriteConfig';
import { LurkPhase } from '@/systems/Lurk';
import type { Lurk } from '@/systems/Lurk';

enum HideoutFrame {
  Calm = 0,
  Tell = 1,
  Broken = 2,
}

/**
 * Kryjówka Czyhacza (krok 123): trumna, kokon, pęknięty mur… pod północnym murem. W ukryciu co kilka sekund
 * drgnie i pokaże ślepia (subtelny znak), przy ostrzeżeniu trzęsie się coraz mocniej i błyska na czerwono,
 * po wyskoku zostaje rozbita. Drganie to czysty efekt (Math.random) — nie wpływa na rozgrywkę.
 */
export class LurkHideout {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly row: number;
  private readonly baseX: number;

  constructor(scene: Phaser.Scene, den: { readonly x: number; readonly y: number }, variant: EnemyVariant) {
    this.row = LURKER_HIDEOUT_VISUAL.rows[variant] ?? 0;
    this.baseX = Math.round(den.x);
    // Dół klatki = dół kafla kryjówki (górna część zachodzi na lico muru).
    const bottom = Math.round(den.y + TILE_SIZE / 2);
    this.sprite = scene.add
      .sprite(this.baseX, bottom, SPRITE_SHEETS[LURKER_HIDEOUT_VISUAL.sheet].key, this.frame(HideoutFrame.Calm))
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.shrine);
  }

  update(lurk: Lurk, now: number): void {
    const v = LURKER_HIDEOUT_VISUAL;
    switch (lurk.phase) {
      case LurkPhase.Hidden: {
        const telling = lurk.isTelling(now);
        this.show(telling ? HideoutFrame.Tell : HideoutFrame.Calm, telling ? v.tellJitter : 0);
        this.sprite.clearTint();
        break;
      }
      case LurkPhase.Waking: {
        const jitter = Math.max(1, Math.round(v.warnJitter * lurk.wakeProgress(now) + 0.5));
        this.show(HideoutFrame.Tell, jitter);
        if (Math.floor(now / v.warnFlashMs) % 2 === 0) this.sprite.setTint(v.warnTint);
        else this.sprite.clearTint();
        break;
      }
      case LurkPhase.Out:
        this.show(HideoutFrame.Broken, 0);
        this.sprite.clearTint();
        break;
    }
  }

  private show(frame: HideoutFrame, jitter: number): void {
    this.sprite.setFrame(this.frame(frame));
    const dx = jitter > 0 ? Math.round((Math.random() * 2 - 1) * jitter) : 0;
    this.sprite.setX(this.baseX + dx);
  }

  private frame(frame: HideoutFrame): number {
    return this.row * LURKER_HIDEOUT_VISUAL.columns + frame;
  }
}

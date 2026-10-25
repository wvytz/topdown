import Phaser from 'phaser';
import type { UltimateConfig } from '@/core/heroTypes';
import type { Vector2 } from '@/core/types';
import type { Player } from '@/entities/Player';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { PlayerShotManager, ShotLook } from '@/combat/PlayerShotManager';
import type { OrbSplash } from '@/systems/Sorcery';
import type { AimTarget } from '@/systems/touchAim';
import { nearestInRange } from '@/systems/Ultimate';
import { facingDirection } from '@/systems/Facing';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { ARCHER_ARROW_VISUAL, SPRITE_SHEETS, ULTIMATE_VISUAL, animationKey } from '@/config/spriteConfig';
import { diag } from '@/diagnostics/DiagnosticsHub';

type Totem = Extract<UltimateConfig, { kind: 'totem' }>;

export interface UltimateManagerDeps {
  readonly scene: Phaser.Scene;
  readonly player: Player;
  readonly effects: CombatEffects;
  readonly playerShots: PlayerShotManager;
  /** Wybuch Supernowej: rani wrogów i bossa jak fala uderzeniowa. */
  readonly blast: (strike: OrbSplash) => void;
  /** Cele totemu: żywi, widoczni wrogowie i boss z pomocnikami. */
  readonly targets: () => Iterable<AimTarget>;
  /** Szał zaczął się albo skończył — scena przelicza loadout gracza. */
  readonly onRageChanged: () => void;
  readonly floorNumber: number;
}

/** Stojący totem łucznika. */
interface ActiveTotem {
  readonly config: Totem;
  readonly at: Vector2;
  readonly until: number;
  nextShotAt: number;
  readonly gfx: Phaser.GameObjects.Graphics;
}

/**
 * Ultimate (R, krok 98): skutki w świecie — szał barbarzyńcy (czas i loadout), Supernowa Czarodziejki
 * (wybuch i poświata tarczy), totem łucznika (wabik, który strzela). Pasek mocy i nietykalność trzyma `Player`.
 */
export class UltimateManager {
  private rageUntil: number | null = null;
  private shieldUntil = -Infinity;
  private totem: ActiveTotem | null = null;
  private readonly aura: Phaser.GameObjects.Graphics;

  constructor(private readonly deps: UltimateManagerDeps) {
    this.aura = deps.scene.add.graphics().setDepth(RENDER_DEPTH.groundFlash);
  }

  /** Szał trwa — scena mnoży loadout gracza (`applyRage`). */
  isRaging(now: number): boolean {
    return this.rageUntil !== null && now < this.rageUntil;
  }

  /** Punkt, w który celują wrogowie i bossowie: stojący totem; null — gracz. */
  get aggroTarget(): Vector2 | null {
    return this.totem?.at ?? null;
  }

  use(ultimate: UltimateConfig, now: number): void {
    const { player, effects, scene } = this.deps;
    diag.note('ultimate', { floor: this.deps.floorNumber, kind: ultimate.kind });
    effects.floatingText(player.x, player.y - player.radius - 10, `${ultimate.name}!`, ULTIMATE_VISUAL.text[ultimate.kind]);
    scene.cameras.main.shake(ULTIMATE_VISUAL.shakeMs, ULTIMATE_VISUAL.shakeIntensity);
    switch (ultimate.kind) {
      case 'rage':
        this.rageUntil = now + ultimate.durationMs;
        this.deps.onRageChanged();
        return;
      case 'supernova': {
        const center = { x: player.x, y: player.y };
        this.deps.blast({ center, radius: ultimate.radius, damage: ultimate.damage, knockback: ultimate.knockback, now, source: center, exclude: null });
        effects.nova(center.x, center.y, ultimate.radius);
        this.shieldUntil = now + ultimate.shieldMs;
        return;
      }
      case 'totem':
        this.removeTotem();
        this.totem = {
          config: ultimate,
          at: { x: player.x, y: player.y },
          until: now + ultimate.durationMs,
          nextShotAt: now,
          gfx: scene.add.graphics().setDepth(RENDER_DEPTH.enemy),
        };
        return;
    }
  }

  update(now: number): void {
    if (this.rageUntil !== null && now >= this.rageUntil) {
      this.rageUntil = null;
      this.deps.onRageChanged();
    }
    if (this.deps.player.isDead) {
      this.removeTotem();
      this.shieldUntil = -Infinity;
    }
    this.drawAura(now);
    this.updateTotem(now);
  }

  /** Poświata wokół bohatera: czerwona w szale, błękitna tarcza po Supernowej. */
  private drawAura(now: number): void {
    const { player } = this.deps;
    this.aura.clear();
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    if (this.isRaging(now)) {
      this.aura.lineStyle(2, ULTIMATE_VISUAL.rage, 0.5 + 0.4 * pulse).strokeCircle(player.x, player.y, player.radius + 6 + pulse * 2);
    }
    if (now < this.shieldUntil) {
      this.aura.fillStyle(ULTIMATE_VISUAL.shield, 0.12).fillCircle(player.x, player.y, player.radius + 8);
      this.aura.lineStyle(2, ULTIMATE_VISUAL.shield, 0.6 + 0.3 * pulse).strokeCircle(player.x, player.y, player.radius + 8);
    }
  }

  private updateTotem(now: number): void {
    const totem = this.totem;
    if (!totem) return;
    if (now >= totem.until) {
      this.removeTotem();
      return;
    }
    this.drawTotem(totem, now);
    if (now < totem.nextShotAt) return;
    const target = nearestInRange(totem.at, [...this.deps.targets()], totem.config.range);
    if (!target) return;
    totem.nextShotAt = now + totem.config.shotIntervalMs;
    this.fireFromTotem(totem, target);
  }

  private fireFromTotem(totem: ActiveTotem, target: Vector2): void {
    const { config, at } = totem;
    const origin = { x: at.x, y: at.y - ULTIMATE_VISUAL.totem.height };
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const direction = { x: dx / length, y: dy / length };
    const sheet = ARCHER_ARROW_VISUAL.sheet;
    // Strzały totemu: magia (trafiają upiory), bez statusów i leczenia z przedmiotów.
    const look: ShotLook = {
      texture: SPRITE_SHEETS[sheet].key,
      animation: animationKey(sheet, ARCHER_ARROW_VISUAL.animation, facingDirection(direction) ?? 0),
      status: {},
      vampiric: false,
      magic: true,
    };
    this.deps.playerShots.fire(
      origin,
      direction,
      { damage: config.damage, knockback: config.knockback, projectileSpeed: config.speed, projectileLifetimeMs: config.lifetimeMs, projectileRadius: 4 },
      this.deps.player.effects,
      look,
    );
  }

  /** Totem (placeholder geometryczny): drewniany słup z jarzącym się okiem i pierścieniem wabika. */
  private drawTotem(totem: ActiveTotem, now: number): void {
    const { gfx, at, until, config } = totem;
    const v = ULTIMATE_VISUAL.totem;
    const left = Math.max(0, (until - now) / config.durationMs);
    const pulse = 0.5 + 0.5 * Math.sin(now / 120);
    gfx.clear();
    gfx.lineStyle(1, v.glow, 0.25 + 0.25 * pulse).strokeCircle(at.x, at.y, 14 + pulse * 6);
    gfx.fillStyle(0x000000, 0.35).fillEllipse(at.x, at.y + 2, 16, 6);
    gfx.fillStyle(v.wood, 1).fillRect(at.x - 4, at.y - v.height, 8, v.height);
    gfx.fillStyle(v.woodDark, 1).fillRect(at.x - 4, at.y - v.height + 6, 8, 2).fillRect(at.x - 4, at.y - v.height + 13, 8, 2);
    gfx.fillStyle(v.glow, 0.6 + 0.4 * pulse).fillCircle(at.x, at.y - v.height, 3);
    // Ile zostało: cienki pasek pod totemem.
    gfx.fillStyle(0x000000, 0.6).fillRect(at.x - 9, at.y + 6, 18, 2);
    gfx.fillStyle(v.glow, 1).fillRect(at.x - 9, at.y + 6, 18 * left, 2);
  }

  private removeTotem(): void {
    this.totem?.gfx.destroy();
    this.totem = null;
  }

  destroy(): void {
    this.removeTotem();
    this.aura.destroy();
  }
}

import Phaser from 'phaser';
import type { HeroId } from '@/core/heroTypes';
import type { ScaleSnapshot } from '@/core/combatWeightTypes';
import { COMBAT_WEIGHT_CONFIG } from '@/config/combatWeightConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SoundCue, sound } from '@/audio/SoundBoard';
import type { Player } from '@/entities/Player';
import { HERO_COLORS } from '@/systems/HeroColors';
import { type UiText, uiText } from '@/ui/UiText';

const TIER_CUES = [SoundCue.StreakTier1, SoundCue.StreakTier2, SoundCue.StreakTier3] as const;
/** Podskok licznika po wejściu na próg (ms, px). */
const POP_MS = 160;
const POP_PX = 3;
/** Rozsypany licznik: opada i gaśnie. */
const SHATTER_MS = 420;

/**
 * Sygnalizacja Szali przy bohaterze (krok U11a, wersja lekka systemu wag): licznik Passy „×8” obok postaci
 * (biel → złoto → barwa klasy na III, podskok i ton na progach, rozsypuje się po utracie) i 1–3 czerwone rysy
 * na obrysie bohatera (pęknięcia; pulsują szybciej z każdym, przy III niski puls). Bez HUD-u i bez krwi:
 * wszystko przy postaci, w co-opie każdy bohater ma własne.
 */
export class WeightFx {
  private readonly counter: UiText;
  private readonly cracks: Phaser.GameObjects.Graphics;
  private last: ScaleSnapshot = { streak: 0, tier: 0, cracks: 0 };
  private popUntil = 0;
  private counterColor: string = COMBAT_WEIGHT_CONFIG.visual.counterColors[0];
  private readonly classCss: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    hero: HeroId,
  ) {
    this.classCss = HERO_COLORS[hero].css;
    this.counter = uiText(scene, player.x, player.y, '', { color: COMBAT_WEIGHT_CONFIG.visual.counterColors[0] })
      .setOrigin(0, 1)
      .setDepth(RENDER_DEPTH.worldText)
      .setVisible(false);
    this.cracks = scene.add.graphics().setDepth(RENDER_DEPTH.combatFx);
  }

  update(now: number): void {
    const snap = this.player.weights.snapshot();
    const { visual } = COMBAT_WEIGHT_CONFIG;
    if (snap.tier > this.last.tier) {
      this.popUntil = now + POP_MS;
      sound.play(TIER_CUES[snap.tier - 1] ?? SoundCue.StreakTier3, this.player);
    }
    if (snap.streak < this.last.streak && snap.tier < this.last.tier && this.counter.visible) this.shatter();
    if (snap.cracks >= COMBAT_WEIGHT_CONFIG.cracks.max && this.last.cracks < snap.cracks) sound.play(SoundCue.CrackPulse, this.player);
    this.last = snap;

    const alive = !this.player.isDead && this.player.visible;
    const showCounter = alive && snap.streak >= visual.counterFrom;
    this.counter.setVisible(showCounter);
    if (showCounter) {
      const color = snap.tier >= 3 ? this.classCss : visual.counterColors[Math.min(snap.tier, 2)]!;
      this.counterColor = color;
      this.counter.setText(`×${snap.streak}`).setColor(color).setFontSize(snap.tier >= 3 ? 2 : 1);
      const pop = now < this.popUntil ? POP_PX : 0;
      this.counter.setPosition(Math.round(this.player.x + visual.counterOffset.x), Math.round(this.player.y + visual.counterOffset.y - pop));
    }
    this.drawCracks(alive ? snap.cracks : 0, now);
  }

  /** Utracona Passa: kopia licznika opada i gaśnie. */
  private shatter(): void {
    const ghost = uiText(this.scene, this.counter.x, this.counter.y, this.counter.text, { color: this.counterColor, size: this.counter.fontSize >= 2 ? 2 : 1 })
      .setOrigin(0, 1)
      .setDepth(RENDER_DEPTH.worldText);
    this.scene.tweens.add({ targets: ghost, y: ghost.y + 8, alpha: 0, duration: SHATTER_MS, onComplete: () => ghost.destroy() });
  }

  /** Rysy-zygzaki na obrysie bohatera; pulsują tym szybciej, im więcej pęknięć. */
  private drawCracks(count: number, now: number): void {
    const gfx = this.cracks;
    gfx.clear();
    if (count <= 0) return;
    const { visual } = COMBAT_WEIGHT_CONFIG;
    const period = visual.crackPulseMs[Math.min(count, visual.crackPulseMs.length) - 1] ?? 600;
    const alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((now / period) * Math.PI * 2));
    const { x, y } = this.player;
    for (let i = 0; i < count; i++) {
      const deg = visual.crackAnglesDeg[i % visual.crackAnglesDeg.length]!;
      const points = crackPoints(x, y, Phaser.Math.DegToRad(deg), visual.crackRadius, visual.crackLength);
      gfx.lineStyle(3, visual.crackOutline, alpha * 0.8).strokePoints(points, false);
      gfx.lineStyle(1, visual.crackColor, alpha).strokePoints(points, false);
    }
  }

  destroy(): void {
    this.counter.destroy();
    this.cracks.destroy();
  }
}

/** Zygzak rysy: od obrysu na zewnątrz, z dwoma załamaniami w poprzek. */
function crackPoints(cx: number, cy: number, angle: number, radius: number, length: number): Phaser.Math.Vector2[] {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const at = (along: number, side: number): Phaser.Math.Vector2 =>
    new Phaser.Math.Vector2(Math.round(cx + dx * along + nx * side), Math.round(cy + dy * along + ny * side));
  return [at(radius - length / 2, 0), at(radius - length / 6, 2), at(radius + length / 6, -2), at(radius + length / 2, 0)];
}

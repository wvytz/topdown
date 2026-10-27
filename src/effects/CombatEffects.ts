import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { AREA_TELEGRAPH_VISUAL, BLAST_VISUAL, NOVA_VISUAL, ORB_SPLASH_VISUAL } from '@/config/spriteConfig';
import { exposedArcs } from '@/systems/AreaOutline';
import type { OutlineCircle } from '@/systems/AreaOutline';

/** Wygląd wybuchu: domyślny ogień (`BLAST_VISUAL`) albo inna paleta o tym samym układzie (zarodniki, krok 111). */
type BlastVisual = {
  readonly frameMs: number;
  readonly frames: readonly { readonly fill: number; readonly fillAlpha: number; readonly ring: number; readonly ringWidth: number; readonly ringAlpha: number; readonly sparks: number }[];
  readonly sparkColor: number;
  readonly sparkSize: number;
  readonly sparkReach: number;
};

/** Krótkie, czysto wizualne efekty walki (bez wpływu na logikę). */
export class CombatEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  slash(x: number, y: number, angle: number, range: number, arcRadians: number): void {
    const g = this.scene.add.graphics().setDepth(RENDER_DEPTH.slash);
    g.fillStyle(0xffffff, 0.35);
    g.slice(x, y, range, angle - arcRadians / 2, angle + arcRadians / 2, false);
    g.fillPath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
  }

  deathBurst(x: number, y: number, color: number, radius: number): void {
    const circle = this.scene.add.circle(x, y, radius, color, 0.8).setDepth(RENDER_DEPTH.deathBurst);
    this.scene.tweens.add({
      targets: circle,
      scale: 2.2,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => circle.destroy(),
    });
  }

  /** Błysk uderzenia strefy obszarowej. */
  impact(x: number, y: number, radius: number): void {
    const circle = this.scene.add.circle(x, y, radius, 0xffd0a0, 0.45).setDepth(RENDER_DEPTH.groundFlash);
    this.scene.tweens.add({ targets: circle, alpha: 0, duration: 180, onComplete: () => circle.destroy() });
  }

  /**
   * Wybuch strefy obrażeń (krok 110): klatki skokowo co `frameMs` — biały błysk do samego brzegu, ogień,
   * pierścień fali i iskry. Wszystko w promieniu `radius`, czyli dokładnie tam, gdzie wybuch rani.
   * `group` — strefy tego samego ataku (hak, smuga): pierścień tylko na zewnętrznym brzegu ich sumy.
   * `v` — paleta wybuchu (krok 111: strąki zarodników Pożeracza wybuchają sokiem).
   */
  blast(x: number, y: number, radius: number, group: readonly OutlineCircle[] = [], v: BlastVisual = BLAST_VISUAL): void {
    // Wybuch zawsze rani — dźwięk razem z obrazem (krok 116).
    sound.play(SoundCue.Explosion, { x, y });
    const g = this.scene.add.graphics().setDepth(RENDER_DEPTH.groundFlash);
    const cx = Math.round(x);
    const cy = Math.round(y);
    const r = Math.max(2, Math.round(radius));
    // Kierunki iskier losowane raz na wybuch (efekt czysto wizualny — Math.random wolno).
    const arcs = group.length > 1 ? exposedArcs({ center: { x, y }, radius }, group, AREA_TELEGRAPH_VISUAL.outlineSegments) : [{ start: 0, end: Math.PI * 2 }];
    const sparks = Array.from({ length: Math.max(...v.frames.map((f) => f.sparks)) }, () => ({
      angle: Math.random() * Math.PI * 2,
      reach: 0.45 + Math.random() * 0.55,
    }));
    const draw = (index: number): void => {
      const frame = v.frames[index];
      g.clear();
      if (!frame) return;
      // Iskry wylatują z kolejnymi klatkami coraz dalej, ale nie dalej niż `sparkReach` promienia.
      const travel = (index + 1) / v.frames.length;
      g.fillStyle(frame.fill, frame.fillAlpha).fillCircle(cx, cy, r);
      const half = frame.ringWidth / 2;
      g.lineStyle(frame.ringWidth, frame.ring, frame.ringAlpha);
      for (const arc of arcs) g.beginPath().arc(cx, cy, r - half, arc.start, arc.end).strokePath();
      g.fillStyle(v.sparkColor, 1);
      for (const spark of sparks.slice(0, frame.sparks)) {
        const d = Math.min(r * v.sparkReach, r * spark.reach * travel) - v.sparkSize / 2;
        const px = Math.round(cx + Math.cos(spark.angle) * d - v.sparkSize / 2);
        const py = Math.round(cy + Math.sin(spark.angle) * d - v.sparkSize / 2);
        g.fillRect(px, py, v.sparkSize, v.sparkSize);
      }
    };
    draw(0);
    let index = 0;
    this.scene.time.addEvent({
      delay: v.frameMs,
      repeat: v.frames.length - 1,
      callback: () => {
        index++;
        if (index >= v.frames.length) g.destroy();
        else draw(index);
      },
    });
  }

  /** Rozprysk kuli Czarodziejki (krok 50): pierścień energii w promieniu rozprysku, szybko gaśnie. */
  splash(x: number, y: number, radius: number): void {
    const { color, alpha, fillAlpha, durationMs } = ORB_SPLASH_VISUAL;
    const ring = this.scene.add.circle(x, y, radius, color, fillAlpha).setStrokeStyle(2, color, alpha).setDepth(RENDER_DEPTH.groundFlash);
    this.scene.tweens.add({ targets: ring, alpha: 0, scale: 1.15, duration: durationMs, onComplete: () => ring.destroy() });
  }

  /** Fala uderzeniowa Czarodziejki (krok 97): pierścień rozchodzi się od niej do promienia fali. */
  nova(x: number, y: number, radius: number): void {
    const { color, core, alpha, fillAlpha, startScale, durationMs } = NOVA_VISUAL;
    const ring = this.scene.add.circle(x, y, radius, color, fillAlpha).setStrokeStyle(3, core, alpha).setDepth(RENDER_DEPTH.groundFlash);
    ring.setScale(startScale);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: durationMs, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }

  /** Unoszący się napis (np. „+3” złota) nad miejscem zdarzenia. */
  floatingText(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add
      .text(x, y - 8, text, { fontFamily: 'monospace', fontSize: '11px', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(RENDER_DEPTH.worldText);
    this.scene.tweens.add({ targets: label, y: y - 30, alpha: 0, duration: 700, onComplete: () => label.destroy() });
  }

  /**
   * Okrzyk nad postacią (sprzątaczki, krok 125): większy napis z obrysem, trzyma się `holdMs`, potem unosi i gaśnie.
   */
  shout(x: number, y: number, text: string, color: string, holdMs: number, riseMs: number): Phaser.GameObjects.Text {
    const label = this.scene.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.worldText);
    this.scene.tweens.add({ targets: label, y: y - 14, alpha: 0, delay: holdMs, duration: riseMs, onComplete: () => label.destroy() });
    return label;
  }

  playerHit(): void {
    this.scene.cameras.main.shake(100, 0.004);
  }
}

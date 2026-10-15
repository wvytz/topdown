import Phaser from 'phaser';
import type { EliteAffix } from '@/core/combatTypes';
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { ELITE_VISUAL, SHIELD_ARC_VISUAL } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { eliteTitle } from '@/systems/Elites';
import { pixelEllipse } from '@/systems/lighting';
import { LIGHT_VISIBILITY_KEY } from '@/effects/EnemyVisibility';

export interface EliteMarkerOwner extends Phaser.GameObjects.Sprite {
  readonly radius: number;
  /** Kąt tarczy (radiany) albo null, gdy elita jej nie ma. */
  readonly shieldAngle: number | null;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** Pierścień z pikseli (obwódka elipsy o grubości `thickness`), biały — barwi go tint. */
function ringTexture(scene: Phaser.Scene, size: number, thickness: number): string {
  const key = `tex-elite-ring-${size}-${thickness}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, size, size);
  const ctx = texture?.getContext();
  if (!texture || !ctx) throw new Error('EliteMarker: nie udało się utworzyć tekstury pierścienia.');
  const outer = pixelEllipse(size, size);
  const innerSize = size - thickness * 2;
  const inner = pixelEllipse(innerSize, innerSize);
  const image = ctx.createImageData(size, size);
  outer.forEach((inside, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    const ix = x - thickness;
    const iy = y - thickness;
    const inInner = ix >= 0 && iy >= 0 && ix < innerSize && iy < innerSize && inner[iy * innerSize + ix] === 1;
    const on = inside === 1 && !inInner;
    image.data.set([255, 255, 255, on ? 255 : 0], i * 4);
  });
  ctx.putImageData(image, 0, 0);
  texture.refresh();
  return key;
}

/**
 * Oznaczenie elity (krok 42): pulsujący pierścień w kolorze cechy pod stopami, nazwa cech nad głową
 * i łuk tarczy u Tarczownika. Wszystko gaśnie razem z wrogiem w mroku (alfa widoczności z kroku 30).
 */
export function attachEliteMarker(owner: EliteMarkerOwner, affixes: readonly EliteAffix[]): void {
  const scene = owner.scene;
  const { ringGap, ringThickness, ringAlpha, pulseMs, labelOffset, fontSize } = ELITE_VISUAL;
  const colors = affixes.map((a) => ELITE_CONFIG.affixes[a].color);
  const size = (owner.radius + ringGap) * 2;
  const ring = scene.add
    .image(owner.x, owner.y, ringTexture(scene, size, ringThickness))
    .setDepth(RENDER_DEPTH.groundFlash)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(colors[0]!);
  const label = scene.add
    .text(owner.x, owner.y, eliteTitle(affixes, ELITE_CONFIG), {
      fontFamily: 'monospace',
      fontSize: `${fontSize}px`,
      color: hex(colors[0]!),
      stroke: '#1b1a22',
      strokeThickness: 3,
    })
    .setOrigin(0.5, 1)
    .setDepth(RENDER_DEPTH.worldText);
  const arc = owner.shieldAngle !== null ? scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) : null;

  const sync = () => {
    const now = scene.time.now;
    const visibility = (owner.getData(LIGHT_VISIBILITY_KEY) as number | undefined) ?? 1;
    const alpha = owner.visible ? visibility : 0;
    // Kilka cech: pierścień zmienia kolor co puls (skokowo, bez mieszania barw).
    const pulse = Math.floor(now / pulseMs);
    ring.setTint(colors[pulse % colors.length]!);
    const breath = 0.75 + 0.25 * Math.sin((now / pulseMs) * Math.PI);
    ring.setPosition(Math.round(owner.x), Math.round(owner.y + owner.radius * 0.4)).setAlpha(alpha * ringAlpha * breath);
    label.setPosition(Math.round(owner.x), Math.round(owner.y - owner.radius - labelOffset)).setAlpha(alpha);
    if (arc) {
      arc.clear();
      const angle = owner.shieldAngle;
      if (angle !== null && alpha > 0) {
        const half = (ELITE_CONFIG.shield.arcDeg * Math.PI) / 360;
        arc.lineStyle(SHIELD_ARC_VISUAL.width, ELITE_CONFIG.affixes.shielded.color, SHIELD_ARC_VISUAL.alpha * 1.4 * alpha).beginPath();
        arc.arc(owner.x, owner.y, owner.radius + SHIELD_ARC_VISUAL.gap, angle - half, angle + half);
        arc.strokePath();
      }
    }
  };
  sync();
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
  owner.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
    ring.destroy();
    label.destroy();
    arc?.destroy();
  });
}

import type Phaser from 'phaser';
import type { LightStamp } from '@/systems/lighting';

/**
 * Tekstura ze stempla światła (czysta logika: systems/lighting): kolor `rgb`, alfa z pasm.
 * Tworzona raz na klucz — kolejne wywołania zwracają istniejącą.
 */
export function stampTexture(scene: Phaser.Scene, key: string, build: () => LightStamp, rgb: number): string {
  if (scene.textures.exists(key)) return key;
  const stamp = build();
  const texture = scene.textures.createCanvas(key, stamp.size, stamp.size);
  const ctx = texture?.getContext();
  if (!texture || !ctx) throw new Error(`stampTexture: nie udało się utworzyć tekstury „${key}”.`);
  const image = ctx.createImageData(stamp.size, stamp.size);
  const [r, g, b] = [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
  for (let i = 0; i < stamp.alpha.length; i++) {
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = stamp.alpha[i]!;
  }
  ctx.putImageData(image, 0, 0);
  texture.refresh();
  return key;
}

/** Kolor z zapisu „#rrggbb” (kolory palety z JSON-a arkusza). */
export function hexColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

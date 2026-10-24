import Phaser from 'phaser';
import { HERO_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import type { HeroId } from '@/core/heroTypes';

/** Kadr miniaturki: kierunek w arkuszu, wycinek klatki i bok kwadratu w pikselach ekranu. */
export interface HeroIconSpec {
  readonly facing: number;
  readonly crop: { readonly x: number; readonly y: number; readonly size: number };
  readonly sizePx: number;
}

/**
 * Miniaturka bohatera (krok 89a; od kroku 94 też na ekranie startowym): pierwsza klatka chodu, kadrowana
 * i zmniejszona z wygładzaniem (zwykłe skalowanie najbliższym sąsiadem gubiłoby co drugi piksel).
 * Tekstura powstaje raz na bohatera i rozmiar; zwraca jej klucz.
 */
export function heroIconTexture(scene: Phaser.Scene, hero: HeroId, spec: HeroIconSpec): string {
  const key = `hero-icon-${hero}-${spec.sizePx}`;
  const textures = scene.textures;
  if (textures.exists(key)) return key;
  const sheet = SPRITE_SHEETS[HERO_VISUALS[hero].sheet];
  // Bez arkusza zostaje pusta tekstura (nic nie widać), a nie znacznik brakującej tekstury.
  const canvas = textures.createCanvas(key, spec.sizePx, spec.sizePx);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx || !textures.exists(sheet.key)) return key;
  const source = textures.get(sheet.key).getSourceImage() as CanvasImageSource;
  const { x, y, size } = spec.crop;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, x, spec.facing * sheet.frameHeight + y, size, size, 0, 0, spec.sizePx, spec.sizePx);
  canvas.refresh();
  return key;
}

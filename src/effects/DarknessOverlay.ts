import type Phaser from 'phaser';

/** Bok tekstury — z zapasem pokrywa widok kamery (960×540 przy zoomie 1.5) w każdym położeniu gracza. */
const SIZE = 1800;
const DEPTH = 15;
const OUTER_ALPHA = 0.94;
/** Szerokość miękkiego przejścia na krawędzi widocznego kręgu (ułamek promienia). */
const SOFT_EDGE = 0.45;

/**
 * Mrok (modyfikator piętra): ciemność z miękkim kręgiem widoczności wokół gracza.
 * Czysto wizualny — nie zmienia zasad gry. Tekstura generowana raz na promień.
 */
export class DarknessOverlay {
  private readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, radius: number) {
    const key = `tex-darkness-${radius}`;
    if (!scene.textures.exists(key)) {
      const texture = scene.textures.createCanvas(key, SIZE, SIZE);
      const ctx = texture?.getContext();
      if (!texture || !ctx) throw new Error('DarknessOverlay: nie udało się utworzyć tekstury.');
      const c = SIZE / 2;
      const gradient = ctx.createRadialGradient(c, c, radius * (1 - SOFT_EDGE), c, c, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${OUTER_ALPHA})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, SIZE, SIZE);
      texture.refresh();
    }
    this.image = scene.add.image(0, 0, key).setDepth(DEPTH);
  }

  follow(target: { x: number; y: number }): void {
    this.image.setPosition(target.x, target.y);
  }
}

import Phaser from 'phaser';
import type { MirrorFloorConfig } from '@/config/lightingConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { TILE_SIZE } from '@/config/gameConfig';
import { animationKey, SPRITE_SHEETS } from '@/config/spriteConfig';
import { TileType, type DungeonFloor } from '@/core/dungeonTypes';

/** Głębokości postaci, które odbijają się w posadzce (wrogowie, bossowie, bohaterowie). */
const REFLECTED_DEPTHS = new Set<number>([RENDER_DEPTH.enemy, RENDER_DEPTH.boss, RENDER_DEPTH.player]);
/** Odbicia między cieniami środowiska a cieniami postaci — mury (depth 3) je zasłaniają, więc są tylko na podłodze. */
const REFLECTION_DEPTH = RENDER_DEPTH.envShadow + 0.3;

/**
 * Lustrzana posadzka (krok 124, `#lustrzana-komnata`): każda postać ma pod stopami swoją kopię odwróconą w pionie,
 * z tą samą klatką animacji, a po podłodze w kadrze migają błyski polerowania — nad mrokiem, więc posadzka świeci.
 * Czysto wizualne (Math.random dozwolony): po fizyce (POST_UPDATE) kopiuje stan sprite'ów.
 */
export class MirrorFloor {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly glints: Phaser.GameObjects.Sprite[] = [];
  private nextGlintAt = 0;
  private readonly bottoms = new Map<string, number>();
  private probe: HTMLCanvasElement | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly floor: DungeonFloor,
    private readonly config: MirrorFloorConfig,
  ) {
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this));
  }

  private update(time: number): void {
    this.reflect();
    if (time >= this.nextGlintAt) {
      const { min, max } = this.config.glints.intervalMs;
      this.nextGlintAt = time + min + Math.random() * (max - min);
      this.spawnGlint();
    }
  }

  private reflect(): void {
    const { alphaNear, alphaFar, tint } = this.config.reflection;
    const view = this.scene.cameras.main.worldView;
    let used = 0;
    for (const child of this.scene.children.list) {
      if (!(child instanceof Phaser.GameObjects.Sprite) || !child.visible || child.alpha <= 0) continue;
      if (!REFLECTED_DEPTHS.has(child.depth)) continue;
      // Tylko postacie z ciałem fizycznym (bez efektów na tych samych głębokościach).
      if (!child.body) continue;
      // Oś odbicia na dolnej krawędzi narysowanej postaci (od ciała fizycznego odbicie odstawało albo chowało się pod nią).
      const feetY = Math.round(child.y + (this.visibleBottom(child.frame) - child.displayOriginY) * child.scaleY);
      if (feetY < view.y - 64 || feetY > view.bottom + 64 || child.x < view.x - 64 || child.x > view.right + 64) continue;
      const image = this.pool[used] ?? this.addImage();
      used++;
      image
        .setTexture(child.texture.key, child.frame.name)
        .setOrigin(child.originX, child.originY)
        .setScale(child.scaleX, child.scaleY)
        .setFlip(child.flipX, !child.flipY)
        .setRotation(-child.rotation)
        .setPosition(child.x, 2 * feetY - child.y)
        .setTint(tint)
        .setVisible(true);
      // Przy flipY Phaser zamienia rogi quada: „dolne” leżą przy stopach, „górne” — na końcu odbicia.
      const a = child.alpha;
      image.setAlpha(alphaFar * a, alphaFar * a, alphaNear * a, alphaNear * a);
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.setVisible(false);
  }

  /** Dolny nieprzezroczysty wiersz klatki (+1), liczony raz na klatkę. */
  private visibleBottom(frame: Phaser.Textures.Frame): number {
    const key = `${frame.texture.key}:${frame.name}`;
    const cached = this.bottoms.get(key);
    if (cached !== undefined) return cached;
    // Jedno rysowanie klatki na płótno i odczyt całego obrazu (getPixelAlpha rysuje osobno każdy piksel).
    const { cutX, cutY, cutWidth: w, cutHeight: h } = frame;
    const canvas = this.probe ?? (this.probe = document.createElement('canvas'));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let bottom = h;
    if (ctx) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(frame.source.image as CanvasImageSource, cutX, cutY, w, h, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      search: for (let y = h - 1; y >= 0; y--) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3]! > 0) {
            bottom = y + 1;
            break search;
          }
        }
      }
    }
    this.bottoms.set(key, bottom);
    return bottom;
  }

  private addImage(): Phaser.GameObjects.Image {
    const image = this.scene.add.image(0, 0, '__DEFAULT').setDepth(REFLECTION_DEPTH);
    this.pool.push(image);
    return image;
  }

  /** Błysk na losowym kaflu podłogi w kadrze. */
  private spawnGlint(): void {
    if (this.glints.length >= this.config.glints.maxAlive) return;
    const view = this.scene.cameras.main.worldView;
    const tx = Math.floor((view.x + Math.random() * view.width) / TILE_SIZE);
    const ty = Math.floor((view.y + Math.random() * view.height) / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.floor.width || ty >= this.floor.height) return;
    if (this.floor.tiles[ty * this.floor.width + tx] !== TileType.Floor) return;
    const x = tx * TILE_SIZE + 4 + Math.random() * (TILE_SIZE - 8);
    const y = ty * TILE_SIZE + 4 + Math.random() * (TILE_SIZE - 8);
    const glint = this.scene.add
      .sprite(Math.round(x), Math.round(y), SPRITE_SHEETS.polishSparkle.key, 0)
      .setDepth(RENDER_DEPTH.torchGlow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(this.config.glints.alpha);
    this.glints.push(glint);
    glint.play(animationKey('polishSparkle', 'twinkle'));
    glint.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.glints.splice(this.glints.indexOf(glint), 1);
      glint.destroy();
    });
  }
}

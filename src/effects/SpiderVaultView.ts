import type Phaser from 'phaser';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SPIDER_VAULT_ART, SPIDER_VAULT_VISUAL } from '@/config/spiderVaultConfig';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { SecretArea } from '@/dungeon/SecretRoom';
import type { SpiderVaultDecor, SpiderVaultLayout, VaultDecal, VaultPedestal } from '@/dungeon/SpiderVault';
import { threadPixels } from '@/dungeon/SpiderVault';
import type { PointLight } from '@/effects/LightingOverlay';

const DRIP_ANIM = { pedestal: 'vault-pedestal-drip', grand: 'vault-pedestal-grand-drip' } as const;

/** Ładowane raz w BootScene: arkusze skarbca z `tools/spider_vault_sprites.py`. */
export function loadSpiderVaultArt(scene: Phaser.Scene): void {
  const { dir, ...sheets } = SPIDER_VAULT_ART;
  for (const s of Object.values(sheets)) scene.load.spritesheet(s.key, `${dir}/${s.key}.png`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
}

/** Animacje kropli śluzu na piedestałach (BootScene.create). */
export function registerSpiderVaultAnimations(scene: Phaser.Scene): void {
  for (const [anim, sheet] of [
    [DRIP_ANIM.pedestal, SPIDER_VAULT_ART.pedestal],
    [DRIP_ANIM.grand, SPIDER_VAULT_ART.grand],
  ] as const) {
    if (scene.anims.exists(anim)) continue;
    scene.anims.create({ key: anim, frames: scene.anims.generateFrameNumbers(sheet.key, { start: 0, end: sheet.frames - 1 }), frameRate: SPIDER_VAULT_VISUAL.dripFps, repeat: -1 });
  }
}

/**
 * Skarbiec pająków (krok U4d): rysuje oplot i piedestały zaplanowane w czystym `dungeon/SpiderVault.ts`,
 * gdy ukryta komnata się odsłoni. Wszystko bez kolizji. Nici rasteryzujemy raz do jednej tekstury
 * (piksel w piksel, z cieniem na posadzce), więc skarbiec kosztuje kilkadziesiąt obrazków bez pracy co klatkę.
 */
export class SpiderVaultView {
  readonly lights: readonly PointLight[];
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly threadKey: string;

  constructor(
    private readonly scene: Phaser.Scene,
    floor: DungeonFloor,
    area: SecretArea,
    private readonly layout: SpiderVaultLayout,
    decor: SpiderVaultDecor,
  ) {
    const T = TILE_SIZE;
    const V = SPIDER_VAULT_VISUAL;
    const A = SPIDER_VAULT_ART;
    for (const d of decor.silk) this.decal(A.silk.key, d, Math.round(d.at.x * T), Math.round(d.at.y * T), 0.5, 0.5, RENDER_DEPTH.vaultFloor);
    for (const d of decor.slime) this.decal(A.slime.key, d, Math.round(d.at.x * T), Math.round(d.at.y * T), 0.5, 0.5, RENDER_DEPTH.vaultFloor + 0.01);
    for (const c of decor.corners) {
      const web = scene.add
        .image(c.at.x * T, c.at.y * T, A.cornerWeb.key, 0)
        .setOrigin(c.flipX ? 1 : 0, c.flipY ? 1 : 0)
        .setFlip(c.flipX, c.flipY)
        .setDepth(RENDER_DEPTH.vaultFloor + 0.02);
      this.objects.push(web);
    }
    for (const d of decor.husks) this.decal(A.husk.key, d, d.at.x * T, d.at.y * T, 0.5, 0.5, RENDER_DEPTH.vaultThreads + 0.01);
    for (const d of decor.curtains) this.decal(A.curtain.key, d, d.at.x * T, (d.at.y + 1) * T - V.curtainTop, 0, 0, RENDER_DEPTH.wallDecor);

    this.threadKey = `vault-threads-${floor.seed}-${area.room.id}`;
    this.drawThreads(area, decor);

    const lights: PointLight[] = [];
    layout.pedestals.forEach((p) => {
      const sheet = p.grand ? A.grand : A.pedestal;
      const foot = this.footY(p);
      const sprite = scene.add.sprite(p.at.x * T, foot, sheet.key, 0).setOrigin(0.5, 1).setDepth(RENDER_DEPTH.vaultProp);
      // Math.random — przesunięcie animacji to efekt czysto wizualny.
      sprite.play({ key: p.grand ? DRIP_ANIM.grand : DRIP_ANIM.pedestal, startFrame: Math.floor(Math.random() * sheet.frames) });
      this.objects.push(sprite);
      lights.push({ x: p.at.x * T, y: foot - sheet.frameHeight / 2, radius: p.grand ? V.grandLightRadius : V.lightRadius });
    });
    this.lights = lights;
  }

  /** Miejsce kokonu na piedestale `index` (px świata): w gnieździe z jedwabiu na kapitelu. */
  cocoonSpot(index: number): { x: number; y: number } {
    const p = this.layout.pedestals[index]!;
    const sheet = p.grand ? SPIDER_VAULT_ART.grand : SPIDER_VAULT_ART.pedestal;
    return { x: p.at.x * TILE_SIZE, y: this.footY(p) - sheet.frameHeight - SPIDER_VAULT_VISUAL.cocoonAboveTop };
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
    if (this.scene.textures.exists(this.threadKey)) this.scene.textures.remove(this.threadKey);
  }

  private footY(p: VaultPedestal): number {
    return p.at.y * TILE_SIZE + (p.grand ? SPIDER_VAULT_VISUAL.grandFoot : SPIDER_VAULT_VISUAL.pedestalFoot);
  }

  private decal(key: string, d: VaultDecal, x: number, y: number, ox: number, oy: number, depth: number): void {
    const img = this.scene.add.image(x, y, key, d.variant).setOrigin(ox, oy).setDepth(depth);
    // Phaser odbija klatkę w jej własnych granicach, więc obrazek zostaje na swoim kaflu.
    if (d.flipX || d.flipY) img.setFlip(d.flipX, d.flipY);
    this.objects.push(img);
  }

  /** Nici do jednej tekstury nad obszarem komnaty (z zapasem kafla): najpierw cienie, potem nici z połyskiem. */
  private drawThreads(area: SecretArea, decor: SpiderVaultDecor): void {
    const T = TILE_SIZE;
    const V = SPIDER_VAULT_VISUAL;
    const r = area.room;
    const ox = (r.x - 1) * T;
    const oy = (r.y - 1) * T;
    const w = (r.width + 2) * T;
    const h = (r.height + 2) * T;
    if (this.scene.textures.exists(this.threadKey)) this.scene.textures.remove(this.threadKey);
    const canvas = this.scene.textures.createCanvas(this.threadKey, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
    const lines = decor.threads.map((t) =>
      threadPixels({ x: t.from.x * T - ox, y: t.from.y * T - oy }, { x: t.to.x * T - ox, y: t.to.y * T - oy }, t.sag * T),
    );
    // Cień ze stałą alfą (cienie środowiska): każdy piksel raz, nawet gdy cienie nici się krzyżują.
    const shade = new Set<number>();
    for (const px of lines) for (const p of px) shade.add((p.y + V.threadShadowDrop) * w + p.x);
    ctx.globalAlpha = V.threadShadowAlpha;
    ctx.fillStyle = hex(V.threadShadowColor);
    for (const i of shade) ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
    ctx.globalAlpha = 1;
    lines.forEach((px, li) => {
      px.forEach((p, i) => {
        ctx.fillStyle = hex(i % V.glintEvery === 0 ? V.threadGlint : li % 3 === 0 ? V.threadShade : V.threadColor);
        ctx.fillRect(p.x, p.y, 1, 1);
      });
    });
    canvas.refresh();
    this.objects.push(this.scene.add.image(ox, oy, this.threadKey).setOrigin(0).setDepth(RENDER_DEPTH.vaultThreads));
  }
}

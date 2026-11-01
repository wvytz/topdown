import Phaser from 'phaser';

/**
 * Tekstury rekwizytów zmiennych aren (krok 160) rysowane w kodzie raz na grę: wiadro, butla chloru, wózek,
 * żółty znak „ślisko”, lustro na stojaku, słup z gniazdem, żywopłot. Pikselowe, w paletach biomów; generator
 * arkuszy (tools/) może je kiedyś zastąpić — klucze zostaną te same.
 */
export const ARENA_ART = {
  bucket: 'arena-bucket',
  bucketTipped: 'arena-bucket-tipped',
  bottle: 'arena-bottle',
  cart: 'arena-cart',
  sign: 'arena-sign',
  mirror: 'arena-mirror',
  mirrorCracked: 'arena-mirror-cracked',
  pillar: 'arena-pillar',
  nest: 'arena-nest',
  nestBroken: 'arena-nest-broken',
  hedge: 'arena-hedge',
} as const;

type Painter = (g: Phaser.GameObjects.Graphics) => void;

function bake(scene: Phaser.Scene, key: string, width: number, height: number, paint: Painter): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  paint(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

/** Deterministyczne „losowe” piksele liści i patyków (bez Math.random — tekstura ta sama w każdej grze). */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function bakeArenaArt(scene: Phaser.Scene): void {
  bake(scene, ARENA_ART.bucket, 20, 20, (g) => {
    g.fillStyle(0x1b1a22, 0.35).fillEllipse(10, 17, 18, 5);
    g.fillStyle(0x2f6fd0).fillRect(4, 6, 12, 11);
    g.fillStyle(0x4f93f0).fillRect(5, 7, 4, 9);
    g.fillStyle(0x1d3f7a).fillRect(3, 4, 14, 3);
    g.fillStyle(0xbfe6ff).fillRect(5, 5, 10, 1);
    g.lineStyle(1, 0x9aa0aa).strokeEllipse(10, 4, 14, 6);
  });
  bake(scene, ARENA_ART.bucketTipped, 24, 20, (g) => {
    g.fillStyle(0x7cc8ff, 0.5).fillEllipse(15, 13, 16, 8);
    g.fillStyle(0x2f6fd0).fillRect(3, 9, 12, 8);
    g.fillStyle(0x4f93f0).fillRect(4, 10, 9, 3);
    g.fillStyle(0x1d3f7a).fillRect(14, 8, 3, 10);
  });
  bake(scene, ARENA_ART.bottle, 14, 24, (g) => {
    g.fillStyle(0x1b1a22, 0.35).fillEllipse(7, 22, 12, 4);
    g.fillStyle(0x6fbf3a).fillRect(2, 8, 10, 13);
    g.fillStyle(0x9fe060).fillRect(3, 9, 3, 11);
    g.fillStyle(0x3d7a1c).fillRect(4, 4, 6, 4);
    g.fillStyle(0xd0d0d8).fillRect(4, 1, 6, 3);
    g.fillStyle(0xf8f040).fillRect(3, 13, 8, 4);
    g.fillStyle(0x1b1a22).fillRect(6, 14, 2, 2);
  });
  bake(scene, ARENA_ART.cart, 30, 24, (g) => {
    g.fillStyle(0x1b1a22, 0.35).fillEllipse(15, 22, 28, 5);
    g.fillStyle(0x3a5aa0).fillRect(2, 6, 26, 12);
    g.fillStyle(0x5a7ad0).fillRect(3, 7, 24, 3);
    g.fillStyle(0xf0d040).fillRect(5, 11, 6, 6);
    g.fillStyle(0x80d0ff).fillRect(14, 11, 6, 6);
    g.fillStyle(0x202028).fillCircle(6, 20, 2).fillCircle(24, 20, 2);
    g.lineStyle(1, 0xa0a0b0).lineBetween(28, 6, 29, 1);
  });
  bake(scene, ARENA_ART.sign, 16, 22, (g) => {
    g.fillStyle(0x1b1a22, 0.35).fillEllipse(8, 20, 14, 4);
    g.fillStyle(0xf8d030).fillTriangle(8, 1, 1, 19, 15, 19);
    g.lineStyle(1, 0x6a5010).strokeTriangle(8, 1, 1, 19, 15, 19);
    g.fillStyle(0x1b1a22).fillRect(7, 7, 2, 6).fillRect(7, 15, 2, 2);
  });
  const mirror = (cracked: boolean): Painter => (g) => {
    g.fillStyle(0x1b1a22, 0.35).fillEllipse(16, 45, 28, 6);
    g.fillStyle(0x6a4a24).fillRect(4, 2, 24, 42);
    g.fillStyle(0xc8a050).fillRect(5, 3, 22, 40);
    g.fillStyle(0xa8d8f0).fillRect(7, 5, 18, 36);
    g.fillStyle(0xd8f4ff).fillRect(8, 6, 6, 34);
    g.fillStyle(0xffffff, 0.9).fillRect(10, 9, 2, 10).fillRect(18, 24, 2, 6);
    g.fillStyle(0x6a4a24).fillRect(6, 43, 4, 3).fillRect(22, 43, 4, 3);
    if (cracked) {
      g.lineStyle(1, 0x304050);
      g.lineBetween(16, 22, 9, 8).lineBetween(16, 22, 24, 12).lineBetween(16, 22, 10, 38).lineBetween(16, 22, 23, 36).lineBetween(16, 22, 25, 25);
    }
  };
  bake(scene, ARENA_ART.mirror, 32, 48, mirror(false));
  bake(scene, ARENA_ART.mirrorCracked, 32, 48, mirror(true));
  bake(scene, ARENA_ART.pillar, 32, 52, (g) => {
    g.fillStyle(0x1b1a22, 0.4).fillEllipse(16, 49, 30, 7);
    g.fillStyle(0x4c5560).fillRect(6, 8, 20, 42);
    g.fillStyle(0x66717c).fillRect(7, 8, 6, 42);
    g.fillStyle(0x38404a).fillRect(22, 8, 4, 42);
    g.fillStyle(0x5a646f).fillRect(3, 4, 26, 6).fillRect(3, 44, 26, 6);
    for (let i = 0; i < 14; i++) g.fillStyle(0x3f7a3a, 0.9).fillRect(7 + Math.floor(hash(i) * 16), 14 + Math.floor(hash(i + 50) * 30), 2, 2);
  });
  const nest = (broken: boolean): Painter => (g) => {
    for (let i = 0; i < 40; i++) {
      const a = hash(i) * Math.PI * 2;
      const r = (broken ? 14 : 9) + hash(i + 7) * (broken ? 6 : 8);
      const x = 22 + Math.cos(a) * r;
      const y = 14 + Math.sin(a) * r * 0.5;
      g.lineStyle(1, hash(i + 3) > 0.5 ? 0x8a6232 : 0x5e4020).lineBetween(x, y, x + Math.cos(a + 1.4) * 6, y + Math.sin(a + 1.4) * 3);
    }
    if (broken) return;
    g.fillStyle(0x6e4c26).fillEllipse(22, 15, 30, 12);
    g.fillStyle(0x3a2814).fillEllipse(22, 13, 20, 6);
    // Bocian w gnieździe: biały tułów, czarne lotki, czerwony dziób.
    g.fillStyle(0xf0f0ea).fillEllipse(20, 9, 12, 8);
    g.fillStyle(0x1b1a22).fillRect(22, 7, 6, 4);
    g.fillStyle(0xf0f0ea).fillCircle(14, 5, 3);
    g.fillStyle(0xe04a2a).fillTriangle(11, 4, 11, 6, 5, 6);
  };
  bake(scene, ARENA_ART.nest, 44, 24, nest(false));
  bake(scene, ARENA_ART.nestBroken, 44, 24, nest(true));
  bake(scene, ARENA_ART.hedge, 32, 40, (g) => {
    g.fillStyle(0x1b1a22, 0.4).fillEllipse(16, 37, 32, 6);
    g.fillStyle(0x163a1c).fillRect(1, 6, 30, 31);
    for (let i = 0; i < 90; i++) {
      const x = 1 + Math.floor(hash(i) * 28);
      const y = 3 + Math.floor(hash(i + 100) * 32);
      const shade = hash(i + 200);
      g.fillStyle(shade > 0.66 ? 0x4a9a44 : shade > 0.33 ? 0x2f7034 : 0x1f5226).fillRect(x, y, 3, 3);
    }
    g.fillStyle(0xd84060).fillRect(8, 14, 2, 2).fillRect(22, 24, 2, 2);
  });
}

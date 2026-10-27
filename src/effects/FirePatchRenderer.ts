import Phaser from 'phaser';
import { FIRE_PATCH_VISUAL } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { exposedArcs } from '@/systems/AreaOutline';
import type { OutlineArc } from '@/systems/AreaOutline';
import type { FirePatch, FirePatchField, FirePatchStage } from '@/systems/HellAttacks';
import { firePatchStage } from '@/systems/HellAttacks';

/** Liczba całkowita z pozycji, klatki i numeru elementu — stały wygląd plamy bez losowania co klatkę. */
function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Ułamek 0..1 z `hash`. */
function unit(a: number, b: number, c: number): number {
  return (hash(a, b, c) % 1000) / 1000;
}

/** Zapas warstwy wypalonej podłogi (px świata) ponad kadr: kamera przesuwa się w jednej klatce o mniej. */
const CHAR_MARGIN = 32;

/** Plama w pikselach świata z etapem życia na tę klatkę. */
interface PatchLook {
  readonly patch: FirePatch;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly stage: FirePatchStage;
}

/**
 * Płonące plamy na podłodze (krok 114): wypalona podłoga i brzeg dokładnie w zasięgu parzenia, w środku żar,
 * języki ognia i wznoszące się iskry, klatki skokowo. Smuga ma jeden obrys sumy kół i ciągłą żyłę żaru.
 * Czysto wizualne — plamy i ich trafienia liczy `FirePatchField`.
 */
export class FirePatchRenderer {
  /**
   * Wypalona podłoga pod ogniem: kryjące koła na grafice poza sceną (`stencil`), przeniesione na warstwę kadru
   * ze stałą alfą — nachodzące plamy smugi dają jedną równą plamę, bez ciemniejszych soczewek na styku.
   */
  private readonly stencil: Phaser.GameObjects.Graphics;
  private readonly charLayer: Phaser.GameObjects.RenderTexture;
  /** Czerwona poświata plam (ADD) — tak samo jedna równa warstwa dla całej smugi. */
  private readonly bodyLayer: Phaser.GameObjects.RenderTexture;
  private readonly halfW = Math.ceil(GAME_WIDTH / (2 * CAMERA_CONFIG.zoom)) + CHAR_MARGIN;
  private readonly halfH = Math.ceil(GAME_HEIGHT / (2 * CAMERA_CONFIG.zoom)) + CHAR_MARGIN;
  /** Ogień (ADD): świeci jak pochodnie. */
  private readonly flame: Phaser.GameObjects.Graphics;
  /** Odsłonięte łuki brzegu każdej plamy i pary nachodzących plam; liczone na nowo tylko po zmianie listy. */
  private arcs = new Map<FirePatch, OutlineArc[]>();
  private pairs: (readonly [FirePatch, FirePatch])[] = [];
  private arcsVersion = -1;

  constructor(private readonly scene: Phaser.Scene) {
    this.stencil = scene.make.graphics({ x: 0, y: 0 }, false);
    this.charLayer = scene.add
      .renderTexture(0, 0, this.halfW * 2, this.halfH * 2)
      .setOrigin(0)
      .setDepth(RENDER_DEPTH.telegraph)
      .setAlpha(FIRE_PATCH_VISUAL.char.alpha);
    this.bodyLayer = scene.add
      .renderTexture(0, 0, this.halfW * 2, this.halfH * 2)
      .setOrigin(0)
      .setDepth(RENDER_DEPTH.groundFlash)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(FIRE_PATCH_VISUAL.body.alpha);
    this.flame = scene.add.graphics().setDepth(RENDER_DEPTH.groundFlash).setBlendMode(Phaser.BlendModes.ADD);
  }

  draw(field: FirePatchField, now: number): void {
    const v = FIRE_PATCH_VISUAL;
    this.flame.clear();
    this.charLayer.clear();
    this.bodyLayer.clear();
    if (field.patches.length === 0) return;
    if (field.version !== this.arcsVersion) this.updateArcs(field);
    const frame = Math.floor(now / v.frameMs);
    const looks = new Map<FirePatch, PatchLook>();
    for (const patch of field.patches) {
      const look = { patch, x: Math.round(patch.center.x), y: Math.round(patch.center.y), r: Math.round(patch.radius), stage: firePatchStage(patch, now, v.igniteMs, v.dyingMs) };
      looks.set(patch, look);
      // Rozbłysk przy zapłonie: całe koło jasne, od pierwszej klatki widać pełny zasięg.
      if (look.stage === 'ignite') this.flame.fillStyle(v.hot.color, v.igniteAlpha).fillCircle(look.x, look.y, look.r);
    }
    this.stamp(this.charLayer, v.char.color, looks.values());
    this.stamp(this.bodyLayer, v.body.color, looks.values());
    for (const [a, b] of this.pairs) this.drawVein(looks.get(a)!, looks.get(b)!, frame);
    for (const look of looks.values()) {
      if (look.stage === 'ignite') continue;
      const dying = look.stage === 'dying';
      this.drawCore(look, frame, dying);
      if (!dying) this.drawTongues(look, frame);
      this.drawSparks(look, frame, dying);
    }
    for (const look of looks.values()) this.drawEdge(look, now);
  }

  /**
   * Kryjące koła wszystkich plam w kolorze `color` przeniesione na warstwę `layer` (jej alfa i mieszanie),
   * zakotwiczoną w świecie wokół kadru (zapas na ruch kamery w tej klatce).
   */
  private stamp(layer: Phaser.GameObjects.RenderTexture, color: number, looks: Iterable<PatchLook>): void {
    this.stencil.clear().fillStyle(color, 1);
    for (const { x, y, r } of looks) this.stencil.fillCircle(x, y, r);
    const view = this.scene.cameras.main.worldView;
    const ox = Math.round(view.centerX) - this.halfW;
    const oy = Math.round(view.centerY) - this.halfH;
    layer.setPosition(ox, oy);
    layer.draw(this.stencil, -ox, -oy);
  }

  /** Brzeg w całości wewnątrz koła (r-2..r), jak telegrafy z kroku 110; przed zgaśnięciem miga skokowo. */
  private drawEdge({ patch, x, y, r, stage }: PatchLook, now: number): void {
    const v = FIRE_PATCH_VISUAL;
    const dim = stage === 'dying' && Math.floor((patch.expiresAt - now) / v.dyingBlinkMs) % 2 === 0;
    this.flame.lineStyle(v.edge.width, stage === 'ignite' ? v.hot.color : v.edge.color, dim ? v.dyingEdgeAlpha : v.edge.alpha);
    for (const arc of this.arcs.get(patch) ?? []) {
      this.flame.beginPath().arc(x, y, r - v.edge.width / 2, arc.start, arc.end).strokePath();
    }
  }

  /** Żyła żaru między środkami nachodzących plam smugi. */
  private drawVein(a: PatchLook, b: PatchLook, frame: number): void {
    if (a.stage === 'ignite' || b.stage === 'ignite') return;
    const { vein, core } = FIRE_PATCH_VISUAL;
    const dying = a.stage === 'dying' || b.stage === 'dying';
    // Grubość pulsuje skokowo o piksel (każdy odcinek w innej fazie).
    const pulse = Math.round(unit(a.x + b.x, a.y + b.y, frame) * 2) - 1;
    const width = Math.max(2, Math.round(Math.min(a.r, b.r) * vein.scale * (dying ? 0.6 : 1)) + pulse);
    this.flame.lineStyle(width, core.color, vein.alpha).lineBetween(a.x, a.y, b.x, b.y);
  }

  /** Żar: jedna kula w małej plamie, kilka nieregularnych w dużej; drga o piksel co klatkę, przygasa przy końcu. */
  private drawCore({ x, y, r }: PatchLook, frame: number, dying: boolean): void {
    const { core, hot } = FIRE_PATCH_VISUAL;
    const shrink = dying ? 0.7 : 1;
    this.flame.fillStyle(core.color, core.alpha);
    if (r < core.bigRadius) {
      const jitter = Math.round((unit(x, y, frame) - 0.5) * 2);
      this.flame.fillCircle(x, y, Math.max(1, Math.round(r * core.smallScale * shrink) + jitter));
      return;
    }
    const blobs = Math.min(core.maxBlobs, Math.max(2, Math.round(r * core.blobsPerRadius)));
    const [minScale, maxScale] = core.blobScale;
    for (let i = 0; i < blobs; i++) {
      const angle = unit(x, y, 100 + i) * Math.PI * 2;
      const dist = unit(y, x, 100 + i) * r * core.spread;
      const bx = Math.round(x + Math.cos(angle) * dist + (unit(x + i, y, frame) - 0.5) * 2);
      const by = Math.round(y + Math.sin(angle) * dist + (unit(x, y + i, frame) - 0.5) * 2);
      const br = Math.round(r * (minScale + unit(x, y, 200 + i) * (maxScale - minScale)) * shrink);
      this.flame.fillCircle(bx, by, Math.max(1, br));
    }
    // Najgorętsze miejsce: jasne jądro w środku.
    if (!dying) this.flame.fillStyle(hot.color, 0.35).fillCircle(x, y, Math.max(1, Math.round(r * 0.14)));
  }

  /** Języki ognia: słupki pikseli od podstawy w środku plamy w górę, wysokość skacze co klatkę, czubek w kole. */
  private drawTongues({ x, y, r }: PatchLook, frame: number): void {
    const { tongues, core, hot, body } = FIRE_PATCH_VISUAL;
    const count = Math.min(tongues.max, Math.max(1, Math.round(r * tongues.perRadius)));
    const tallest = Math.min(tongues.maxHeight, Math.round(r * tongues.heightPerRadius));
    const wide = r >= core.bigRadius ? 1 : 0;
    for (let i = 0; i < count; i++) {
      // Podstawa stała dla plamy, wysokość zmienia się z klatką (każdy język w innej fazie).
      const angle = unit(x, y, i * 2 + 1) * Math.PI * 2;
      const dist = unit(x, y, i * 2 + 2) * r * tongues.spread;
      const bx = Math.round(x + Math.cos(angle) * dist);
      const by = Math.round(y + Math.sin(angle) * dist);
      const room = Math.floor(by - y + Math.sqrt(Math.max(0, r * r - (bx - x) ** 2))) - 2;
      const height = Math.min(room, Math.round(3 + unit(x + i, y, frame) * (tallest - 3)));
      if (height < 3) continue;
      this.flame.fillStyle(body.color, 0.7).fillRect(bx - 1 - wide, by - 1, 3 + wide * 2, 2);
      this.flame.fillStyle(core.color, 0.85).fillRect(bx - 1, by - height + 1, 2 + wide, height - 1);
      this.flame.fillStyle(hot.color, hot.alpha).fillRect(bx, by - height, 1, 2 + wide);
    }
  }

  /** Iskry: jasne piksele wznoszące się z żaru przez kilka klatek, potem nowe miejsce; nie wychodzą za brzeg. */
  private drawSparks({ x, y, r }: PatchLook, frame: number, dying: boolean): void {
    const { sparks, hot } = FIRE_PATCH_VISUAL;
    const count = dying ? 1 : Math.min(sparks.max, Math.max(1, Math.round(r * sparks.perRadius)));
    const reach = Math.max(1, r - 3);
    this.flame.fillStyle(hot.color, hot.alpha);
    for (let i = 0; i < count; i++) {
      // Każda iskra ma własną fazę, więc nie odradzają się wszystkie w tej samej klatce.
      const age = (frame + i) % sparks.lifeFrames;
      const cycle = Math.floor((frame + i) / sparks.lifeFrames);
      const angle = unit(x, y, cycle * 7 + i * 3) * Math.PI * 2;
      const dist = Math.sqrt(unit(y, x, cycle * 5 + i)) * reach;
      const sx = Math.round(x + Math.cos(angle) * dist);
      const sy = Math.round(y + Math.sin(angle) * dist) - age * sparks.rise;
      if (Math.hypot(sx - x, sy - y) > reach) continue;
      this.flame.fillRect(sx, sy, 1, 1);
    }
  }

  /** Łuki brzegu nieprzykryte przez sąsiednie plamy (smuga ma jeden obrys sumy kół) i pary nachodzących plam. */
  private updateArcs(field: FirePatchField): void {
    const patches = field.patches;
    const circles = patches.map((p) => ({ center: { x: Math.round(p.center.x), y: Math.round(p.center.y) }, radius: Math.round(p.radius) }));
    this.arcs = new Map();
    this.pairs = [];
    patches.forEach((patch, i) => {
      const me = circles[i]!;
      const near: typeof circles = [];
      circles.forEach((other, j) => {
        if (j === i || Math.hypot(other.center.x - me.center.x, other.center.y - me.center.y) >= other.radius + me.radius) return;
        near.push(other);
        if (j > i) this.pairs.push([patch, patches[j]!]);
      });
      this.arcs.set(patch, near.length === 0 ? [{ start: 0, end: Math.PI * 2 }] : exposedArcs(me, [me, ...near], FIRE_PATCH_VISUAL.outlineSegments));
    });
    this.arcsVersion = field.version;
  }
}

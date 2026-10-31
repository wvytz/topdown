import Phaser from 'phaser';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SLUDGE_FX } from '@/config/sludgeConfig';
import type { SludgeCreepDefinition } from '@/core/bossTypes';
import { TileType } from '@/core/dungeonTypes';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import type { ArenaRect } from '@/systems/Sludge';
import { creepReach, creepThreshold } from '@/systems/Sludge';

/** Bayer 4×4 (STYLEGUIDE §5): dithering tylko na przejściu fiolet → brąz. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

let textureSerial = 0;

/** Stały szum 0..1 z pary liczb (czysto wizualny, ten sam przy każdym przerysowaniu). */
function hash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Szum wartości z interpolacją (plamy, żyłki, zacieki). */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  let tx = gx - x0;
  let ty = gy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hash01(x0, y0, seed) * (1 - tx) + hash01(x0 + 1, y0, seed) * tx;
  const b = hash01(x0, y0 + 1, seed) * (1 - tx) + hash01(x0 + 1, y0 + 1, seed) * tx;
  return a * (1 - ty) + b * ty;
}

function rgba(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/** Warstwa na płótnie: piksele z progami, przerysowywane po zmianie postępu. */
interface CreepLayer {
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly image: Phaser.GameObjects.Image;
  readonly data: ImageData;
  /** Indeksy pikseli z progiem (reszta zawsze przezroczysta). */
  readonly pixels: Int32Array;
  readonly thresholds: Float32Array;
  /** Grubość warstwy na jednostkę postępu (podłoga: f ściany; mur: 1). */
  readonly factors: Float32Array;
  readonly noise: Float32Array;
  readonly width: number;
}

/**
 * Szlam pełznący od ścian areny Króla Szlamu (krok 153, `#krol-szlamu`). Podłoga: pas w zasięgu z `systems/Sludge.ts`
 * (próg głębokości liczony raz na piksel — rysunek to dokładny zasięg spowolnienia), ciemny wał na brzegu, brąz
 * ditheringiem Bayera, żyłki i połysk pojedynczymi pikselami. Mury: zacieki spływające z lica ku podłodze areny
 * (mury z podłogą od północy — nad postaciami, jak warstwa `overhead`). Cała arena nabiera fioletu.
 */
export class SludgeCreepView {
  private readonly arenaPx: ArenaRect;
  private readonly floorLayer: CreepLayer;
  private readonly wallLayers: CreepLayer[] = [];
  private readonly tint: Phaser.GameObjects.Rectangle;
  private drawnDepth = -1;
  private nextBubbleAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    floor: DungeonFloor,
    arena: Room,
    private readonly creep: SludgeCreepDefinition,
  ) {
    this.arenaPx = {
      left: arena.x * TILE_SIZE,
      top: arena.y * TILE_SIZE,
      right: (arena.x + arena.width) * TILE_SIZE,
      bottom: (arena.y + arena.height) * TILE_SIZE,
    };
    this.floorLayer = this.buildFloorLayer(floor);
    this.buildWallLayers(floor, arena);
    const pad = SLUDGE_FX.creep.wallTiles * TILE_SIZE;
    const { left, top, right, bottom } = this.arenaPx;
    this.tint = scene.add
      .rectangle(left - pad, top - pad, right - left + pad * 2, bottom - top + pad * 2, SLUDGE_FX.creep.tint.color, 0)
      .setOrigin(0)
      .setDepth(RENDER_DEPTH.motes - 0.1);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Prostokąt podłogi areny (px) — ten sam, którym BossFight sprawdza spowolnienie. */
  get arenaRect(): ArenaRect {
    return this.arenaPx;
  }

  /** Przerysowanie po wzroście szlamu (`depth` px od ścian); `bubble` — bąbel w losowym miejscu pasa. */
  update(depth: number, now: number, bubble: (x: number, y: number) => void): void {
    const progress = Math.min(1, depth / Math.max(1, this.creep.maxDepthPx));
    if (Math.abs(depth - this.drawnDepth) >= SLUDGE_FX.creep.redrawStepPx) {
      this.drawnDepth = depth;
      this.paintFloor(this.floorLayer, depth);
      for (const layer of this.wallLayers) this.paintWall(layer, progress * SLUDGE_FX.creep.wallCover);
      this.tint.setFillStyle(SLUDGE_FX.creep.tint.color, SLUDGE_FX.creep.tint.maxAlpha * progress);
    }
    if (depth > 6 && now >= this.nextBubbleAt) {
      this.nextBubbleAt = now + SLUDGE_FX.bubbles.creepEveryMs / Math.max(0.25, progress);
      const at = this.randomPointInCreep(depth);
      if (at) bubble(at.x, at.y);
    }
  }

  /** Po walce: szlam zostaje na podłodze i murach (ślad walki), fiolet znad areny powoli schodzi. */
  settle(): void {
    this.scene.tweens.add({ targets: this.tint, fillAlpha: 0, duration: 2500 });
  }

  destroy(): void {
    for (const layer of [this.floorLayer, ...this.wallLayers]) {
      layer.image.destroy();
      layer.texture.destroy();
    }
    this.tint.destroy();
  }

  /** Losowy punkt w głębi pasa (bąble) — przy jednej z czterech ścian, w zasięgu fali brzegu. */
  private randomPointInCreep(depth: number): Vector2 | null {
    const { left, top, right, bottom } = this.arenaPx;
    const edge = Math.floor(Math.random() * 4);
    const horizontal = edge === 0 || edge === 2;
    const s = Math.random() * (horizontal ? right - left : bottom - top);
    const reach = creepReach(depth, s, [0.3, 2.1, 4.4, 5.6][edge]!, this.creep) - 4;
    if (reach < 3) return null;
    const d = 3 + Math.random() * (reach - 3);
    if (edge === 0) return { x: left + s, y: top + d };
    if (edge === 1) return { x: right - d, y: top + s };
    if (edge === 2) return { x: left + s, y: bottom - d };
    return { x: left + d, y: top + s };
  }

  private makeLayer(x: number, y: number, width: number, height: number, depth: number, count: number): CreepLayer {
    const key = `sludge-creep-${textureSerial++}`;
    const texture = this.scene.textures.createCanvas(key, width, height);
    if (!texture) throw new Error('SludgeCreepView: nie udało się utworzyć płótna.');
    const image = this.scene.add.image(x, y, key).setOrigin(0).setDepth(depth);
    const data = texture.getContext().createImageData(width, height);
    return {
      texture,
      image,
      data,
      pixels: new Int32Array(count),
      thresholds: new Float32Array(count),
      factors: new Float32Array(count),
      noise: new Float32Array(count),
      width,
    };
  }

  /** Podłoga areny: próg tylko dla pikseli, które mogą zostać pokryte (do `maxDepthPx` od ściany). */
  private buildFloorLayer(floor: DungeonFloor): CreepLayer {
    const { left, top, right, bottom } = this.arenaPx;
    const width = right - left;
    const height = bottom - top;
    const max = this.creep.maxDepthPx;
    const picks: Array<{ i: number; t: number; f: number; n: number }> = [];
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (px > max && py > max && width - px > max && height - py > max) continue;
        const wx = left + px + 0.5;
        const wy = top + py + 0.5;
        const tile = floor.tiles[Math.floor(wy / TILE_SIZE) * floor.width + Math.floor(wx / TILE_SIZE)];
        if (tile === TileType.Wall) continue;
        const { depth, wallFactor } = creepThreshold({ x: wx, y: wy }, this.arenaPx, this.creep);
        if (depth > max) continue;
        picks.push({ i: py * width + px, t: depth, f: wallFactor, n: valueNoise(wx, wy, 9, 17) * 0.75 + valueNoise(wx, wy, 3, 23) * 0.25 });
      }
    }
    const layer = this.makeLayer(left, top, width, height, RENDER_DEPTH.combatDecal + 0.05, picks.length);
    picks.forEach((p, k) => {
      layer.pixels[k] = p.i;
      layer.thresholds[k] = p.t;
      layer.factors[k] = p.f;
      layer.noise[k] = p.n;
    });
    return layer;
  }

  /**
   * Mury wokół areny (do `wallTiles` kafli): próg zacieku rośnie z odległością od podłogi areny i ze „strugami”
   * (szum rozciągnięty w pionie), więc szlam spływa smugami. Mury z podłogą od północy — osobna warstwa nad postaciami.
   */
  private buildWallLayers(floor: DungeonFloor, arena: Room): void {
    const pad = SLUDGE_FX.creep.wallTiles;
    const x0 = arena.x - pad;
    const y0 = arena.y - pad;
    const tilesW = arena.width + pad * 2;
    const tilesH = arena.height + pad * 2;
    const isWall = (tx: number, ty: number): boolean =>
      tx < 0 || ty < 0 || tx >= floor.width || ty >= floor.height || floor.tiles[ty * floor.width + tx] === TileType.Wall;
    const low: Array<{ i: number; t: number; n: number }> = [];
    const high: Array<{ i: number; t: number; n: number }> = [];
    const width = tilesW * TILE_SIZE;
    const height = tilesH * TILE_SIZE;
    const span = pad * TILE_SIZE;
    const { left, top, right, bottom } = this.arenaPx;
    for (let ty = y0; ty < y0 + tilesH; ty++) {
      for (let tx = x0; tx < x0 + tilesW; tx++) {
        if (!isWall(tx, ty) || tx < 0 || ty < 0 || tx >= floor.width || ty >= floor.height) continue;
        // Lico północnego muru ma `wallTiles` kafli wysokości; boczne i południowe mury — jeden kafel (dalej jest już mrok).
        const reachTiles = Math.max(arena.x - tx, tx - (arena.x + arena.width - 1), ty - (arena.y + arena.height - 1), 0);
        if (reachTiles > 1 || (ty < arena.y && arena.y - ty > pad)) continue;
        const overhead = !isWall(tx, ty - 1);
        for (let py = 0; py < TILE_SIZE; py++) {
          for (let px = 0; px < TILE_SIZE; px++) {
            const wx = tx * TILE_SIZE + px + 0.5;
            const wy = ty * TILE_SIZE + py + 0.5;
            const dx = wx < left ? left - wx : wx > right ? wx - right : 0;
            const dy = wy < top ? top - wy : wy > bottom ? wy - bottom : 0;
            const dist = Math.max(dx, dy) / span;
            // Struga: szum rozciągnięty wzdłuż kierunku spływania (w pionie na murach północ/południe, w poziomie na bokach).
            const vertical = dy >= dx;
            const streak = vertical ? valueNoise(wx, wy * 0.18, 3, 41) : valueNoise(wx * 0.18, wy, 3, 43);
            const t = dist * 0.55 + streak * 0.75 - 0.12;
            if (t > 1) continue;
            const entry = { i: (ty - y0) * TILE_SIZE * width + py * width + (tx - x0) * TILE_SIZE + px, t, n: valueNoise(wx, wy, 4, 59) };
            (overhead ? high : low).push(entry);
          }
        }
      }
    }
    for (const [list, depth] of [
      [low, RENDER_DEPTH.walls + 0.1],
      [high, RENDER_DEPTH.overhead + 0.05],
    ] as const) {
      if (list.length === 0) continue;
      const layer = this.makeLayer(x0 * TILE_SIZE, y0 * TILE_SIZE, width, height, depth, list.length);
      list.forEach((p, k) => {
        layer.pixels[k] = p.i;
        layer.thresholds[k] = p.t;
        layer.factors[k] = 1;
        layer.noise[k] = p.n;
      });
      this.wallLayers.push(layer);
    }
  }

  /** Podłoga: grubość = f·(głębokość − próg) px; wał, brąz Bayerem na czole, żyłki i połysk. */
  private paintFloor(layer: CreepLayer, depth: number): void {
    const { purple, brown, glint, creep } = SLUDGE_FX;
    const data = layer.data.data;
    data.fill(0);
    const covered = new Uint8Array(layer.data.width * layer.data.height);
    for (let k = 0; k < layer.pixels.length; k++) if (layer.thresholds[k]! < depth) covered[layer.pixels[k]!] = 1;
    const w = layer.width;
    for (let k = 0; k < layer.pixels.length; k++) {
      const t = layer.thresholds[k]!;
      if (t >= depth) continue;
      const i = layer.pixels[k]!;
      const x = i % w;
      const y = (i - x) / w;
      const thick = layer.factors[k]! * (depth - t);
      const n = layer.noise[k]!;
      const edge = !covered[i - 1] || !covered[i + 1] || !covered[i - w] || !covered[i + w];
      let color: number;
      if (edge && thick < 2.5) color = purple[0];
      else if (thick < 1 + creep.rimPx) color = purple[1];
      else {
        // Czoło szlamu (cienka warstwa) przechodzi w brąz ditheringiem Bayera; głębiej fiolet z plamami i żyłkami.
        const brownMix = 1 - (thick - 1 - creep.rimPx) / creep.ditherPx;
        const useBrown = brownMix > (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
        const vein = Math.abs(n - 0.5) < 0.02;
        const shade = vein ? 3 : n > 0.66 ? 3 : n < 0.3 ? 1 : 2;
        color = (useBrown ? brown : purple)[shade]!;
        if (!useBrown && hash01(x, y, 7) < 0.004) color = glint;
      }
      const [r, g, b] = rgba(color);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    this.flush(layer);
  }

  /** Mur: piksel w zacieku, gdy próg < postęp; obrys strugi najciemniejszym fioletem, połysk na licu. */
  private paintWall(layer: CreepLayer, level: number): void {
    const { purple, glint } = SLUDGE_FX;
    const data = layer.data.data;
    data.fill(0);
    const covered = new Uint8Array(layer.data.width * layer.data.height);
    for (let k = 0; k < layer.pixels.length; k++) if (layer.thresholds[k]! < level) covered[layer.pixels[k]!] = 1;
    const w = layer.width;
    for (let k = 0; k < layer.pixels.length; k++) {
      if (layer.thresholds[k]! >= level) continue;
      const i = layer.pixels[k]!;
      const x = i % w;
      const y = (i - x) / w;
      const edge = !covered[i - 1] || !covered[i + 1] || !covered[i - w] || !covered[i + w];
      const n = layer.noise[k]!;
      let color: number = edge ? purple[0] : n > 0.62 ? purple[3] : n < 0.3 ? purple[1] : purple[2];
      // Kropla na końcu strugi: jaśniejszy piksel tuż nad obrysem od dołu.
      if (!edge && !covered[i + w * 2] && covered[i + w]) color = purple[3];
      if (!edge && hash01(x, y, 11) < 0.006) color = glint;
      const [r, g, b] = rgba(color);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    this.flush(layer);
  }

  private flush(layer: CreepLayer): void {
    layer.texture.getContext().putImageData(layer.data, 0, 0);
    layer.texture.refresh();
  }
}

import Phaser from 'phaser';
import type { AmbientProfile } from '@/config/lightingConfig';
import { LIGHTING } from '@/config/lightingConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { buildLightStamp, lightTouchesView, playerLightStrength, pointLightStrength } from '@/systems/lighting';
import { stampTexture } from '@/effects/lightTextures';

/** Światło punktowe w świecie (pochodnia); promień zmienia się przy migotaniu. */
export interface PointLight {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Zapas (px świata) ponad kadr i martwą strefę kamery. */
const MARGIN = 4;

/**
 * Mrok i światła w jednej warstwie: co klatkę wypełniamy ją pełnym mrokiem w kolorze palety
 * i „wycieramy” (ERASE) stemple świateł — gracza i pochodni. Warstwa jest w rozdzielczości świata
 * i zakotwiczona w świecie (pełne piksele), więc przy zoomie 2 pasma są ostre jak kafle.
 * Składana po fizyce (POST_UPDATE), żeby światło nie zostawało klatkę za graczem.
 */
export class LightingOverlay {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly halfW: number;
  private readonly halfH: number;
  private readonly playerKey: string;
  private readonly playerHalf: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly profile: AmbientProfile,
    private readonly ambientColor: number,
    /** Czy pochodnie rozświetlają mrok (przy modyfikatorze „Mrok” nie — tam to mechanika piętra). */
    private readonly torchesLightUp: boolean,
  ) {
    this.halfW = Math.ceil(GAME_WIDTH / (2 * CAMERA_CONFIG.zoom) + CAMERA_CONFIG.deadzoneWidth / 2) + MARGIN;
    this.halfH = Math.ceil(GAME_HEIGHT / (2 * CAMERA_CONFIG.zoom) + CAMERA_CONFIG.deadzoneHeight / 2) + MARGIN;
    this.rt = scene.add.renderTexture(0, 0, this.halfW * 2, this.halfH * 2).setOrigin(0).setDepth(RENDER_DEPTH.darkness);
    const { fullLightRadius, edgeRadius, maxDarkness, bands } = profile;
    this.playerKey = stampTexture(
      scene,
      `light-player-${fullLightRadius}-${edgeRadius}-${maxDarkness}-${bands}`,
      () => buildLightStamp(edgeRadius, (d) => playerLightStrength(d, profile)),
      0xffffff,
    );
    this.playerHalf = Math.ceil(edgeRadius);
  }

  render(player: { readonly x: number; readonly y: number }, lights: readonly PointLight[]): void {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const ox = px - this.halfW;
    const oy = py - this.halfH;
    const rt = this.rt;
    rt.setPosition(ox, oy);
    rt.clear();
    rt.fill(this.ambientColor, this.profile.maxDarkness);
    rt.erase(this.playerKey, px - ox - this.playerHalf, py - oy - this.playerHalf);
    if (!this.torchesLightUp) return;
    const view = { x: ox, y: oy, width: this.halfW * 2, height: this.halfH * 2 };
    for (const light of lights) {
      if (!lightTouchesView(light, light.radius, view)) continue;
      const half = Math.ceil(light.radius);
      rt.erase(torchLightKey(this.scene, light.radius), Math.round(light.x) - ox - half, Math.round(light.y) - oy - half);
    }
  }
}

/** Stempel światła pochodni o danym promieniu (biały — do wycierania mroku i, z odcieniem, do poświaty). */
export function torchLightKey(scene: Phaser.Scene, radius: number): string {
  const { bands } = LIGHTING.torch;
  return stampTexture(scene, `light-torch-${radius}-${bands}`, () => buildLightStamp(radius, (d) => pointLightStrength(d, radius, bands)), 0xffffff);
}

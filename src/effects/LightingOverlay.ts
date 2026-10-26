import Phaser from 'phaser';
import type { AmbientProfile } from '@/config/lightingConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { buildLightStamp, lightTouchesView, overlayOrigin, playerLightStrength, pointLightStrength } from '@/systems/lighting';
import { stampTexture } from '@/effects/lightTextures';

/** Światło punktowe w świecie (pochodnia); promień zmienia się przy migotaniu. */
export interface PointLight {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Zapas (px świata) ponad kadr: kamera z lerp przesuwa się w jednej klatce o mniej niż tyle. */
const MARGIN = 24;

/**
 * Mrok i światła w jednej warstwie: co klatkę wypełniamy ją pełnym mrokiem w kolorze palety
 * i „wycieramy” (ERASE) stemple świateł — gracza i pochodni. Warstwa jest w rozdzielczości świata
 * i zakotwiczona w świecie (pełne piksele). Światło przechodzi płynnie (krok 28a), bez pasm.
 * Składana po fizyce (POST_UPDATE), żeby światło nie zostawało klatkę za graczem.
 */
export class LightingOverlay {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly halfW: number;
  private readonly halfH: number;
  private readonly playerKey: string;
  private readonly playerHalf: number;
  /** Mrok zasadzki (krok 49): druga warstwa ciemności z małym kręgiem światła gracza, siła 0..1. */
  private dread = 0;
  private dreadLayer: { readonly rt: Phaser.GameObjects.RenderTexture; readonly key: string; readonly half: number; readonly darkness: number } | null =
    null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly profile: AmbientProfile,
    private readonly ambientColor: number,
    /** Czy pochodnie rozświetlają mrok (przy modyfikatorze „Mrok” nie — tam to mechanika piętra). */
    private readonly torchesLightUp: boolean,
  ) {
    this.halfW = Math.ceil(GAME_WIDTH / (2 * CAMERA_CONFIG.zoom)) + MARGIN;
    this.halfH = Math.ceil(GAME_HEIGHT / (2 * CAMERA_CONFIG.zoom)) + MARGIN;
    this.rt = scene.add.renderTexture(0, 0, this.halfW * 2, this.halfH * 2).setOrigin(0).setDepth(RENDER_DEPTH.darkness);
    const { fullLightRadius, edgeRadius, maxDarkness } = profile;
    this.playerKey = stampTexture(
      scene,
      `light-player-${fullLightRadius}-${edgeRadius}-${maxDarkness}`,
      () => buildLightStamp(edgeRadius, (d) => playerLightStrength(d, profile)),
      0xffffff,
    );
    this.playerHalf = Math.ceil(edgeRadius);
  }

  /**
   * Przyciemnienie zasadzki: nad zwykłym mrokiem druga warstwa w profilu `profile` (mały krąg światła gracza),
   * z siłą `level` 0..1 — przejście płynne, pochodnie jej nie rozjaśniają.
   */
  setDread(level: number, profile: AmbientProfile): void {
    this.dread = Math.min(1, Math.max(0, level));
    if (this.dread > 0 && !this.dreadLayer) {
      const rt = this.scene.add.renderTexture(0, 0, this.halfW * 2, this.halfH * 2).setOrigin(0).setDepth(RENDER_DEPTH.darkness + 0.01);
      const key = stampTexture(
        this.scene,
        `light-player-${profile.fullLightRadius}-${profile.edgeRadius}-${profile.maxDarkness}`,
        () => buildLightStamp(profile.edgeRadius, (d) => playerLightStrength(d, profile)),
        0xffffff,
      );
      this.dreadLayer = { rt, key, half: Math.ceil(profile.edgeRadius), darkness: profile.maxDarkness };
    }
  }

  /** `players` — bohaterowie z własnym kręgiem światła (co-op, etap C2: dwóch; solo — jeden). */
  render(players: readonly { readonly x: number; readonly y: number }[], lights: readonly PointLight[]): void {
    // Warstwa trzyma się kadru kamery (przycięta do granic świata jak kamera), a nie środka bohatera.
    const camera = this.scene.cameras.main;
    const view = { x: camera.worldView.centerX, y: camera.worldView.centerY };
    const { x: ox, y: oy } = overlayOrigin(view, { x: this.halfW, y: this.halfH }, camera.getBounds());
    const rt = this.rt;
    rt.setPosition(ox, oy);
    rt.clear();
    rt.fill(this.ambientColor, this.profile.maxDarkness);
    for (const player of players) {
      rt.erase(this.playerKey, Math.round(player.x) - ox - this.playerHalf, Math.round(player.y) - oy - this.playerHalf);
    }
    this.renderDread(players, ox, oy);
    if (!this.torchesLightUp) return;
    const area = { x: ox, y: oy, width: this.halfW * 2, height: this.halfH * 2 };
    for (const light of lights) {
      if (!lightTouchesView(light, light.radius, area)) continue;
      const half = Math.ceil(light.radius);
      rt.erase(torchLightKey(this.scene, light.radius), Math.round(light.x) - ox - half, Math.round(light.y) - oy - half);
    }
  }

  /** Warstwa mroku zasadzki: w tym samym miejscu co główna, ciemność × siła, wytarte tylko kręgi bohaterów. */
  private renderDread(players: readonly { readonly x: number; readonly y: number }[], ox: number, oy: number): void {
    const layer = this.dreadLayer;
    if (!layer) return;
    layer.rt.setVisible(this.dread > 0);
    if (this.dread <= 0) return;
    layer.rt.setPosition(ox, oy);
    layer.rt.clear();
    layer.rt.fill(this.ambientColor, layer.darkness * this.dread);
    for (const player of players) {
      layer.rt.erase(layer.key, Math.round(player.x) - ox - layer.half, Math.round(player.y) - oy - layer.half);
    }
  }
}

/** Stempel światła pochodni o danym promieniu (biały — do wycierania mroku i, z odcieniem, do poświaty). */
export function torchLightKey(scene: Phaser.Scene, radius: number): string {
  return stampTexture(scene, `light-torch-${radius}`, () => buildLightStamp(radius, (d) => pointLightStrength(d, radius)), 0xffffff);
}

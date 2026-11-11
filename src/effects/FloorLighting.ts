import Phaser from 'phaser';
import type { TilesetAsset } from '@/config/tilesetConfig';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { LIGHTING } from '@/config/lightingConfig';
import type { FogConfig } from '@/config/lightingConfig';
import type { TorchSpot } from '@/dungeon/LightPlanner';
import { darknessModifierProfile } from '@/systems/lighting';
import { DustMotes } from '@/effects/DustMotes';
import { EnemyVisibility } from '@/effects/EnemyVisibility';
import { FogWisps } from '@/effects/FogWisps';
import { LightingOverlay } from '@/effects/LightingOverlay';
import type { PointLight } from '@/effects/LightingOverlay';
import { hexColor } from '@/effects/lightTextures';
import { Torches } from '@/world/Torches';

/** Czego oświetlenie piętra potrzebuje od sceny gry — same odczyty, bez zależności od jej pól. */
export interface FloorLightingDeps {
  readonly asset: TilesetAsset;
  readonly tileset: TilesetMeta;
  readonly torchSpots: readonly TorchSpot[];
  /** Promień widzenia modyfikatora „Mrok”; null — piętro bez niego. */
  readonly visionRadius: number | null;
  /** Mgła biomu (Grzybnia); przy „Mroku” ignorowana. */
  readonly fog: FogConfig | null;
  /** Bohaterowie z własnym kręgiem światła. */
  readonly bearers: () => readonly { readonly x: number; readonly y: number }[];
  /** Światła piętra poza pochodniami (paleniska, żywe otoczenie); `withAmbient` — także te z żywego otoczenia. */
  readonly extraLights: (withAmbient: boolean) => readonly PointLight[];
  /** Światło ognia walki (krok 144). */
  readonly flares: () => readonly PointLight[];
  /** Wrogowie ukrywani poza światłem (mgła, „Mrok”). */
  readonly hideable: () => Iterable<Phaser.GameObjects.Sprite>;
  /** Czy światła żywego otoczenia odsłaniają wrogów. */
  readonly ambientRevealsEnemies: boolean;
}

/**
 * Światło piętra (krok 19a, wydzielone z `GameScene.ts` w kroku U1): mrok z winietą, pochodnie, pyłki, obłoczki mgły
 * i ukrywanie wrogów poza światłem. Przy modyfikatorze „Mrok” warstwa mroku jest prawie nieprzezroczysta, a pochodnie
 * świecą tylko jako punkty. Biom z mgłą (krok 28a): ta sama warstwa w kolorze mgły; „Mrok” ma pierwszeństwo przed mgłą.
 * W „Mroku” i we mgle wrogowie pokazują się dopiero w świetle (krok 30). Składane po fizyce (POST_UPDATE).
 */
export class FloorLighting {
  readonly overlay: LightingOverlay;
  readonly torches: Torches;

  constructor(scene: Phaser.Scene, private readonly deps: FloorLightingDeps) {
    const vision = deps.visionRadius;
    const fog = vision === null ? deps.fog : null;
    const profile = vision !== null ? darknessModifierProfile(vision, LIGHTING.darknessModifier) : (fog?.profile ?? LIGHTING.ambient);
    const color = fog?.color ?? hexColor(deps.tileset.colors.ambient);
    const torchesLightUp = vision === null;
    this.torches = new Torches(scene, deps.torchSpots, deps.asset, deps.tileset, { glow: torchesLightUp });
    this.overlay = new LightingOverlay(scene, profile, color, torchesLightUp);
    new DustMotes(scene, deps.tileset.colors.ash.map(hexColor), fog?.motes ?? LIGHTING.motes);
    if (fog) new FogWisps(scene, fog);
    const hiding =
      vision !== null || fog
        ? new EnemyVisibility({
            profile,
            revealStrength: LIGHTING.enemyReveal.revealStrength,
            lights: () => (torchesLightUp ? this.pointLights(deps.ambientRevealsEnemies) : []),
            players: deps.bearers,
            actors: deps.hideable,
          })
        : null;
    // Po fizyce: światło gracza i widoczność wrogów nie zostają klatkę za nim.
    const render = (): void => {
      this.overlay.render(deps.bearers(), this.pointLights(), deps.flares());
      hiding?.update();
    };
    render();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, render);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, render));
  }

  /** Światła piętra: pochodnie, paleniska (krok 41b) i — z `withAmbient` — żywe otoczenie. */
  pointLights(withAmbient = true): PointLight[] {
    return [...this.torches.lights, ...this.deps.extraLights(withAmbient)];
  }
}

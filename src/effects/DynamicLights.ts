import Phaser from 'phaser';
import { LightKind } from '@/core/lightTypes';
import type { DynamicLightLevel, LightSource } from '@/core/lightTypes';
import type { Vector2 } from '@/core/types';
import { DYNAMIC_LIGHT_CONFIG } from '@/config/dynamicLightConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { torchLightKey } from '@/effects/LightingOverlay';
import { screenFx } from '@/effects/ScreenFx';
import { beamLightPoints, dynamicLightLevel, flashPeakRadius, flashRadius, quantizeRadius, selectLights } from '@/systems/DynamicLights';
import type { ViewRect } from '@/systems/lighting';

/** Grupa pocisków, które świecą; `kind` decyduje o barwie (np. kula Czarodziejki — fiolet). */
interface TrackedShots {
  readonly group: Phaser.GameObjects.Group;
  readonly kind: (shot: Phaser.GameObjects.GameObject) => LightKind;
}

interface Flash {
  readonly x: number;
  readonly y: number;
  readonly peak: number;
  readonly kind: LightKind;
  readonly color: number | undefined;
  readonly bornAt: number;
}

/**
 * Światło 2.0 (krok U3): pociski, magia i wybuchy rozświetlają mrok — warstwa mroku (`LightingOverlay`) wyciera
 * ich stemple jak pochodnie, także w „Mroku” i w Zaduchu zasadzki, żeby strzały były czytelne. Na Wysokiej każde
 * światło dostaje barwną poświatę (ADD) nad mrokiem. Same efekty obrazu: widoczności wrogów (`EnemyVisibility`)
 * to nie zmienia, logiki ani RNG nie dotyka. Poziom liczy czysta warstwa (`systems/DynamicLights.ts`).
 */
class DynamicLightsView {
  private scene: Phaser.Scene | null = null;
  private tracked: TrackedShots[] = [];
  private flashes: Flash[] = [];
  /** Światła jednej klatki (promień Czarodziejki) — zbierane w update, zużywane przy składaniu mroku. */
  private frame: LightSource[] = [];
  private tints: Phaser.GameObjects.Image[] = [];

  get level(): DynamicLightLevel {
    return dynamicLightLevel(screenFx.profile);
  }

  /** Pociski z tej grupy świecą (gracza — `PlayerShotManager`, wrogów — `ProjectileManager`). */
  trackShots(group: Phaser.GameObjects.Group, kind: TrackedShots['kind']): void {
    this.attach(group.scene);
    this.tracked.push({ group, kind });
  }

  /** Błysk wybuchu albo magii o strefie `zone` (px): gaśnie przez `flash.durationMs`. */
  flash(scene: Phaser.Scene, x: number, y: number, zone: number, kind: LightKind, color?: number): void {
    if (!this.level.flashes) return;
    this.attach(scene);
    this.flashes.push({ x, y, peak: flashPeakRadius(zone), kind, color, bornAt: scene.time.now });
    if (this.flashes.length > DYNAMIC_LIGHT_CONFIG.maxFlashes) this.flashes.shift();
  }

  /** Promień Czarodziejki w tej klatce: światła w odstępach od kryształu do końca. */
  beam(scene: Phaser.Scene, from: Vector2, to: Vector2): void {
    if (!this.level.beam) return;
    this.attach(scene);
    const radius = DYNAMIC_LIGHT_CONFIG.kinds[LightKind.Beam].radius;
    this.frame = beamLightPoints(from, to).map((p) => ({ x: p.x, y: p.y, radius, kind: LightKind.Beam }));
  }

  /**
   * Światła do wytarcia w mroku w tej klatce (w kadrze, w limicie poziomu); od razu rysuje ich barwną poświatę.
   * Wołane raz na klatkę przez `FloorLighting` po fizyce.
   */
  collect(view: ViewRect): LightSource[] {
    const level = this.level;
    const scene = this.scene;
    const frame = this.frame;
    this.frame = [];
    if (!scene || level.maxLights <= 0) {
      this.hideTints(0);
      return [];
    }
    const now = scene.time.now;
    const sources: LightSource[] = [];
    if (level.shots) {
      const styles = DYNAMIC_LIGHT_CONFIG.kinds;
      for (const { group, kind } of this.tracked) {
        for (const child of group.getChildren()) {
          const shot = child as Phaser.GameObjects.Sprite;
          if (!shot.active || !shot.visible) continue;
          const k = kind(shot);
          sources.push({ x: shot.x, y: shot.y, radius: styles[k].radius, kind: k });
        }
      }
    }
    this.flashes = this.flashes.filter((f) => now - f.bornAt < DYNAMIC_LIGHT_CONFIG.flash.durationMs);
    for (const f of this.flashes) sources.push({ x: f.x, y: f.y, radius: flashRadius(f.peak, now - f.bornAt), kind: f.kind, ...(f.color !== undefined && { color: f.color }) });
    if (level.beam) sources.push(...frame);
    const picked = selectLights(sources, view, level.maxLights).map((s) => ({ ...s, radius: quantizeRadius(s.radius) }));
    this.drawTints(scene, level.tint ? picked : []);
    return picked.filter((s) => s.radius > 0);
  }

  /** Barwna poświata (Wysoka): stempel pochodni zabarwiony na kolor rodzaju, mieszanie ADD, nad mrokiem. */
  private drawTints(scene: Phaser.Scene, lights: readonly LightSource[]): void {
    let used = 0;
    for (const light of lights) {
      if (light.radius <= 0) continue;
      const style = DYNAMIC_LIGHT_CONFIG.kinds[light.kind];
      const key = torchLightKey(scene, light.radius);
      const image =
        this.tints[used] ??
        (this.tints[used] = scene.add.image(0, 0, key).setDepth(RENDER_DEPTH.dynamicLight).setBlendMode(Phaser.BlendModes.ADD));
      used++;
      if (image.texture.key !== key) image.setTexture(key);
      image.setPosition(Math.round(light.x), Math.round(light.y)).setTint(light.color ?? style.color).setAlpha(style.tintAlpha).setVisible(true);
    }
    this.hideTints(used);
  }

  private hideTints(from: number): void {
    for (let i = from; i < this.tints.length; i++) this.tints[i]!.setVisible(false);
  }

  /** Nowa scena gry: stan poprzedniej przepada przy jej zamknięciu. */
  private attach(scene: Phaser.Scene): void {
    if (this.scene === scene) return;
    this.reset();
    this.scene = scene;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.scene === scene) {
        this.reset();
        this.scene = null;
      }
    });
  }

  private reset(): void {
    this.tracked = [];
    this.flashes = [];
    this.frame = [];
    this.tints = [];
  }
}

export const dynamicLights = new DynamicLightsView();

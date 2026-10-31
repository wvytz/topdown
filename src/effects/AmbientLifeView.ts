import Phaser from 'phaser';
import type { BiomeAmbientConfig, GlowPropConfig } from '@/config/ambientConfig';
import { AMBIENT_CONFIG, AmbientKind } from '@/config/ambientConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { SoundCue } from '@/core/audioTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { sound } from '@/audio/SoundBoard';
import type { AmbientSpot } from '@/dungeon/AmbientPlanner';
import type { PointLight } from '@/effects/LightingOverlay';
import { torchLightKey } from '@/effects/LightingOverlay';
import type { AmbientThreat, GlowState, RavenState, WispState } from '@/systems/AmbientLife';
import {
  GlowPhase,
  RavenPhase,
  alarmRaven,
  glowLightRadius,
  initialGlow,
  initialRaven,
  mothOffset,
  mothScatter,
  pulseFrame,
  stepGlow,
  stepRaven,
  stepWisp,
  wispPosition,
} from '@/systems/AmbientLife';

/** Bohater widziany przez żywe otoczenie. */
export interface AmbientHero {
  readonly x: number;
  readonly y: number;
  readonly dashing: boolean;
}

interface MutableLight extends PointLight {
  x: number;
  y: number;
  radius: number;
}

interface GlowProp {
  readonly kind: AmbientKind.Glowcap | AmbientKind.OvergrownLamp | AmbientKind.Candle;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly sheet: SpriteSheetId;
  readonly variant: number;
  readonly config: GlowPropConfig;
  readonly snuffRadius: number | undefined;
  readonly light: MutableLight;
  readonly glow: Phaser.GameObjects.Image;
  readonly phaseOffset: number;
  readonly moths: Phaser.GameObjects.Sprite[];
  state: GlowState;
  /** Ostatnio pokazany promień (zmiana tekstury poświaty tylko przy zmianie). */
  shownRadius: number;
}

interface Raven {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  state: RavenState;
  nextPeckAt: number;
}

interface Wisp {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly glow: Phaser.GameObjects.Image;
  readonly light: MutableLight;
  readonly bounds: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  state: WispState;
}

const SPORE_TEXTURE = 'tex-ambient-spore';
const SHADOW_TEXTURE = 'tex-ambient-shadow';
/** Kolory zarodników i poświaty Grzybni (rampa światła grzybów) oraz poświaty zniczy i ogników. */
const SPORE_TINTS = [0x44d4e2, 0xb6f2f1, 0x0099bb];
const GROVE_GLOW_TINT = 0x0099bb;
const CANDLE_GLOW_TINT = 0xc4524a;
const WISP_GLOW_TINT = 0x7fd08a;
/** Siła poświaty ADD (pochodnie mają 0,16). */
const GLOW_ALPHA = 0.14;
/** Gdzie świeci rekwizyt względem środka kafla (px): kępa — kapelusze, lampa — klosz, znicze — szkło. */
const LIGHT_OFFSET: Readonly<Record<GlowProp['kind'], { readonly x: number; readonly y: number }>> = {
  [AmbientKind.Glowcap]: { x: 0, y: -2 },
  [AmbientKind.OvergrownLamp]: { x: -1, y: 4 },
  [AmbientKind.Candle]: { x: 0, y: 5 },
};

/**
 * Żywe otoczenie biomów 2–3 (krok 156): rysuje i animuje rekwizyty z planu (`dungeon/AmbientPlanner`), a o ich
 * zachowaniu decydują czyste funkcje `systems/AmbientLife`. Światła rekwizytów (`lights`) rozwiewają mrok i mgłę
 * jak pochodnie. Liczy tylko to, co blisko kadru. Math.random — wyłącznie dla wyglądu (faza, dziobanie, rozrzut).
 */
export class AmbientLifeView {
  private readonly props: GlowProp[] = [];
  private readonly ravens: Raven[] = [];
  private readonly wisps: Wisp[] = [];
  private readonly spores: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private nextDriftAt = 0;
  private lastTime = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    floor: DungeonFloor,
    spots: readonly AmbientSpot[],
    private readonly config: BiomeAmbientConfig,
    private readonly heroes: () => readonly AmbientHero[],
    /** Poświata ADD (przy modyfikatorze „Mrok” wyłączona — jak u pochodni). */
    private readonly glowEnabled = true,
  ) {
    ensureTextures(scene);
    for (const spot of spots) {
      const x = spot.tile.x * TILE_SIZE + TILE_SIZE / 2;
      const y = spot.tile.y * TILE_SIZE + TILE_SIZE / 2;
      switch (spot.kind) {
        case AmbientKind.Glowcap:
        case AmbientKind.OvergrownLamp:
        case AmbientKind.Candle:
          this.props.push(this.createProp(spot, x, y));
          break;
        case AmbientKind.Raven:
          this.ravens.push(this.createRaven(x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-4, 4)));
          break;
        case AmbientKind.Wisp: {
          const room = floor.rooms[spot.roomId];
          if (room) this.wisps.push(this.createWisp(x, y, room));
          break;
        }
      }
    }
    if (config.grove) {
      const s = config.grove.spores;
      this.spores = scene.add
        .particles(0, 0, SPORE_TEXTURE, {
          lifespan: { min: s.lifespanMs.min, max: s.lifespanMs.max },
          speedX: { min: -5, max: 5 },
          speedY: { min: -s.riseSpeed.max, max: -s.riseSpeed.min },
          tint: SPORE_TINTS,
          alpha: 0.85,
          maxAliveParticles: s.maxParticles,
          emitting: false,
        })
        .setDepth(RENDER_DEPTH.ambientGlow);
    }
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this));
  }

  /** Światła rekwizytów, które teraz świecą (zgaszone pomijamy). */
  get lights(): PointLight[] {
    const lights: PointLight[] = [];
    for (const prop of this.props) if (prop.light.radius > 0) lights.push(prop.light);
    for (const wisp of this.wisps) if (wisp.sprite.visible) lights.push(wisp.light);
    return lights;
  }

  private createProp(spot: AmbientSpot, x: number, y: number): GlowProp {
    const kind = spot.kind as GlowProp['kind'];
    const grove = this.config.grove;
    const graveyard = this.config.graveyard;
    const sheet: SpriteSheetId = kind === AmbientKind.Glowcap ? 'groveGlowcap' : kind === AmbientKind.OvergrownLamp ? 'groveLamp' : 'graveCandle';
    const config = kind === AmbientKind.Glowcap ? grove!.glowcap : kind === AmbientKind.OvergrownLamp ? grove!.lamp : graveyard!.candle;
    const sprite = this.scene.add.sprite(x, y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.ambientProp);
    // Odbicie w poziomie — kępy i znicze nie wyglądają jak spod jednej sztancy (światło z góry, wolno flipX).
    if (kind !== AmbientKind.OvergrownLamp && Math.random() < 0.5) sprite.setFlipX(true);
    const offset = LIGHT_OFFSET[kind];
    const light: MutableLight = { x: x + (sprite.flipX ? -offset.x : offset.x), y: y + offset.y, radius: 0 };
    const tint = kind === AmbientKind.Candle ? CANDLE_GLOW_TINT : GROVE_GLOW_TINT;
    const glow = this.scene.add
      .image(light.x, light.y, torchLightKey(this.scene, config.lightRadius))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setAlpha(GLOW_ALPHA)
      .setDepth(RENDER_DEPTH.torchGlow)
      .setVisible(spot.lit && this.glowEnabled);
    const moths: Phaser.GameObjects.Sprite[] = [];
    for (let i = 0; i < spot.moths; i++) {
      const moth = this.scene.add.sprite(x, y, SPRITE_SHEETS.groveMoth.key).setDepth(RENDER_DEPTH.ambientGlow);
      moth.play({ key: animationKey('groveMoth', 'flap'), startFrame: Phaser.Math.Between(0, 3) });
      moths.push(moth);
    }
    const prop: GlowProp = {
      kind,
      sprite,
      sheet,
      variant: Math.min(spot.variant, SPRITE_SHEETS[sheet].directions - 1),
      config,
      snuffRadius: kind === AmbientKind.Candle ? graveyard?.candle.snuffRadius : undefined,
      light,
      glow,
      phaseOffset: Phaser.Math.Between(0, 5),
      moths,
      state: initialGlow(spot.lit),
      shownRadius: -1,
    };
    this.playCalm(prop, true);
    if (!spot.lit) sprite.play(animationKey(sheet, 'out', prop.variant));
    return prop;
  }

  private createRaven(x: number, y: number): Raven {
    const shadow = this.scene.add.image(x, y + 6, SHADOW_TEXTURE).setDepth(RENDER_DEPTH.actorShadow);
    const sprite = this.scene.add.sprite(x, y, SPRITE_SHEETS.graveRaven.key).setDepth(RENDER_DEPTH.ambientCritter);
    sprite.setFlipX(Math.random() < 0.5);
    sprite.play({ key: animationKey('graveRaven', 'idle'), startFrame: Phaser.Math.Between(0, 6) });
    return { sprite, shadow, state: initialRaven(x, y), nextPeckAt: Phaser.Math.Between(500, 3500) };
  }

  private createWisp(x: number, y: number, room: { x: number; y: number; width: number; height: number }): Wisp {
    const wisps = this.config.graveyard!.wisps;
    const sprite = this.scene.add.sprite(x, y, SPRITE_SHEETS.graveWisp.key).setDepth(RENDER_DEPTH.ambientGlow);
    sprite.play({ key: animationKey('graveWisp', 'flicker'), startFrame: Phaser.Math.Between(0, 5) });
    const light: MutableLight = { x, y, radius: wisps.lightRadius };
    const glow = this.scene.add
      .image(x, y, torchLightKey(this.scene, wisps.lightRadius))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(WISP_GLOW_TINT)
      .setAlpha(GLOW_ALPHA)
      .setDepth(RENDER_DEPTH.torchGlow)
      .setVisible(this.glowEnabled);
    const bounds = {
      left: room.x * TILE_SIZE,
      top: room.y * TILE_SIZE,
      right: (room.x + room.width) * TILE_SIZE,
      bottom: (room.y + room.height) * TILE_SIZE,
    };
    const state: WispState = {
      homeX: x,
      homeY: y,
      swayRadius: Phaser.Math.Between(wisps.swayRadius.min, wisps.swayRadius.max),
      phase: Math.random() * Math.PI * 2,
    };
    return { sprite, glow, light, bounds, state };
  }

  private update(time: number): void {
    const dt = Math.min(100, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const heroes = this.heroes();
    const view = this.scene.cameras.main.worldView;
    const m = AMBIENT_CONFIG.activeMarginPx;
    const near = (x: number, y: number) => x > view.x - m && x < view.right + m && y > view.y - m && y < view.bottom + m;
    for (const prop of this.props) {
      if (!near(prop.sprite.x, prop.sprite.y)) continue;
      this.updateProp(prop, time, threatFor(heroes, prop.sprite.x, prop.sprite.y));
    }
    for (const raven of this.ravens) {
      if (raven.state.phase === RavenPhase.Gone || !near(raven.state.x, raven.state.y)) continue;
      this.updateRaven(raven, time, dt, threatFor(heroes, raven.state.x, raven.state.y));
    }
    for (const wisp of this.wisps) {
      if (!near(wisp.state.homeX, wisp.state.homeY)) continue;
      this.updateWisp(wisp, time, dt, heroes);
    }
    this.driftSpores(time, near);
  }

  // ---------------- kępy, lampy, znicze ----------------

  private updateProp(prop: GlowProp, time: number, threat: AmbientThreat | null): void {
    const before = prop.state.phase;
    const step = stepGlow(prop.state, time, threat, prop.config, prop.snuffRadius);
    prop.state = step.state;
    if (step.event === 'startle') this.onStartle(prop);
    if (step.event === 'snuff') {
      prop.sprite.play(animationKey(prop.sheet, 'snuff', prop.variant));
      sound.play(SoundCue.CandleSnuff, prop.sprite);
    }
    if (step.state.phase !== before && step.event === null) this.onPhase(prop);
    const frame = pulseFrame(time, SPRITE_SHEETS[prop.sheet].fps, prop.phaseOffset, Math.max(1, prop.config.pulseOffsets.length));
    const radius = glowLightRadius(prop.state, time, prop.config, frame);
    prop.light.radius = radius;
    if (radius !== prop.shownRadius) {
      prop.shownRadius = radius;
      prop.glow.setVisible(radius > 0 && this.glowEnabled);
      if (radius > 0) prop.glow.setTexture(torchLightKey(this.scene, radius));
    }
    if (prop.moths.length > 0 && this.config.grove) {
      const moths = this.config.grove.moths;
      const scatter = mothScatter(prop.state, time, moths);
      prop.moths.forEach((moth, i) => {
        const o = mothOffset(time, i, prop.moths.length, moths, scatter);
        moth.setPosition(Math.round(prop.light.x + o.x), Math.round(prop.light.y + o.y));
      });
    }
  }

  private onStartle(prop: GlowProp): void {
    if (prop.kind === AmbientKind.Candle) {
      prop.sprite.play(animationKey(prop.sheet, 'gust', prop.variant));
      return;
    }
    prop.sprite.play(animationKey(prop.sheet, 'flinch', prop.variant));
    this.spores?.emitParticleAt(prop.light.x, prop.light.y, this.config.grove?.spores.burst ?? 0);
    sound.play(SoundCue.SporePuff, prop.sprite);
  }

  /** Zmiana fazy bez zdarzenia: skulone → przygaszone → budzi się → pulsuje (znicz po szarpnięciu — migocze). */
  private onPhase(prop: GlowProp): void {
    switch (prop.state.phase) {
      case GlowPhase.Dim:
        prop.sprite.play(animationKey(prop.sheet, 'dim', prop.variant));
        break;
      case GlowPhase.Recover:
        prop.sprite.play(animationKey(prop.sheet, 'wake', prop.variant));
        break;
      case GlowPhase.Calm:
        this.playCalm(prop, false);
        break;
      default:
        break;
    }
  }

  private playCalm(prop: GlowProp, randomStart: boolean): void {
    const name = prop.kind === AmbientKind.Candle ? 'flicker' : 'pulse';
    const animations = SPRITE_SHEETS[prop.sheet].animations as Readonly<Record<string, { readonly frames: readonly number[] }>>;
    const length = animations[name]?.frames.length ?? 1;
    prop.sprite.play({ key: animationKey(prop.sheet, name, prop.variant), startFrame: randomStart ? prop.phaseOffset % length : 0 });
  }

  // ---------------- kruki ----------------

  private updateRaven(raven: Raven, time: number, dt: number, threat: AmbientThreat | null): void {
    const config = this.config.graveyard!.ravens;
    const before = raven.state.phase;
    const step = stepRaven(raven.state, time, dt, threat, config, (Math.random() - 0.5) * 0.9);
    raven.state = step.state;
    const s = raven.state;
    if (step.event === 'takeoff') {
      raven.sprite.play(animationKey('graveRaven', 'fly')).setDepth(RENDER_DEPTH.ambientFlyer);
      raven.sprite.setFlipX(s.dirX < 0);
      sound.play(SoundCue.WingFlap, raven.sprite);
      // Stado zrywa się falą: sąsiedzi w promieniu dostają alarm z małym opóźnieniem.
      for (const other of this.ravens) {
        if (other === raven) continue;
        if (Math.hypot(other.state.x - s.x, other.state.y - s.y) > config.flockRadius) continue;
        other.state = alarmRaven(other.state, time + Phaser.Math.Between(config.flockDelayMs.min, config.flockDelayMs.max), threat ?? s);
      }
    }
    if (s.phase === RavenPhase.Gone) {
      raven.sprite.destroy();
      raven.shadow.destroy();
      return;
    }
    if (before === RavenPhase.Perched && s.phase === RavenPhase.Perched) {
      // Dziobanie co kilka sekund (czysto wizualne).
      if (time >= raven.nextPeckAt) {
        raven.nextPeckAt = time + Phaser.Math.Between(1800, 5200);
        raven.sprite.play(animationKey('graveRaven', 'peck'));
        raven.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (raven.state.phase === RavenPhase.Perched && raven.sprite.active) raven.sprite.play(animationKey('graveRaven', 'idle'));
        });
      }
      return;
    }
    const progress = Math.min(1, (time - s.since) / config.flightMs);
    raven.sprite.setPosition(Math.round(s.x), Math.round(s.y - s.height));
    raven.shadow.setPosition(Math.round(s.x), Math.round(s.y + 6)).setScale(Math.max(0.4, 1 - progress * 0.6));
    // Pod koniec lotu kruk znika w mroku nad kadrem.
    raven.sprite.setAlpha(progress > 0.75 ? 1 - (progress - 0.75) * 4 : 1);
    raven.shadow.setAlpha(1 - progress);
  }

  // ---------------- błędne ogniki ----------------

  private updateWisp(wisp: Wisp, time: number, dt: number, heroes: readonly AmbientHero[]): void {
    const config = this.config.graveyard!.wisps;
    const at = wispPosition(wisp.state, time, config);
    const threat = threatFor(heroes, at.x, at.y);
    wisp.state = stepWisp(wisp.state, time, dt, threat, wisp.bounds, config);
    const p = wispPosition(wisp.state, time, config);
    wisp.sprite.setPosition(Math.round(p.x), Math.round(p.y));
    wisp.light.x = p.x;
    wisp.light.y = p.y + 4;
    const frame = pulseFrame(time, SPRITE_SHEETS.graveWisp.fps, 0, config.pulseOffsets.length);
    const radius = config.lightRadius + (config.pulseOffsets[frame] ?? 0);
    if (radius !== wisp.light.radius) wisp.glow.setTexture(torchLightKey(this.scene, radius));
    wisp.light.radius = radius;
    wisp.glow.setPosition(Math.round(wisp.light.x), Math.round(wisp.light.y));
  }

  // ---------------- zarodniki ----------------

  /** Co chwilę jeden zarodnik wzlatuje z losowej, spokojnej kępy w kadrze. */
  private driftSpores(time: number, near: (x: number, y: number) => boolean): void {
    const spores = this.spores;
    const grove = this.config.grove;
    if (!spores || !grove || time < this.nextDriftAt) return;
    this.nextDriftAt = time + grove.spores.driftIntervalMs;
    const calm = this.props.filter((p) => p.kind !== AmbientKind.Candle && p.state.phase === GlowPhase.Calm && near(p.sprite.x, p.sprite.y));
    const prop = calm[Math.floor(Math.random() * calm.length)];
    if (!prop) return;
    spores.emitParticleAt(prop.light.x + Phaser.Math.Between(-6, 6), prop.light.y + Phaser.Math.Between(-3, 3), 1);
  }
}

/** Najbliższy bohater (co-op: każdy płoszy). */
function threatFor(heroes: readonly AmbientHero[], x: number, y: number): AmbientThreat | null {
  let best: AmbientThreat | null = null;
  for (const hero of heroes) {
    const distance = Math.hypot(hero.x - x, hero.y - y);
    if (!best || distance < best.distance) best = { x: hero.x, y: hero.y, distance, dashing: hero.dashing };
  }
  return best;
}

/** Tekstury rysowane w kodzie: zarodnik (1 px) i cień kruka (elipsa w kolorze obrysu, alfa 0,4 — STYLEGUIDE §6). */
function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SPORE_TEXTURE)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
    g.generateTexture(SPORE_TEXTURE, 1, 1);
    g.destroy();
  }
  if (!scene.textures.exists(SHADOW_TEXTURE)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x1b1a22, 0.4).fillEllipse(5, 2, 10, 4);
    g.generateTexture(SHADOW_TEXTURE, 10, 4);
    g.destroy();
  }
}

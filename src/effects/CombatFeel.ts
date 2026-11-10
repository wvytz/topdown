import Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import { HitstopKind } from '@/core/combatFeelTypes';
import type { CombatFeelLevel, ShatterPiece } from '@/core/combatFeelTypes';
import { COMBAT_FEEL_CONFIG } from '@/config/combatFeelConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SORCERY_COLORS } from '@/config/heroColorConfig';
import { combatFeelLevel, isHeavyHit, shatterPieces, slashSegments } from '@/systems/CombatFeel';
import { screenFx } from '@/effects/ScreenFx';

interface SparkBurst {
  readonly x: number;
  readonly y: number;
  readonly startAt: number;
  readonly color: number;
  readonly dirs: readonly number[];
}

interface Shatter {
  readonly x: number;
  readonly y: number;
  readonly startAt: number;
  readonly colors: readonly number[];
  readonly pieces: readonly ShatterPiece[];
}

interface SlashTrail {
  readonly x: number;
  readonly y: number;
  readonly startAt: number;
  readonly segments: readonly number[];
  readonly range: number;
}

/** Obiekt z ciałem na ekranie (wróg, boss) — do iskier trafienia. */
interface HitTarget {
  readonly x: number;
  readonly y: number;
}

/**
 * Feel walki (krok U2, STYLEGUIDE §13.5): iskry trafienia i smuga cięcia nad mrokiem, rozpad wrogów, światło pocisków
 * wrogów, hitstop (przez `screenFx`). Jeden moduł na scenę gry; trzy wspólne `Graphics` rysowane raz na klatkę,
 * zamiast obiektu na każde trafienie — w nawale (22 wrogów) to stały koszt. Czysto wizualne: Math.random dozwolony,
 * logika, hitboxy i czas gry bez zmian. Na Niskiej nic się tu nie rysuje (gra sprzed upgradu).
 */
class CombatFeelView {
  private scene: Phaser.Scene | null = null;
  /** Nad mrokiem: iskry, smuga, błyski. */
  private overDark: Phaser.GameObjects.Graphics | null = null;
  /** Światło pocisków wrogów (ADD, nad mrokiem). */
  private halos: Phaser.GameObjects.Graphics | null = null;
  /** Kawałki rozpadu — „ciało”, więc pod mrokiem, na wysokości postaci. */
  private debris: Phaser.GameObjects.Graphics | null = null;
  private sparks: SparkBurst[] = [];
  private shatters: Shatter[] = [];
  private slashes: SlashTrail[] = [];
  private projectiles: Phaser.GameObjects.Group | null = null;

  /** Poziom feelu dla bieżącej jakości i „mniej błysków”. */
  get level(): CombatFeelLevel {
    return combatFeelLevel(screenFx.profile);
  }

  /** Nowa scena gry (CombatEffects): wspólne płótna i rysowanie po każdej klatce logiki. */
  bind(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sparks = [];
    this.shatters = [];
    this.slashes = [];
    this.projectiles = null;
    this.overDark = scene.add.graphics().setDepth(RENDER_DEPTH.combatFx);
    this.halos = scene.add.graphics().setDepth(RENDER_DEPTH.projectileLight).setBlendMode(Phaser.BlendModes.ADD);
    this.debris = scene.add.graphics().setDepth(RENDER_DEPTH.deathBurst);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this);
      if (this.scene === scene) this.scene = null;
      screenFx.cancelHitstop();
    });
  }

  /** Pociski wrogów, które dostają własne małe światło (§13.5). */
  trackProjectiles(group: Phaser.GameObjects.Group): void {
    this.projectiles = group;
  }

  /** Trafienie wroga albo bossa: iskry od źródła ciosu, a ciężki cios — hitstop i krótkie drżenie. */
  hit(target: HitTarget, source: Vector2, damage: number, options: { readonly blocked?: boolean | undefined; readonly magic?: boolean | undefined } = {}): void {
    const scene = this.scene;
    if (!scene) return;
    const level = this.level;
    if (level.hitSparks && level.sparkCount > 0) {
      const { spread, color, blockedColor } = COMBAT_FEEL_CONFIG.sparks;
      const base = Math.atan2(target.y - source.y, target.x - source.x);
      const dirs = Array.from({ length: level.sparkCount }, () => base + (Math.random() - 0.5) * spread * 2);
      const tone = options.blocked ? blockedColor : options.magic ? SORCERY_COLORS.light : color;
      this.sparks.push({ x: Math.round(target.x), y: Math.round(target.y), startAt: screenFx.visualTime, color: tone, dirs });
    }
    if (!options.blocked && isHeavyHit(damage)) this.stop(HitstopKind.HeavyHit, level);
  }

  /** Śmierć wroga: rozpad na kawałki; elita sypie się gęściej, w barwach cech, z hitstopem. */
  kill(at: Vector2, radius: number, colors: readonly number[], elite: boolean): void {
    const scene = this.scene;
    if (!scene) return;
    const level = this.level;
    if (level.shatter && level.shatterPieces > 0) {
      const scale = Math.max(0.6, Math.min(1.6, radius / 10));
      const count = Math.round(level.shatterPieces * scale * (elite ? COMBAT_FEEL_CONFIG.shatter.eliteMultiplier : 1));
      this.shatters.push({ x: Math.round(at.x), y: Math.round(at.y), startAt: screenFx.visualTime, colors, pieces: shatterPieces(count, colors.length, Math.random) });
    }
    if (elite) this.stop(HitstopKind.EliteKill, level);
  }

  /** Ostatni cios w bossa: najdłuższy hitstop i rozpad w barwie bossa. */
  bossKill(at: Vector2, radius: number, color: number): void {
    const level = this.level;
    if (level.shatter && this.scene) {
      const count = level.shatterPieces * 3;
      this.shatters.push({ x: Math.round(at.x), y: Math.round(at.y), startAt: screenFx.visualTime, colors: [color, 0xfff1c8], pieces: shatterPieces(count, 2, Math.random).map((p) => ({ ...p, frames: p.frames.map((f) => ({ x: Math.round((f.x * radius) / 12), y: Math.round((f.y * radius) / 12) })) })) });
    }
    this.stop(HitstopKind.BossKill, level);
  }

  /** Smuga cięcia barbarzyńcy; zwraca false na Niskiej (wtedy rysuje się dawny biały wycinek). */
  slash(x: number, y: number, angle: number, range: number, arc: number): boolean {
    const scene = this.scene;
    if (!scene || !this.level.slashTrail) return false;
    this.slashes.push({ x: Math.round(x), y: Math.round(y), startAt: screenFx.visualTime, segments: slashSegments(angle, arc), range });
    return true;
  }

  private stop(kind: HitstopKind, level: CombatFeelLevel): void {
    if (!screenFx.hitstop(kind, level.hitstop)) return;
    const shake = COMBAT_FEEL_CONFIG.shake[kind];
    if (this.scene) screenFx.shake(this.scene.cameras.main, shake.ms, shake.intensity, { ifIdle: kind !== HitstopKind.BossKill, force: kind === HitstopKind.BossKill });
  }

  private draw(): void {
    const scene = this.scene;
    if (!scene || !this.overDark || !this.halos || !this.debris) return;
    const now = screenFx.visualTime;
    this.overDark.clear();
    this.debris.clear();
    this.drawSlashes(this.overDark, now);
    this.drawSparks(this.overDark, now);
    this.drawShatters(this.debris, now);
    this.drawHalos(this.halos);
  }

  private drawSparks(g: Phaser.GameObjects.Graphics, now: number): void {
    const { frameMs, frames, size, reach } = COMBAT_FEEL_CONFIG.sparks;
    this.sparks = this.sparks.filter((burst) => {
      const frame = Math.floor((now - burst.startAt) / frameMs);
      if (frame >= frames) return false;
      const d = reach[frame] ?? reach[reach.length - 1] ?? 0;
      // Pierwsza klatka — jeden piksel bieli w miejscu trafienia (§13.5), dalej iskry w barwie ciosu.
      g.fillStyle(frame === 0 ? 0xfffaf0 : burst.color, 1);
      if (frame === 0) g.fillRect(burst.x - 1, burst.y - 1, size + 1, size + 1);
      for (const dir of burst.dirs) {
        const px = Math.round(burst.x + Math.cos(dir) * d - size / 2);
        const py = Math.round(burst.y + Math.sin(dir) * d - size / 2);
        g.fillRect(px, py, frame === frames - 1 ? 1 : size, frame === frames - 1 ? 1 : size);
      }
      return true;
    });
  }

  private drawSlashes(g: Phaser.GameObjects.Graphics, now: number): void {
    const { frameMs, alphas, widths, core, color } = COMBAT_FEEL_CONFIG.slash;
    this.slashes = this.slashes.filter((trail) => {
      const frame = Math.floor((now - trail.startAt) / frameMs);
      if (frame >= alphas.length) return false;
      const width = widths[frame] ?? 1;
      // Łuk rysujemy przy samym końcu zasięgu — smuga ostrza, nie wypełniony wachlarz zasłaniający wrogów.
      const r = trail.range - width / 2;
      g.lineStyle(width, frame === 0 ? core : color, alphas[frame] ?? 0);
      g.beginPath();
      trail.segments.forEach((a, i) => {
        const px = Math.round(trail.x + Math.cos(a) * r);
        const py = Math.round(trail.y + Math.sin(a) * r);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.strokePath();
      return true;
    });
  }

  private drawShatters(g: Phaser.GameObjects.Graphics, now: number): void {
    const { frameMs, frames, size, outline } = COMBAT_FEEL_CONFIG.shatter;
    this.shatters = this.shatters.filter((s) => {
      const frame = Math.floor((now - s.startAt) / frameMs);
      if (frame >= frames) return false;
      // Kawałki maleją w ostatnich klatkach (skokowo), zamiast płynnie gasnąć.
      const piece = frame >= frames - 2 ? size - 1 : size;
      for (const p of s.pieces) {
        const at = p.frames[frame];
        if (!at) continue;
        const px = s.x + at.x;
        const py = s.y + at.y;
        g.fillStyle(outline, 1).fillRect(px - 1, py - 1, piece + 2, piece + 2);
        g.fillStyle(s.colors[p.colorIndex] ?? s.colors[0] ?? 0xffffff, 1).fillRect(px, py, piece, piece);
      }
      return true;
    });
  }

  private drawHalos(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    if (!this.projectiles || !this.level.projectileHalo) return;
    const { radius, color, alpha, coreRadius, coreAlpha } = COMBAT_FEEL_CONFIG.projectileHalo;
    for (const child of this.projectiles.getChildren()) {
      const p = child as Phaser.GameObjects.Sprite;
      if (!p.active || !p.visible) continue;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      g.fillStyle(color, alpha).fillCircle(x, y, radius);
      g.fillStyle(color, coreAlpha).fillCircle(x, y, coreRadius);
    }
  }
}

export const combatFeel = new CombatFeelView();

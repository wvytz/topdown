import Phaser from 'phaser';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { BRAZIER_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { drawAreaTelegraph } from '@/combat/SpiderlingSwarm';
import { planBraziers } from '@/dungeon/BrazierPlanner';
import { DungeonView } from '@/dungeon/DungeonView';
import type { PointLight } from '@/effects/LightingOverlay';
import type { Player } from '@/entities/Player';
import type { BrazierConfig, BrazierTiming } from '@/systems/Braziers';
import { BrazierPhase, brazierCycleIndex, brazierDamage, brazierState, brazierTimingForFloor } from '@/systems/Braziers';
import { knockbackFrom } from '@/systems/CombatMath';

export interface BrazierDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly config: BrazierConfig;
  readonly rng: Rng;
  readonly player: Player;
  /** Kafle, przy których nie stawiamy palenisk (kapliczka). */
  readonly avoid: readonly TilePoint[];
  readonly onPlayerHit: () => void;
}

interface Brazier {
  readonly at: Vector2;
  readonly offsetMs: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly telegraph: Phaser.GameObjects.Graphics;
  readonly fire: Phaser.GameObjects.Graphics;
  phase: BrazierPhase | null;
  /** Cykl, w którym buchnięcie już zraniło gracza. */
  burstHitCycle: number;
}

/**
 * Paleniska Piekła (krok 41b): rozmieszczenie (czysty planer), faza cyklu z czystego systemu, animacja,
 * czerwona strefa w ostrzeżeniu, ogień w buchnięciu i obrażenia gracza. Bez ciała fizycznego (jak kokon —
 * nie zmienia linii wzroku Kiterów). Wrogów nie parzy — to ich biom. Obrażenia przez `takeHit`, więc
 * nietykalność po trafieniu i dash chronią jak przed każdym atakiem.
 */
export class BrazierManager {
  private readonly braziers: Brazier[] = [];
  private readonly timing: BrazierTiming;
  private readonly lightList: PointLight[] = [];

  constructor(private readonly deps: BrazierDeps) {
    this.timing = brazierTimingForFloor(deps.config, deps.floorNumber);
    const cycle = this.timing.idleMs + this.timing.warnMs + this.timing.burstMs;
    for (const tile of planBraziers(deps.floor, deps.config, deps.rng, deps.avoid)) {
      const at = DungeonView.tileToWorldCenter(tile);
      this.braziers.push({
        at,
        offsetMs: Math.floor(deps.rng.next() * cycle),
        sprite: deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[BRAZIER_VISUAL.sheet].key).setDepth(RENDER_DEPTH.shrine),
        telegraph: deps.scene.add.graphics().setDepth(RENDER_DEPTH.telegraph),
        fire: deps.scene.add.graphics().setDepth(RENDER_DEPTH.groundFlash).setBlendMode(Phaser.BlendModes.ADD),
        phase: null,
        burstHitCycle: -1,
      });
    }
  }

  /** Światła palenisk na tę klatkę (do mroku i widoczności wrogów). */
  get lights(): readonly PointLight[] {
    return this.lightList;
  }

  update(now: number): void {
    const { player, config } = this.deps;
    this.lightList.length = 0;
    for (const brazier of this.braziers) {
      const state = brazierState(this.timing, brazier.offsetMs, now);
      if (state.phase !== brazier.phase) this.enterPhase(brazier, state.phase);
      this.draw(brazier, state.phase, now);
      const { idleRadius, warnRadius, burstRadius } = BRAZIER_VISUAL.light;
      const radius = state.phase === BrazierPhase.Burst ? burstRadius : state.phase === BrazierPhase.Warn ? warnRadius : idleRadius;
      this.lightList.push({ x: brazier.at.x, y: brazier.at.y, radius });

      if (player.isDead) continue;
      const hurt = brazierDamage(config, state, brazier.at, player);
      if (!hurt) continue;
      const cycleIndex = brazierCycleIndex(this.timing, brazier.offsetMs, now);
      if (hurt === config.burst && brazier.burstHitCycle === cycleIndex) continue;
      const hit = { damage: hurt.damage, knockback: knockbackFrom(brazier.at, player, hurt.knockback) };
      if (!player.takeHit(hit, now)) continue;
      if (hurt === config.burst) brazier.burstHitCycle = cycleIndex;
      this.deps.onPlayerHit();
    }
  }

  private enterPhase(brazier: Brazier, phase: BrazierPhase): void {
    brazier.phase = phase;
    const { sheet } = BRAZIER_VISUAL;
    const name = phase === BrazierPhase.Idle ? BRAZIER_VISUAL.idle : phase === BrazierPhase.Warn ? BRAZIER_VISUAL.warn : BRAZIER_VISUAL.burst;
    const key = animationKey(sheet, name);
    const frames = this.deps.scene.anims.get(key)?.frames.length ?? 1;
    // Ostrzeżenie: płomień rośnie dokładnie przez czas ostrzeżenia; reszta w tempie arkusza.
    const frameRate = phase === BrazierPhase.Warn ? (frames * 1000) / this.timing.warnMs : undefined;
    brazier.sprite.play({ key, ...(frameRate !== undefined && { frameRate }) });
  }

  private draw(brazier: Brazier, phase: BrazierPhase, now: number): void {
    const { burst } = this.deps.config;
    if (phase === BrazierPhase.Warn) {
      // Ta sama czerwona strefa co telegrafy ataków: wypełnia się do chwili buchnięcia.
      const cycle = this.timing.idleMs + this.timing.warnMs + this.timing.burstMs;
      const t = (((now + brazier.offsetMs) % cycle) + cycle) % cycle;
      const telegraphStartAt = now - (t - this.timing.idleMs);
      drawAreaTelegraph(
        brazier.telegraph,
        { center: brazier.at, radius: burst.radius, telegraphStartAt, impactAt: telegraphStartAt + this.timing.warnMs, damage: 0, knockback: 0 },
        now,
      );
    } else {
      brazier.telegraph.clear();
    }
    brazier.fire.clear();
    if (phase === BrazierPhase.Burst) {
      const { outer, inner, alpha, innerScale } = BRAZIER_VISUAL.fire;
      // Migotanie skokowe w rytmie animacji (efekt czysto wizualny).
      const flicker = Math.floor(now / 160) % 2 === 0 ? 0 : -3;
      brazier.fire.fillStyle(outer, alpha).fillCircle(brazier.at.x, brazier.at.y, burst.radius + flicker);
      brazier.fire.fillStyle(inner, alpha).fillCircle(brazier.at.x, brazier.at.y, burst.radius * innerScale + flicker);
    }
  }
}

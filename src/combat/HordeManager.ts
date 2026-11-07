import Phaser from 'phaser';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { RETINUE_MARKER_VISUAL } from '@/config/spriteConfig';
import type { EnemyVariant } from '@/core/combatTypes';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { Enemy } from '@/entities/Enemy';
import type { Party } from '@/entities/Party';
import type { EnemyManager } from '@/combat/EnemyManager';
import { pickRetinueTiles } from '@/systems/BossRetinue';
import type { HordeConfig, HordeRoomPlan } from '@/systems/Horde';
import { HordePhase, HordeRoomState, hordeRoomForSpawn, isInsideRoom } from '@/systems/Horde';

export interface HordeManagerDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly party: Party;
  readonly enemies: EnemyManager;
  readonly effects: CombatEffects;
  readonly config: HordeConfig;
  readonly plans: readonly HordeRoomPlan[];
  /** Stworek biomu (null = biom bez stworka — nawały nie ma). */
  readonly minion: EnemyVariant | null;
  readonly rng: Rng;
  /** Ostatnia fala pokoju wybita — „Droga wolna”. */
  readonly onRoomCleared: (room: Room) => void;
}

/** Stworek, który dopiero wychodzi: znacznik na podłodze i chwila wyjścia. */
interface PendingSwarmling {
  readonly at: number;
  readonly position: Vector2;
  readonly gfx: Phaser.GameObjects.Graphics;
}

interface HordeRoom {
  readonly room: Room;
  readonly state: HordeRoomState;
  /** Stworki tej fali, które czekają na miejsce pod sufitem żywych. */
  queued: number;
  pending: PendingSwarmling[];
  minions: Enemy[];
}

/**
 * Nawała (krok 175): pierwsze wejście bohatera do zwykłego pokoju budzi fale stworków biomu. Każdy wychodzi
 * ze znacznika na podłodze (jak świta bossa) z dala od bohaterów; sufit żywych wrogów chroni wydajność.
 * Ta sama droga wyjścia służy tłumowi świty bossa (`spawnAround`).
 */
export class HordeManager {
  private readonly rooms: HordeRoom[];
  private loose: PendingSwarmling[] = [];

  constructor(private readonly deps: HordeManagerDeps) {
    this.rooms = deps.minion
      ? deps.plans.map((plan) => ({ room: deps.floor.rooms[plan.roomId]!, state: new HordeRoomState(plan, deps.config), queued: 0, pending: [], minions: [] }))
      : [];
  }

  update(now: number): void {
    const { party, config } = this.deps;
    const heroTiles = party.living.map((p) => ({ x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE) }));
    for (const horde of this.rooms) {
      const { state, room } = horde;
      if (state.currentPhase === HordePhase.Done) continue;
      if (state.currentPhase === HordePhase.Dormant) {
        if (heroTiles.some((tile) => isInsideRoom(room, tile, config.entryMarginTiles))) state.wake(now);
        continue;
      }
      horde.minions = horde.minions.filter((m) => m.active && !m.isDead);
      const alive = horde.minions.length + horde.pending.length + horde.queued;
      horde.queued += state.update(now, alive);
      if (horde.queued > 0) this.release(horde, heroTiles, now);
      horde.pending = this.hatch(horde.pending, now, horde.minions);
      if ((state.currentPhase as HordePhase) === HordePhase.Done) this.deps.onRoomCleared(room);
    }
    this.loose = this.hatch(this.loose, now, null);
  }

  /** Tłum świty bossa (krok 175): `count` stworków wokół miejsca wyjścia pomocnika. */
  spawnAround(at: Vector2, count: number): void {
    const { minion, scene, config } = this.deps;
    if (!minion) return;
    const room = hordeRoomForSpawn(count, this.deps.enemies.aliveCount + this.pendingCount, config.maxAliveEnemies);
    for (let i = 0; i < room; i++) {
      const angle = (i / Math.max(1, room)) * Math.PI * 2;
      const position = { x: at.x + Math.cos(angle) * 18, y: at.y + Math.sin(angle) * 18 };
      this.loose.push({ at: scene.time.now + config.telegraphMs, position, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
  }

  private get pendingCount(): number {
    return this.loose.length + this.rooms.reduce((sum, r) => sum + r.pending.length, 0);
  }

  /** Wypuszcza z kolejki fali tyle stworków, ile mieści sufit, na wolnych kaflach z dala od bohaterów. */
  private release(horde: HordeRoom, heroTiles: readonly { x: number; y: number }[], now: number): void {
    const { config, floor, rng, scene } = this.deps;
    const room = hordeRoomForSpawn(horde.queued, this.deps.enemies.aliveCount + this.pendingCount, config.maxAliveEnemies);
    if (room <= 0) return;
    const tiles = pickRetinueTiles(floor, horde.room, heroTiles, room, config.minPlayerDistanceTiles, rng);
    for (const tile of tiles) {
      const position = { x: (tile.x + 0.5) * TILE_SIZE, y: (tile.y + 0.5) * TILE_SIZE };
      horde.pending.push({ at: now + config.telegraphMs, position, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    }
    // Za mało miejsca w małym pokoju — reszta fali przepada (pokój i tak się zapełnia).
    horde.queued = 0;
  }

  /** Znaczniki pulsują; po telegrafie wychodzi stworek. */
  private hatch(pending: PendingSwarmling[], now: number, into: Enemy[] | null): PendingSwarmling[] {
    const { color, alpha, fillAlpha, radius, pulseMs } = RETINUE_MARKER_VISUAL;
    const minion = this.deps.minion;
    return pending.filter((p) => {
      if (now >= p.at) {
        p.gfx.destroy();
        if (minion) {
          const enemy = this.deps.enemies.spawnSwarmling(minion, p.position, this.deps.config.riseMs);
          into?.push(enemy);
        }
        this.deps.effects.impact(p.position.x, p.position.y, radius * 0.6);
        sound.play(SoundCue.Brood, p.position);
        return false;
      }
      const pulse = 0.75 + 0.25 * Math.sin((now / pulseMs) * Math.PI);
      p.gfx.clear().fillStyle(color, fillAlpha).fillCircle(p.position.x, p.position.y, radius * 0.7 * pulse).lineStyle(1, color, alpha).strokeCircle(p.position.x, p.position.y, radius * 0.7 * pulse);
      return true;
    });
  }

  destroy(): void {
    for (const p of [...this.loose, ...this.rooms.flatMap((r) => r.pending)]) p.gfx.destroy();
    this.loose = [];
  }
}

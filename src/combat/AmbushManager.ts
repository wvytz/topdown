import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { EnemyType, EnemyVariant } from '@/core/combatTypes';
import type { LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { ITEM_POOL } from '@/config/lootConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import type { EnemyManager } from '@/combat/EnemyManager';
import { DungeonView } from '@/dungeon/DungeonView';
import { GATE_WAIT_CONFIG } from '@/config/gateWaitConfig';
import { type GateWait, gatePosts } from '@/systems/GateWait';
import { findRoomEntrances, isDeepInsideRoom } from '@/dungeon/arenaGates';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { LightingOverlay } from '@/effects/LightingOverlay';
import type { Enemy } from '@/entities/Enemy';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import type { AmbushConfig } from '@/systems/Ambush';
import { AmbushPhase, AmbushState, ambushSpawnTiles } from '@/systems/Ambush';
import { pickWeightedItem } from '@/systems/Loot';
import { ENEMY_VARIANTS } from '@/config/combatConfig';

const GHOST_PHASING = ENEMY_VARIANTS[EnemyVariant.Ghost].phasing;
const GHOST_PHASE_CYCLE = GHOST_PHASING ? GHOST_PHASING.solidMs + GHOST_PHASING.phasedMs : 0;

export interface AmbushDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly room: Room;
  readonly config: AmbushConfig;
  readonly view: DungeonView;
  readonly lighting: () => LightingOverlay | null;
  /** Bohaterowie (co-op, etap C0). */
  readonly party: Party;
  readonly enemies: EnemyManager;
  readonly effects: CombatEffects;
  /** RNG zasadzki: przedmiot-przynęta i miejsca upiorów. */
  readonly rng: Rng;
  readonly spawnLoot: (at: { x: number; y: number }, drops: readonly LootDrop[]) => void;
  /** Upiory zasadzki: zawsze widoczne (świecą nad mrokiem), bez łupu. */
  readonly onGhost: (enemy: Enemy) => void;
  readonly toast: (text: string) => void;
  /** Co-op (etap C3): przy zamknięciu krat ściąga partnera spoza pokoju do bohatera w środku. */
  readonly gather: (anchor: Player, room: Room) => void;
  /** Wrogowie spoza pokoju czekają pod kratami, po ich podniesieniu ruszają zrywem (krok 132). */
  readonly gateWait: GateWait<Enemy>;
}

/**
 * Pokój zasadzki (krok 49): przedmiot na środku pustego pokoju. Gdy gracz wejdzie w głąb — kraty, mrok i dwie
 * fale upiorów (wynurzają się z posadzki). Po ostatniej fali światło wraca, kraty się podnoszą, przedmiot
 * da się podnieść. Przebieg z czystego `systems/Ambush`.
 */
export class AmbushManager {
  private readonly state: AmbushState;
  private readonly gates: readonly TilePoint[];
  private readonly bait: LootDrop;
  private wave: Enemy[] = [];
  private dreadTarget = 0;
  private dread = 0;
  private lastNow = 0;

  constructor(private readonly deps: AmbushDeps) {
    this.state = new AmbushState(deps.config);
    this.gates = findRoomEntrances(deps.floor, deps.room);
    const itemId = pickWeightedItem(ITEM_POOL, deps.rng);
    this.bait = { kind: PickupKind.Item, itemId: itemId! };
    deps.spawnLoot(DungeonView.tileToWorldCenter(this.center), [this.bait]);
  }

  private get center() {
    const { room } = this.deps;
    return { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
  }

  /** Przynęta leży, dopóki zasadzka trwa — podnieść ją można dopiero po ostatniej fali. */
  canCollect(drop: LootDrop): boolean {
    return drop !== this.bait || this.state.phase === AmbushPhase.Cleared;
  }

  update(now: number): void {
    const { party, room, config } = this.deps;
    const dt = this.lastNow === 0 ? 0 : now - this.lastNow;
    this.lastNow = now;
    this.wave = this.wave.filter((g) => g.active && !g.isDead);
    const inside = party.living.find((player) => isDeepInsideRoom(room, DungeonView.worldToTile(player.x, player.y), config.triggerMargin));
    const event = this.state.update({ playerInside: inside !== undefined, playerDead: party.isDown, aliveInWave: this.wave.length }, now);
    if (event?.kind === 'seal') {
      if (inside) this.deps.gather(inside, room);
      this.seal();
    }
    else if (event?.kind === 'wave') this.summon(event.count);
    else if (event?.kind === 'clear') this.release();
    // Mrok narasta i opada płynnie (krok 28a: bez twardych przejść).
    const step = dt / config.dread.fadeMs;
    this.dread = this.dreadTarget > this.dread ? Math.min(this.dreadTarget, this.dread + step) : Math.max(this.dreadTarget, this.dread - step);
    this.deps.lighting()?.setDread(this.dread, config.dread.profile);
  }

  private seal(): void {
    const { view, effects, scene, floor, room, gateWait } = this.deps;
    gateWait.seal(room, gatePosts(floor, room, this.gates, TILE_SIZE, GATE_WAIT_CONFIG.postOffsetTiles));
    for (const gate of this.gates) {
      view.sealGate(gate);
      const at = DungeonView.tileToWorldCenter(gate);
      effects.impact(at.x, at.y, TILE_SIZE * 0.6);
    }
    scene.cameras.main.shake(160, 0.004);
    sound.play(SoundCue.GatesSlam);
    sound.play(SoundCue.Ambush);
    this.dreadTarget = 1;
    this.deps.toast('Zasadzka! Światło gaśnie…');
  }

  private summon(count: number): void {
    const { room, config, party, enemies, rng, effects } = this.deps;
    // Etap C0 co-opu: upiory wychodzą z dala od pierwszego żywego bohatera.
    const player = party.living[0] ?? party.leader;
    const tiles = ambushSpawnTiles(room, DungeonView.worldToTile(player.x, player.y), count, config.minSpawnDistance, rng);
    tiles.forEach((tile, i) => {
      const at = DungeonView.tileToWorldCenter(tile);
      // Przesunięcie fazy przenikania rozłożone na cały cykl: upiory nie znikają wszystkie naraz.
      const phaseOffsetMs = Math.floor((i * GHOST_PHASE_CYCLE) / Math.max(1, count));
      const ghost = enemies.spawnAt(EnemyType.Rusher, at, [], {
        variant: EnemyVariant.Ghost,
        phaseOffsetMs,
        riseMs: config.riseMs,
        scaling: config.ghostScaling,
      });
      this.deps.onGhost(ghost);
      this.wave.push(ghost);
      effects.impact(at.x, at.y, TILE_SIZE * 0.5);
    });
  }

  private release(): void {
    for (const gate of this.gates) this.deps.view.releaseGate(gate);
    this.deps.gateWait.release(this.deps.room, this.deps.scene.time.now);
    this.dreadTarget = 0;
    this.deps.toast('Upiory rozwiały się — nagroda jest twoja.');
  }
}

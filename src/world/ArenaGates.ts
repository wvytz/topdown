import type Phaser from 'phaser';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { ARENA_GATES } from '@/config/bossConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { ArenaGateLock, findRoomEntrances, isDeepInsideRoom } from '@/dungeon/arenaGates';
import { DungeonView } from '@/dungeon/DungeonView';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';

export interface ArenaGatesDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly view: DungeonView;
  /** Bohaterowie (co-op, etap C0). */
  readonly party: Party;
  readonly effects: CombatEffects;
  readonly isBossFighting: () => boolean;
  readonly isBossDefeated: () => boolean;
  /** Wywoływane przy opuszczeniu krat (np. komunikat w HUD). */
  readonly onSealed: () => void;
  /** Co-op (etap C3): przy zamknięciu krat ściąga partnera spoza areny do bohatera w środku. */
  readonly gather: (anchor: Player, room: Room) => void;
}

/** Kraty na wejściach do areny: opadają w trakcie walki z bossem, podnoszą się po zwycięstwie. */
export class ArenaGates {
  private readonly lock: ArenaGateLock;
  private readonly gates: readonly TilePoint[];
  private readonly arena: Room;

  constructor(private readonly deps: ArenaGatesDeps) {
    const arena = deps.floor.rooms[deps.floor.bossRoomId];
    if (!arena) throw new Error('ArenaGates: brak komnaty bossa w danych piętra.');
    this.arena = arena;
    this.lock = new ArenaGateLock(arena, ARENA_GATES.sealMarginTiles);
    this.gates = findRoomEntrances(deps.floor, arena);
  }

  update(): void {
    const { party, isBossFighting, isBossDefeated } = this.deps;
    // Co-op (etap C3): kraty opadają, gdy w głębi areny stoi którykolwiek żywy bohater.
    const deep = party.living.find((member) => isDeepInsideRoom(this.arena, DungeonView.worldToTile(member.x, member.y), ARENA_GATES.sealMarginTiles));
    const player = deep ?? party.living[0] ?? party.leader;
    const change = this.lock.update({
      bossFighting: isBossFighting() && !party.isDown,
      bossDefeated: isBossDefeated(),
      playerTile: DungeonView.worldToTile(player.x, player.y),
    });
    if (change === 'seal') {
      this.deps.gather(player, this.arena);
      this.seal();
    } else if (change === 'release') this.release();
  }

  private seal(): void {
    const { scene, view, effects, onSealed } = this.deps;
    for (const gate of this.gates) {
      view.sealGate(gate);
      const center = DungeonView.tileToWorldCenter(gate);
      effects.impact(center.x, center.y, TILE_SIZE * 0.6);
    }
    scene.cameras.main.shake(ARENA_GATES.shakeDurationMs, ARENA_GATES.shakeIntensity);
    onSealed();
  }

  private release(): void {
    for (const gate of this.gates) this.deps.view.releaseGate(gate);
  }
}

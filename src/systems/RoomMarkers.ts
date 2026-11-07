import type { Room, TilePoint } from '@/core/dungeonTypes';

/**
 * Ikonki pokojów na minimapie (krok 163, uwaga testera: „pokoje mogłyby mieć ikonki”). Czysta logika:
 * co pokazać i gdzie (kafel środka pokoju). Ikonka pokazuje się dopiero, gdy ten kafel jest odkryty — mapa
 * dalej nie zdradza nieznanych pokojów. Rysuje `scenes/HudScene.ts` wzorami z `config/minimapConfig.ts`.
 */
export enum RoomMarkerKind {
  /** Kapliczka, na której jeszcze nie złożono ofiary. */
  Shrine = 'shrine',
  /** Pokój zasadzki przed wyczyszczeniem fal (przedmiot na środku). */
  Ambush = 'ambush',
  /** Pokój z żywą elitą. */
  Elite = 'elite',
}

export interface RoomMarker {
  readonly kind: RoomMarkerKind;
  /** Kafel, na którym stoi ikonka. */
  readonly x: number;
  readonly y: number;
}

export interface RoomMarkerInput {
  readonly rooms: readonly Room[];
  /** Kafel kapliczki; null, gdy jej nie ma albo już użyta. */
  readonly shrine: TilePoint | null;
  /** Pokój zasadzki przed wyczyszczeniem; null — brak albo po walce. */
  readonly ambushRoomId: number | null;
  /** Kafle żywych elit. */
  readonly elites: readonly TilePoint[];
}

export function roomCenter(room: Room): TilePoint {
  return { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
}

export function roomAt(rooms: readonly Room[], tile: TilePoint): Room | undefined {
  return rooms.find((r) => tile.x >= r.x && tile.y >= r.y && tile.x < r.x + r.width && tile.y < r.y + r.height);
}

/** Ikonki w stałej kolejności: kapliczka, zasadzka, elity (jedna na pokój, w pokoju zasadzki — żadna). */
export function roomMarkers(input: RoomMarkerInput): RoomMarker[] {
  const markers: RoomMarker[] = [];
  if (input.shrine) markers.push({ kind: RoomMarkerKind.Shrine, ...input.shrine });
  const ambush = input.ambushRoomId === null ? undefined : input.rooms.find((r) => r.id === input.ambushRoomId);
  if (ambush) markers.push({ kind: RoomMarkerKind.Ambush, ...roomCenter(ambush) });
  const seen = new Set<number>();
  for (const tile of input.elites) {
    const room = roomAt(input.rooms, tile);
    if (!room || seen.has(room.id) || room.id === ambush?.id) continue;
    seen.add(room.id);
    const center = roomCenter(room);
    // Kapliczka w tym samym pokoju — ikonka elity obok, żeby się nie nakładały.
    const clash = input.shrine && Math.abs(input.shrine.x - center.x) < 3 && Math.abs(input.shrine.y - center.y) < 3;
    markers.push({ kind: RoomMarkerKind.Elite, x: clash ? center.x - 3 : center.x, y: center.y });
  }
  return markers;
}

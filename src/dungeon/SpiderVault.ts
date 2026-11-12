import type { DungeonFloor, IntRange, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { SecretArea } from '@/dungeon/SecretRoom';

/**
 * Skarbiec pająków (krok U4d, prośba właściciela 12.11.2026): ukryta komnata za areną Króla Pająków jest
 * gęsto opleciona nićmi i śluzem, a kokony skarbu stoją na piedestałach — wielki na końcu komnaty naprzeciw
 * wejścia, pozostałe parami, symetrycznie wzdłuż osi, jak w sali tronowej. Czysta logika: gdzie co stoi.
 * Pozycje w jednostkach kafli (środek kafla x = x + 0,5), żeby wielki piedestał mógł stanąć dokładnie
 * na osi komnaty o parzystej szerokości. Piedestały i ozdoby są bez kolizji (dekoracje, CLAUDE.md).
 */
export interface SpiderVaultConfig {
  /** Odstęp piedestałów od ścian komnaty (kafle). */
  readonly wallMargin: number;
  /** Pary piedestałów obok wielkiego (ile się zmieści, najwyżej `max`). */
  readonly pedestalPairs: IntRange;
  /** Szansa na płat jedwabiu: kafel przy ścianie, drugi pierścień, środek, obok piedestału, korytarz. */
  readonly silkChance: { readonly edge: number; readonly ring: number; readonly inner: number; readonly nearPedestal: number; readonly corridor: number };
  readonly silkVariants: number;
  /** Przesunięcie płatu od środka kafla (ułamek kafla) — płaty większe od kafla zachodzą na siebie bez siatki. */
  readonly silkJitter: number;
  readonly slimePools: IntRange;
  readonly slimeVariants: number;
  /** Przesunięcie kałuży od środka kafla (ułamek kafla, w każdą stronę). */
  readonly slimeJitter: number;
  readonly curtainChance: number;
  readonly curtainVariants: number;
  readonly husks: IntRange;
  readonly huskVariants: number;
  /** Nici od piedestału do ścian i ich zasięg (kafle). */
  readonly threadsPerPedestal: IntRange;
  readonly threadReach: { readonly min: number; readonly max: number };
  /** Cięciwy sieci w każdym narożniku i ich odległość od rogu (kafle). */
  readonly cornerChords: IntRange;
  readonly chordReach: { readonly min: number; readonly max: number };
  /** Ugięcie nici w dół (kafle). */
  readonly sag: { readonly min: number; readonly max: number };
}

export enum VaultSide {
  North = 'n',
  South = 's',
  East = 'e',
  West = 'w',
}

/** Punkt w jednostkach kafli (ułamkowy). */
export interface VaultPoint {
  readonly x: number;
  readonly y: number;
}

export interface VaultPedestal {
  /** Środek podstawy piedestału (kafle). */
  readonly at: VaultPoint;
  readonly grand: boolean;
}

export interface VaultDecal {
  readonly at: VaultPoint;
  readonly variant: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

/** Wielka sieć w narożniku: `at` to róg komnaty, odbicia mówią, w którą stronę rośnie (wzór = NW). */
export interface VaultCornerWeb {
  readonly at: VaultPoint;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export interface VaultThread {
  readonly from: VaultPoint;
  readonly to: VaultPoint;
  /** Ugięcie w dół w połowie długości (kafle). */
  readonly sag: number;
}

export interface SpiderVaultLayout {
  readonly entrance: VaultSide;
  readonly pedestals: readonly VaultPedestal[];
  /** Indeks piedestału, na którym kokon kryje przedmiot. */
  readonly prize: number;
}

export interface SpiderVaultDecor {
  /** Płaty jedwabiu: `at` = środek płatu (kafel + przesunięcie). */
  readonly silk: readonly VaultDecal[];
  readonly slime: readonly VaultDecal[];
  readonly corners: readonly VaultCornerWeb[];
  /** Zasłony jedwabiu na licu północnego muru: `at` = lewy górny róg kafla muru nad komnatą. */
  readonly curtains: readonly VaultDecal[];
  readonly husks: readonly VaultDecal[];
  readonly threads: readonly VaultThread[];
}

const inRoom = (r: Room, x: number, y: number) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** Strona komnaty, którą wchodzi korytarz (kafel obszaru tuż za prostokątem komnaty), i kafel wejścia. */
export function vaultEntrance(floor: DungeonFloor, area: SecretArea): { readonly side: VaultSide; readonly tile: TilePoint } {
  const r = area.room;
  for (const i of area.tiles) {
    const x = i % floor.width;
    const y = Math.floor(i / floor.width);
    if (inRoom(r, x, y)) continue;
    const touches = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => inRoom(r, x + dx!, y + dy!));
    if (!touches) continue;
    const side = y < r.y ? VaultSide.North : y >= r.y + r.height ? VaultSide.South : x < r.x ? VaultSide.West : VaultSide.East;
    return { side, tile: { x, y } };
  }
  return { side: VaultSide.South, tile: { x: r.x + Math.floor(r.width / 2), y: r.y + r.height } };
}

/**
 * Układ lokalny komnaty: `lateral` w poprzek wejścia, `depth` od ściany z wejściem (0) w głąb.
 * Zwraca rozmiary i zamianę (lateral, depth) w jednostkach kafli na punkt piętra.
 */
function frame(room: Room, side: VaultSide) {
  const across = side === VaultSide.North || side === VaultSide.South;
  const lateral = across ? room.width : room.height;
  const depth = across ? room.height : room.width;
  const toPoint = (l: number, d: number): VaultPoint => {
    switch (side) {
      case VaultSide.South:
        return { x: room.x + l, y: room.y + room.height - d };
      case VaultSide.North:
        return { x: room.x + l, y: room.y + d };
      case VaultSide.East:
        return { x: room.x + room.width - d, y: room.y + l };
      case VaultSide.West:
        return { x: room.x + d, y: room.y + l };
    }
  };
  return { lateral, depth, toPoint };
}

/**
 * Piedestały: wielki na osi komnaty w ostatnim rzędzie naprzeciw wejścia, pary symetrycznie wokół osi —
 * najpierw obok wielkiego (z odstępem 2 kafli), potem co drugi rząd ku wejściu. Rząd przy wejściu wolny.
 * Jeden losowy piedestał ma kokon z przedmiotem (który — nie widać).
 */
export function planVaultLayout(floor: DungeonFloor, area: SecretArea, config: SpiderVaultConfig, rng: Rng): SpiderVaultLayout {
  const entrance = vaultEntrance(floor, area).side;
  const { lateral: L, depth: D, toPoint } = frame(area.room, entrance);
  const m = config.wallMargin;
  const axis = L / 2;
  // Środek kafla (lateral, depth) w jednostkach kafli lokalnych: depth liczone od ściany wejścia.
  const center = (l: number, d: number) => toPoint(l + 0.5, d + 0.5);
  const farRow = D - 1 - m;
  const pedestals: VaultPedestal[] = [{ at: toPoint(axis, farRow + 0.5), grand: true }];
  const wanted = rng.int(config.pedestalPairs.min, config.pedestalPairs.max);
  const slots: [number, number][] = [];
  for (let d = farRow; d >= Math.max(m, 1); d -= 2) {
    const gap = d === farRow ? 2 : 1;
    // Kafel po lewej osi, którego środek jest co najmniej `gap` od osi; dalej co 2 kafle ku ścianie.
    for (let l = Math.floor(axis - gap - 0.5); l >= m; l -= 2) slots.push([l, d]);
  }
  for (const [l, d] of slots.slice(0, wanted)) {
    pedestals.push({ at: center(l, d), grand: false });
    pedestals.push({ at: center(L - 1 - l, d), grand: false });
  }
  return { entrance, pedestals, prize: Math.floor(rng.next() * pedestals.length) };
}

const between = (rng: Rng, range: { readonly min: number; readonly max: number }) => range.min + rng.next() * (range.max - range.min);
const dist = (a: VaultPoint, b: VaultPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Czy punkt świata (px) leży na kaflu skarbca — komnaty albo korytarza do niej (spowolnienie w jedwabiu). */
export function isInVault(area: SecretArea, floorWidth: number, point: VaultPoint, tileSize: number): boolean {
  const x = Math.floor(point.x / tileSize);
  const y = Math.floor(point.y / tileSize);
  return x >= 0 && x < floorWidth && area.tiles.has(y * floorWidth + x);
}

/** Kafel (całkowity), na którym stoi piedestał. */
export const pedestalTile = (p: VaultPedestal): TilePoint => ({ x: Math.floor(p.at.x), y: Math.floor(p.at.y - 0.01) });

/**
 * Oplot skarbca (własny strumień losowań — zmiana ozdób nie przestawia piedestałów ani nagrody):
 * płaty jedwabiu gęstsze przy ścianach i piedestałach, kałuże śluzu, sieci w narożnikach, zasłony na
 * północnym murze, zawinięte ciała śmiałków przy ścianach bocznych i nici napięte między piedestałami a murem.
 */
export function planVaultDecor(floor: DungeonFloor, area: SecretArea, layout: SpiderVaultLayout, config: SpiderVaultConfig, rng: Rng): SpiderVaultDecor {
  const r = area.room;
  const door = vaultEntrance(floor, area).tile;
  const pedestalTiles = layout.pedestals.map(pedestalTile);
  const isPedestal = (x: number, y: number) => pedestalTiles.some((t) => t.x === x && t.y === y);
  const nearPedestal = (x: number, y: number) => pedestalTiles.some((t) => Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1);
  const flip = () => ({ flipX: rng.chance(0.5), flipY: rng.chance(0.5) });

  const silk: VaultDecal[] = [];
  for (const i of area.tiles) {
    const x = i % floor.width;
    const y = Math.floor(i / floor.width);
    let chance: number;
    if (!inRoom(r, x, y)) chance = config.silkChance.corridor;
    else {
      const edge = Math.min(x - r.x, r.x + r.width - 1 - x, y - r.y, r.y + r.height - 1 - y);
      chance = edge === 0 ? config.silkChance.edge : edge === 1 ? config.silkChance.ring : config.silkChance.inner;
      if (nearPedestal(x, y)) chance = Math.max(chance, config.silkChance.nearPedestal);
    }
    if (!rng.chance(chance)) continue;
    const j = config.silkJitter;
    silk.push({ at: { x: x + 0.5 + (rng.next() * 2 - 1) * j, y: y + 0.5 + (rng.next() * 2 - 1) * j }, variant: rng.int(0, config.silkVariants - 1), ...flip() });
  }

  const free: TilePoint[] = [];
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) if (!isPedestal(x, y)) free.push({ x, y });
  const slime: VaultDecal[] = [];
  const pools = Math.min(free.length, rng.int(config.slimePools.min, config.slimePools.max));
  for (let k = 0; k < pools; k++) {
    const t = free.splice(Math.floor(rng.next() * free.length), 1)[0]!;
    const j = config.slimeJitter;
    slime.push({ at: { x: t.x + 0.5 + (rng.next() * 2 - 1) * j, y: t.y + 0.5 + (rng.next() * 2 - 1) * j }, variant: rng.int(0, config.slimeVariants - 1), ...flip() });
  }

  const nearDoor = (x: number, y: number) => Math.abs(x - door.x) <= 1 && Math.abs(y - door.y) <= 1;
  const corners: VaultCornerWeb[] = [];
  for (const [cx, cy, flipX, flipY] of [
    [r.x, r.y, false, false],
    [r.x + r.width, r.y, true, false],
    [r.x, r.y + r.height, false, true],
    [r.x + r.width, r.y + r.height, true, true],
  ] as const) {
    // Narożny kafel komnaty przy tym rogu; sieć nie zasłania wejścia.
    const tx = flipX ? cx - 1 : cx;
    const ty = flipY ? cy - 1 : cy;
    if (!nearDoor(tx, ty)) corners.push({ at: { x: cx, y: cy }, flipX, flipY });
  }

  const curtains: VaultDecal[] = [];
  for (let x = r.x; x < r.x + r.width; x++) {
    const y = r.y - 1;
    if (y < 0 || floor.tiles[y * floor.width + x] !== TileType.Wall) continue;
    if (rng.chance(config.curtainChance)) curtains.push({ at: { x, y }, variant: rng.int(0, config.curtainVariants - 1), flipX: rng.chance(0.5), flipY: false });
  }

  // Ciała śmiałków: przy ścianach bocznych (zachodniej i wschodniej), nie na piedestale i nie przy wejściu.
  const sideSpots: TilePoint[] = [];
  for (let y = r.y + 1; y < r.y + r.height - 1; y++) {
    for (const x of [r.x, r.x + r.width - 1]) if (!nearPedestal(x, y) && !nearDoor(x, y)) sideSpots.push({ x, y });
  }
  const husks: VaultDecal[] = [];
  const huskCount = Math.min(sideSpots.length, rng.int(config.husks.min, config.husks.max));
  for (let k = 0; k < huskCount; k++) {
    const t = sideSpots.splice(Math.floor(rng.next() * sideSpots.length), 1)[0]!;
    // Kafel obok na tej samej ścianie nie dostaje drugiego ciała.
    for (let s = sideSpots.length - 1; s >= 0; s--) if (sideSpots[s]!.x === t.x && Math.abs(sideSpots[s]!.y - t.y) <= 1) sideSpots.splice(s, 1);
    husks.push({ at: { x: t.x + 0.5, y: t.y + 0.5 }, variant: rng.int(0, config.huskVariants - 1), flipX: t.x !== r.x, flipY: false });
  }

  const threads: VaultThread[] = [];
  const sag = () => between(rng, config.sag);
  // Punkty zaczepu na obwodzie komnaty co pół kafla (bez odcinka wejścia).
  const perimeter: VaultPoint[] = [];
  for (let s = 0; s <= r.width * 2; s++) {
    perimeter.push({ x: r.x + s / 2, y: r.y }, { x: r.x + s / 2, y: r.y + r.height });
  }
  for (let s = 1; s < r.height * 2; s++) perimeter.push({ x: r.x, y: r.y + s / 2 }, { x: r.x + r.width, y: r.y + s / 2 });
  const anchors = perimeter.filter((p) => dist(p, { x: door.x + 0.5, y: door.y + 0.5 }) > 1.2);
  for (const p of layout.pedestals) {
    const reachable = anchors.filter((a) => {
      const d = dist(a, p.at);
      return d >= config.threadReach.min && d <= config.threadReach.max;
    });
    const n = Math.min(reachable.length, rng.int(config.threadsPerPedestal.min, config.threadsPerPedestal.max) + (p.grand ? 2 : 0));
    for (let k = 0; k < n; k++) {
      const to = reachable.splice(Math.floor(rng.next() * reachable.length), 1)[0]!;
      threads.push({ from: p.at, to, sag: sag() });
    }
  }
  for (const c of corners) {
    const sx = c.flipX ? -1 : 1;
    const sy = c.flipY ? -1 : 1;
    const chords = rng.int(config.cornerChords.min, config.cornerChords.max);
    for (let k = 0; k < chords; k++) {
      const a = between(rng, config.chordReach);
      const b = between(rng, config.chordReach);
      threads.push({ from: { x: c.at.x + sx * a, y: c.at.y }, to: { x: c.at.x, y: c.at.y + sy * b }, sag: sag() * 0.5 });
    }
  }
  // Nici od wielkiego piedestału do najbliższych sąsiadów (łuk nad ołtarzem).
  const grand = layout.pedestals.find((p) => p.grand);
  if (grand) {
    for (const p of layout.pedestals) {
      if (!p.grand && dist(p.at, grand.at) <= 3.2) threads.push({ from: grand.at, to: p.at, sag: sag() });
    }
  }
  return { silk, slime, corners, curtains, husks, threads };
}

/**
 * Piksele nici (krzywa Béziera 2. stopnia z ugięciem w dół) w pikselach świata — ciągła linia 1 px
 * (kolejne piksele stykają się bokiem albo rogiem), bez powtórzeń, z oboma końcami.
 */
export function threadPixels(from: VaultPoint, to: VaultPoint, sag: number): VaultPoint[] {
  if (Math.round(from.x) === Math.round(to.x) && Math.round(from.y) === Math.round(to.y)) return [{ x: Math.round(from.x), y: Math.round(from.y) }];
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2 + sag * 2;
  const at = (t: number) => ({
    x: Math.round((1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x),
    y: Math.round((1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y),
  });
  const steps = Math.max(1, Math.ceil((Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + Math.abs(sag) * 2) * 2));
  const out: VaultPoint[] = [];
  const seen = new Set<string>();
  const push = (p: VaultPoint) => {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return;
    // Uzupełnienie dziury (krok większy niż 1 px) linią prostą — ciągłość nici.
    const last = out[out.length - 1];
    if (last && Math.max(Math.abs(p.x - last.x), Math.abs(p.y - last.y)) > 1) {
      const n = Math.max(Math.abs(p.x - last.x), Math.abs(p.y - last.y));
      for (let i = 1; i < n; i++) {
        const q = { x: Math.round(last.x + ((p.x - last.x) * i) / n), y: Math.round(last.y + ((p.y - last.y) * i) / n) };
        const k = `${q.x},${q.y}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(q);
        }
      }
    }
    seen.add(key);
    out.push(p);
  };
  for (let i = 0; i <= steps; i++) push(at(i / steps));
  return out;
}

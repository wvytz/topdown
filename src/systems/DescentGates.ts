/**
 * Bramy i kupiec Zejścia (Akt II, krok Z4; `docs/AKT2.md` §4). Czysta logika: po bossie odbicia dwie bramy
 * prowadzą na różne odbicia (gdy trasa na to pozwala) z różnymi nagrodami; kupiec sprzedaje za złoto.
 */
import type { DescentConfig } from '@/config/descentConfig';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { ItemDefinition, ItemId } from '@/core/lootTypes';
import { GateReward } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { descentRoute } from '@/systems/Descent';
import { pickWeightedItem } from '@/systems/Loot';

type RouteShape = Pick<DescentConfig, 'floors' | 'firstFloor' | 'lastFloor'>;

export interface GateOption {
  /** Odbicie (piętro wieży) za bramą. */
  readonly floor: number;
  readonly reward: GateReward;
}

export interface GateRules {
  readonly seedSalt: number;
  readonly rewards: readonly GateReward[];
  readonly embersMultiplier: number;
  readonly goldMultiplier: number;
  readonly merchantDepths: readonly number[];
}

/** Co czeka za schodami odbicia: koniec (Dno zdobyte), ostatnie zejście bez wyboru albo dwie bramy. */
export type DescentStep =
  | { readonly kind: 'end' }
  | { readonly kind: 'final'; readonly floor: number }
  | { readonly kind: 'gates'; readonly options: readonly [GateOption, GateOption] };

/**
 * Przebyta droga runu. Zapis z kroku Z4 ją pamięta; starszy zapis (krok Z1) — odtwarzamy ją z trasy seeda,
 * a piętro spoza trasy zaczyna nową drogę.
 */
export function descentPathFor(saved: readonly number[] | undefined, floor: number, runSeed: number, config: RouteShape, salt: number): number[] {
  if (saved && saved.length > 0 && saved.at(-1) === floor) return [...saved];
  const route = descentRoute(runSeed, config, salt);
  const index = route.indexOf(floor);
  return index >= 0 ? route.slice(0, index + 1) : [floor];
}

/** Odbicia, które mogą być następne: dalej w dół i tak, żeby do Dna starczyło pięter na pełne Zejście. */
export function gateCandidates(path: readonly number[], config: RouteShape): number[] {
  const current = path.at(-1) ?? config.firstFloor;
  const slotsAfter = config.floors - path.length - 2;
  const candidates: number[] = [];
  for (let floor = current + 1; floor < config.lastFloor; floor++) {
    if (config.lastFloor - 1 - floor >= slotsAfter) candidates.push(floor);
  }
  return candidates;
}

/** Nagrody, które może mieć brama na tę głębię (kupiec nie dubluje stałego kupca głębi). */
function rewardsFor(depth: number, rules: GateRules): GateReward[] {
  return rules.rewards.filter((reward) => reward !== GateReward.Merchant || !rules.merchantDepths.includes(depth));
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[rng.int(0, items.length - 1)] ?? items[0]!;
}

/** Następny krok Zejścia po bossie bieżącego odbicia. Własny strumień RNG: seed runu + piętro wyjścia. */
export function descentStep(runSeed: number, path: readonly number[], config: RouteShape, rules: GateRules): DescentStep {
  if (path.length >= config.floors) return { kind: 'end' };
  if (path.length === config.floors - 1) return { kind: 'final', floor: config.lastFloor };
  const candidates = gateCandidates(path, config);
  const current = path.at(-1) ?? config.firstFloor;
  if (candidates.length === 0) return { kind: 'final', floor: config.lastFloor };
  const rng = createRng(deriveSeed(deriveSeed(runSeed, rules.seedSalt), current));
  const floors = [...candidates];
  const first = floors.splice(rng.int(0, floors.length - 1), 1)[0]!;
  const second = floors.length > 0 ? floors[rng.int(0, floors.length - 1)]! : first;
  const [left, right] = first <= second ? [first, second] : [second, first];
  const depth = path.length + 1;
  const pool = rewardsFor(depth, rules);
  const leftReward = pick(pool, rng);
  const rest = pool.filter((reward) => reward !== leftReward);
  const rightReward = rest.length > 0 ? pick(rest, rng) : leftReward;
  return { kind: 'gates', options: [{ floor: left, reward: leftReward }, { floor: right, reward: rightReward }] };
}

export function gateEmbersMultiplier(reward: GateReward | undefined, rules: GateRules): number {
  return reward === GateReward.Embers ? rules.embersMultiplier : 1;
}

export function gateGoldMultiplier(reward: GateReward | undefined, rules: GateRules): number {
  return reward === GateReward.Gold ? rules.goldMultiplier : 1;
}

/** Żar z ułamkowym mnożnikiem bramy: reszta przechodzi na kolejne zabicie (1 × 1,5 → 1, 2, 1, 2…). */
export class EmberTally {
  private carry = 0;

  constructor(private readonly multiplier: number) {}

  award(amount: number): number {
    const exact = amount * this.multiplier + this.carry;
    const whole = Math.floor(exact);
    this.carry = exact - whole;
    return whole;
  }
}

/** Czy na tej głębi stoi kupiec: stała głębia albo brama z nagrodą „kupiec”. */
export function merchantHere(depth: number, reward: GateReward | undefined, rules: GateRules): boolean {
  return reward === GateReward.Merchant || rules.merchantDepths.includes(depth);
}

export interface MerchantRules {
  readonly seedSalt: number;
  readonly items: number;
  readonly itemPrice: { readonly base: number; readonly perDepth: number };
  readonly heal: { readonly pct: number; readonly base: number; readonly perDepth: number };
}

export type MerchantOffer =
  | { readonly kind: 'item'; readonly item: ItemId; readonly price: number }
  | { readonly kind: 'heal'; readonly pct: number; readonly price: number };

/** Lada kupca: `items` różnych przedmiotów z puli (ważone jak łupy) i leczenie; ceny rosną z głębią. */
export function rollMerchantStock(pool: readonly ItemDefinition[], depth: number, rng: Rng, rules: MerchantRules): MerchantOffer[] {
  const step = Math.max(0, depth - 1);
  const itemPrice = rules.itemPrice.base + rules.itemPrice.perDepth * step;
  const offers: MerchantOffer[] = [];
  let left = [...pool];
  for (let i = 0; i < rules.items; i++) {
    const item = pickWeightedItem(left, rng);
    if (item === null) break;
    offers.push({ kind: 'item', item, price: itemPrice });
    left = left.filter((definition) => definition.id !== item);
  }
  offers.push({ kind: 'heal', pct: rules.heal.pct, price: rules.heal.base + rules.heal.perDepth * step });
  return offers;
}

/** Ziarno lady kupca (seed piętra + sól). */
export function merchantRng(floorSeed: number, rules: MerchantRules): Rng {
  return createRng(deriveSeed(floorSeed, rules.seedSalt));
}

/** Miejsce kupca w pokoju startowym: kafel podłogi obok miejsca startu (nie na nim), najbliżej ściany. */
export function planMerchantTile(floor: DungeonFloor): TilePoint | null {
  const room = floor.rooms.find((candidate) => candidate.id === floor.startRoomId);
  if (!room) return null;
  const spawn = floor.playerSpawn;
  const isFloor = (x: number, y: number): boolean =>
    x >= room.x && y >= room.y && x < room.x + room.width && y < room.y + room.height && floor.tiles[y * floor.width + x] === TileType.Floor;
  const offsets: readonly TilePoint[] = [
    { x: 2, y: -2 },
    { x: -2, y: -2 },
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
    { x: 1, y: 1 },
  ];
  for (const offset of offsets) {
    const x = spawn.x + offset.x;
    const y = spawn.y + offset.y;
    if (isFloor(x, y)) return { x, y };
  }
  return null;
}

import type { HeroDefinition } from '@/core/heroTypes';
import type { FloorSceneData } from '@/core/types';
import { RunMode } from '@/core/runMode';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import type { ItemId } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { EnemyType } from '@/core/combatTypes';
import { PickupKind } from '@/core/lootTypes';
import { createRng, deriveSeed } from '@/core/random';
import { AMBUSH_CONFIG } from '@/config/ambushConfig';
import { biomeForFloor } from '@/config/biomeConfig';
import { getEncounterConfigForFloor } from '@/config/combatConfig';
import { SECRET_ROOM_BIOME, getDungeonConfigForFloor } from '@/config/gameConfig';
import {
  BOSS_LOOT,
  BOSS_REWARD,
  ENEMY_LOOT,
  ITEM_DEFINITIONS,
  ITEM_EFFECTS,
  ITEM_POOL,
  LOOT_SCALING,
  SHRINE_CONFIG,
  STAT_LIMITS,
} from '@/config/lootConfig';
import type { PracticeLoadoutConfig } from '@/config/practiceLoadoutConfig';
import { hasAmbush } from '@/systems/Ambush';
import { usefulItemPool } from '@/systems/ItemUsefulness';
import { rollLoot, pickWeightedItem } from '@/systems/Loot';
import type { RewardRoll } from '@/systems/ItemEvolution';
import { countItems, rollRewardChoices } from '@/systems/ItemEvolution';
import { makeOffering } from '@/systems/Shrine';

/** Skąd przedmiot trafił do zestawu — do diagnostyki i testów. */
export type PracticeItemSource = 'drop' | 'ambush' | 'shrine' | 'secret' | 'boss';

export interface PracticeLoadout {
  readonly items: readonly ItemId[];
  readonly gold: number;
  readonly sources: Readonly<Record<PracticeItemSource, number>>;
}

const PRACTICE_LOADOUT_SALT = 0x5eed;

/** Czy adres prosi o zestaw: domyślnie tak, `?items=0` — nie. */
export function wantsPracticeLoadout(search: string, config: Pick<PracticeLoadoutConfig, 'urlParam' | 'offValue'>): boolean {
  return new URLSearchParams(search).get(config.urlParam) !== config.offValue;
}

/**
 * Symuluje przejście pięter 1…`targetFloor − 1` (krok 148): wrogowie z prawdziwych tabel łupów, zasadzki
 * z harmonogramu seeda runu, ukryta komnata w Grzybni, kapliczka i 1 z 3 kart za bossa (wybór losowy).
 * Ten sam seed runu = ten sam zestaw. `stream` rozdziela zestawy bohaterów w co-opie.
 */
export function simulatePracticeLoadout(
  runSeed: number,
  targetFloor: number,
  hero: HeroDefinition,
  config: PracticeLoadoutConfig,
  stream = 0,
): PracticeLoadout {
  const rng = createRng(deriveSeed(runSeed, PRACTICE_LOADOUT_SALT + stream));
  const items: ItemId[] = [];
  const sources: Record<PracticeItemSource, number> = { drop: 0, ambush: 0, shrine: 0, secret: 0, boss: 0 };
  let gold = 0;
  const grant = (id: ItemId | null, source: PracticeItemSource): void => {
    if (id === null) return;
    items.push(id);
    sources[source] += 1;
  };
  const useful = () => usefulItemPool(ITEM_POOL, hero, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);

  for (let floor = 1; floor < targetFloor; floor += 1) {
    const kills = floorKills(floor, config, rng);
    for (let i = 0; i < kills; i += 1) {
      const type = rng.chance(getEncounterConfigForFloor(floor).kiterChance) ? EnemyType.Kiter : EnemyType.Rusher;
      for (const drop of rollLoot(ENEMY_LOOT[type], floor, LOOT_SCALING, ITEM_POOL, rng)) {
        if (drop.kind === PickupKind.Gold) gold += drop.amount;
        if (drop.kind === PickupKind.Item) grant(drop.itemId, 'drop');
      }
    }
    if (hasAmbush(runSeed, floor, AMBUSH_CONFIG)) grant(pickWeightedItem(ITEM_POOL, rng), 'ambush');
    if (rng.chance(config.shrineChance)) {
      const offering = makeOffering({ gold, floor, alreadyUsed: false, config: SHRINE_CONFIG, pool: useful(), rng });
      if (offering.ok) {
        gold -= offering.cost;
        grant(offering.itemId, 'shrine');
      }
    }
    for (const drop of rollLoot(BOSS_LOOT, floor, LOOT_SCALING, ITEM_POOL, rng)) {
      if (drop.kind === PickupKind.Gold) gold += drop.amount;
    }
    // Krok 150: karty z kartą rozwoju; gracz buduje przemianę — bierze kartę przemiany, zwykle też kartę rozwoju.
    const roll = rollRewardChoices(useful(), BOSS_REWARD.choices, rng, items, ITEM_EFFECTS.evolution);
    grant(pickLikeBuilder(roll, items, config, rng), 'boss');
    // Ukryta komnata za areną (krok 46/51): tylko w Grzybni, po bossie.
    if (biomeForFloor(floor).id === SECRET_ROOM_BIOME) grant(pickWeightedItem(ITEM_POOL, rng), 'secret');
  }
  return { items, gold, sources };
}

/**
 * Wybór karty „przeciętnego” gracza po kroku 150: karta przemiany zawsze, karta rozwoju z szansą
 * `developmentPickChance`, inaczej losowa karta.
 */
function pickLikeBuilder(roll: RewardRoll, owned: readonly ItemId[], config: PracticeLoadoutConfig, rng: Rng): ItemId | null {
  const counts = countItems(owned);
  const evolving = roll.choices.find((id) => (counts.get(id) ?? 0) === ITEM_EFFECTS.evolution.copies - 1);
  if (evolving) return evolving;
  if (roll.development && rng.chance(config.developmentPickChance)) return roll.development;
  return roll.choices[rng.int(0, roll.choices.length - 1)] ?? null;
}

/** Liczba zabitych wrogów na piętrze: pokoje i wrogowie na pokój jak w generatorze, razy część zabitych. */
function floorKills(floor: number, config: PracticeLoadoutConfig, rng: Rng): number {
  const { roomCount } = getDungeonConfigForFloor(floor);
  const { enemiesPerRoom } = getEncounterConfigForFloor(floor);
  const rooms = Math.max(0, rng.int(roomCount.min, roomCount.max) - config.quietRooms);
  let enemies = 0;
  for (let i = 0; i < rooms; i += 1) enemies += rng.int(enemiesPerRoom.min, enemiesPerRoom.max);
  return Math.round(enemies * config.killShare);
}

/**
 * Dane startu z zestawem (krok 148): run testowy wspinaczki od piętra N > 1 dostaje przedmioty i złoto
 * z symulacji pięter 1…N−1. W co-opie partner ma własny zestaw (osobny strumień). Inne starty bez zmian.
 */
export function applyPracticeLoadout(
  data: FloorSceneData,
  config: PracticeLoadoutConfig,
  fixedItems: readonly ItemId[] | null = null,
): { data: FloorSceneData; loadout: PracticeLoadout | null } {
  const mode = data.run.mode ?? RunMode.Tower;
  if (data.run.practice !== true || mode !== RunMode.Tower || (data.floor <= 1 && !fixedItems)) return { data, loadout: null };
  const simulated = simulatePracticeLoadout(data.runSeed, data.floor, HERO_DEFINITIONS[data.run.hero], config);
  // Krok 150: `?items=electric-arrow*3,…` — dokładnie ten zestaw (np. do obejrzenia przemiany na arenie).
  const own = fixedItems ? { ...simulated, items: [...fixedItems] } : simulated;
  const run = { ...data.run, items: own.items, gold: own.gold };
  const partner = data.coop?.partner;
  if (!data.coop || !partner) return { data: { ...data, run }, loadout: own };
  const partnerItems = simulatePracticeLoadout(data.runSeed, data.floor, HERO_DEFINITIONS[partner.hero], config, 1).items;
  return { data: { ...data, run, coop: { ...data.coop, partner: { ...partner, items: partnerItems } } }, loadout: own };
}

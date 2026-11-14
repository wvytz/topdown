import type { HeroId } from '@/core/heroTypes';
import type { FloorSceneData } from '@/core/types';
import type { CoopPartnerSnapshot, CoopSceneData } from '@/core/types';
import type { ItemDefinition, ItemEvolutionConfig, ItemId } from '@/core/lootTypes';
import { RunMode } from '@/core/runMode';
import { countItems, describeRewardCard, type RewardCardKind } from '@/systems/ItemEvolution';
import { DEFAULT_COOP_DEVICES } from '@/systems/coopDevices';
import { BOT_DEVICES, SOLO_DEVICES } from '@/systems/coopDevices';
import { freshCoop, partnerHero } from '@/systems/Coop';

/**
 * Ukryty tryb bota-partnera (krok 149, pomysł właściciela): `?bot=1` dokłada drugiego bohatera sterowanego
 * przez AI; `?bot=archer` (sorceress, barbarian) wybiera mu bohatera. W menu go nie ma. Czysta logika.
 */

/** Bohater bota z adresu: konkretny, `null` — „następny po bohaterze gracza”; brak parametru = tryb wyłączony. */
export function parseBotParam(search: string, param: string, parseHero: (value: string | null) => HeroId | null): { hero: HeroId | null } | null {
  const value = new URLSearchParams(search).get(param);
  if (value === null || value === '' || value === '0') return null;
  return { hero: parseHero(value) };
}

/**
 * Dane piętra z botem: w zwykłej wspinaczce (jak co-op — decyzja właściciela) bot zajmuje miejsce P2,
 * a gracz steruje wszystkimi urządzeniami jak solo. Run z botem jest testowy — nie trafia na tablicę.
 * Już obecny partner (np. z zapisu) przechodzi pod bota; poza wspinaczką — bez zmian.
 */
export function withPartnerBot(data: FloorSceneData, bot: { hero: HeroId | null } | null, heroOrder: readonly HeroId[]): FloorSceneData {
  if (!bot || (data.run.mode ?? RunMode.Tower) !== RunMode.Tower) return data;
  const devices = [SOLO_DEVICES, BOT_DEVICES];
  const coop = data.coop
    ? { ...data.coop, devices }
    : freshCoop(partnerHero(data.run.hero, bot.hero ?? data.run.hero, heroOrder), devices);
  return { ...data, run: { ...data.run, practice: true }, coop };
}

/** Czy P2 to bot (urządzenia z `withPartnerBot`). */
export const isBotCoop = (data: Pick<FloorSceneData, 'coop'>): boolean => data.coop?.devices[1]?.bot === true;

/** Kolejność kart dla bota (krok U9a): przemiana, relikwia bossa, kolejna kopia, nowy przedmiot, kopia po przemianie. */
const BOT_CARD_ORDER: readonly RewardCardKind[] = ['evolution', 'relic', 'growth', 'new', 'evolved'];

/**
 * Karta za bossa dla bota (krok U9a): zamiast pierwszej z brzegu — ta, która daje przemianę, potem relikwia,
 * potem rozwój przedmiotu w budowie. Przy remisie wygrywa karta stojąca wcześniej (karty są losowe, więc to uczciwe).
 */
export function botRewardPick(
  choices: readonly ItemId[],
  owned: readonly ItemId[],
  definitions: Readonly<Record<ItemId, ItemDefinition>>,
  evolution: ItemEvolutionConfig,
): ItemId | undefined {
  const counts = countItems(owned);
  let best: ItemId | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const id of choices) {
    const rank = BOT_CARD_ORDER.indexOf(describeRewardCard(definitions[id], counts.get(id) ?? 0, evolution).kind);
    if (rank < bestRank) {
      best = id;
      bestRank = rank;
    }
  }
  return best;
}

/** Partner z zapisu (krok U9a): run z botem wraca z botem, zwykły co-op — P1 klawiatura z myszą, P2 pad. */
export function coopFromSave(partner: CoopPartnerSnapshot): CoopSceneData {
  const { bot, ...snapshot } = partner;
  return { partner: snapshot, devices: bot ? [SOLO_DEVICES, BOT_DEVICES] : DEFAULT_COOP_DEVICES };
}

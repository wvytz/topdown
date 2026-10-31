import type { HeroId } from '@/core/heroTypes';
import type { FloorSceneData } from '@/core/types';
import { RunMode } from '@/core/runMode';
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

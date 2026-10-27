import type { HeroId } from '@/core/heroTypes';
import type { RunSnapshot } from '@/core/lootTypes';
import type { CoopPartnerSnapshot } from '@/core/types';
import { ItemId } from '@/core/lootTypes';
import { RunMode } from '@/core/runMode';
import { HERO_DEFINITIONS, parseHeroId } from '@/config/heroConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { floorLabel } from '@/systems/TowerLoop';

/**
 * Zapis gry (krok 91): punkt kontrolny z wejścia na piętro — seed runu, piętro i stan runu (bohater, złoto,
 * przedmioty, HP). Generowanie pięter jest deterministyczne, więc to wystarcza, by odtworzyć piętro od początku.
 */
export interface SaveData {
  readonly runSeed: number;
  readonly floor: number;
  readonly run: RunSnapshot;
  /** Co-op (etap C7): partner z wejścia na piętro — bohater, przedmioty, HP; brak w grze solo. */
  readonly coop?: CoopPartnerSnapshot;
}

export interface SaveRecord extends SaveData {
  readonly version: 1;
  /** Chwila zapisu (ms od epoki). */
  readonly savedAt: number;
}

export const SAVE_VERSION = 1;

export function toSaveRecord(data: SaveData, savedAt: number): SaveRecord {
  const coop = data.coop && { coop: { ...data.coop, items: [...data.coop.items] } };
  return { version: SAVE_VERSION, savedAt, runSeed: data.runSeed, floor: data.floor, run: { ...data.run, items: [...data.run.items] }, ...coop };
}

const ITEM_IDS = new Set<string>(Object.values(ItemId));
const RUN_MODES = new Set<string>(Object.values(RunMode));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Odczyt zapisu z tekstu (JSON z magazynu). Uszkodzony, obcy albo z innej wersji = null — gra go pomija. */
export function parseSaveRecord(raw: string | null): SaveRecord | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== SAVE_VERSION) return null;
  const { savedAt, runSeed, floor, run, coop } = value;
  if (!isCount(savedAt) || !isCount(runSeed) || runSeed > 0xffffffff || !isCount(floor) || floor < 1) return null;
  const snapshot = parseRunSnapshot(run);
  if (!snapshot) return null;
  if (coop === undefined) return { version: SAVE_VERSION, savedAt, runSeed, floor, run: snapshot };
  const partner = parsePartner(coop);
  return partner ? { version: SAVE_VERSION, savedAt, runSeed, floor, run: snapshot, coop: partner } : null;
}

function parsePartner(value: unknown): CoopPartnerSnapshot | null {
  if (!isRecord(value)) return null;
  const hero = parseHeroId(typeof value.hero === 'string' ? value.hero : null);
  const { items, hp } = value;
  if (!hero || !Array.isArray(items) || !items.every((id): id is ItemId => typeof id === 'string' && ITEM_IDS.has(id))) return null;
  if (hp !== null && !(typeof hp === 'number' && Number.isFinite(hp) && hp > 0)) return null;
  return { hero, items, hp };
}

function parseRunSnapshot(value: unknown): RunSnapshot | null {
  if (!isRecord(value)) return null;
  const hero = parseHeroId(typeof value.hero === 'string' ? value.hero : null);
  const { gold, items, hp, practice, mode, fromSave, startFloor } = value;
  if (!hero || !isCount(gold) || !Array.isArray(items)) return null;
  if (!items.every((id): id is ItemId => typeof id === 'string' && ITEM_IDS.has(id))) return null;
  if (hp !== null && !(typeof hp === 'number' && Number.isFinite(hp) && hp > 0)) return null;
  if (practice !== undefined && typeof practice !== 'boolean') return null;
  if (fromSave !== undefined && typeof fromSave !== 'boolean') return null;
  if (mode !== undefined && !(typeof mode === 'string' && RUN_MODES.has(mode))) return null;
  if (startFloor !== undefined && !(isCount(startFloor) && startFloor >= 1)) return null;
  return {
    hero,
    gold,
    items,
    hp,
    practice: practice ?? false,
    ...(mode !== undefined && mode !== RunMode.Tower ? { mode: mode as RunMode } : {}),
    ...(fromSave ? { fromSave } : {}),
    ...(startFloor !== undefined ? { startFloor } : {}),
  };
}

/**
 * Stan do wczytania. Autozapis to ten sam run (po śmierci znika), więc zachowuje miejsce na tablicy;
 * run z ręcznego slotu dostaje znacznik `fromSave`, chyba że konfiguracja pozwala go liczyć.
 */
export function loadFromRecord(record: SaveRecord, source: 'auto' | 'slot', manualLoadRanked: boolean): SaveData {
  const fromSave = record.run.fromSave === true || (source === 'slot' && !manualLoadRanked);
  const run: RunSnapshot = { ...record.run, items: [...record.run.items], ...(fromSave ? { fromSave } : {}) };
  const coop = record.coop && { coop: { ...record.coop, items: [...record.coop.items] } };
  return { runSeed: record.runSeed, floor: record.floor, run, ...coop };
}

/** Run nie trafia na tablicę wyników (start z adresu albo wczytany ze slotu). */
export const isUnranked = (run: Pick<RunSnapshot, 'practice' | 'fromSave'>): boolean => run.practice === true || run.fromSave === true;

export interface SaveSummary {
  /** „Barbarzyńca · Piętro 3” / „Łucznik · Arena 2”. */
  readonly title: string;
  /** „1240 złota · 4 przedmioty · 22.10 12:30”. */
  readonly details: string;
}

/** Krótki opis zapisu do menu i pauzy. */
export function saveSummary(record: SaveRecord): SaveSummary {
  const hero: HeroId = record.run.hero;
  const where = record.run.mode === RunMode.BossRush ? `Arena ${record.floor}` : floorLabel(record.floor, TOWER_CONFIG);
  const items = record.run.items.length;
  const parts = [`${record.run.gold} złota`, `${items} ${itemsWord(items)}`, formatSavedAt(record.savedAt)];
  const heroes = record.coop ? `${HERO_DEFINITIONS[hero].name} + ${HERO_DEFINITIONS[record.coop.hero].name}` : HERO_DEFINITIONS[hero].name;
  return { title: `${heroes} · ${where}`, details: parts.join(' · ') };
}

/** Polska odmiana: 1 przedmiot, 2–4 przedmioty, 5+ przedmiotów (12–14 też „przedmiotów”). */
export function itemsWord(count: number): string {
  if (count === 1) return 'przedmiot';
  const tens = count % 100;
  const ones = count % 10;
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? 'przedmioty' : 'przedmiotów';
}

/** „22.10 12:30” w czasie lokalnym. */
export function formatSavedAt(savedAt: number): string {
  const d = new Date(savedAt);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Stan walki podawany blokadzie zapisu co klatkę. */
export interface BossSaveLockState {
  readonly bossFighting: boolean;
  readonly bossDefeated: boolean;
}

/** Zmiana blokady: `lock` — usuń autozapis, `unlock` — zapisz go z powrotem. */
export type BossSaveLockStep = 'lock' | 'unlock' | null;

/**
 * Blokada zapisu na czas walki z bossem (krok 121, zgłoszenie właściciela: zapis w trakcie walki
 * cofał na początek areny — darmowa druga szansa). Od przebudzenia bossa do jego śmierci nie ma ręcznego
 * zapisu ani autozapisu „Kontynuuj”, więc wyjście z gry w trakcie walki kończy run. W arenach bossów
 * piętro to sama walka, więc blokada trwa od wejścia. Po zwycięstwie zapis wraca (stan z wejścia na piętro).
 */
export class BossSaveLock {
  private engaged: boolean;
  private released = false;

  constructor(bossRush: boolean) {
    this.engaged = bossRush;
  }

  get locked(): boolean {
    return this.engaged;
  }

  update(state: BossSaveLockState): BossSaveLockStep {
    if (this.released) return null;
    if (state.bossDefeated) {
      this.released = true;
      if (!this.engaged) return null;
      this.engaged = false;
      return 'unlock';
    }
    // Boss raz obudzony trzyma blokadę do śmierci — także gdy na chwilę wypadnie z fazy walki.
    if (!this.engaged && state.bossFighting) {
      this.engaged = true;
      return 'lock';
    }
    return null;
  }
}

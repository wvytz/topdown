import type { ItemId } from '@/core/lootTypes';

/**
 * Trwały profil gracza (Akt II, krok Z1): czysta logika — odblokowanie Popielnika, Żar, statystyki Zejść i rangi.
 * Zapis i odczyt z magazynu: `persistence/MetaStorage.ts`.
 */
export interface MetaProfile {
  readonly version: 1;
  /** Wiedźma pokonana choć raz — Popielnik jest dostępny z menu. */
  readonly hideoutUnlocked: boolean;
  /** Scena upadku do Popielnika już pokazana. */
  readonly arrivalSeen: boolean;
  /** Żar — waluta trwała. */
  readonly embers: number;
  /** Rozpoczęte i ukończone Zejścia; najgłębsza osiągnięta głębia. */
  readonly runs: number;
  readonly wins: number;
  readonly bestDepth: number;
  /** Piętra wieży, których bossów (albo ich odbicia) gracz pokonał od odblokowania Popielnika — półka trofeów. */
  readonly trophies: readonly number[];
  /** Krok Z3: Wota znalezione w runach, czekające na wypalenie w Piecu wotów. */
  readonly foundVotives: readonly ItemId[];
  /** Krok Z3: Wota wypalone — są w puli łupów i można je wybrać na start Zejścia. */
  readonly burnedVotives: readonly ItemId[];
  /** Krok Z3: przedmiot startowy Zejścia (jedno z wypalonych Wot); null — bez. */
  readonly startItem: ItemId | null;
  /** Krok Z5: ukończone poziomy Zaćmienia (0 — żadnego; 1 — Dno na poziomie 0 …) — z nich ranga. */
  readonly eclipseCleared: number;
  /** Krok Z5: poziom Zaćmienia wybrany przy Bramie (następne Zejście). */
  readonly eclipse: number;
  /** Krok Z5: Kram kupca wykupiony — kupiec Zejścia wykłada przedmiot więcej. */
  readonly stallBought: boolean;
}

export const META_VERSION = 1;

export const EMPTY_META: MetaProfile = {
  version: META_VERSION,
  hideoutUnlocked: false,
  arrivalSeen: false,
  embers: 0,
  runs: 0,
  wins: 0,
  bestDepth: 0,
  trophies: [],
  foundVotives: [],
  burnedVotives: [],
  startItem: null,
  eclipseCleared: 0,
  eclipse: 0,
  stallBought: false,
};

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Odczyt profilu z tekstu (JSON z magazynu). Brak, uszkodzony albo z innej wersji = pusty profil.
 * `knownVotives` — identyfikatory Wot, które gra zna (obce wpisy odpadają; profil z kroku Z1 nie ma ich wcale).
 */
export function parseMetaProfile(raw: string | null, knownVotives: readonly ItemId[] = []): MetaProfile {
  if (raw === null) return EMPTY_META;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_META;
  }
  if (typeof value !== 'object' || value === null) return EMPTY_META;
  const data = value as Record<string, unknown>;
  if (data.version !== META_VERSION) return EMPTY_META;
  const { embers, runs, wins, bestDepth, trophies } = data;
  if (!isCount(embers) || !isCount(runs) || !isCount(wins) || !isCount(bestDepth)) return EMPTY_META;
  const votives = (list: unknown): ItemId[] =>
    Array.isArray(list) ? [...new Set(list.filter((id): id is ItemId => knownVotives.includes(id as ItemId)))] : [];
  const burnedVotives = votives(data.burnedVotives);
  const foundVotives = votives(data.foundVotives).filter((id) => !burnedVotives.includes(id));
  const startItem = burnedVotives.includes(data.startItem as ItemId) ? (data.startItem as ItemId) : null;
  // Krok Z5: profil sprzed Zaćmień — każde zdobyte Dno było poziomem 0 (ranga Zahartowany zostaje).
  const eclipseCleared = isCount(data.eclipseCleared) ? data.eclipseCleared : wins > 0 ? 1 : 0;
  const eclipse = isCount(data.eclipse) && data.eclipse <= eclipseCleared ? data.eclipse : 0;
  const shelf = Array.isArray(trophies) ? [...new Set(trophies.filter((floor): floor is number => isCount(floor) && floor >= 1))].sort((a, b) => a - b) : [];
  return {
    version: META_VERSION,
    hideoutUnlocked: data.hideoutUnlocked === true,
    arrivalSeen: data.arrivalSeen === true,
    embers,
    runs,
    wins,
    bestDepth,
    trophies: shelf,
    foundVotives,
    burnedVotives,
    startItem,
    eclipseCleared,
    eclipse,
    stallBought: data.stallBought === true,
  };
}

/**
 * Pierwsze pokonanie Wiedźmy: Popielnik odblokowany, a przedmioty z runu spalają się na pierwszy Żar.
 * Kolejne zwycięstwa niczego nie dokładają (zwraca ten sam profil i 0).
 */
export function unlockHideout(
  profile: MetaProfile,
  itemCount: number,
  config: { readonly arrivalEmbersPerItem: number; readonly arrivalEmbersMin: number },
): { readonly profile: MetaProfile; readonly embers: number } {
  if (profile.hideoutUnlocked) return { profile, embers: 0 };
  const embers = Math.max(config.arrivalEmbersMin, Math.max(0, Math.floor(itemCount)) * config.arrivalEmbersPerItem);
  return { profile: { ...profile, hideoutUnlocked: true, embers: profile.embers + embers }, embers };
}

/** Scena upadku obejrzana — kolejne wejścia do Popielnika zaczynają się zwyczajnie. */
export function markArrivalSeen(profile: MetaProfile): MetaProfile {
  return profile.arrivalSeen ? profile : { ...profile, arrivalSeen: true };
}

/** Skrót testowy `?hub=1`: Popielnik otwarty na stałe, bez sceny upadku i bez Żaru na dobry początek. */
export function openHideoutForTest(profile: MetaProfile): MetaProfile {
  return profile.hideoutUnlocked ? profile : { ...profile, hideoutUnlocked: true, arrivalSeen: true };
}

export interface DescentOutcome {
  /** Żar oddany przez run (już po stracie przy śmierci). */
  readonly embers: number;
  /** Głębia, na której run się skończył (1..n). */
  readonly depth: number;
  readonly victory: boolean;
  /** Krok Z5: poziom Zaćmienia runu (brak — 0). */
  readonly eclipse?: number;
}

/**
 * Koniec Zejścia: Żar do profilu, statystyki i najgłębsza głębia. Krok Z5: zwycięstwo zalicza poziom Zaćmienia
 * (`levelCount` — ile poziomów istnieje; ukończone nie przekraczają tej liczby).
 */
export function bankDescent(profile: MetaProfile, outcome: DescentOutcome, levelCount = 1): MetaProfile {
  const level = Math.max(0, Math.floor(outcome.eclipse ?? 0));
  return {
    ...profile,
    eclipseCleared: outcome.victory ? Math.min(levelCount, Math.max(profile.eclipseCleared, level + 1)) : profile.eclipseCleared,
    embers: profile.embers + Math.max(0, Math.floor(outcome.embers)),
    runs: profile.runs + 1,
    wins: profile.wins + (outcome.victory ? 1 : 0),
    bestDepth: Math.max(profile.bestDepth, Math.max(0, Math.floor(outcome.depth))),
  };
}

/** Trofeum za bossa piętra wieży (albo jego odbicie); bez powtórek, rosnąco. Przed odblokowaniem Popielnika — nic. */
export function addTrophy(profile: MetaProfile, towerFloor: number): MetaProfile {
  if (!profile.hideoutUnlocked || !Number.isInteger(towerFloor) || towerFloor < 1 || profile.trophies.includes(towerFloor)) return profile;
  return { ...profile, trophies: [...profile.trophies, towerFloor].sort((a, b) => a - b) };
}

/** Ranga gracza (krok Z5, §6): za ukończone poziomy Zaćmienia. */
export function metaRank(profile: Pick<MetaProfile, 'eclipseCleared'>, ranks: readonly string[]): string {
  return ranks[Math.max(0, Math.min(profile.eclipseCleared, ranks.length - 1))] ?? '';
}

/** Wybór poziomu Zaćmienia przy Bramie (tylko otwarte: 0..ukończone, do `max`). */
export function chooseEclipse(profile: MetaProfile, level: number, max: number): MetaProfile {
  const open = Math.min(profile.eclipseCleared, max);
  if (!Number.isInteger(level) || level < 0 || level > open || level === profile.eclipse) return profile;
  return { ...profile, eclipse: level };
}

/** Skrót testowy `?hub=1&eclipse=1` (krok Z5): wszystkie poziomy Zaćmienia do wyboru (ranga rośnie razem z nimi). */
export function openEclipsesForTest(profile: MetaProfile, max: number): MetaProfile {
  return profile.eclipseCleared >= max ? profile : { ...profile, eclipseCleared: max };
}

/** Kram kupca (krok Z5): jednorazowy zakup za Żar. Bez Żaru albo już kupiony — bez zmian. */
export function buyStall(profile: MetaProfile, cost: number): MetaProfile {
  if (profile.stallBought || profile.embers < cost) return profile;
  return { ...profile, embers: profile.embers - cost, stallBought: true };
}

// ---------------- Wota (krok Z3) ----------------

/** Znalezione Wotum trafia na listę do wypalenia (bez powtórek; wypalone i znane — bez zmian). */
export function findVotive(profile: MetaProfile, votive: ItemId): MetaProfile {
  if (profile.foundVotives.includes(votive) || profile.burnedVotives.includes(votive)) return profile;
  return { ...profile, foundVotives: [...profile.foundVotives, votive] };
}

/** Wota znane profilowi (znalezione albo wypalone) — tych już się nie znajduje. */
export function knownVotives(profile: MetaProfile): ItemId[] {
  return [...profile.burnedVotives, ...profile.foundVotives];
}

/**
 * Wypalenie Wotum w Piecu: kosztuje Żar, przedmiot wchodzi do puli łupów. Pierwsze wypalone od razu staje się
 * przedmiotem startowym (gracz zmienia go przy Palenisku). Bez Żaru albo bez tego Wotum — profil bez zmian.
 */
export function burnVotive(profile: MetaProfile, votive: ItemId, cost: number): MetaProfile {
  if (!profile.foundVotives.includes(votive) || profile.embers < cost) return profile;
  return {
    ...profile,
    embers: profile.embers - cost,
    foundVotives: profile.foundVotives.filter((id) => id !== votive),
    burnedVotives: [...profile.burnedVotives, votive],
    startItem: profile.startItem ?? votive,
  };
}

/** Palenisko: następny przedmiot startowy w kolejce (wypalone Wota, potem „bez przedmiotu”). */
export function cycleStartItem(profile: MetaProfile): MetaProfile {
  const options: (ItemId | null)[] = [...profile.burnedVotives, null];
  if (options.length === 1) return profile;
  const index = options.indexOf(profile.startItem);
  return { ...profile, startItem: options[(index + 1) % options.length] ?? null };
}

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
};

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Odczyt profilu z tekstu (JSON z magazynu). Brak, uszkodzony albo z innej wersji = pusty profil. */
export function parseMetaProfile(raw: string | null): MetaProfile {
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
}

/** Koniec Zejścia: Żar do profilu, statystyki i najgłębsza głębia. */
export function bankDescent(profile: MetaProfile, outcome: DescentOutcome): MetaProfile {
  return {
    ...profile,
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

/** Ranga gracza: najwyższa, na którą wystarcza ukończonych Zejść. */
export function metaRank(profile: Pick<MetaProfile, 'wins'>, ranks: readonly { readonly wins: number; readonly name: string }[]): string {
  let name = ranks[0]?.name ?? '';
  for (const rank of ranks) if (profile.wins >= rank.wins) name = rank.name;
  return name;
}

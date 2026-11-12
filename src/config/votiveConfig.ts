import type { VotiveConfig } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';

/**
 * Krok Z3 (Akt II, `docs/AKT2.md` §5): pierwsze Wota — przedmioty ochronne zaprojektowane 25.10 (pomysły właściciela:
 * Pancerz z odwłoka i Rdzeń Tarczownika). Liczby wg poleconych odpowiedzi z Q&A: odporność 50% na kopię,
 * druga kopia = pełna; ochrona to czysty plus (ceną jest miejsce na karcie zamiast ataku).
 */
export const VOTIVE_CONFIG: VotiveConfig = {
  carapace: { resistPerCopy: 0.5 },
  shieldCore: { resistPerCopy: 0.5 },
  // −8% za kopię, malejąco (8 / 15 / 22 / 28%…), sufit 30%.
  stoneScale: { reductionPerCopy: 0.08, max: 0.3 },
  // Ratunek raz na piętro: 1 HP i 1 s nietykalności; druga kopia leczy przy ratunku 10% maks. HP.
  guideBone: { invulnerableMs: 1000, healPctPerExtraCopy: 0.1, maxCopies: 2 },
};

/** Wota w kolejności odkrywania i wypalania (Piec wotów). Kolejne próby (Z6+) dokładają tu swoje. */
export const VOTIVE_ORDER: readonly ItemId[] = [ItemId.Carapace, ItemId.ShieldCore, ItemId.StoneScale, ItemId.GuideBone];

/** Piec wotów i przedmiot startowy (krok Z3). */
export const KILN_CONFIG = {
  /** Żar za wypalenie jednego Wotum (Zejście daje ok. 60–90 Żaru). */
  burnCost: 30,
  /** Sól strumienia RNG, który wybiera znalezione Wotum (seed runu + piętro). */
  findSeedSalt: 0x7a07,
} as const;

/** Sygnał zadziałania ochrony (pytanie 8 z Q&A: błysk koloru nad bohaterem). */
export const WARD_VISUAL = {
  poison: { tint: 0x7fd36b, text: 'jad odparty' },
  fire: { tint: 0xffa040, text: 'żar odparty' },
  rescue: { tint: 0xe8dcc0, text: 'pies cię przeprowadził' },
  flashMs: 160,
  /** Napis najwyżej raz na tyle ms (trucizna tyka co 0,5 s). */
  textCooldownMs: 2500,
} as const;

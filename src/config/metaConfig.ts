/**
 * Trwały profil gracza (Akt II, krok Z1; `docs/AKT2.md` §5): to, co zostaje między runami. Odblokowania
 * poszerzają wybór, nie podnoszą statystyk (decyzja właściciela 11.11.2026).
 */
export const META_CONFIG = {
  /** Klucz magazynu — osobny od zapisów runu; stara nazwa gry zostaje w kluczach celowo (jak reszta). */
  storageKey: 'tower-crawler.meta.v1',
  /** Pierwsze lądowanie w Popielniku: przedmioty z runu spalają się na Żar (tyle za sztukę). */
  arrivalEmbersPerItem: 3,
  /** Najmniej Żaru za pierwsze lądowanie (gdyby bohater doszedł prawie bez przedmiotów). */
  arrivalEmbersMin: 15,
} as const;

export type MetaConfig = typeof META_CONFIG;

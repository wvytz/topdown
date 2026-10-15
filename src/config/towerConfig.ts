/**
 * Pętla wieży (krok 43, wariant B właściciela): po piętrze 6 (Kat Otchłani) wspinaczka trwa dalej —
 * kolejny krąg przechodzi te same biomy i bossów od nowa. Trudność dalej rośnie z numerem piętra
 * (ENEMY_SCALING), a elity w każdym kolejnym kręgu mają o cechę więcej. Finałowego bossa jeszcze nie ma.
 */
export const TOWER_CONFIG = {
  /** Pięter w jednym kręgu (biomy 1–6). */
  floorsPerLoop: 6,
  /** Cech elity w pierwszym kręgu i przyrost na każdy kolejny krąg. */
  eliteAffixesFirstLoop: 1,
  eliteAffixesPerLoop: 1,
  eliteMaxAffixes: 3,
} as const;

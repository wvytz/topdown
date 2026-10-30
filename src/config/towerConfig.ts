/**
 * Pętla wieży (krok 43, wariant B właściciela; od kroku 83 siedem pięter — po Kacie Otchłani Baron Dymu; od kroku 124
 * dziewięć — po Palarni dwa piętra Lustrzanej komnaty; od kroku 127 osiem — pająki walczą w duecie na jednym piętrze; od kroku 134 siedem — Piekło ma jedno piętro; od kroku 137 osiem — Bociani Ogród z Brudną Wiedźmą zamyka krąg): po ostatnim piętrze kręgu wspinaczka trwa dalej —
 * kolejny krąg przechodzi te same biomy i bossów od nowa. Trudność dalej rośnie z numerem piętra
 * (ENEMY_SCALING), a elity w każdym kolejnym kręgu mają o cechę więcej. Finałowego bossa jeszcze nie ma.
 */
export const TOWER_CONFIG = {
  /** Pięter w jednym kręgu (od kroku 134: jedno piętro Piekła, Lustrzana komnata na 6–7; od kroku 137 Bociani Ogród na 8). */
  floorsPerLoop: 8,
  /** Cech elity w pierwszym kręgu i przyrost na każdy kolejny krąg. */
  eliteAffixesFirstLoop: 1,
  eliteAffixesPerLoop: 1,
  eliteMaxAffixes: 3,
} as const;

import { AttackWeight } from '@/core/combatWeightTypes';
import { EnemyAttackKind, EnemyType, type EnemyDefinition } from '@/core/combatTypes';

/**
 * Waga ataku zwykłego wroga (krok U11b, wersja lekka systemu wag — docs/WAGI.md §2 i §11). Czysta logika.
 *
 * - **Lekki:** upiory (krucha fala zasadzki) — bez znaku.
 * - **Ciężki:** elity (każda cecha), skok-szarża (ogar) i Czyhacz — pomarańczowe „!” w zamachu.
 * - **Średni:** cała reszta — bez nowego znaku (zostaje pomarańczowy odcień zamachu).
 *
 * Przebijający jest tylko atak kary (`PunishManager`, czerwone „!!”). Stworki nawały i czerwie mają
 * osobne definicje bez cech, więc same wypadają jako średnie albo lekkie — bez znaku.
 */
export function enemyAttackWeight(definition: Pick<EnemyDefinition, 'type' | 'attack' | 'affixes' | 'phasing'>): AttackWeight {
  if (definition.phasing) return AttackWeight.Light;
  if ((definition.affixes?.length ?? 0) > 0) return AttackWeight.Heavy;
  if (definition.attack.kind === EnemyAttackKind.Pounce || definition.type === EnemyType.Lurker) return AttackWeight.Heavy;
  return AttackWeight.Medium;
}

/** Czy zamach tej wagi dostaje znak nad głową (ciężki i przebijający; lekki i średni — nie). */
export function hasWindupMark(weight: AttackWeight): boolean {
  return weight === AttackWeight.Heavy || weight === AttackWeight.Piercing;
}

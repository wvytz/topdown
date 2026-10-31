import { diag } from '@/diagnostics/DiagnosticsHub';
import type { FloorSceneData } from '@/core/types';
import { PRACTICE_LOADOUT_CONFIG } from '@/config/practiceLoadoutConfig';
import { applyPracticeLoadout, wantsPracticeLoadout } from '@/systems/PracticeLoadout';
import { parseStartOverrides } from '@/systems/startOverrides';

/**
 * Szybki start testowy (krok 148): `?floor=N` (np. z `&boss=1`) daje zestaw z symulowanego przejścia pięter,
 * `?items=0` — start z pustymi rękami. Wspólne dla startu z adresu i ekranu wyboru bohatera.
 */
export function withPracticeLoadout(data: FloorSceneData, practice: boolean): FloorSceneData {
  if (!practice || !wantsPracticeLoadout(window.location.search, PRACTICE_LOADOUT_CONFIG)) return data;
  const { data: next, loadout } = applyPracticeLoadout(data, PRACTICE_LOADOUT_CONFIG);
  if (loadout) diag.note('practice-loadout', { floor: data.floor, items: loadout.items.length, gold: loadout.gold, ...loadout.sources });
  return next;
}

/**
 * R po śmierci w runie testowym z adresu (krok 148): znowu to samo piętro (i arena, przy `?boss=1`)
 * z nowym zestawem — szybkie powtórki walki z bossem. Seed z adresu zostaje, inaczej nowy.
 * Bez `?floor=` w adresie — zwykły nowy run (bez zmian).
 */
export function practiceRestart(fresh: FloorSceneData, wasPractice: boolean): FloorSceneData {
  if (!wasPractice) return fresh;
  const { floor, atBoss, runSeed } = parseStartOverrides(window.location.search);
  if (floor === undefined || floor <= 1) return fresh;
  return withPracticeLoadout(
    { ...fresh, floor, runSeed: runSeed ?? fresh.runSeed, run: { ...fresh.run, practice: true }, ...(atBoss ? { atBoss } : {}) },
    true,
  );
}

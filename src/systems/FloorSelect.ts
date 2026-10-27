import { RunMode } from '@/core/runMode';
import { biomeForFloor } from '@/config/biomeConfig';
import { BOSS_DUETS, bossForFloor } from '@/config/bossConfig';
import { duetForFloor } from '@/systems/BossDuet';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { floorLabel } from '@/systems/TowerLoop';

/**
 * Wybór piętra (krok 91, pomysł właściciela): nowy run można zacząć od każdego piętra, którego bossa gracz już
 * pokonał we wspinaczce — szybsza droga do kolejnych kręgów wieży. Czysta logika; zapis w `persistence/BossProgress`.
 */

/** Czy pokonanie bossa w tym runie odblokowuje piętro: wspinaczka albo wybór piętra, bez runu testowego z adresu. */
export function unlocksFloor(mode: RunMode, practice: boolean): boolean {
  return !practice && (mode === RunMode.Tower || mode === RunMode.FloorSelect);
}

/** Najwyższe pokonane piętro po nowym zwycięstwie (nigdy nie maleje). */
export const recordBossDefeat = (best: number, floor: number): number => Math.max(best, Math.floor(floor));

/** Piętra do wyboru: 1..najwyższe pokonane (pierwsze piętro zawsze). */
export function startFloors(bestDefeated: number): number[] {
  const top = Math.max(1, Math.floor(bestDefeated));
  return Array.from({ length: top }, (_, i) => i + 1);
}

/** Wybrane piętro po przesunięciu o `delta` (← →), w granicach 1..najwyższe pokonane. */
export function stepStartFloor(floor: number, delta: number, bestDefeated: number): number {
  return Math.min(Math.max(1, bestDefeated), Math.max(1, floor + delta));
}

export interface StartFloorInfo {
  /** „Piętro 9 · Krąg II”. */
  readonly label: string;
  readonly biome: string;
  readonly boss: string;
}

export function startFloorInfo(floor: number): StartFloorInfo {
  // Duet (krok 127) pod wspólną nazwą — np. „Matka i Król Pająków”.
  const boss = duetForFloor(floor, BOSS_DUETS, TOWER_CONFIG)?.name ?? bossForFloor(floor).name;
  return { label: floorLabel(floor, TOWER_CONFIG), biome: biomeForFloor(floor).name, boss };
}

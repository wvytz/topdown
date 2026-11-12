import { RunMode } from '@/core/runMode';

/**
 * Podpis runu na ekranie końca (krok U7): kto, w jakim trybie, na jakim ziarnie i z czym skończył.
 * Ziarno pozwala powtórzyć ten sam układ pięter (`?seed=`), więc podpis nadaje się do pochwalenia się runem.
 */
export interface RunSignatureInput {
  /** Imiona bohaterów (co-op: dwa). */
  readonly heroes: readonly string[];
  readonly mode: RunMode;
  readonly seed: number;
  readonly startFloor: number | null;
  readonly practice: boolean;
  readonly fromSave: boolean;
  readonly itemCount: number;
  readonly evolvedCount: number;
}

/** Polska odmiana liczebnika: 1 przedmiot, 2–4 przedmioty, 5+ przedmiotów (12–14 też „ów”). */
export function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const tens = count % 100;
  const units = count % 10;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}

function modeLabel(input: RunSignatureInput): string {
  const base = input.mode === RunMode.BossRush ? 'areny bossów' : input.mode === RunMode.FloorSelect ? `od piętra ${input.startFloor ?? 1}` : 'wspinaczka';
  const tags = [input.heroes.length > 1 ? 'co-op' : null, input.practice ? 'run testowy' : null, input.fromSave ? 'z zapisu' : null].filter((t): t is string => t !== null);
  return [base, ...tags].join(', ');
}

/** „Barbarzyńca · wspinaczka · ziarno 12345 · 7 przedmiotów, 1 przemiana”. */
export function runSignature(input: RunSignatureInput): string {
  const items = `${input.itemCount} ${plural(input.itemCount, 'przedmiot', 'przedmioty', 'przedmiotów')}`;
  const evolved = input.evolvedCount > 0 ? `, ${input.evolvedCount} ${plural(input.evolvedCount, 'przemiana', 'przemiany', 'przemian')}` : '';
  return [input.heroes.join(' + '), modeLabel(input), `ziarno ${input.seed >>> 0}`, items + evolved].join(' · ');
}

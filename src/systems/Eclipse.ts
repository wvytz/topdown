/**
 * Zaćmienia (Akt II, krok Z5; `docs/AKT2.md` §6): czysta logika poziomów trudności Zejścia — który poziom jest
 * dostępny i nałożenie reguł poziomu na konfiguracje walki. Liczby: `config/eclipseConfig.ts`.
 */
import type { EclipseLevel } from '@/config/eclipseConfig';
import type { RetinueDefinition } from '@/core/bossTypes';
import type { RunSnapshot } from '@/core/lootTypes';
import { RunMode } from '@/core/runMode';

/** Poziom o tym numerze (ucięty do istniejących; zły numer = poziom 0). */
export function eclipseLevel(level: number | undefined, levels: readonly EclipseLevel[]): EclipseLevel {
  return levels[clampEclipse(level ?? 0, levels.length - 1)] ?? levels[0]!;
}

/** Numer poziomu w zakresie 0..max (ułamki i śmieci — 0). */
export function clampEclipse(level: number, max: number): number {
  if (!Number.isInteger(level) || level < 0) return 0;
  return Math.min(level, Math.max(0, max));
}

/** Najwyższy poziom do wybrania: każdy ukończony otwiera następny (poziom 0 jest zawsze). */
export function highestOpenEclipse(cleared: number, levels: readonly EclipseLevel[]): number {
  return clampEclipse(cleared, levels.length - 1);
}

/** Cechy elit z regułą poziomu, do sufitu wieży. */
export function eclipseEliteAffixes(base: number, level: EclipseLevel, max: number): number {
  return Math.min(max, base + level.extraEliteAffixes);
}

/** Konfiguracja nawały z dodatkowymi falami (piętra bez fal — 0 — zostają bez nawały). */
export function withExtraHordeWaves<T extends { readonly wavesByFloor: readonly number[] }>(config: T, extra: number): T {
  if (extra <= 0) return config;
  return { ...config, wavesByFloor: config.wavesByFloor.map((waves) => (waves > 0 ? waves + extra : 0)) };
}

/** Świta bossa wzmocniona regułą poziomu; boss bez świty — bez zmian. */
export function withRetinueBoost<T extends { readonly retinue?: RetinueDefinition }>(definition: T, level: EclipseLevel): T {
  const boost = level.retinue;
  const retinue = definition.retinue;
  if (!boost || !retinue) return definition;
  return {
    ...definition,
    retinue: {
      ...retinue,
      count: retinue.count + boost.extraCount,
      maxAlive: retinue.maxAlive + boost.extraMaxAlive,
      everyMs: Math.round(retinue.everyMs * boost.intervalMultiplier),
      enragedEveryMs: Math.round(retinue.enragedEveryMs * boost.intervalMultiplier),
    },
  };
}

/** Leczenie z mikstury na tym poziomie (co najmniej 1 HP). */
export function eclipseHeal(amount: number, level: EclipseLevel): number {
  return amount > 0 ? Math.max(1, Math.round(amount * level.healMultiplier)) : amount;
}

/** Cena u kupca na tym poziomie. */
export function eclipsePrice(price: number, level: EclipseLevel): number {
  return Math.round(price * level.merchantPriceMultiplier);
}

/**
 * Poziom Zaćmienia dla runu: świeże Zejście na pierwszym piętrze dostaje poziom wybrany w Popielniku; run, który
 * już go ma (kolejne piętro, zapis), zostaje przy swoim. Inne tryby — bez zmian.
 */
export function withRunEclipse(run: RunSnapshot, floor: number, firstFloor: number, chosen: number, max: number): RunSnapshot {
  if (run.mode !== RunMode.Descent || run.eclipse !== undefined) return run;
  // Zapis sprzed kroku Z5 (run w toku bez poziomu) to zwykłe Zejście.
  const fresh = floor === firstFloor && run.fromSave !== true && (run.descentPath?.length ?? 1) <= 1;
  return { ...run, eclipse: fresh ? clampEclipse(chosen, max) : 0 };
}

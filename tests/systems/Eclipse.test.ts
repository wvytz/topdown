import { describe, expect, it } from 'vitest';
import { ECLIPSE_CONFIG } from '@/config/eclipseConfig';
import { HORDE_CONFIG } from '@/config/hordeConfig';
import type { RunSnapshot } from '@/core/lootTypes';
import { RunMode } from '@/core/runMode';
import { HeroId } from '@/core/heroTypes';
import {
  clampEclipse,
  eclipseEliteAffixes,
  eclipseHeal,
  eclipseLevel,
  eclipsePrice,
  highestOpenEclipse,
  withExtraHordeWaves,
  withRetinueBoost,
  withRunEclipse,
} from '@/systems/Eclipse';
import { EMPTY_META, bankDescent, buyStall, chooseEclipse, metaRank, openEclipsesForTest, parseMetaProfile } from '@/systems/MetaProgress';
import { parseSaveRecord } from '@/systems/SaveGame';

const LEVELS = ECLIPSE_CONFIG.levels;
const MAX = LEVELS.length - 1;
const [L0, L1, L2, L3] = [0, 1, 2, 3].map((level) => eclipseLevel(level, LEVELS)) as [typeof LEVELS[0], typeof LEVELS[0], typeof LEVELS[0], typeof LEVELS[0]];

describe('Zaćmienia — poziomy', () => {
  it('poziom 0 to zwykłe Zejście, a każdy kolejny zawiera reguły poprzednich i daje więcej Żaru', () => {
    expect(L0.extraEliteAffixes + L0.extraHordeWaves).toBe(0);
    expect(L0.healMultiplier).toBe(1);
    expect(L0.retinue).toBeNull();
    expect(L1.extraEliteAffixes).toBeGreaterThan(0);
    expect(L1.healMultiplier).toBeLessThan(1);
    expect(L2.extraEliteAffixes).toBe(L1.extraEliteAffixes);
    expect(L2.extraHordeWaves).toBeGreaterThan(0);
    expect(L2.merchantPriceMultiplier).toBeGreaterThan(1);
    expect(L3.extraHordeWaves).toBe(L2.extraHordeWaves);
    expect(L3.retinue).not.toBeNull();
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i]!.embersMultiplier).toBeGreaterThan(LEVELS[i - 1]!.embersMultiplier);
    expect(ECLIPSE_CONFIG.ranks).toHaveLength(LEVELS.length + 1);
  });

  it('zły numer poziomu daje poziom 0, za wysoki — ostatni', () => {
    expect(clampEclipse(-1, MAX)).toBe(0);
    expect(clampEclipse(1.5, MAX)).toBe(0);
    expect(clampEclipse(9, MAX)).toBe(MAX);
    expect(eclipseLevel(undefined, LEVELS)).toBe(L0);
    expect(eclipseLevel(42, LEVELS)).toBe(L3);
    expect(highestOpenEclipse(0, LEVELS)).toBe(0);
    expect(highestOpenEclipse(2, LEVELS)).toBe(2);
    expect(highestOpenEclipse(4, LEVELS)).toBe(MAX);
  });

  it('reguły: cechy elit do sufitu, fale nawały, świta, leczenie i ceny', () => {
    expect(eclipseEliteAffixes(1, L1, 3)).toBe(2);
    expect(eclipseEliteAffixes(3, L1, 3)).toBe(3);
    const horde = withExtraHordeWaves(HORDE_CONFIG, L2.extraHordeWaves);
    expect(horde.wavesByFloor).toEqual(HORDE_CONFIG.wavesByFloor.map((w) => (w > 0 ? w + 1 : 0)));
    expect(withExtraHordeWaves(HORDE_CONFIG, 0)).toBe(HORDE_CONFIG);
    expect(withExtraHordeWaves({ wavesByFloor: [0, 2] }, 1).wavesByFloor).toEqual([0, 3]);
    const retinue = { type: 'rusher', firstAfterMs: 9000, everyMs: 16000, enragedEveryMs: 12000, count: 1, maxAlive: 2, telegraphMs: 1000, minPlayerDistanceTiles: 4 } as const;
    const boosted = withRetinueBoost({ retinue } as never, L3) as { retinue: typeof retinue };
    expect(boosted.retinue.count).toBe(2);
    expect(boosted.retinue.maxAlive).toBe(3);
    expect(boosted.retinue.everyMs).toBe(12000);
    expect(boosted.retinue.enragedEveryMs).toBe(9000);
    const plain = { retinue };
    expect(withRetinueBoost(plain as never, L2)).toBe(plain);
    const noRetinue = { maxHp: 10 };
    expect(withRetinueBoost(noRetinue as never, L3)).toBe(noRetinue);
    expect(eclipseHeal(15, L0)).toBe(15);
    expect(eclipseHeal(15, L1)).toBe(9);
    expect(eclipseHeal(1, L1)).toBe(1);
    expect(eclipsePrice(40, L1)).toBe(40);
    expect(eclipsePrice(40, L2)).toBe(60);
  });
});

describe('Zaćmienia — run', () => {
  const descent: RunSnapshot = { hero: HeroId.Barbarian, gold: 0, items: [], hp: null, mode: RunMode.Descent };

  it('świeże Zejście dostaje poziom z Popielnika, run w toku i inne tryby — nie', () => {
    expect(withRunEclipse(descent, 1, 1, 2, MAX).eclipse).toBe(2);
    expect(withRunEclipse(descent, 1, 1, 9, MAX).eclipse).toBe(MAX);
    expect(withRunEclipse({ ...descent, eclipse: 1 }, 3, 1, 3, MAX).eclipse).toBe(1);
    // Zapis sprzed kroku Z5: run w toku bez poziomu = zwykłe Zejście.
    expect(withRunEclipse(descent, 4, 1, 3, MAX).eclipse).toBe(0);
    expect(withRunEclipse({ ...descent, fromSave: true }, 1, 1, 3, MAX).eclipse).toBe(0);
    const tower: RunSnapshot = { hero: HeroId.Barbarian, gold: 0, items: [], hp: null };
    expect(withRunEclipse(tower, 1, 1, 3, MAX)).toBe(tower);
  });

  it('poziom przechodzi przez zapis gry, a zły wpis odpada', () => {
    const record = (eclipse: unknown) => JSON.stringify({ version: 1, savedAt: 1, runSeed: 5, floor: 3, run: { ...descent, eclipse } });
    expect(parseSaveRecord(record(2))?.run.eclipse).toBe(2);
    expect(parseSaveRecord(record(7))?.run.eclipse).toBeUndefined();
    expect(parseSaveRecord(record('x'))?.run.eclipse).toBeUndefined();
  });
});

describe('Zaćmienia — profil i rangi', () => {
  it('zwycięstwo zalicza poziom i otwiera następny, śmierć nie', () => {
    let profile = bankDescent(EMPTY_META, { embers: 10, depth: 6, victory: true, eclipse: 0 }, LEVELS.length);
    expect(profile.eclipseCleared).toBe(1);
    expect(metaRank(profile, ECLIPSE_CONFIG.ranks)).toBe('Zahartowany');
    profile = bankDescent(profile, { embers: 10, depth: 4, victory: false, eclipse: 1 }, LEVELS.length);
    expect(profile.eclipseCleared).toBe(1);
    profile = bankDescent(profile, { embers: 10, depth: 6, victory: true, eclipse: 1 }, LEVELS.length);
    expect(metaRank(profile, ECLIPSE_CONFIG.ranks)).toBe('Godny');
    // Zwycięstwo na niższym poziomie rangi nie odbiera.
    profile = bankDescent(profile, { embers: 10, depth: 6, victory: true, eclipse: 0 }, LEVELS.length);
    expect(profile.eclipseCleared).toBe(2);
    profile = bankDescent({ ...profile, eclipseCleared: 4 }, { embers: 0, depth: 6, victory: true, eclipse: 3 }, LEVELS.length);
    expect(profile.eclipseCleared).toBe(4);
    expect(metaRank(profile, ECLIPSE_CONFIG.ranks)).toBe('Wybraniec');
  });

  it('wybór przy Bramie tylko spośród otwartych poziomów', () => {
    const open = { ...EMPTY_META, eclipseCleared: 2 };
    expect(chooseEclipse(open, 2, MAX).eclipse).toBe(2);
    expect(chooseEclipse(open, 3, MAX)).toBe(open);
    expect(chooseEclipse(open, -1, MAX)).toBe(open);
    expect(chooseEclipse({ ...EMPTY_META, eclipseCleared: 4 }, 3, MAX).eclipse).toBe(3);
  });

  it('profil sprzed Zaćmień: zdobyte Dno to ukończony poziom 0; wybór ponad otwarte odpada', () => {
    const old = { ...EMPTY_META } as Record<string, unknown>;
    delete old.eclipseCleared;
    delete old.eclipse;
    delete old.stallBought;
    expect(parseMetaProfile(JSON.stringify({ ...old, wins: 2 })).eclipseCleared).toBe(1);
    expect(parseMetaProfile(JSON.stringify(old)).eclipseCleared).toBe(0);
    const profile = parseMetaProfile(JSON.stringify({ ...EMPTY_META, eclipseCleared: 1, eclipse: 3, stallBought: true }));
    expect(profile.eclipse).toBe(0);
    expect(profile.stallBought).toBe(true);
  });

  it('skrót testowy otwiera wszystkie poziomy, ukończonych nie odbiera', () => {
    expect(openEclipsesForTest(EMPTY_META, MAX).eclipseCleared).toBe(MAX);
    const all = { ...EMPTY_META, eclipseCleared: 4 };
    expect(openEclipsesForTest(all, MAX)).toBe(all);
  });

  it('Kram kupca kupuje się raz i tylko za Żar', () => {
    expect(buyStall({ ...EMPTY_META, embers: 10 }, 60).stallBought).toBe(false);
    const bought = buyStall({ ...EMPTY_META, embers: 70 }, 60);
    expect(bought).toMatchObject({ embers: 10, stallBought: true });
    expect(buyStall({ ...bought, embers: 100 }, 60)).toMatchObject({ embers: 100, stallBought: true });
  });
});

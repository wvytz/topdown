import { describe, expect, it } from 'vitest';
import { META_CONFIG } from '@/config/metaConfig';
import { EMPTY_META, addTrophy, bankDescent, markArrivalSeen, metaRank, openHideoutForTest, parseMetaProfile, unlockHideout } from '@/systems/MetaProgress';

describe('profil trwały', () => {
  it('brak, śmieci i obca wersja dają pusty profil', () => {
    expect(parseMetaProfile(null)).toEqual(EMPTY_META);
    expect(parseMetaProfile('{oops')).toEqual(EMPTY_META);
    expect(parseMetaProfile('[]')).toEqual(EMPTY_META);
    expect(parseMetaProfile(JSON.stringify({ ...EMPTY_META, version: 2 }))).toEqual(EMPTY_META);
    expect(parseMetaProfile(JSON.stringify({ ...EMPTY_META, embers: -5 }))).toEqual(EMPTY_META);
  });

  it('przechodzi przez zapis i odczyt bez zmian, a trofea porządkuje', () => {
    const profile = { ...EMPTY_META, hideoutUnlocked: true, arrivalSeen: true, embers: 42, runs: 3, wins: 1, bestDepth: 6, trophies: [1, 4] };
    expect(parseMetaProfile(JSON.stringify(profile))).toEqual(profile);
    expect(parseMetaProfile(JSON.stringify({ ...profile, trophies: [4, 1, 4, 'x', 0] })).trophies).toEqual([1, 4]);
  });

  it('pierwsza Wiedźma odblokowuje Popielnik i spala przedmioty na Żar, kolejne nic nie dają', () => {
    const first = unlockHideout(EMPTY_META, 9, META_CONFIG);
    expect(first.profile.hideoutUnlocked).toBe(true);
    expect(first.embers).toBe(9 * META_CONFIG.arrivalEmbersPerItem);
    expect(first.profile.embers).toBe(first.embers);
    const again = unlockHideout(first.profile, 20, META_CONFIG);
    expect(again.embers).toBe(0);
    expect(again.profile).toBe(first.profile);
  });

  it('pierwsze lądowanie daje co najmniej minimum Żaru', () => {
    expect(unlockHideout(EMPTY_META, 0, META_CONFIG).embers).toBe(META_CONFIG.arrivalEmbersMin);
  });

  it('koniec Zejścia dopisuje Żar, run i najgłębszą głębię', () => {
    const lost = bankDescent({ ...EMPTY_META, embers: 5, bestDepth: 4 }, { embers: 12, depth: 3, victory: false });
    expect(lost).toMatchObject({ embers: 17, runs: 1, wins: 0, bestDepth: 4 });
    const won = bankDescent(lost, { embers: 80, depth: 6, victory: true });
    expect(won).toMatchObject({ embers: 97, runs: 2, wins: 1, bestDepth: 6 });
  });

  it('trofea: tylko po odblokowaniu, bez powtórek', () => {
    expect(addTrophy(EMPTY_META, 3)).toBe(EMPTY_META);
    const open = { ...EMPTY_META, hideoutUnlocked: true };
    const one = addTrophy(open, 3);
    expect(one.trophies).toEqual([3]);
    expect(addTrophy(one, 3)).toBe(one);
    expect(addTrophy(one, 1).trophies).toEqual([1, 3]);
  });

  it('scena upadku oznaczana raz', () => {
    const seen = markArrivalSeen(EMPTY_META);
    expect(seen.arrivalSeen).toBe(true);
    expect(markArrivalSeen(seen)).toBe(seen);
  });

  it('ranga rośnie z ukończonymi Zejściami', () => {
    expect(metaRank({ wins: 0 }, META_CONFIG.ranks)).toBe('Śmiałek');
    expect(metaRank({ wins: 1 }, META_CONFIG.ranks)).toBe('Zahartowany');
    expect(metaRank({ wins: 5 }, META_CONFIG.ranks)).toBe('Godny');
    expect(metaRank({ wins: 99 }, META_CONFIG.ranks)).toBe('Wybraniec');
  });

  it('skrót testowy otwiera Popielnik bez sceny upadku i bez Żaru', () => {
    const opened = openHideoutForTest(EMPTY_META);
    expect(opened).toEqual({ ...EMPTY_META, hideoutUnlocked: true, arrivalSeen: true });
    expect(openHideoutForTest(opened)).toBe(opened);
  });
});

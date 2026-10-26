import { describe, expect, it } from 'vitest';
import { MusicTheme } from '@/core/audioTypes';
import { MUSIC_BY_BIOME, MUSIC_THEMES } from '@/config/audioConfig';
import { BiomeId } from '@/config/biomeConfig';
import { barDuration, chordDegree, composeBar, scaleDegreeMidi } from '@/systems/MusicComposer';

const tower = MUSIC_THEMES[MusicTheme.Tower];

describe('MusicComposer (krok 116)', () => {
  it('stopnie skali przechodzą do kolejnej oktawy', () => {
    expect(scaleDegreeMidi(tower, 0)).toBe(tower.root);
    expect(scaleDegreeMidi(tower, tower.scale.length)).toBe(tower.root + 12);
  });

  it('akord zmienia się co barsPerChord taktów i wraca po całej progresji', () => {
    const cycle = tower.progression.length * tower.barsPerChord;
    expect(chordDegree(tower, 0)).toBe(chordDegree(tower, tower.barsPerChord - 1));
    expect(chordDegree(tower, cycle)).toBe(chordDegree(tower, 0));
  });

  it('takt jest deterministyczny i nuty mieszczą się w takcie', () => {
    for (let bar = 0; bar < 32; bar++) {
      const notes = composeBar(tower, bar, false);
      expect(composeBar(tower, bar, false)).toEqual(notes);
      for (const note of notes) {
        expect(note.at).toBeGreaterThanOrEqual(0);
        expect(note.at).toBeLessThan(barDuration(tower));
      }
    }
  });

  it('wieża: bęben tylko w walce z bossem; zaświaty: zawsze', () => {
    const drums = (theme: MusicTheme, intense: boolean) => composeBar(MUSIC_THEMES[theme], 0, intense).filter((n) => n.voice === 'drum').length;
    expect(drums(MusicTheme.Tower, false)).toBe(0);
    expect(drums(MusicTheme.Tower, true)).toBeGreaterThan(0);
    expect(drums(MusicTheme.Underworld, false)).toBeGreaterThan(0);
  });

  it('każdy biom ma klimat muzyki', () => {
    for (const biome of Object.values(BiomeId)) expect(MUSIC_BY_BIOME[biome]).toBeDefined();
  });
});

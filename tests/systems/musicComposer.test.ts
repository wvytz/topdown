import { describe, expect, it } from 'vitest';
import type { MusicVoice } from '@/core/audioTypes';
import { MusicTheme } from '@/core/audioTypes';
import { MUSIC_BY_BIOME, MUSIC_THEMES } from '@/config/audioConfig';
import { BiomeId } from '@/config/biomeConfig';
import { STEPS_PER_BAR, barDuration, chordDegree, composeBar, isBreakdown, scaleDegreeMidi } from '@/systems/MusicComposer';

const tower = MUSIC_THEMES[MusicTheme.Tower];
const count = (bar: number, intense: boolean, voice: MusicVoice, theme = tower) => composeBar(theme, bar, intense).filter((n) => n.voice === voice).length;

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
    for (const theme of Object.values(MUSIC_THEMES)) {
      for (let bar = 0; bar < 48; bar++) {
        for (const intense of [false, true]) {
          const notes = composeBar(theme, bar, intense);
          expect(composeBar(theme, bar, intense)).toEqual(notes);
          for (const note of notes) {
            expect(note.at).toBeGreaterThanOrEqual(0);
            expect(note.at).toBeLessThan(barDuration(theme));
          }
        }
      }
    }
  });

  it('każdy biom ma klimat muzyki', () => {
    for (const biome of Object.values(BiomeId)) expect(MUSIC_BY_BIOME[biome]).toBeDefined();
  });
});

describe('house w klimacie horroru (krok 139)', () => {
  it('pętla ma 16 kroków basu i tempo house\'u', () => {
    for (const theme of Object.values(MUSIC_THEMES)) {
      expect(theme.bassSteps).toHaveLength(STEPS_PER_BAR);
      expect(theme.bpm).toBeGreaterThanOrEqual(110);
      expect(theme.bpm).toBeLessThanOrEqual(130);
    }
  });

  it('stopa na każdą ćwierćnutę, poza przełamaniem frazy', () => {
    for (let bar = 0; bar < tower.phraseBars * 2; bar++) {
      expect(count(bar, false, 'kick')).toBe(isBreakdown(tower, bar, false) ? 0 : 4);
    }
    expect(isBreakdown(tower, tower.phraseBars - 1, false)).toBe(true);
    expect(isBreakdown(tower, tower.phraseBars - 1, true)).toBe(false);
  });

  it('wstęp bez klasku i staba, potem klask wchodzi', () => {
    expect(count(0, false, 'clap')).toBe(0);
    expect(count(1, false, 'stab')).toBe(0);
    expect(count(tower.introBars, false, 'clap')).toBe(tower.clapSteps.length);
  });

  it('walka z bossem: szesnastkowe hi-haty i stab w każdym takcie', () => {
    expect(count(tower.introBars, false, 'hat')).toBe(0);
    expect(count(tower.introBars, true, 'hat')).toBe(STEPS_PER_BAR / 2);
    expect(count(tower.introBars, true, 'stab')).toBeGreaterThan(0);
  });

  it('dron gra interwał grozy nad primą akordu', () => {
    for (const theme of Object.values(MUSIC_THEMES)) {
      const drones = composeBar(theme, 0, false).filter((n) => n.voice === 'drone').map((n) => n.midi);
      expect(drones).toHaveLength(2);
      expect((drones[1] ?? 0) - (drones[0] ?? 0)).toBe(theme.droneTension);
    }
  });

  it('pingi pojawiają się, ale nie w każdym takcie', () => {
    const pings = Array.from({ length: tower.phraseBars }, (_, i) => count(tower.phraseBars + i, false, 'ping'));
    expect(pings.some((p) => p > 0)).toBe(true);
    expect(pings.some((p) => p === 0)).toBe(true);
  });
});

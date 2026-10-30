import { describe, expect, it } from 'vitest';
import type { MusicVoice } from '@/core/audioTypes';
import type { HorrorThemeDefinition, LucentThemeDefinition } from '@/core/audioTypes';
import { MusicPreset, MusicTheme } from '@/core/audioTypes';
import { MUSIC_BY_BIOME, MUSIC_PRESETS } from '@/config/audioConfig';
import { BiomeId } from '@/config/biomeConfig';
import { STEPS_PER_BAR, barDuration, chordDegree, composeBar, isBreakdown, scaleDegreeMidi } from '@/systems/MusicComposer';

const HORROR = MUSIC_PRESETS[MusicPreset.Horror] as Record<MusicTheme, HorrorThemeDefinition>;
const LUCENT = MUSIC_PRESETS[MusicPreset.Lucent] as Record<MusicTheme, LucentThemeDefinition>;
const tower = HORROR[MusicTheme.Tower];
const lucent = LUCENT[MusicTheme.Tower];
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
    for (const theme of [...Object.values(HORROR), ...Object.values(LUCENT)]) {
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

describe('zestaw Horror — house w klimacie horroru (krok 139)', () => {
  it('pętla ma 16 kroków basu i tempo house\'u', () => {
    for (const theme of Object.values(HORROR)) {
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
    for (const theme of Object.values(HORROR)) {
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

describe('zestaw Lucent — ambient z kroku 116', () => {
  it('każdy zestaw ma oba klimaty w swoim stylu', () => {
    for (const preset of Object.values(MusicPreset)) {
      for (const theme of Object.values(MusicTheme)) expect(MUSIC_PRESETS[preset][theme].preset).toBe(preset);
    }
  });

  it('wieża: bęben tylko w walce z bossem; zaświaty: zawsze', () => {
    const drums = (theme: MusicTheme, intense: boolean) => composeBar(LUCENT[theme], 0, intense).filter((n) => n.voice === 'drum').length;
    expect(drums(MusicTheme.Tower, false)).toBe(0);
    expect(drums(MusicTheme.Tower, true)).toBeGreaterThan(0);
    expect(drums(MusicTheme.Underworld, false)).toBeGreaterThan(0);
  });

  it('w ostatnich taktach każdej frazy nie ma dzwonków (krok 116a)', () => {
    const { every, rest } = lucent.bellRest;
    for (let bar = 0; bar < 64; bar++) {
      const bells = composeBar(lucent, bar, true).filter((n) => n.voice === 'bell').length;
      if (bar % every >= every - rest) expect(bells).toBe(0);
    }
  });

  it('Lucent gra tylko swoje głosy, Horror — swoje', () => {
    const voices = (theme: Parameters<typeof composeBar>[0]) => new Set(Array.from({ length: 32 }, (_, bar) => composeBar(theme, bar, true).map((n) => n.voice)).flat());
    for (const v of voices(lucent)) expect(['pad', 'bass', 'bell', 'drum']).toContain(v);
    expect(voices(tower).has('kick')).toBe(true);
    expect(voices(tower).has('pad')).toBe(false);
  });
});

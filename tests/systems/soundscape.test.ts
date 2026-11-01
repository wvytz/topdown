import { describe, expect, it } from 'vitest';
import { BiomeId } from '@/config/biomeConfig';
import { SOUNDSCAPES, SOUNDSCAPE_CONFIG, SoundscapeEcho } from '@/config/soundscapeConfig';
import { SOUND_GATE_RULES, SOUND_RECIPES } from '@/config/audioConfig';
import { pickSoundscape } from '@/systems/Soundscape';

const rolls = (pick: number, angle = 0, distance = 0, interval = 0) => ({ pick, angle, distance, interval });

describe('odgłosy biomów (krok 158)', () => {
  it('każdy biom ma odgłosy, a każdy odgłos — przepis syntezy i bramkę', () => {
    for (const id of Object.values(BiomeId)) {
      const scape = SOUNDSCAPES[id];
      expect(scape.entries.length).toBeGreaterThan(0);
      expect(scape.intervalMs.min).toBeGreaterThanOrEqual(4000);
      for (const entry of scape.entries) {
        expect(SOUND_RECIPES[entry.cue].layers.length).toBeGreaterThan(0);
        // Tło jest ciche: nie głośniejsze od zwykłych efektów walki.
        expect(SOUND_RECIPES[entry.cue].gain).toBeLessThanOrEqual(0.2);
        expect(SOUND_GATE_RULES[entry.cue].minGapMs).toBeGreaterThan(0);
      }
    }
  });

  it('losuje według wag i daje przerwę z zakresu biomu', () => {
    const scape = SOUNDSCAPES[BiomeId.TowerRuins];
    const total = scape.entries.reduce((s, e) => s + e.weight, 0);
    const counts = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const pick = pickSoundscape(scape, SOUNDSCAPE_CONFIG, rolls((i + 0.5) / 600, 0, 0, i / 600))!;
      counts.set(pick.cue, (counts.get(pick.cue) ?? 0) + 1);
      expect(pick.nextInMs).toBeGreaterThanOrEqual(scape.intervalMs.min);
      expect(pick.nextInMs).toBeLessThanOrEqual(scape.intervalMs.max);
    }
    for (const entry of scape.entries) expect(counts.get(entry.cue)! / 600).toBeCloseTo(entry.weight / total, 1);
  });

  it('odgłos dochodzi spoza kadru, z odległości z konfiguracji', () => {
    for (const r of [0, 0.3, 0.99]) {
      const pick = pickSoundscape(SOUNDSCAPES[BiomeId.Graveyard], SOUNDSCAPE_CONFIG, rolls(0.5, r, r, 0.5))!;
      const d = Math.hypot(pick.dx, pick.dy);
      expect(d).toBeGreaterThanOrEqual(SOUNDSCAPE_CONFIG.distancePx.min - 0.01);
      expect(d).toBeLessThanOrEqual(SOUNDSCAPE_CONFIG.distancePx.max + 0.01);
    }
  });

  it('bez odgłosów (same zerowe wagi) — nic', () => {
    expect(pickSoundscape({ intervalMs: { min: 1000, max: 2000 }, entries: [] }, SOUNDSCAPE_CONFIG, rolls(0.5))).toBeNull();
  });
});

describe('obraz do odgłosów (krok 159)', () => {
  it('dudnienie Piekła, gruz ruin i kruk Cmentarzyska mają obraz; reszta odgłosów — tylko dźwięk', () => {
    const echoes = Object.values(SOUNDSCAPES).flatMap((s) => s.entries.filter((e) => e.echo).map((e) => e.echo));
    expect(new Set(echoes)).toEqual(new Set([SoundscapeEcho.Quake, SoundscapeEcho.Dust, SoundscapeEcho.Flyover]));
    const crow = SOUNDSCAPES[BiomeId.Graveyard].entries.findIndex((e) => e.echo === SoundscapeEcho.Flyover);
    const scape = { ...SOUNDSCAPES[BiomeId.Graveyard], entries: [SOUNDSCAPES[BiomeId.Graveyard].entries[crow]!] };
    expect(pickSoundscape(scape, SOUNDSCAPE_CONFIG, rolls(0.5))!.echo).toBe(SoundscapeEcho.Flyover);
    const bell = { ...scape, entries: [{ cue: SOUNDSCAPES[BiomeId.Graveyard].entries[1]!.cue, weight: 1 }] };
    expect(pickSoundscape(bell, SOUNDSCAPE_CONFIG, rolls(0.5))!.echo).toBeNull();
  });
});

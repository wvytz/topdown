import { BiomeId } from '@/config/biomeConfig';
import { SoundCue } from '@/core/audioTypes';
import type { IntRange } from '@/core/dungeonTypes';

/**
 * Odgłosy biomów (krok 158, `#dzwiek` `#zywe-otoczenie`): co kilka sekund gdzieś poza kadrem coś się odzywa —
 * wiatr w ruinach, kapanie w Grzybni, kruk i dzwon na Cmentarzysku, dudnienie w Piekle, telefon, którego nikt nie
 * odbiera, w mieszkaniu gracza. Dźwięk dochodzi z boku (stereo z `SOUND_SPACE`) i jest cichy — tło, a nie sygnał
 * walki. Lore: na dole ruina i wiatr, wyżej coraz więcej śladów cywilizacji (prąd, telefon, winda). Liczby moje,
 * do oceny właściciela.
 */

export interface SoundscapeEntry {
  readonly cue: SoundCue;
  /** Waga losowania względem innych odgłosów biomu. */
  readonly weight: number;
}

export interface BiomeSoundscape {
  /** Przerwa między odgłosami (ms). */
  readonly intervalMs: IntRange;
  readonly entries: readonly SoundscapeEntry[];
}

export interface SoundscapeConfig {
  /** Skąd dochodzi odgłos: tyle px od środka kadru, w losowym kierunku (dalej = ciszej, z boku = stereo). */
  readonly distancePx: IntRange;
  /** Pierwszy odgłos po wejściu na piętro najwcześniej po tylu ms (najpierw cisza i muzyka). */
  readonly firstDelayMs: number;
  /** W walce z bossem biom milknie (decyzja: tło nie może zagłuszać telegrafów). */
  readonly silentInBossFight: boolean;
}

export const SOUNDSCAPE_CONFIG: SoundscapeConfig = {
  distancePx: { min: 200, max: 380 },
  firstDelayMs: 4000,
  silentInBossFight: true,
};

export const SOUNDSCAPES: Readonly<Record<BiomeId, BiomeSoundscape>> = {
  // Parter po apokalipsie: wiatr hula przez wyłomy, coś się osypuje, gdzieś stuka blacha.
  [BiomeId.TowerRuins]: {
    intervalMs: { min: 7000, max: 14000 },
    entries: [
      { cue: SoundCue.AmbWind, weight: 3 },
      { cue: SoundCue.AmbRubble, weight: 2 },
      { cue: SoundCue.AmbMetal, weight: 1 },
    ],
  },
  [BiomeId.SpiderLair]: {
    intervalMs: { min: 7000, max: 13000 },
    entries: [
      { cue: SoundCue.AmbDrip, weight: 2 },
      { cue: SoundCue.AmbChitter, weight: 3 },
    ],
  },
  [BiomeId.FungalGrove]: {
    intervalMs: { min: 6000, max: 12000 },
    entries: [
      { cue: SoundCue.AmbDrip, weight: 3 },
      { cue: SoundCue.AmbChitter, weight: 1 },
      { cue: SoundCue.AmbWind, weight: 1 },
    ],
  },
  [BiomeId.Graveyard]: {
    intervalMs: { min: 8000, max: 15000 },
    entries: [
      { cue: SoundCue.AmbCrow, weight: 3 },
      { cue: SoundCue.AmbBell, weight: 1 },
      { cue: SoundCue.AmbWind, weight: 2 },
    ],
  },
  [BiomeId.Infernal]: {
    intervalMs: { min: 7000, max: 13000 },
    entries: [
      { cue: SoundCue.AmbRumble, weight: 3 },
      { cue: SoundCue.AmbChains, weight: 2 },
    ],
  },
  // Wyżej jest prąd: lodówka buczy, gdzieś dzwoni telefon, którego nikt nie odbiera.
  [BiomeId.SmokeDen]: {
    intervalMs: { min: 8000, max: 15000 },
    entries: [
      { cue: SoundCue.AmbFridge, weight: 2 },
      { cue: SoundCue.AmbPhone, weight: 2 },
      { cue: SoundCue.AmbDrip, weight: 1 },
    ],
  },
  [BiomeId.MirrorHall]: {
    intervalMs: { min: 9000, max: 16000 },
    entries: [
      { cue: SoundCue.AmbChime, weight: 2 },
      { cue: SoundCue.AmbDrip, weight: 2 },
    ],
  },
  [BiomeId.StorkGarden]: {
    intervalMs: { min: 6000, max: 12000 },
    entries: [
      { cue: SoundCue.AmbOwl, weight: 2 },
      { cue: SoundCue.AmbCrickets, weight: 3 },
      { cue: SoundCue.AmbWind, weight: 1 },
    ],
  },
};

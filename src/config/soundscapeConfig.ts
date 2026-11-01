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

/**
 * Obraz do odgłosu (krok 159): dźwięk tła czasem widać — dudnienie trzęsie lekko kadrem i sypie pyłem z sufitu,
 * osypujący się gruz sypie kurzem od strony dźwięku, kruk przelatuje nad kadrem w stronę, skąd zakrakał.
 */
export enum SoundscapeEcho {
  /** Lekkie drżenie kadru i pył sypiący się z sufitu w kilku miejscach. */
  Quake = 'quake',
  /** Strużka kurzu z sufitu po stronie, z której doszedł odgłos. */
  Dust = 'dust',
  /** Sylwetka kruka przelatuje przez kadr od strony odgłosu. */
  Flyover = 'flyover',
}

export interface SoundscapeEntry {
  readonly cue: SoundCue;
  /** Co widać razem z odgłosem; brak — tylko dźwięk. */
  readonly echo?: SoundscapeEcho;
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

export interface SoundscapeEchoConfig {
  /** Drżenie kadru przy dudnieniu (ms, siła jak w `camera.shake`) — słabsze od drżenia zapowiedzi bossa. */
  readonly quakeShakeMs: number;
  readonly quakeIntensity: number;
  /** Ile strużek pyłu przy dudnieniu i przy osypującym się gruzie. */
  readonly quakePlumes: number;
  readonly dustPlumes: number;
  /** Ziarenka w strużce, ich spadek (px/s) i życie (ms). */
  readonly grainsPerPlume: number;
  readonly fallSpeed: { readonly min: number; readonly max: number };
  readonly lifespanMs: { readonly min: number; readonly max: number };
  /** Przelot kruka: czas przelotu przez kadr (ms) i wysokość nad górną krawędzią kadru, na której leci (ułamek wysokości widoku). */
  readonly flyoverMs: number;
  readonly flyoverBand: { readonly min: number; readonly max: number };
  /** Barwy ziarenek: kurz ruin (piaskowiec) i pył Piekła (bazalt z drobinami żaru). */
  readonly dustTints: readonly number[];
  readonly quakeTints: readonly number[];
}

export const SOUNDSCAPE_ECHO: SoundscapeEchoConfig = {
  quakeShakeMs: 380,
  quakeIntensity: 0.0018,
  quakePlumes: 6,
  dustPlumes: 2,
  grainsPerPlume: 14,
  fallSpeed: { min: 30, max: 60 },
  lifespanMs: { min: 900, max: 1500 },
  flyoverMs: 2600,
  flyoverBand: { min: 0.12, max: 0.4 },
  dustTints: [0xc9b994, 0xa8977a, 0x857660],
  quakeTints: [0xb09a90, 0x8a7570, 0xf5ae4b],
};

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
      { cue: SoundCue.AmbRubble, weight: 2, echo: SoundscapeEcho.Dust },
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
      { cue: SoundCue.AmbCrow, weight: 3, echo: SoundscapeEcho.Flyover },
      { cue: SoundCue.AmbBell, weight: 1 },
      { cue: SoundCue.AmbWind, weight: 2 },
    ],
  },
  [BiomeId.Infernal]: {
    intervalMs: { min: 7000, max: 13000 },
    entries: [
      { cue: SoundCue.AmbRumble, weight: 3, echo: SoundscapeEcho.Quake },
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
